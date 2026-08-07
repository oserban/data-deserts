#!/usr/bin/env python3
"""Fetch DHS survey participant counts and aggregate them by country and year.

The DHS API does not expose one universal participant total. It exposes counts
of interviewed women and interviewed men, plus a separate household count. This
script defines participants as the sum of the available women and men counts;
households are never treated as people.

Writes the BioTIME-compatible aggregation:

    data/dhs.json
    {"AFG": {"2015": 40221}, "ALB": {"2008": 10597, "2017": 17003}}

It also writes data/dhs_report.json, retaining every survey and its women, men,
households, survey type, and participant-count completeness.

Run from the repository root:

    python3 processing/fetch_dhs.py
"""

import argparse
import json
import os
import ssl
import time
import urllib.parse
import urllib.request


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "dhs.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "dhs_report.json")
API_ROOT = "https://api.dhsprogram.com/rest/dhs"
COUNTRY_FIELDS = "CountryName,DHS_CountryCode,ISO2_CountryCode,ISO3_CountryCode"
SURVEY_FIELDS = (
    "SurveyId,CountryName,SurveyYear,SurveyType,DHS_CountryCode,"
    "NumberOfWomen,NumberOfMen,NumberOfHouseholds"
)
# The DHS API leaves ISO fields blank for this subnational programme.
COUNTRY_OVERRIDES = {"OS": "NGA"}  # Nigeria (Ondo State)

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def api_page(endpoint, page, per_page, fields, retries=4):
    """Fetch and return one page from an official DHS API endpoint."""
    query = urllib.parse.urlencode({
        "returnFields": fields,
        "page": page,
        "perpage": per_page,
    })
    request = urllib.request.Request(
        "%s/%s?%s" % (API_ROOT, endpoint, query),
        headers={"User-Agent": "data-deserts-pipeline/1.0"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
                payload = json.load(response)
            if "Data" not in payload:
                raise RuntimeError("DHS API response contains no Data field")
            return payload
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def api_records(endpoint, fields, per_page=100):
    """Yield all records from a paginated DHS endpoint."""
    page = 1
    while True:
        payload = api_page(endpoint, page, per_page, fields)
        yield from payload["Data"]
        total_pages = int(payload.get("TotalPages", 1))
        print("Fetched DHS %s page %d/%d" % (endpoint, page, total_pages))
        if page >= total_pages:
            break
        page += 1


def optional_count(value):
    """Parse an optional non-negative API count, returning ``None`` when absent."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
    count = int(value)
    if count < 0:
        raise ValueError("participant counts cannot be negative")
    return count


def country_mapping(country_records):
    """Build DHS country code -> ISO3 using the API's authoritative mapping."""
    mapping = dict(COUNTRY_OVERRIDES)
    for country in country_records:
        dhs_code = str(country.get("DHS_CountryCode") or "").strip()
        iso3 = str(country.get("ISO3_CountryCode") or "").strip()
        if dhs_code and iso3:
            mapping[dhs_code] = iso3
    return mapping


def aggregate_surveys(survey_records, dhs_to_iso3):
    """Return BioTIME-shaped participant totals, a survey report, and statistics."""
    totals = {}
    report = []
    seen = set()
    stats = {
        "surveys": 0,
        "with_participants": 0,
        "complete_women_and_men": 0,
        "partial_one_gender": 0,
        "missing_participants": 0,
    }
    for survey in survey_records:
        survey_id = str(survey.get("SurveyId") or "").strip()
        if not survey_id or survey_id in seen:
            continue
        seen.add(survey_id)
        stats["surveys"] += 1
        dhs_code = str(survey.get("DHS_CountryCode") or "").strip()
        iso3 = dhs_to_iso3.get(dhs_code)
        try:
            year = int(survey["SurveyYear"])
            if not 1900 <= year <= 2100:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            raise ValueError("Survey %s has an invalid year" % survey_id)
        if not iso3:
            raise ValueError("Survey %s has no ISO3 mapping for DHS country code %s" %
                             (survey_id, dhs_code))

        women = optional_count(survey.get("NumberOfWomen"))
        men = optional_count(survey.get("NumberOfMen"))
        # DHS currently returns this field with a lowercase "of" despite accepting
        # NumberOfHouseholds in returnFields. Support both forms.
        households = optional_count(survey.get("NumberofHouseholds",
                                               survey.get("NumberOfHouseholds")))
        if women is not None and men is not None:
            completeness = "women_and_men"
            stats["complete_women_and_men"] += 1
        elif women is not None or men is not None:
            completeness = "women_only" if women is not None else "men_only"
            stats["partial_one_gender"] += 1
        else:
            completeness = "missing"
            stats["missing_participants"] += 1

        participants = (women or 0) + (men or 0) if completeness != "missing" else None
        if participants is not None:
            yearly = totals.setdefault(iso3, {})
            year_text = str(year)
            yearly[year_text] = yearly.get(year_text, 0) + participants
            stats["with_participants"] += 1

        report.append({
            "surveyId": survey_id,
            "country": str(survey.get("CountryName") or ""),
            "iso3": iso3,
            "year": year,
            "surveyType": str(survey.get("SurveyType") or ""),
            "participants": participants,
            "women": women,
            "men": men,
            "households": households,
            "completeness": completeness,
        })

    ordered_totals = {
        iso3: dict(sorted(yearly.items()))
        for iso3, yearly in sorted(totals.items())
    }
    report.sort(key=lambda survey: (survey["iso3"], survey["year"], survey["surveyId"]))
    return ordered_totals, report, stats


def write_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False,
                  indent=indent, separators=None if indent else (",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Participant aggregation (default: processing/data/dhs.json)")
    parser.add_argument("--report", default=DEFAULT_REPORT,
                        help="Survey-level report (default: processing/data/dhs_report.json)")
    parser.add_argument("--per-page", type=int, default=100,
                        help="DHS API records requested per page (default: 100)")
    args = parser.parse_args()
    if args.per_page <= 0:
        parser.error("--per-page must be positive")
    return args


def main():
    args = parse_args()
    mapping = country_mapping(api_records("countries", COUNTRY_FIELDS, args.per_page))
    totals, surveys, stats = aggregate_surveys(
        api_records("surveys", SURVEY_FIELDS, args.per_page), mapping)
    total_participants = sum(count for yearly in totals.values() for count in yearly.values())
    metadata = {
        "source": "DHS Program API",
        "sourceUrl": "https://api.dhsprogram.com/",
        "participantDefinition": "NumberOfWomen + NumberOfMen when available",
        "householdsAreParticipants": False,
        "countries": len(totals),
        "participants": total_participants,
        **stats,
    }
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report, {"_meta": metadata, "surveys": surveys}, indent=2)
    print("Wrote %s: %d countries, %s known participants from %d/%d surveys" %
          (args.output, len(totals), format(total_participants, ","),
           stats["with_participants"], stats["surveys"]))
    print("Wrote %s: survey-level participant and household provenance" % args.report)


if __name__ == "__main__":
    main()
