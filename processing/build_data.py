#!/usr/bin/env python3
"""Build static app data from ecology, hydrology and household-survey datasets.

Reads country/year record counts from:

    data/biotime.json
    data/living_planet.json
    data/predicts.json
    data/dhs.json
    data/mics.json
    data/gbif.json
    data/lsms_isa.json
    data/grdc.json
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
import copy
import math
import os

from fetch_lsms import apply_estimates
from data_deserts import load_geojson
from fetch_predicts import RELEASES as PREDICTS_RELEASES
from fetch_gbif import ALLOWED_BASIS_OF_RECORD
from fetch_grdc import COUNTING_METHOD as GRDC_COUNTING_METHOD, UNIT as GRDC_UNIT
from fetch_crop_allocation import METHOD as CROP_METHOD, UNIT as CROP_UNIT, CROPS, evidence_counts, MAP_BOUNDARIES, digest


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
APP_DATA_DIR = os.path.join(HERE, "..", "app", "data")
WALL_DATA_DIR = os.path.join(HERE, "..", "do-app-wall", "src", "data")
BOUNDARIES_PATH = str(MAP_BOUNDARIES)


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
    "grdc": {
        "name": "GRDC",
        "file": "grdc.json",
        "domain": "Hydrology",
        "url": "https://grdc.bafg.de/data/data_portal/",
        "description": "observed river-discharge station-years: each GRDC station counts once in each year with at least one valid daily or monthly observation; zero flow is valid, missing values are excluded, and overlapping files are deduplicated; multi-year totals are station-years, not unique stations or discharge volume",
        "unit": GRDC_UNIT,
        "color": "#38aee8",
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
CATEGORY_ORDER = ["Ecology", "Agriculture", "Hydrology", "Public Health"]

CROP_DEFINITIONS = {
    key: {"name": name, "file": key + ".json", "domain": "Agriculture", "url": url,
          "unit": CROP_UNIT, "color": color,
          "description": "documented census-reporting administrative units, deduplicated across crops and irrigation modes within each year; pixels and allocated calendar entries are not observations; allocation measures describe spatial allocation and do not select a reference product"}
    for key, name, url, color in [
        ("mapspam", "MapSPAM", "https://www.mapspam.info/data/", "#db8c35"),
        ("gaez", "GAEZ actual area", "https://www.fao.org/gaez/gaezv4/en", "#c8ab45"),
        ("mirca2000", "MIRCA2000", "https://zenodo.org/records/7422506", "#a2b04c"),
        ("mirca_os", "MIRCA-OS", "https://doi.org/10.1038/s41597-024-04313-w", "#73af88"),
    ]
}

AGRICULTURE_DEFINITION = {
    "name": "Agricultural map support", "domain": "Agriculture", "color": "#d6ac54",
    "url": "https://doi.org/10.1038/s41597-024-04313-w", "unit": CROP_UNIT,
    "agricultureAggregate": True,
    "description": "country-level map availability across crops by default; reporting-unit coverage remains available as an alternative aggregate",
}
HYDRO_DEFINITION = {
    "name": "Hydrology map support", "domain": "Hydrology", "color": "#4ca6d9",
    "url": "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means",
    "unit": "map comparisons", "hydroAggregate": True,
    "description": "precomputed country-level comparison of precipitation, cropland extent and irrigated-area maps; it is a map metric, not a record-coverage score",
}


def agriculture_payload(directory, valid_iso, expected_geometry_sha=None):
    """Export counts and allocation measures separately; absence is never a zero CV.

    Source census-unit identities remain distinct from the country analysis geometry. Evidence
    from multiple products/crops must not inflate the aggregate observation count.
    """
    crops = {crop: {"name": crop.replace('_', ' ').capitalize(), "color": '#d6ac54',
                    "records": {}, "metrics": {}} for crop in CROPS}
    result = {"schemaVersion": 1, "cropOrder": list(crops), "crops": crops, "records": {},
              "effective_resolution_km": {}, "aggregateMetrics": {},
              "status": "unavailable", "reason": "Verified census evidence linked to map countries is not yet available.",
              "defaultMetric": "dispersion", "defaultAggregation": "dispersion",
              "dispersionDefinition": "Mean native-cell CV of country-normalised harvested-area shares; mean of available years in the selected window.",
              "similarityDefinition": "Mean pairwise overlap of country-normalised allocation shares among available products. It compares map patterns and does not select a reference product.",
              "sourceAvailabilityDefinition": "Available positive-area product maps divided by the eligible products for the crop/year. It does not compare map patterns.",
              "resolutionDefinition": "Coarsest effective resolution among available years; missing years are not interpolated.",
              "coverageDefinition": "0.6 × log1p(reporting units per million km²) / log1p(pool maximum density) + 0.4 × years with reports / selected years.",
              "aggregateDefinition": "Per-country, per-year crop aggregates are precomputed from the available crop comparisons. Dispersion, similarity and source availability are arithmetic means across crops; effective resolution is the largest crop result."
              }
    path = os.path.join(directory, 'crop_allocation_report.json')
    if not os.path.exists(path):
        return result
    with open(path, encoding='utf-8') as source:
        report = json.load(source)
    meta = report.get('_meta', {})
    if meta.get('countingMethod') != CROP_METHOD or meta.get('unit') != CROP_UNIT:
        raise ValueError('Unsupported agriculture evidence method')
    geometry = meta.get('analysisGeometry', {})
    if expected_geometry_sha is not None and (geometry.get('sha256') != expected_geometry_sha or
                                               geometry.get('scope') != 'map country'):
        raise ValueError('Agriculture geometry differs from dashboard map; rerun fetch_crop_allocation.py --reconcile-evidence')
    result['analysisGeometry'] = geometry
    evidence_counts(report['evidence'])  # Reject estimated or unsourced observations.
    unit_sets, crop_sets = {}, {}
    for row in report['evidence']:
        iso, year, crop = row['country_iso3'], str(row['year']), row['crop']
        if iso not in valid_iso or crop not in crops:
            continue
        unit = (int(row['admin_level']), str(row['admin_unit_id']))
        unit_sets.setdefault((iso, year), set()).add(unit)
        crop_sets.setdefault((crop, iso, year), set()).add(unit)
    for (iso, year), units in unit_sets.items():
        result['records'].setdefault(iso, {})[year] = len(units)
    for (crop, iso, year), units in crop_sets.items():
        crops[crop]['records'].setdefault(iso, {})[year] = len(units)
    availability = {}
    for row in report.get('source_availability', []):
        iso, year, crop = row['country_iso3'], str(row['year']), row['crop']
        if iso not in valid_iso or crop not in crops:
            continue
        key = (iso, year, crop)
        if key in availability:
            raise ValueError('Duplicate agriculture source availability')
        value = row.get('source_availability')
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError('Invalid agriculture source availability')
        availability[key] = row
    seen = set()
    for row in report.get('effective_resolution', []):
        iso, year, crop = row['country_iso3'], str(row['year']), row['crop']
        if iso not in valid_iso or crop not in crops:
            continue
        key = (iso, year, crop)
        if key in seen:
            raise ValueError('Duplicate agriculture country/crop/year metric')
        seen.add(key)
        cv, resolution, similarity = (row.get('dispersion_at_native_cell'), row.get('effective_resolution_km'),
                                      row.get('allocation_similarity'))
        for label, value in [('dispersion', cv), ('effective resolution', resolution), ('allocation similarity', similarity)]:
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or
                                      value < 0 or (label == 'effective resolution' and value == 0)):
                raise ValueError('Invalid agriculture ' + label)
        complete = row.get('complete', resolution is not None)
        if type(complete) is not bool:
            raise ValueError('Invalid agriculture completeness flag')
        flag = row.get('crosswalk_exactness')
        if flag not in ('exact', 'aggregated', 'approximate'):
            raise ValueError('Missing agriculture crosswalk exactness')
        crops[crop]['metrics'].setdefault(iso, {})[year] = {
            'dispersion': cv if complete else None, 'resolution': resolution if complete else None,
            'allocationSimilarity': similarity if complete else None,
            'sourceAvailability': availability.get(key, {}).get('source_availability'),
            'products': row.get('products', []), 'nProducts': row.get('n_products', 0),
            'crosswalkExactness': flag, 'complete': complete,
        }
        result['effective_resolution_km'].setdefault(iso, {}).setdefault(year, {})[crop] = resolution if complete else None
    for (iso, year, crop), row in availability.items():
        metric = crops[crop]['metrics'].setdefault(iso, {}).setdefault(year, {
            'dispersion': None, 'resolution': None, 'allocationSimilarity': None,
            'sourceAvailability': None, 'products': [], 'nProducts': 0,
            'crosswalkExactness': 'exact', 'complete': False,
        })
        metric['sourceAvailability'] = row['source_availability']
        metric['products'] = row['products']
        metric['nProducts'] = row['n_products']
    # Precompute the country/year aggregate once.  The dashboard only reads
    # these summaries; it never derives an agriculture score from rasters.
    aggregate_values = {}
    for crop in crops.values():
        for iso, years in crop['metrics'].items():
            for year, metric in years.items():
                bucket = aggregate_values.setdefault(iso, {}).setdefault(year, {
                    'dispersion': [], 'resolution': [], 'allocationSimilarity': [],
                    'sourceAvailability': [], 'crosswalkExactness': []
                })
                if metric['complete']:
                    for field in ('dispersion', 'resolution', 'allocationSimilarity'):
                        if isinstance(metric.get(field), (int, float)) and math.isfinite(metric[field]):
                            bucket[field].append(metric[field])
                if isinstance(metric.get('sourceAvailability'), (int, float)) and math.isfinite(metric['sourceAvailability']):
                    bucket['sourceAvailability'].append(metric['sourceAvailability'])
                bucket['crosswalkExactness'].append(metric['crosswalkExactness'])
    exactness_rank = {'exact': 0, 'aggregated': 1, 'approximate': 2}
    for iso, years in aggregate_values.items():
        result['aggregateMetrics'][iso] = {}
        for year, values in years.items():
            result['aggregateMetrics'][iso][year] = {
                'dispersion': (sum(values['dispersion']) / len(values['dispersion'])
                               if values['dispersion'] else None),
                'resolution': max(values['resolution']) if values['resolution'] else None,
                'allocationSimilarity': (sum(values['allocationSimilarity']) / len(values['allocationSimilarity'])
                                         if values['allocationSimilarity'] else None),
                'sourceAvailability': (sum(values['sourceAvailability']) / len(values['sourceAvailability'])
                                       if values['sourceAvailability'] else None),
                'nCrops': len(values['dispersion']),
                'crosswalkExactness': max(values['crosswalkExactness'], key=lambda value: exactness_rank[value])
                                      if values['crosswalkExactness'] else None,
                'complete': bool(values['dispersion']),
            }
    if result['records'] or any(
        value['dispersion'] is not None or value['resolution'] is not None or value['sourceAvailability'] is not None
        for crop in crops.values() for years in crop['metrics'].values() for value in years.values()
    ):
        result.update(status='available', reason='Allocation scores compare country-normalised harvested-area shares. Source availability remains visible when a crop/year has fewer than two positive-area products.')
        if (report.get('reconciliation') or {}).get('status') == 'partial':
            result['reason'] = ('Partial census reconciliation: supported source tables only. '
                                'Raster allocation measures remain available independently of the evidence table.')
    return result


def hydro_payload(directory, valid_iso):
    """Expose validated hydro-map metrics without turning unavailable inputs into zeroes."""
    result = {"schemaVersion": 1, "status": "unavailable",
              "reason": "Hydro comparison rasters have not been processed yet.",
              "defaultMetric": "dispersion", "variables": {},
              "variableOrder": ["precipitation", "cropland_extent", "irrigated_area_extent"],
              "excluded": {"rainfed_area_extent": "ESA CCI Medium Resolution Land Cover has no defensible rainfed class."}}
    path = os.path.join(directory, "hydro_comparisons", "hydro_report.json")
    if not os.path.exists(path):
        return result
    with open(path, encoding="utf-8") as source:
        payload = json.load(source)
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported hydro comparison schema")
    variables = payload.get("variables", {})
    if set(variables) - set(result["variableOrder"]):
        raise ValueError("Hydro report includes an unapproved comparison")
    for key, value in variables.items():
        if value.get("name") is None or not isinstance(value.get("metrics", {}), dict):
            raise ValueError("Invalid hydro comparison payload")
    result.update(payload)
    return result


def load_crop_sources(directory):
    """Register only audited reporting counts; unavailable evidence is not zero."""
    path = os.path.join(directory, "crop_allocation_report.json")
    if not os.path.exists(path):
        if any(os.path.exists(os.path.join(directory, d["file"])) for d in CROP_DEFINITIONS.values()):
            raise ValueError("Crop evidence counts exist without their audit report")
        return {}, {}
    with open(path, encoding="utf-8") as source:
        report = json.load(source)
    meta = report["_meta"]
    if meta.get("schemaVersion") != 1 or meta.get("countingMethod") != CROP_METHOD or meta.get("unit") != CROP_UNIT:
        raise ValueError("Unsupported crop-allocation evidence method")
    counts = evidence_counts(report["evidence"])
    definitions, metadata = {}, {}
    for key, definition in CROP_DEFINITIONS.items():
        records = load_records(os.path.join(directory, definition["file"]))
        if records != counts.get(key, {}):
            raise ValueError("Crop reporting counts do not match evidence: " + key)
        if not records:
            continue
        resolutions = {}
        for row in report["effective_resolution"]:
            iso, year, value = row["country_iso3"], str(row["year"]), row["effective_resolution_km"]
            if value is not None and (not isinstance(value, (float, int)) or isinstance(value, bool)
                                      or not math.isfinite(value) or value <= 0):
                raise ValueError("Invalid crop effective resolution")
            if iso in records and year in records[iso]:
                resolutions.setdefault(iso, {}).setdefault(year, {})[row["crop"]] = value
        definitions[key] = definition
        metadata[key] = {
            "coverage": {"countingMethod": CROP_METHOD, "independentProducts": False},
            "crosswalk": [r for r in report["crosswalk"] if r["product"] == key],
            "effective_resolution_km": resolutions,
            "spatialSupport": {"display": "country summaries", "countryWeighting": meta["countryWeighting"],
                               "tolerance": meta["tolerance"], "unknownResolution": "do not render a raster"},
        }
    return definitions, metadata


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


def load_grdc_coverage(path, records):
    """Validate yearly counts against deduplicated station-year provenance."""
    with open(path, encoding="utf-8") as source:
        report = json.load(source)
    meta = report.get("_meta", {})
    refresh = "Run python3 processing/fetch_grdc.py to refresh GRDC coverage."
    if (meta.get("schemaVersion") != 1 or meta.get("unit") != GRDC_UNIT
            or meta.get("countingMethod") != GRDC_COUNTING_METHOD):
        raise ValueError("GRDC provenance has an unsupported counting method. " + refresh)
    counts, seen = {}, set()
    for station in report["stations"]:
        station_id, iso, years = station["stationId"], station["iso3"], station["years"]
        if not station_id or station_id in seen or len(set(years)) != len(years):
            raise ValueError("Duplicate or missing GRDC station/year identity. " + refresh)
        seen.add(station_id)
        if any(type(year) is not int or not 1000 <= year <= 9999 for year in years):
            raise ValueError("Invalid GRDC observation year. " + refresh)
        if iso is not None and years:
            yearly = counts.setdefault(iso, {})
            for year in years:
                yearly[str(year)] = yearly.get(str(year), 0) + 1
    if counts != records or meta.get("stationYears") != sum(sum(y.values()) for y in counts.values()):
        raise ValueError("GRDC counts do not match observed station-years in grdc_report.json. " + refresh)
    return {"countingMethod": GRDC_COUNTING_METHOD, "minimumObservationsPerYear": 1,
            "deduplication": "station ID and observation year", "zeroFlowIsValid": True}


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


def load_lsms_estimates(path, records, valid_iso):
    """Reconstruct observed and estimated records separately from their audit."""
    with open(path, encoding='utf-8') as source:
        report = json.load(source)
    observed, seen = {}, set()
    for study in report['studies']:
        if study['studyId'] in seen:
            raise ValueError('Duplicate LSMS study in audit')
        seen.add(study['studyId'])
        count = study['participants']
        if count is None:
            continue
        selected = [f for f in study['files'] if f['fileId'] == study['selectedFileId']]
        if type(count) is not int or count <= 0 or len(selected) != 1 or selected[0]['caseCount'] != count:
            raise ValueError('LSMS observed count differs from selected roster')
        yearly = observed.setdefault(study['iso3'], {})
        year = str(study['year'])
        yearly[year] = yearly.get(year, 0) + count
    if observed != records:
        raise ValueError('LSMS counts differ from roster audit')
    recalculated = copy.deepcopy(report['studies'])
    estimates, provenance = apply_estimates(recalculated)
    if (estimates != report['_meta'].get('estimatedRecords') or
            provenance != report['_meta'].get('householdEstimation') or
            any(a.get('householdEstimation') != b.get('householdEstimation') or
                a.get('estimatedParticipants') != b.get('estimatedParticipants')
                for a,b in zip(report['studies'], recalculated))):
        raise ValueError('LSMS estimates are stale or differ from resource evidence; rerun fetch_lsms.py --reprocess-report processing/data/lsms_report.json')
    return {'estimatedRecords': {iso:y for iso,y in estimates.items() if iso in valid_iso},
            'householdEstimation': provenance,
            'estimationDescription': 'Estimated household members = reviewed household rows × a cited household-size mean. These are not interview counts. Observed rosters always take priority.'}


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
        if 'estimatedRecords' in dataset:
            dataset['estimatedRecords'] = {iso: kept for iso, yearly in dataset['estimatedRecords'].items()
                if (kept := {year: count for year, count in yearly.items() if int(year) >= first_year})}
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
    load_crop_sources(DATA_DIR)  # Validate per-product files against the same evidence audit.
    agriculture = agriculture_payload(DATA_DIR, valid_iso, digest(MAP_BOUNDARIES))
    hydro = hydro_payload(DATA_DIR, valid_iso)
    definitions = {}
    for key, definition in DATASET_DEFINITIONS.items():
        if key == "grdc":
            definitions['hydro_maps'] = HYDRO_DEFINITION
        definitions[key] = definition
        if key == "lsms_isa":
            definitions['agriculture_maps'] = AGRICULTURE_DEFINITION
    # The sector sequence is also the clockwise donut sequence.  Keep domains
    # contiguous, and put the two map-comparison aggregates at the shared
    # Agriculture/Hydrology boundary so they can be read together.
    definitions = {
        key: definitions[key]
        for key in sorted(
            definitions,
            key=lambda key: CATEGORY_ORDER.index(definitions[key]['domain']))
    }
    for key, definition in definitions.items():
        records = (agriculture['records'] if key == 'agriculture_maps' else
                   ({iso: {year: value.get('nComponents', 0) for year, value in years.items()}
                     for iso, years in hydro.get('aggregate', {}).get('metrics', {}).items()} if key == 'hydro_maps' else
                    load_records(os.path.join(DATA_DIR, definition["file"]))))
        metadata = {}
        if key == 'agriculture_maps':
            metadata['effective_resolution_km'] = agriculture['effective_resolution_km']
            metadata['spatialSupport'] = {
                'display': 'country summaries', 'countryWeighting': 'mean of nonzero blocks within map country',
                'analysisGeometry': agriculture.get('analysisGeometry'),
                'unknownResolution': 'do not render a raster',
            }
        if key == 'hydro_maps':
            metadata['spatialSupport'] = {
                'display': 'country summaries', 'countryWeighting': 'mean across available approved map comparisons',
                'analysisGeometry': 'map country', 'unknownResolution': 'do not render a raster',
            }
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
        if key == "lsms":
            metadata.update(load_lsms_estimates(os.path.join(DATA_DIR, "lsms_report.json"), records, valid_iso))
        if key == "grdc":
            metadata["coverage"] = load_grdc_coverage(
                os.path.join(DATA_DIR, "grdc_report.json"), records)
        unknown = sorted(set(records).difference(valid_iso))
        if unknown:
            if key not in ALLOW_UNMAPPED_DATASETS and key not in CROP_DEFINITIONS:
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
        "datasetOrder": list(definitions),
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
        ("AGRICULTURE", agriculture),
        ("HYDRO", hydro),
    ])
    write_json(os.path.join(WALL_DATA_DIR, "datasets.json"), {
        "datasets": datasets,
        "meta": meta,
        "agriculture": agriculture,
        "hydro": hydro,
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
