#!/usr/bin/env python3
"""Fetch LSMS participant-record counts from the World Bank NADA REST API.

The parser enumerates the public ``lsms`` collection and retrieves every
study's data-file metadata. It does not scrape catalog HTML or download
microdata.

``case_count`` is a file row count, not automatically a participant count.
This parser identifies household-member/person roster files and selects one
canonical roster per study. It never adds case counts across files. The output
uses the shared format ``{ISO3: {year: count}}``; the report retains every file,
classification, selection decision, study ID, access type, and unresolved case.
If filenames/descriptions do not identify a roster, public variable metadata
is checked for household and member identifiers, age, sex, and relationship
to the household head. Every fetch automatically computes household-member estimates
separately from versioned local resources; no microdata or live household-size lookup
is needed. Both apps include these estimates by default and can display observed counts only.

Run from the repository root:

    python3 processing/fetch_lsms.py
"""

import argparse
import hashlib
import math
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
import unicodedata
from collections import Counter

from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "lsms.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "lsms_report.json")
API_ROOT = "https://microdata.worldbank.org/index.php/api"
COLLECTION = "lsms"

HOUSEHOLD_RESOURCES = Path(__file__).resolve().parent / 'resources'
HOUSEHOLD_ESTIMATES_PATH = HOUSEHOLD_RESOURCES / 'lsms_household_estimates.json'
HOUSEHOLD_ESTIMATION_METHOD = 'reviewed-households-times-frozen-mean-v1'

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


EXCLUDED_FILE_TERMS = (
    "agricultur", "asset", "business", "community", "consumption", "crop",
    "diary", "dwelling", "enterprise", "expenditure", "food", "income",
    "education", "employment", "fertility", "health", "labor", "labour",
    "livestock", "migration", "parcel", "plot", "price", "product", "shock",
    "social", "transaction", "transfer", "weight",
)


def integer_or_zero(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def api_get(path, query=None, retries=4):
    """Read one JSON document from the public NADA catalog API."""
    url = API_ROOT + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(
        url, headers={"User-Agent": "data-deserts-pipeline/2.0"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(
                    request, timeout=120, context=SSL_CONTEXT) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def collection_studies(page_size=100, retries=4):
    """Return every study in the LSMS collection using API pagination."""
    studies = []
    page = 1
    expected = None
    while expected is None or len(studies) < expected:
        payload = api_get("/catalog/search", {
            "collection": COLLECTION,
            "ps": page_size,
            "page": page,
            "sort_by": "year",
            "sort_order": "asc",
            "format": "json",
        }, retries)
        result = payload.get("result") or {}
        rows = result.get("rows") or []
        expected = int(result.get("found", len(rows)))
        if not rows:
            break
        studies.extend(rows)
        print("Fetched LSMS catalog page %d: %d/%d studies" %
              (page, len(studies), expected))
        page += 1
    if len(studies) != expected:
        raise RuntimeError("LSMS pagination returned %d of %d studies" %
                           (len(studies), expected))
    return studies


def normalize_text(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def classify_file(file_metadata):
    """Classify a NADA data file as a person-roster candidate or non-person file."""
    name = normalize_text(file_metadata.get("file_name"))
    description = normalize_text(file_metadata.get("description"))
    text = (name + " " + description).strip()
    case_count = file_metadata.get("case_count")
    case_count = integer_or_zero(case_count)

    if case_count <= 0:
        return {"candidate": False, "score": 0, "reason": "missing_case_count"}
    # A domain word in the filename is decisive. Descriptions are not: genuine
    # household-roster descriptions often enumerate migration, employment, or
    # other attributes collected for each member.
    excluded = next((term for term in EXCLUDED_FILE_TERMS if term in name), None)
    if excluded:
        return {"candidate": False, "score": 0,
                "reason": "excluded_%s_file" % excluded}

    explicit_roster_phrases = (
        ("household roster", 100, "household_roster"),
        ("householdroster", 100, "household_roster"),
        ("hh roster", 98, "household_roster"),
        ("hhroster", 98, "household_roster"),
        ("roster of household members", 100, "household_roster"),
        ("household sociodemographic characteristics", 94, "household_demographics"),
        ("sociodemographic characteristics of household members", 94, "household_demographics"),
        ("member roster", 96, "member_roster"),
        ("person roster", 96, "person_roster"),
        ("individual roster", 96, "person_roster"),
        ("list of household members", 94, "household_member_list"),
        ("roster of individuals living in the household", 94, "household_member_list"),
    )
    for phrase, score, reason in explicit_roster_phrases:
        if phrase in text:
            return {"candidate": True, "score": score, "reason": reason}
    filename_phrases = (
        ("household member", 92, "household_member_file"),
        ("householdmember", 92, "household_member_file"),
    )
    for phrase, score, reason in filename_phrases:
        if phrase in name:
            return {"candidate": True, "score": score, "reason": reason}
    if description in ("roster", "roster demographics"):
        return {"candidate": True, "score": 90, "reason": "person_roster_description"}
    if "household questionnaire" in description and "survey roster" in description:
        return {"candidate": True, "score": 94, "reason": "household_survey_roster"}
    tokens = set(name.split())
    if "roster" in tokens:
        return {"candidate": True, "score": 85, "reason": "generic_roster"}
    if (("person" in tokens or "persons" in tokens or "individual" in tokens or
         "individuals" in tokens) and
            ("data" in tokens or "level" in tokens or "file" in tokens)):
        return {"candidate": True, "score": 75, "reason": "generic_person_file"}
    return {"candidate": False, "score": 0, "reason": "not_person_roster"}


# Conservative variable-label signatures: all five roles must occur in distinct
# variables in the SAME file. A household-head's age/sex is not a person roster.
ROSTER_VARIABLE_PATTERNS = {
    "household_id": (
        r"(?:household|hh|hhld|menage|hogar|domicilio) (?:id|identifier|identification|number|no|code)(?: .*|$)",
        r"(?:id|identifier|identification|number|numero|code|identifiant) (?:of |du |de |del )?(?:the |le |la )?(?:household|hh|menage|hogar)(?: .*|$)",
        r"(?:hhid|hh id|householdid|household id|hhn|numhh)",
    ),
    "member_id": (
        r"(?:person|individual|individu|member|household member|hh member|membre|persona) (?:id|identifier|identification|number|no|code)(?: .*|$)",
        r"(?:id|identifier|identification|number|numero|code) (?:of |du |de |del )?(?:the |le |la )?(?:person|individual|member|membre|persona)(?: .*|$)",
        r"(?:id|id code|pid|personid|person id|memberid|member id|indiv|individ|individual id|line number)",
    ),
    "age": (r"(?:age|edad|idade)(?: in (?:completed )?years| en annees| en anos| revolu| revolus)?",
            r"(?:age|edad) (?:of |du |de )?(?:the |le |la )?(?:person|member|individual|respondent|membre)(?: in years)?"),
    "sex": (r"(?:sex|sexe|sexo|gender)",
            r"(?:sex|gender|sexe) (?:of |du |de )?(?:the |le |la )?(?:person|member|individual|respondent|membre)"),
    "relationship": (r"(?:relationship|relation|rel|lien|parentesco|parental link).*\b(?:head|chef|jefe|chefe)\b.*",),
}


def roster_variable_evidence(variables):
    """Return auditable matching variables, never infer a count from their values."""
    matches = {}
    for role, patterns in ROSTER_VARIABLE_PATTERNS.items():
        for item in variables:
            label = normalize_text(item.get("labl"))
            if role == "household_id" and re.search(r"\b(?:members|member|size|persons|personnes)\b", label):
                continue  # Household size is not a household identifier.
            # Demographic roles use labels only: an AGE code may mean age of the
            # household head, plot owner, child, etc. Labels must establish scope.
            texts = [normalize_text(item.get("labl"))]
            if role in ("household_id", "member_id"):
                texts.append(normalize_text(item.get("name")))
            if any(re.fullmatch(pattern, text) for text in texts for pattern in patterns):
                matches[role] = {"variableId": str(item.get("vid") or ""),
                                 "name": str(item.get("name") or ""),
                                 "label": str(item.get("labl") or "")}
                break
    if len(matches) != len(ROSTER_VARIABLE_PATTERNS):
        return None
    if len({v["variableId"] for v in matches.values()}) != len(matches):
        return None
    return matches


def study_variables(study_id, retries=4):
    path = "/catalog/%s/variables" % urllib.parse.quote(study_id, safe="")
    payload = api_get(path, retries=retries)
    variables = payload.get("variables")
    if not isinstance(variables, list) or integer_or_zero(payload.get("total")) != len(variables):
        raise ValueError("Incomplete LSMS variable metadata for " + study_id)
    if any(not all(v.get(key) for key in ("fid", "vid", "name")) for v in variables):
        raise ValueError("Invalid LSMS variable identifiers for " + study_id)
    return variables, API_ROOT + path


def resolve_participant_file(files, study_id, retries=4):
    """Use variable metadata only when no named person roster can be selected."""
    selected, selection, alternatives = select_participant_file(files)
    if selected:
        return selected, selection, alternatives
    if not files:
        return None, "unresolved_no_file_metadata", []
    if not any(item["caseCount"] > 0 for item in files):
        return None, "unresolved_missing_case_counts", []
    if "_A_" in study_id:
        return None, "unresolved_derived_analysis_file", []
    try:
        variables, url = study_variables(study_id, retries)
    except (OSError, ValueError) as exc:
        # Keep usable file counts in the audit even if optional metadata is absent.
        for item in files:
            item["variableMetadataError"] = str(exc)
        return None, "unresolved_variable_metadata_unavailable", []
    grouped = {}
    for item in variables:
        grouped.setdefault(str(item["fid"]), []).append(item)
    candidates = []
    missing_counts = [item["fileId"] for item in files if item["caseCount"] <= 0 and
                      classify_file({"file_name": item["fileName"], "description": item["description"],
                                     "case_count": 1})["candidate"]]
    for item in files:
        proof = roster_variable_evidence(grouped.get(item["fileId"], []))
        if not proof:
            continue
        item["rosterVariableEvidence"] = {"sourceUrl": url, "variables": proof}
        if item["caseCount"] <= 0:
            if item["fileId"] not in missing_counts:
                missing_counts.append(item["fileId"])
            continue
        # A module explicitly named as expenditure, crop, health, etc. stays
        # excluded even if it repeats person-identifying demographic columns.
        if item["classification"]["reason"].startswith("excluded_"):
            continue
        item["classification"] = {"candidate": True, "score": 90,
                                  "reason": "person_roster_variable_metadata"}
        candidates.append(item)
    if not candidates:
        return None, ("unresolved_roster_missing_case_count" if missing_counts else
                      "unresolved_no_person_roster"), missing_counts
    # Distinct roster populations/visits cannot be resolved by selecting the
    # largest file from metadata alone. Never sum these candidate counts.
    if len({item["caseCount"] for item in candidates}) != 1:
        return None, "unresolved_ambiguous_variable_rosters", [item["fileId"] for item in candidates]
    selected = sorted(candidates, key=lambda item: (item["fileName"], item["fileId"]))[0]
    return selected, "verified_roster_variables", [item["fileId"] for item in candidates if item is not selected]


def unresolved_message(selection):
    reasons = {
        "unresolved_derived_analysis_file": "derived analysis release needs a reviewed study-specific counting rule",
        "unresolved_no_file_metadata": "catalogue lists no data files",
        "unresolved_missing_case_counts": "catalogue provides no positive file row counts",
        "unresolved_roster_missing_case_count": "person roster identified, but its row count is missing",
        "unresolved_variable_metadata_unavailable": "could not retrieve complete variable metadata; see audit report",
        "unresolved_ambiguous_variable_rosters": "multiple possible person rosters have different row counts",
        "unresolved_no_person_roster": "no person roster could be verified from file or variable metadata",
        "unresolved_ambiguous_roster_names": "file names do not identify a unique person roster",
    }
    return reasons.get(selection, selection)


def select_participant_file(files):
    """Select one canonical person roster without summing file case counts."""
    candidates = [item for item in files if item["classification"]["candidate"]]
    if not candidates:
        return None, "unresolved_no_person_roster", []
    best_score = max(item["classification"]["score"] for item in candidates)
    if best_score < 75:
        return (None, "unresolved_ambiguous_roster_names",
                [item["fileId"] for item in candidates])
    strongest = [item for item in candidates
                 if item["classification"]["score"] == best_score]
    maximum = max(item["caseCount"] for item in strongest)
    largest = [item for item in strongest if item["caseCount"] == maximum]
    selected = sorted(largest, key=lambda item: (item["fileName"], item["fileId"]))[0]

    distinct_counts = sorted({item["caseCount"] for item in strongest})
    if len(strongest) == 1:
        confidence = "single_strongest_roster"
    elif len(distinct_counts) == 1:
        confidence = "duplicate_rosters_same_count"
    else:
        confidence = "heuristic_largest_strongest_roster"
    alternatives = [item["fileId"] for item in candidates
                    if item["fileId"] != selected["fileId"]]
    return selected, confidence, alternatives


def study_files(study_id, retries=4):
    """Return normalized file metadata from one study's API endpoint."""
    payload = api_get("/catalog/%s/data_files" % urllib.parse.quote(study_id, safe=""),
                      retries=retries)
    raw_files = payload.get("datafiles") or payload.get("data_files") or []
    if isinstance(raw_files, dict):
        raw_files = raw_files.values()
    files = []
    for item in raw_files:
        count = integer_or_zero(item.get("case_count"))
        normalized = {
            "fileId": str(item.get("file_id") or item.get("id") or ""),
            "fileName": str(item.get("file_name") or ""),
            "description": str(item.get("description") or ""),
            "fileType": str(item.get("file_type") or ""),
            "caseCount": count,
            "variableCount": integer_or_zero(item.get("var_count")),
        }
        normalized["classification"] = classify_file(item)
        files.append(normalized)
    files.sort(key=lambda item: item["fileId"])
    return files


def study_identity(study):
    """Extract stable ISO3/year identity from NADA study metadata."""
    study_id = str(study.get("idno") or "")
    iso_match = re.match(r"^([A-Z]{3})(?:_|$)", study_id)
    if not iso_match:
        raise ValueError("Cannot derive ISO3 from LSMS study ID %r" % study_id)
    try:
        year = int(study["year_start"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("LSMS study %s has no valid starting year" % study_id)
    if not 1900 <= year <= 2100:
        raise ValueError("LSMS study %s has invalid year %d" % (study_id, year))
    return study_id, iso_match.group(1), year


def aggregate_studies(studies, retries=4, delay=0.1):
    totals = {}
    report = []
    stats = {"studies": len(studies), "withParticipants": 0,
             "unresolved": 0, "heuristicSelections": 0}
    for index, study in enumerate(studies, 1):
        study_id, iso3, year = study_identity(study)
        files = study_files(study_id, retries)
        selected, selection, alternatives = resolve_participant_file(files, study_id, retries)
        participants = selected["caseCount"] if selected else None
        if participants is None:
            stats["unresolved"] += 1
        else:
            stats["withParticipants"] += 1
            if selection.startswith("heuristic_"):
                stats["heuristicSelections"] += 1
            yearly = totals.setdefault(iso3, {})
            year_text = str(year)
            yearly[year_text] = yearly.get(year_text, 0) + participants
        report.append({
            "studyId": study_id,
            "catalogId": study.get("id"),
            "title": str(study.get("title") or ""),
            "country": str(study.get("nation") or ""),
            "iso3": iso3,
            "year": year,
            "yearEnd": study.get("year_end"),
            "accessType": str(study.get("form_model") or ""),
            "participants": participants,
            "participantDefinition": "case count of one selected person/household-member roster",
            "selectedFileId": selected["fileId"] if selected else None,
            "selection": selection,
            "unresolvedReason": unresolved_message(selection) if selected is None else None,
            "alternativeCandidateFileIds": alternatives,
            "files": files,
        })
        print("[%3d/%3d] %s  %s" %
              (index, len(studies), study_id,
               format(participants, ",") if participants is not None else
               "skipped: " + unresolved_message(selection)))
        if delay:
            time.sleep(delay)
    ordered = {iso3: dict(sorted(yearly.items()))
               for iso3, yearly in sorted(totals.items())}
    report.sort(key=lambda item: (item["iso3"], item["year"], item["studyId"]))
    stats["unresolvedReasons"] = dict(sorted(Counter(
        item["selection"] for item in report if item["participants"] is None).items()))
    return ordered, report, stats


def write_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=indent,
                  separators=None if indent else (",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def checksum(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_resources(path=HOUSEHOLD_ESTIMATES_PATH):
    resources = json.loads(Path(path).read_text())
    if resources.get('schemaVersion') != 1:
        raise ValueError('Unsupported LSMS household resource schema')
    for sid, row in resources.get('studies', {}).items():
        if not sid or not re.fullmatch('[A-Z]{3}', row.get('countryIso3', '')):
            raise ValueError('Invalid reviewed household study')
        if (type(row.get('year')) is not int or type(row.get('households')) is not int or
                row['households'] <= 0 or not row.get('fileId') or not row.get('fileName')):
            raise ValueError('Invalid reviewed household file')
        validate_mean(row)
        if row.get('tier') not in ('same_study_unweighted', 'comparable_survey', 'national_reference'):
            raise ValueError('Invalid household-size reference tier')
    return resources


def validate_mean(row):
    if (type(row.get('year')) is not int or not 1900 <= row['year'] <= 2100 or
            type(row.get('mean')) not in (int, float) or not math.isfinite(row['mean']) or row['mean'] < 1):
        raise ValueError('Invalid household-size mean/year')


def estimate_study(study, resources):
    if study['participants'] is not None:
        return None, 'observed_roster_available'
    if '_A_' in study['studyId'] or study['selection'] not in (
            'unresolved_no_person_roster', 'unresolved_roster_missing_case_count', 'unresolved_missing_case_counts'):
        return None, 'unresolved_study_requires_review'
    binding = resources['studies'].get(study['studyId'])
    if not binding:
        return None, 'no_reviewed_household_file'
    if (study['iso3'], int(study['year'])) != (binding['countryIso3'], binding['year']):
        raise ValueError('Reviewed LSMS household study identity changed')
    matches = [f for f in study['files'] if f['fileId'] == binding['fileId'] and f['fileName'] == binding['fileName']]
    if len(matches) != 1 or matches[0]['caseCount'] != binding['households']:
        return None, 'reviewed_household_file_changed_or_missing'
    households = binding['households']
    count = int((Decimal(households) * Decimal(str(binding['mean']))).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    reference = {key: binding[key] for key in ('mean', 'tier', 'referenceYear', 'sourceUrl')}
    reference['yearGap'] = abs(binding['referenceYear'] - binding['year'])
    return {'method': HOUSEHOLD_ESTIMATION_METHOD, 'estimatedMembers': count, 'households': households,
            'householdFileId': binding['fileId'], 'householdFileName': binding['fileName'],
            'householdCountSource': binding['sourceUrl'], 'householdScope': 'reviewed household-level file',
            'householdSize': reference, 'rounding': 'nearest whole member, half up'}, None


def apply_estimates(studies, resource_path=HOUSEHOLD_ESTIMATES_PATH):
    resources = load_resources(resource_path)
    records, reasons = {}, {}
    estimated_studies = 0
    for study in studies:
        estimate, reason = estimate_study(study, resources)
        study['householdEstimation'] = estimate
        study['estimatedParticipants'] = estimate['estimatedMembers'] if estimate else None
        study['countType'] = ('observed_roster' if study['participants'] is not None else
                              'estimated_household_members' if estimate else 'unavailable')
        study['estimationSkippedReason'] = reason if study['participants'] is None else None
        if estimate:
            estimated_studies += 1
            yearly = records.setdefault(study['iso3'], {})
            year = str(study['year'])
            yearly[year] = yearly.get(year, 0) + estimate['estimatedMembers']
        elif study['participants'] is None:
            reasons[reason] = reasons.get(reason, 0) + 1
    return records, {'method': HOUSEHOLD_ESTIMATION_METHOD, 'unit': 'estimated household members', 'estimatedStudies': estimated_studies,
                     'estimatedMembers': sum(sum(y.values()) for y in records.values()),
                     'remainingStudies': sum(reasons.values()), 'skippedReasons': reasons,
                     'resourceSha256': checksum(resource_path), 'resourceVersion': resources['version']}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Country/year output (default: processing/data/lsms.json)")
    parser.add_argument("--report", default=DEFAULT_REPORT,
                        help="Audit report (default: processing/data/lsms_report.json)")
    parser.add_argument("--reprocess-report", metavar="PATH",
                        help="Recompute household estimates from an existing audit report without network access")
    parser.add_argument("--page-size", type=int, default=100,
                        help="Catalog studies per API page (default: 100)")
    parser.add_argument("--delay", type=float, default=0.1,
                        help="Delay between study requests in seconds (default: 0.1)")
    parser.add_argument("--retries", type=int, default=4,
                        help="Attempts per API request (default: 4)")
    parser.add_argument(
        "--study", action="append", default=[], metavar="IDNO",
        help="Process only this study ID after enumerating LSMS (repeatable; useful for auditing)")
    args = parser.parse_args()
    if args.page_size < 1 or args.delay < 0 or args.retries < 1:
        parser.error("page size and retries must be positive; delay must be non-negative")
    return args


def main():
    args = parse_args()
    if args.reprocess_report:
        if args.study:
            raise SystemExit('--study cannot be combined with --reprocess-report')
        with open(args.reprocess_report, encoding='utf-8') as source:
            previous = json.load(source)
        survey_report = previous['studies']
        totals = {}
        for study in survey_report:
            if study['participants'] is None:
                continue
            selected = [f for f in study['files'] if f['fileId'] == study['selectedFileId']]
            if len(selected) != 1 or selected[0]['caseCount'] != study['participants'] or study['participants'] <= 0:
                raise ValueError('Cached LSMS roster count does not match its file metadata')
            yearly = totals.setdefault(study['iso3'], {})
            year = str(study['year'])
            yearly[year] = yearly.get(year, 0) + study['participants']
        metadata = {k:v for k,v in previous['_meta'].items() if k not in ('householdEstimation', 'estimatedRecords')}
        publish(totals, survey_report, metadata, args)
        return
    studies = collection_studies(args.page_size, args.retries)
    if args.study:
        requested = set(args.study)
        available = {str(study.get("idno") or "") for study in studies}
        missing = sorted(requested - available)
        if missing:
            raise SystemExit("Unknown LSMS study ID(s): %s" % ", ".join(missing))
        studies = [study for study in studies
                   if str(study.get("idno") or "") in requested]
    totals, survey_report, stats = aggregate_studies(
        studies, args.retries, args.delay)
    participant_total = sum(count for yearly in totals.values() for count in yearly.values())
    metadata = {
        "source": "World Bank Microdata Library NADA REST API",
        "sourceUrl": "https://microdata.worldbank.org/catalog/lsms",
        "apiUrl": API_ROOT,
        "collection": COLLECTION,
        "participantDefinition": (
            "case_count from one selected person/household-member roster per study; "
            "file counts are never summed within a study"),
        "participantInterpretation": (
            "people represented in the selected roster, not necessarily people individually interviewed"),
        "countries": len(totals),
        "participants": participant_total,
        **stats,
    }
    publish(totals, survey_report, metadata, args)


def publish(totals, survey_report, metadata, args):
    estimated, estimation_meta = apply_estimates(survey_report)
    metadata['householdEstimation'] = estimation_meta
    metadata['estimatedRecords'] = estimated
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report,
                      {"_meta": metadata, "studies": survey_report}, indent=2)
    print("Wrote %s: %d countries, %s participant records from %d/%d studies" %
          (args.output, len(totals), format(sum(sum(y.values()) for y in totals.values()), ","),
           metadata["withParticipants"], metadata["studies"]))
    print("Wrote %s: study/file classifications and selection provenance" % args.report)
    print('Prepared %d estimated household members from %d studies; %d still unavailable.' %
          (estimation_meta['estimatedMembers'], estimation_meta['estimatedStudies'], estimation_meta['remainingStudies']))
    if metadata["unresolved"]:
        print("%d studies lack observed roster counts (some have estimates above); these are not zero observations:" % metadata["unresolved"])
        for reason, count in metadata["unresolvedReasons"].items():
            print("  %d: %s" % (count, unresolved_message(reason)))


if __name__ == "__main__":
    main()
