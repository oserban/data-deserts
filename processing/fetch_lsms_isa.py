#!/usr/bin/env python3
"""Fetch LSMS-ISA agricultural file-row observations from the NADA REST API.

The output uses ``{ISO3: {year: count}}``. Counts sum rows across agricultural
modules in documented LSMS-ISA survey series. They measure agricultural data
records, not unique farms, households, people, plots, or animals: the same
entity may occur in several modules. A report retains every classification and
included file so the aggregation remains auditable.
"""

import argparse
import json
import os
import re
import time

import fetch_lsms


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "lsms_isa.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "lsms_isa_report.json")

# Official LSMS-ISA partner countries and their agricultural panel series.
ISA_SERIES = {
    "BFA": ("EMC", "EHCVM"),
    "ETH": ("ERSS", "ESS", "ESPS"),
    "MWI": ("IHS", "IHPS"),
    "MLI": ("EAC", "EHCVM"),
    "NER": ("ECVMA", "EHCVM"),
    "NGA": ("GHSP",),
    "TZA": ("NPS",),
    "UGA": ("UNPS",),
}

AGRICULTURE_TERMS = {
    "agricultur": "agriculture", "crop": "crops", "seed": "inputs", "fertiliz": "inputs",
    "pesticide": "inputs", "herbicide": "inputs", "parcel": "land",
    "plot": "land", "land": "land", "farm": "farming",
    "livestock": "livestock", "cattle": "livestock", "poultry": "livestock",
    "fish": "fisheries", "aquaculture": "fisheries", "tree": "trees",
}
EXCLUDED_NAME_TERMS = (
    "questionnaire", "codebook", "dictionary", "syntax", "weight", "community",
)
EXCLUDED_ROSTER_TERMS = ("household roster", "person roster", "member roster")


def is_isa_study(study):
    study_id = str(study.get("idno") or "")
    match = re.match(r"^([A-Z]{3})_(\d{4})", study_id)
    if (not match or int(match.group(2)) < 2008 or "_A_" in study_id or
            "NPS-UPD" in study_id or re.search(r"^MWI_2010-\d{4}_IHPS", study_id)):
        return False
    return any(token in study_id for token in ISA_SERIES.get(match.group(1), ()))


def classify_agriculture_file(item):
    name = fetch_lsms.normalize_text(item.get("fileName") or item.get("file_name"))
    description = fetch_lsms.normalize_text(item.get("description"))
    text = (name + " " + description).strip()
    count = fetch_lsms.integer_or_zero(item.get("caseCount", item.get("case_count")))
    if count <= 0:
        return {"included": False, "category": None, "reason": "missing_case_count"}
    excluded = next((term for term in EXCLUDED_NAME_TERMS if term in name), None)
    if not excluded:
        excluded = next((term for term in EXCLUDED_ROSTER_TERMS if term in text), None)
    if excluded:
        return {"included": False, "category": None,
                "reason": "excluded_%s" % excluded.replace(" ", "_")}
    matched = [(term, category) for term, category in AGRICULTURE_TERMS.items()
               if term in text]
    if "ag" in set(name.split()):
        matched.append(("ag", "agriculture"))
    if not matched:
        return {"included": False, "category": None, "reason": "not_agricultural"}
    # Prefer the most specific/longest matching term for the audit category.
    term, category = sorted(matched, key=lambda value: (-len(value[0]), value[0]))[0]
    return {"included": True, "category": category, "reason": "matched_%s" % term}


def aggregate(studies, retries=4, delay=0.1):
    totals, report = {}, []
    included_studies = [study for study in studies if is_isa_study(study)]
    for index, study in enumerate(included_studies, 1):
        study_id, iso3, year = fetch_lsms.study_identity(study)
        files = fetch_lsms.study_files(study_id, retries)
        selected = []
        for item in files:
            classification = classify_agriculture_file(item)
            item["agricultureClassification"] = classification
            if classification["included"]:
                selected.append(item)
        observations = sum(item["caseCount"] for item in selected)
        if observations:
            yearly = totals.setdefault(iso3, {})
            yearly[str(year)] = yearly.get(str(year), 0) + observations
        report.append({
            "studyId": study_id, "catalogId": study.get("id"),
            "title": str(study.get("title") or ""), "country": str(study.get("nation") or ""),
            "iso3": iso3, "year": year, "yearEnd": study.get("year_end"),
            "accessType": str(study.get("form_model") or ""),
            "agriculturalObservations": observations,
            "includedFileCount": len(selected),
            "includedFileIds": [item["fileId"] for item in selected], "files": files,
        })
        print("[%2d/%2d] %s  %s agricultural file rows in %d files" %
              (index, len(included_studies), study_id, format(observations, ","), len(selected)))
        if delay:
            time.sleep(delay)
    return ({iso: dict(sorted(yearly.items())) for iso, yearly in sorted(totals.items())},
            sorted(report, key=lambda item: (item["iso3"], item["year"], item["studyId"])))


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--report", default=DEFAULT_REPORT)
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--delay", type=float, default=0.1)
    parser.add_argument("--retries", type=int, default=4)
    args = parser.parse_args()
    if args.page_size < 1 or args.delay < 0 or args.retries < 1:
        parser.error("page size and retries must be positive; delay must be non-negative")
    return args


def main():
    args = parse_args()
    studies = fetch_lsms.collection_studies(args.page_size, args.retries)
    totals, studies_report = aggregate(studies, args.retries, args.delay)
    observations = sum(count for yearly in totals.values() for count in yearly.values())
    metadata = {
        "source": "World Bank Microdata Library NADA REST API",
        "sourceUrl": "https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA",
        "collection": "lsms", "partnerCountries": sorted(ISA_SERIES),
        "observationDefinition": "sum of case_count across classified agricultural data files",
        "uniqueEntityCount": False,
        "interpretation": "file-row records; entities may recur across agricultural modules",
        "countries": len(totals), "studies": len(studies_report), "observations": observations,
    }
    fetch_lsms.write_json_atomic(args.output, totals)
    fetch_lsms.write_json_atomic(args.report, {"_meta": metadata, "studies": studies_report}, indent=2)
    print("Wrote %s: %d countries and %s agricultural file-row observations" %
          (args.output, len(totals), format(observations, ",")))
    print("Wrote %s: study/file classifications and provenance" % args.report)


if __name__ == "__main__":
    main()
