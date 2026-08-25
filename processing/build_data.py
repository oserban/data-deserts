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
        "description": "distinct terrestrial biodiversity sampling sites represented in PREDICTS",
        "unit": "sites",
        "color": "#f2c94c",
    },
    "gbif": {
        "name": "GBIF",
        "file": "gbif.json",
        "domain": "Ecology",
        "url": "https://www.gbif.org/occurrence/search",
        "description": "species-occurrence records published through GBIF after the project filters are applied",
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
        "description": "women and men recorded as interviewed in DHS survey metadata",
        "unit": "participants",
        "color": "#e45c5c",
    },
    "mics": {
        "name": "MICS",
        "file": "mics.json",
        "domain": "Public Health",
        "url": "https://mics.unicef.org/surveys",
        "description": "women and men represented in the selected MICS individual survey files",
        "unit": "participants",
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


def dataset_summary(records):
    years = [int(year) for yearly in records.values() for year in yearly]
    return {
        "countries": len(records),
        "records": sum(count for yearly in records.values() for count in yearly.values()),
        "yearMin": min(years) if years else None,
        "yearMax": max(years) if years else None,
    }


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
        dataset["summary"] = dataset_summary(records)
        datasets[key] = dataset

    unknown_categories = sorted({dataset["domain"] for dataset in datasets.values()}
                                .difference(CATEGORY_ORDER))
    if unknown_categories:
        raise ValueError("Datasets use categories missing from CATEGORY_ORDER: %s" %
                         ", ".join(unknown_categories))

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
        "yearMin": aggregate_summary["yearMin"],
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
