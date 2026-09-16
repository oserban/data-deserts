#!/usr/bin/env python3
"""Fetch DHS survey counts and nutrition coverage by country and survey year.

Count each available survey once by SurveyId, never sum people or households.
The DHS Program includes DHS, AIS and MIS surveys. SurveyYear is the principal
survey year; SurveyYearLabel preserves fieldwork ranges such as 2015-16.

Nutrition means any nutrition topic evidenced by survey characteristics or a
published Child Nutrition / Adult Nutrition indicator (including feeding,
anthropometry, anemia and micronutrients). Missing evidence is unconfirmed,
not evidence that a survey contains no nutrition data.

Writes data/dhs.json ({ISO3: {year: survey_count}}) and data/dhs_report.json
(survey identities, year labels, nutrition evidence and separate sample counts).
Run: python3 processing/fetch_dhs.py
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
    "SurveyYearLabel,SurveyStatus,IndicatorData,SurveyCharacteristicIds,"
    "NumberOfWomen,NumberOfMen,NumberOfHouseholds"
)
# The DHS API leaves ISO fields blank for this subnational programme.
COUNTRY_OVERRIDES = {"OS": "NGA"}  # Nigeria (Ondo State)

# Official survey-characteristic IDs, not inferred from the survey type or year.
# https://api.dhsprogram.com/rest/dhs/surveycharacteristics
NUTRITION_CHARACTERISTIC_IDS = {
    10, 14, 15, 20, 41, 52, 64, 65, 74, 94, 97, 110, 122,
    127, 128, 129, 132, 134,
}
NUTRITION_DEFINITION = (
    "Nutrition includes any nutrition topic: feeding practices, dietary diversity, "
    "food insecurity, anthropometry, anemia, and micronutrients. Highlighting uses "
    "DHS survey topics or published child/adult nutrition indicators; unhighlighted "
    "years have no confirmed nutrition evidence in this metadata"
)

try:
    import certifi
except ImportError:
    certifi = None

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where() if certifi is not None else None)


def api_page(endpoint, page, per_page, fields, retries=4, **filters):
    """Fetch and return one page from an official DHS API endpoint."""
    query = urllib.parse.urlencode({
        "returnFields": fields,
        "page": page,
        "perpage": per_page,
        **filters,
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


def api_records(endpoint, fields, per_page=100, **filters):
    """Yield all records from a paginated DHS endpoint."""
    page = 1
    while True:
        payload = api_page(endpoint, page, per_page, fields, **filters)
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
        raise ValueError("sample counts cannot be negative")
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


def nutrition_indicator_topics(indicators):
    """Select all indicators in the provider's two nutrition subject areas."""
    return {
        row["IndicatorId"]: row["Level2"].strip()
        for row in indicators
        if row.get("Level1") in {"Child Nutrition", "Adult Nutrition"}
    }


def fetch_nutrition_evidence(per_page):
    topics = nutrition_indicator_topics(api_records(
        "indicators", "IndicatorId,Level1,Level2", max(per_page, 1000)))
    if not topics:
        raise ValueError("DHS returned no nutrition indicators")
    evidence = {}
    ids = sorted(topics)
    # Keep URLs short and request only national availability, not breakdowns.
    for start in range(0, len(ids), 50):
        for row in api_records(
                "data", "SurveyId,IndicatorId,Value", max(per_page, 10000),
                indicatorIds=",".join(ids[start:start + 50]), breakdown="national"):
            if row.get("Value") not in (None, "") and row.get("IndicatorId") in topics:
                evidence.setdefault(row["SurveyId"], set()).add(topics[row["IndicatorId"]])
    return evidence


def aggregate_surveys(survey_records, dhs_to_iso3, characteristics, nutrition_evidence):
    """Count unique available surveys, retaining nutrition and sample provenance."""
    totals, report, seen = {}, [], set()
    stats = {"surveys": 0, "nutritionSurveys": 0, "unavailableSurveys": 0}
    for survey in survey_records:
        survey_id = str(survey.get("SurveyId") or "").strip()
        if not survey_id:
            raise ValueError("DHS survey has no SurveyId")
        if survey_id in seen:
            continue
        seen.add(survey_id)
        if (survey.get("SurveyStatus") != "Completed" or
                str(survey.get("IndicatorData")) != "1"):
            stats["unavailableSurveys"] += 1
            continue
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
        characteristic_ids = {
            int(value.strip()) for value in str(survey.get("SurveyCharacteristicIds") or "").split(",")
            if value.strip()
        }
        nutrition_topics = sorted({
            characteristics[value] for value in characteristic_ids & NUTRITION_CHARACTERISTIC_IDS
        } | set(nutrition_evidence.get(survey_id, ())))
        yearly = totals.setdefault(iso3, {})
        yearly[str(year)] = yearly.get(str(year), 0) + 1
        stats["surveys"] += 1
        stats["nutritionSurveys"] += bool(nutrition_topics)
        report.append({
            "surveyId": survey_id,
            "country": str(survey.get("CountryName") or ""),
            "iso3": iso3,
            "year": year,
            "yearLabel": str(survey.get("SurveyYearLabel") or year),
            "surveyType": str(survey.get("SurveyType") or ""),
            "nutrition": True if nutrition_topics else None,
            "nutritionTopics": nutrition_topics,
            "characteristicIds": sorted(characteristic_ids),
            "women": optional_count(survey.get("NumberOfWomen")),
            "men": optional_count(survey.get("NumberOfMen")),
            "households": optional_count(survey.get("NumberofHouseholds",
                                                       survey.get("NumberOfHouseholds"))),
        })
    ordered_totals = {
        iso3: dict(sorted(yearly.items())) for iso3, yearly in sorted(totals.items())
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
                        help="Survey-count aggregation (default: processing/data/dhs.json)")
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
    characteristics = {
        int(row["SurveyCharacteristicID"]): row["SurveyCharacteristicName"].strip()
        for row in api_records("surveycharacteristics", "SurveyCharacteristicID,SurveyCharacteristicName",
                               args.per_page)
    }
    if not NUTRITION_CHARACTERISTIC_IDS.issubset(characteristics):
        raise ValueError("DHS nutrition characteristic definitions are missing")
    evidence = fetch_nutrition_evidence(args.per_page)
    totals, surveys, stats = aggregate_surveys(
        api_records("surveys", SURVEY_FIELDS, args.per_page), mapping, characteristics, evidence)
    metadata = {
        "schemaVersion": 2,
        "source": "DHS Program API",
        "sourceUrl": "https://api.dhsprogram.com/",
        "unit": "surveys",
        "countDefinition": "Unique SurveyId, assigned once to its principal SurveyYear",
        "availabilityDefinition": "Completed surveys with published DHS indicator data",
        "nutritionDefinition": NUTRITION_DEFINITION,
        "nutritionCharacteristicIds": sorted(NUTRITION_CHARACTERISTIC_IDS),
        "sampleCountDefinition": "Women, men and households are separate metadata; never summed",
        "countries": len(totals),
        **stats,
    }
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report, {"_meta": metadata, "surveys": surveys}, indent=2)
    print("Wrote %s: %d countries, %d unique surveys (%d with nutrition evidence)" %
          (args.output, len(totals), stats["surveys"], stats["nutritionSurveys"]))
    print("Wrote %s: survey years, nutrition evidence and separate sample counts" % args.report)


if __name__ == "__main__":
    main()
