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

Run from the repository root:

    python3 processing/fetch_lsms.py
"""

import argparse
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "lsms.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "lsms_report.json")
API_ROOT = "https://microdata.worldbank.org/index.php/api"
COLLECTION = "lsms"

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
    return " ".join(re.findall(r"[a-z0-9]+", str(value or "").lower()))


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
    tokens = set(name.split())
    if "roster" in tokens:
        return {"candidate": True, "score": 85, "reason": "generic_roster"}
    if (("person" in tokens or "persons" in tokens or "individual" in tokens or
         "individuals" in tokens) and
            ("data" in tokens or "level" in tokens or "file" in tokens)):
        return {"candidate": True, "score": 75, "reason": "generic_person_file"}
    return {"candidate": False, "score": 0, "reason": "not_person_roster"}


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
        selected, selection, alternatives = select_participant_file(files)
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
            "alternativeCandidateFileIds": alternatives,
            "files": files,
        })
        print("[%3d/%3d] %s  %s" %
              (index, len(studies), study_id,
               format(participants, ",") if participants is not None else "unresolved"))
        if delay:
            time.sleep(delay)
    ordered = {iso3: dict(sorted(yearly.items()))
               for iso3, yearly in sorted(totals.items())}
    report.sort(key=lambda item: (item["iso3"], item["year"], item["studyId"]))
    return ordered, report, stats


def write_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=indent,
                  separators=None if indent else (",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Country/year output (default: processing/data/lsms.json)")
    parser.add_argument("--report", default=DEFAULT_REPORT,
                        help="Audit report (default: processing/data/lsms_report.json)")
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
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report,
                      {"_meta": metadata, "studies": survey_report}, indent=2)
    print("Wrote %s: %d countries, %s participant records from %d/%d studies" %
          (args.output, len(totals), format(participant_total, ","),
           stats["withParticipants"], stats["studies"]))
    print("Wrote %s: study/file classifications and selection provenance" % args.report)


if __name__ == "__main__":
    main()
