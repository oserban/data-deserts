#!/usr/bin/env python3
"""Build static app data from ecology and household-survey datasets.

Reads country/year record counts from:

    data/biotime.json
    data/living_planet.json
    data/predicts.json
    data/dhs.json
    data/mics.json
    data/gbif.json
    data/lsms_isa.json
    data/lsms.json

Each input and the aggregate use the same shape:

    {"GBR": {"1993": 120, "1994": 137}, "ZAF": {"2001": 42}}

Writes:

    ../app/data/world.js
    ../app/data/datasets.js
    ../do-app-wall/src/data/world.json
    ../do-app-wall/src/data/datasets.json

Run from the repository root:

    python3 processing/build_data.py
"""

import json
import math
import os

from data_deserts import load_geojson
from fetch_predicts import RELEASES as PREDICTS_RELEASES
from fetch_gbif import ALLOWED_BASIS_OF_RECORD


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
APP_DATA_DIR = os.path.join(HERE, "..", "app", "data")
WALL_DATA_DIR = os.path.join(HERE, "..", "do-app-wall", "src", "data")
BOUNDARIES_PATH = os.path.join(DATA_DIR, "world.raw.geojson")


def ring_area(coordinates):
    """Approximate a GeoJSON ring area in square kilometres on a sphere."""
    if not coordinates or len(coordinates) < 3:
        return 0
    radians = math.pi / 180
    total = 0
    for index, coordinate in enumerate(coordinates):
        previous = coordinates[(index - 1) % len(coordinates)]
        following = coordinates[(index + 1) % len(coordinates)]
        total += ((following[0] - previous[0]) * radians *
                  math.sin(coordinate[1] * radians))
    return abs(total * 6371.0088 * 6371.0088 / 2)


def geometry_area(geometry):
    polygons = ([geometry["coordinates"]] if geometry["type"] == "Polygon"
                else geometry["coordinates"])
    return sum(sum(ring_area(ring) * (1 if index == 0 else -1)
                   for index, ring in enumerate(polygon))
               for polygon in polygons)

DATASET_DEFINITIONS = {
    "biotime": {
        "name": "BioTIME",
        "file": "biotime.json",
        "domain": "Ecology",
        "url": "https://biotime.st-andrews.ac.uk/",
        "description": "individual taxon observations recorded during repeated biodiversity surveys; these are observation rows, not species or animals",
        "unit": "records",
        "color": "#55c271",
    },
    "living_planet": {
        "name": "Living Planet Database",
        "file": "living_planet.json",
        "domain": "Ecology",
        "url": "https://livingplanetindex.org/data_portal",
        "description": "yearly measurements within monitored vertebrate population time series; these are population measurements, not individual animals",
        "unit": "observations",
        "color": "#57a5e5",
    },
    "predicts": {
        "name": "PREDICTS",
        "file": "predicts.json",
        "domain": "Ecology",
        "url": "https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1",
        "description": "distinct terrestrial biodiversity sampling sites from PREDICTS 2016 V1.1 and the November 2022 additions, deduplicated by source/study/block/site and assigned to the sampling midpoint year",
        "unit": "sites",
        "color": "#f2c94c",
    },
    "gbif": {
        "name": "GBIF",
        "file": "gbif.json",
        "domain": "Ecology",
        "url": "https://www.gbif.org/occurrence/search",
        "description": "GBIF human observations, machine observations and living specimens with coordinates, no flagged geospatial issues and present status; all other basis-of-record types are excluded",
        "unit": "occurrences",
        "color": "#2ec4b6",
    },
    "lsms_isa": {
        "name": "LSMS-ISA",
        "file": "lsms_isa.json",
        "domain": "Agriculture",
        "url": "https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA",
        "description": "rows in LSMS-ISA agricultural survey modules, such as plot, crop, livestock, or household agricultural records",
        "unit": "agricultural records",
        "color": "#e89b3c",
    },
    "dhs": {
        "name": "DHS",
        "file": "dhs.json",
        "domain": "Public Health",
        "url": "https://dhsprogram.com/",
        "description": "unique completed DHS Program surveys with published indicators, counted once per survey ID in the principal survey year; counts represent surveys, not people or households",
        "unit": "surveys",
        "color": "#e45c5c",
    },
    "mics": {
        "name": "MICS",
        "file": "mics.json",
        "domain": "Public Health",
        "url": "https://mics.unicef.org/surveys",
        "description": "women's and men's interview records in selected MICS individual files; household and child files are excluded, and counts do not establish unique people across surveys",
        "unit": "interview records",
        "color": "#c96bd8",
    },
    "lsms": {
        "name": "LSMS",
        "file": "lsms.json",
        "domain": "Public Health",
        "url": "https://microdata.worldbank.org/catalog/lsms",
        "description": "person rows in selected LSMS household roster files",
        "unit": "roster records",
        "color": "#7f8ce0",
    },
}

SCOPE_DATASETS = ["dhs"]
ALLOW_UNMAPPED_DATASETS = {"dhs", "mics", "gbif", "lsms"}
CATEGORY_ORDER = ["Ecology", "Agriculture", "Public Health"]


def load_records(path):
    """Load and validate one ISO3/year/count mapping."""
    with open(path, encoding="utf-8") as source:
        raw = json.load(source)
    records = {}
    for iso, yearly in raw.items():
        if not isinstance(iso, str) or not isinstance(yearly, dict):
            raise ValueError("Invalid country/year mapping in %s" % path)
        clean_yearly = {}
        for year, count in yearly.items():
            year_text = str(year)
            if len(year_text) != 4 or not year_text.isdigit():
                raise ValueError("Invalid year %r in %s" % (year, path))
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                raise ValueError("Invalid count for %s/%s in %s" % (iso, year, path))
            if count:
                clean_yearly[year_text] = count
        if clean_yearly:
            records[iso] = dict(sorted(clean_yearly.items()))
    return dict(sorted(records.items()))


def aggregate_records(datasets, allowed_iso=None):
    """Sum dataset country/year counts, optionally within a country scope."""
    aggregate = {}
    for dataset in datasets.values():
        for iso, yearly in dataset["records"].items():
            if allowed_iso is not None and iso not in allowed_iso:
                continue
            country = aggregate.setdefault(iso, {})
            for year, count in yearly.items():
                country[year] = country.get(year, 0) + count
    return {
        iso: dict(sorted(yearly.items()))
        for iso, yearly in sorted(aggregate.items())
    }


def load_dhs_coverage(path, records):
    """Validate survey units against provenance before either app can use them."""
    with open(path, encoding="utf-8") as source:
        report = json.load(source)
    meta = report.get("_meta", {})
    refresh = "Run python3 processing/fetch_dhs.py to refresh DHS survey coverage."
    if meta.get("schemaVersion") != 2 or meta.get("unit") != "surveys":
        raise ValueError("DHS data still uses the old participant schema. " + refresh)
    if not meta.get("nutritionDefinition"):
        raise ValueError("DHS nutrition definition is missing. " + refresh)
    totals, coverage, seen = {}, {}, set()
    for survey in report["surveys"]:
        survey_id = survey["surveyId"]
        if not survey_id or survey_id in seen:
            raise ValueError("Missing or duplicate DHS survey ID. " + refresh)
        seen.add(survey_id)
        iso, year = survey["iso3"], str(survey["year"])
        topics = survey["nutritionTopics"]
        if ((survey["nutrition"] is not True and survey["nutrition"] is not None) or
                (survey["nutrition"] is True) != bool(topics)):
            raise ValueError("Inconsistent DHS nutrition evidence. " + refresh)
        yearly = totals.setdefault(iso, {})
        yearly[year] = yearly.get(year, 0) + 1
        entry = coverage.setdefault(iso, {}).setdefault(year, {
            "year": int(year), "labels": set(), "surveyCount": 0,
            "nutrition": None, "nutritionTopics": set(), "surveyTypes": set(),
        })
        entry["labels"].add(survey["yearLabel"])
        entry["surveyTypes"].add(survey["surveyType"])
        entry["surveyCount"] += 1
        entry["nutritionTopics"].update(topics)
        if survey["nutrition"] is True:
            entry["nutrition"] = True
    if totals != records:
        raise ValueError("DHS counts do not match unique surveys in dhs_report.json. " + refresh)
    result = {}
    for iso, yearly in sorted(coverage.items()):
        result[iso] = []
        for year, entry in sorted(yearly.items()):
            entry["label"] = ", ".join(sorted(entry.pop("labels")))
            entry["nutritionTopics"] = sorted(entry["nutritionTopics"])
            entry["surveyTypes"] = sorted(entry["surveyTypes"])
            result[iso].append(entry)
    return result, meta["nutritionDefinition"]


def load_predicts_sources(path, records):
    """Reject a stale single-release aggregate before labelling it as combined."""
    refresh = "Run python3 processing/fetch_predicts.py to refresh both PREDICTS releases."
    if not os.path.exists(path):
        raise ValueError("PREDICTS release provenance is missing. " + refresh)
    with open(path, encoding="utf-8") as source:
        report = json.load(source)
    meta = report.get("_meta", {})
    releases = report.get("releases", [])
    expected = {release["resourceId"] for release in PREDICTS_RELEASES}
    actual = {release.get("resourceId") for release in releases}
    if (meta.get("schemaVersion") != 1 or meta.get("unit") != "sites" or
            len(releases) != len(expected) or actual != expected):
        raise ValueError("PREDICTS provenance must include V1.1 and the 2022 additions. " + refresh)
    total = sum(count for yearly in records.values() for count in yearly.values())
    if total != meta.get("matched") or total != sum(release["matched"] for release in releases):
        raise ValueError("PREDICTS counts do not match release provenance. " + refresh)
    return [{"name": release["name"], "url": release["url"]} for release in PREDICTS_RELEASES]


def load_gbif_filters(path, records):
    """Prevent cached counts from the former GBIF filter entering either app."""
    refresh = "Run python3 processing/fetch_gbif.py to refresh GBIF with the current filters."
    if not os.path.exists(path):
        raise ValueError("GBIF filter provenance is missing. " + refresh)
    with open(path, encoding="utf-8") as source:
        report = json.load(source)
    meta = report.get("_meta", {})
    filters = meta.get("filters", {})
    if set(filters.get("basisOfRecordIncluded", [])) != set(ALLOWED_BASIS_OF_RECORD):
        raise ValueError("GBIF counts use an outdated basis-of-record filter. " + refresh)
    country_totals = {iso: sum(yearly.values()) for iso, yearly in records.items()}
    reported_totals = {iso: details["records"] for iso, details in report.get("byCountry", {}).items()
                       if details["records"]}
    if country_totals != reported_totals or sum(country_totals.values()) != meta.get("records"):
        raise ValueError("GBIF counts do not match filter provenance. " + refresh)
    return filters


def dataset_summary(records):
    years = [int(year) for yearly in records.values() for year in yearly]
    return {
        "countries": len(records),
        "records": sum(count for yearly in records.values() for count in yearly.values()),
        "yearMin": min(years) if years else None,
        "yearMax": max(years) if years else None,
    }


def restrict_to_dhs_timeline(datasets):
    """Keep app coverage from the first DHS survey, preserving source inputs."""
    first_year = dataset_summary(datasets["dhs"]["records"])["yearMin"]
    if first_year is None:
        raise ValueError("Cannot define the app timeline without DHS surveys")
    for dataset in datasets.values():
        records = {}
        for iso, yearly in dataset["records"].items():
            retained = {year: count for year, count in yearly.items()
                        if int(year) >= first_year}
            if retained:
                records[iso] = retained
        dataset["records"] = records
        dataset["summary"] = dataset_summary(records)
    return first_year


def write_javascript(path, assignments):
    """Atomically write one or more ``window.NAME = value`` assignments."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        for name, value in assignments:
            output.write("window.%s = " % name)
            json.dump(value, output, ensure_ascii=False, separators=(",", ":"))
            output.write(";\n")
    os.replace(temporary, path)


def write_json(path, value):
    """Atomically write a compact JSON artifact."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def export_world_map(source_path=BOUNDARIES_PATH, output_dir=APP_DATA_DIR):
    """Validate the source GeoJSON and export it for direct browser loading.

    The static app cannot load a local GeoJSON file with ``fetch`` when opened via
    ``file://``, so the map is wrapped in a ``window.WORLD_GEOJSON`` assignment.
    The parsed document is returned for validating dataset ISO3 identifiers.
    """
    world = load_geojson(source_path)
    if world.get("type") != "FeatureCollection" or not isinstance(world.get("features"), list):
        raise ValueError("World map must be a GeoJSON FeatureCollection: %s" % source_path)
    if not world["features"]:
        raise ValueError("World map contains no features: %s" % source_path)

    feature_ids = []
    for index, feature in enumerate(world["features"]):
        if feature.get("type") != "Feature":
            raise ValueError("GeoJSON item %d is not a Feature" % index)
        feature_id = feature.get("id")
        geometry = feature.get("geometry") or {}
        if feature_id is None:
            raise ValueError("GeoJSON feature %d has no country id" % index)
        if geometry.get("type") not in ("Polygon", "MultiPolygon"):
            raise ValueError("GeoJSON feature %s has unsupported geometry %r" %
                             (feature_id, geometry.get("type")))
        feature.setdefault("properties", {})["areaKm2"] = round(
            max(1, geometry_area(geometry)), 2)
        feature_ids.append(str(feature_id))
    duplicates = sorted({feature_id for feature_id in feature_ids
                         if feature_ids.count(feature_id) > 1 and feature_id != "-99"})
    if duplicates:
        raise ValueError("World map contains duplicate feature ids: %s" % ", ".join(duplicates))

    output_path = os.path.join(output_dir, "world.js")
    write_javascript(output_path, [("WORLD_GEOJSON", world)])
    write_json(os.path.join(WALL_DATA_DIR, "world.json"), world)
    print("World map                %3d country features -> app/data/world.js" %
          len(world["features"]))
    return world


def main():
    world = export_world_map()
    valid_iso = {str(feature["id"]) for feature in world["features"]}
    datasets = {}
    for key, definition in DATASET_DEFINITIONS.items():
        records = load_records(os.path.join(DATA_DIR, definition["file"]))
        metadata = {}
        if key == "dhs":
            survey_years, nutrition_definition = load_dhs_coverage(
                os.path.join(DATA_DIR, "dhs_report.json"), records)
            metadata["surveyYears"] = {
                iso: years for iso, years in survey_years.items() if iso in valid_iso
            }
            metadata["nutritionDefinition"] = nutrition_definition
            metadata["description"] = definition["description"] + ". " + nutrition_definition
        if key == "predicts":
            metadata["sources"] = load_predicts_sources(
                os.path.join(DATA_DIR, "predicts_report.json"), records)
        if key == "gbif":
            metadata["filters"] = load_gbif_filters(
                os.path.join(DATA_DIR, "gbif_report.json"), records)
        unknown = sorted(set(records).difference(valid_iso))
        if unknown:
            if key not in ALLOW_UNMAPPED_DATASETS:
                raise ValueError("%s contains ISO3 codes absent from the map: %s" %
                                 (definition["file"], ", ".join(unknown)))
            print("%s countries absent from the low-resolution map (omitted): %s" %
                  (definition["name"], ", ".join(unknown)))
            records = {iso: yearly for iso, yearly in records.items() if iso in valid_iso}
        dataset = {name: value for name, value in definition.items() if name != "file"}
        dataset["records"] = records
        dataset.update(metadata)
        dataset["summary"] = dataset_summary(records)
        datasets[key] = dataset

    unknown_categories = sorted({dataset["domain"] for dataset in datasets.values()}
                                .difference(CATEGORY_ORDER))
    if unknown_categories:
        raise ValueError("Datasets use categories missing from CATEGORY_ORDER: %s" %
                         ", ".join(unknown_categories))

    first_dhs_year = restrict_to_dhs_timeline(datasets)
    scope_iso = set().union(*(datasets[key]["records"] for key in SCOPE_DATASETS))
    for dataset in datasets.values():
        scoped_records = {iso: yearly for iso, yearly in dataset["records"].items()
                          if iso in scope_iso}
        dataset["scopeSummary"] = dataset_summary(scoped_records)

    aggregate = aggregate_records(datasets, allowed_iso=scope_iso)
    aggregate_summary = dataset_summary(aggregate)
    meta = {
        "datasetOrder": list(DATASET_DEFINITIONS),
        "categoryOrder": CATEGORY_ORDER,
        "datasetCount": len(datasets),
        "scopeDatasets": SCOPE_DATASETS,
        "scopeCountries": len(scope_iso),
        "yearMin": first_dhs_year,
        "yearMax": aggregate_summary["yearMax"],
        "aggregate": aggregate_summary,
    }

    write_javascript(os.path.join(APP_DATA_DIR, "datasets.js"), [
        ("DATASETS", datasets),
        ("AGGREGATED_RECORDS", aggregate),
        ("META", meta),
    ])
    write_json(os.path.join(WALL_DATA_DIR, "datasets.json"), {
        "datasets": datasets,
        "meta": meta,
    })

    for key in meta["datasetOrder"]:
        summary = datasets[key]["summary"]
        year_range = ("%d-%d" % (summary["yearMin"], summary["yearMax"])
                      if summary["yearMin"] is not None else "no records")
        print("%-24s %3d countries  %9s records  %s" %
              (datasets[key]["name"], summary["countries"],
               format(summary["records"], ","), year_range))
    print("%-24s %3d countries  %9s records  %d-%d" %
          ("Aggregate", aggregate_summary["countries"],
           format(aggregate_summary["records"], ","),
           aggregate_summary["yearMin"], aggregate_summary["yearMax"]))
    print("Wrote legacy app/data JavaScript and do-app-wall src/data JSON artifacts")


if __name__ == "__main__":
    main()
