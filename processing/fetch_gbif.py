#!/usr/bin/env python3
"""Fetch cleaned GBIF occurrence counts by ISO3 country and observation year.

The output uses the BioTIME shape: ``{"ARG": {"1990": 123, ...}}``.
Defaults focus on modern animal observations and living specimens.
Use ``--include-plants`` to add plants.

Install once and run from the repository root:

    python3 -m pip install -r processing/requirements.txt
    python3 processing/fetch_gbif.py
"""

import argparse
import datetime
import json
import os
import tempfile
import time


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "gbif.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "gbif_report.json")
COUNTRY_ENUMERATION_URL = "https://api.gbif.org/v1/enumeration/country"

# Explicit researcher-approved allowlist. All other basis types are excluded,
# including preserved museum specimens and generic/unspecified occurrences.
ALLOWED_BASIS_OF_RECORD = [
    "HUMAN_OBSERVATION",
    "MACHINE_OBSERVATION",
    "LIVING_SPECIMEN",
]
EXCLUDED_BASIS_OF_RECORD = [
    "OBSERVATION",
    "PRESERVED_SPECIMEN",
    "MATERIAL_SAMPLE",
    "OCCURRENCE",
    "FOSSIL_SPECIMEN",
    "MATERIAL_CITATION",
]


def require_dependencies():
    # pygbif imports its optional plotting module; give matplotlib a writable
    # cache location in restricted/headless processing environments.
    matplotlib_cache = os.path.join(tempfile.gettempdir(), "data-deserts-matplotlib")
    os.makedirs(matplotlib_cache, exist_ok=True)
    os.environ.setdefault("MPLCONFIGDIR", matplotlib_cache)
    try:
        import requests
        from pygbif import occurrences, species
    except ImportError as error:
        raise SystemExit(
            "Processing dependencies are missing; install them with "
            "`python3 -m pip install -r processing/requirements.txt`") from error
    return requests, occurrences, species


def write_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=indent,
                  separators=None if indent else (",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def fetch_countries(requests, selected=None):
    """Return official GBIF ISO2/ISO3 countries."""
    response = requests.get(
        COUNTRY_ENUMERATION_URL,
        headers={"User-Agent": "data-deserts-pipeline/2.0"},
        timeout=120,
    )
    response.raise_for_status()
    countries = []
    for item in response.json():
        iso2 = str(item.get("iso2") or "").upper()
        iso3 = str(item.get("iso3") or "").upper()
        if len(iso2) != 2 or len(iso3) != 3:
            continue
        if selected and iso2 not in selected:
            continue
        countries.append({"iso2": iso2, "iso3": iso3,
                          "name": str(item.get("title") or iso3)})
    countries.sort(key=lambda item: item["iso3"])
    if selected:
        missing = sorted(selected.difference(item["iso2"] for item in countries))
        if missing:
            raise ValueError("Unknown GBIF country codes: %s" % ", ".join(missing))
    return countries


def resolve_kingdom(species, name):
    """Resolve and validate a kingdom against the current GBIF backbone."""
    match = species.name_backbone(scientificName=name, taxonRank="KINGDOM")
    key = match.get("usageKey") or match.get("usage", {}).get("key")
    matched_name = match.get("scientificName") or match.get("usage", {}).get("name")
    if not key or matched_name != name:
        raise RuntimeError("Could not resolve GBIF kingdom %s: %r" % (name, match))
    return int(key)


def facet_counts(payload, field):
    """Normalize pygbif facet responses across supported response shapes."""
    facets = payload.get("facets") or {}
    counts = None
    if isinstance(facets, dict):
        facet = facets.get(field) or facets.get(field.lower()) or facets.get(field.upper())
        counts = facet.get("counts") if isinstance(facet, dict) and "counts" in facet else facet
    elif isinstance(facets, list):
        for facet in facets:
            if str(facet.get("field", "")).lower() == field.lower():
                counts = facet.get("counts")
                break
    if counts is None:
        raise RuntimeError("GBIF response contains no %s facet: %r" % (field, facets))
    if isinstance(counts, dict):
        return {str(name): int(count) for name, count in counts.items()}
    return {str(item["name"]): int(item["count"]) for item in counts}


def search_with_retries(occurrences, retries, **query):
    for attempt in range(retries):
        try:
            return occurrences.search(**query)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def country_kingdom_years(occurrences, country, kingdom_key,
                          year_min, year_max, retries):
    """Return cleaned year counts for one ISO2 country and kingdom."""
    payload = search_with_retries(
        occurrences,
        retries,
        country=country,
        kingdomKey=kingdom_key,
        hasCoordinate=True,
        hasGeospatialIssue=False,
        occurrenceStatus="PRESENT",
        basisOfRecord=ALLOWED_BASIS_OF_RECORD,
        year="%d,%d" % (year_min, year_max),
        facet="year",
        year_facetLimit=year_max - year_min + 1,
        year_facetOffset=0,
        limit=0,
        timeout=120,
    )
    raw_years = facet_counts(payload, "year")
    years = {}
    for year, count in raw_years.items():
        if year.isdigit() and year_min <= int(year) <= year_max and count > 0:
            years[year] = count
    expected = int(payload.get("count", 0))
    actual = sum(years.values())
    if actual != expected:
        raise RuntimeError(
            "GBIF year facet for %s is incomplete: facet sum %d != query count %d" %
            (country, actual, expected))
    return dict(sorted(years.items()))


def merge_years(target, source):
    for year, count in source.items():
        target[year] = target.get(year, 0) + count


def parse_args():
    current_year = datetime.date.today().year
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="ISO3/year output (default: processing/data/gbif.json)")
    parser.add_argument("--report", default=DEFAULT_REPORT,
                        help="Audit report (default: processing/data/gbif_report.json)")
    parser.add_argument("--include-plants", action="store_true",
                        help="Include Plantae in addition to the default Animalia")
    parser.add_argument("--year-min", type=int, default=1900,
                        help="Earliest occurrence year retained (default: 1900)")
    parser.add_argument("--year-max", type=int, default=current_year,
                        help="Latest occurrence year retained (default: current year)")
    parser.add_argument("--country", action="append", default=[], metavar="ISO2",
                        help="Fetch one ISO2 country; repeat as needed (default: all)")
    parser.add_argument("--delay", type=float, default=0.1,
                        help="Delay between search requests in seconds (default: 0.1)")
    parser.add_argument("--retries", type=int, default=4,
                        help="Attempts per search request (default: 4)")
    args = parser.parse_args()
    if args.year_min < 1000 or args.year_max < args.year_min:
        parser.error("year range must be ordered and use four-digit years")
    if args.year_max > current_year:
        parser.error("--year-max cannot be in the future")
    if args.delay < 0 or args.retries < 1:
        parser.error("--delay must be non-negative and --retries must be positive")
    args.country = {code.strip().upper() for code in args.country if code.strip()}
    if any(len(code) != 2 for code in args.country):
        parser.error("--country values must be two-letter ISO codes")
    return args


def main():
    args = parse_args()
    requests, occurrences, species = require_dependencies()
    kingdom_names = ["Animalia"] + (["Plantae"] if args.include_plants else [])
    kingdom_keys = {name: resolve_kingdom(species, name) for name in kingdom_names}
    countries = fetch_countries(requests, args.country)
    totals = {}
    country_report = {}

    for country_index, country in enumerate(countries, 1):
        combined = {}
        by_kingdom = {}
        for name in kingdom_names:
            years = country_kingdom_years(
                occurrences, country["iso2"], kingdom_keys[name],
                args.year_min, args.year_max, args.retries)
            by_kingdom[name] = sum(years.values())
            merge_years(combined, years)
            if args.delay:
                time.sleep(args.delay)
        combined = dict(sorted(combined.items()))
        if combined:
            totals[country["iso3"]] = combined
        country_report[country["iso3"]] = {
            "name": country["name"], "iso2": country["iso2"],
            "records": sum(combined.values()), "byKingdom": by_kingdom,
            "years": len(combined),
        }
        print("[%3d/%3d] %s  %s records" %
              (country_index, len(countries), country["iso3"],
               format(sum(combined.values()), ",")))

    totals = dict(sorted(totals.items()))
    record_total = sum(count for yearly in totals.values() for count in yearly.values())
    filters = {
        "kingdoms": kingdom_names, "kingdomKeys": kingdom_keys,
        "hasCoordinate": True, "hasGeospatialIssue": False,
        "occurrenceStatus": "PRESENT",
        "basisOfRecordIncluded": ALLOWED_BASIS_OF_RECORD,
        "basisOfRecordExcluded": EXCLUDED_BASIS_OF_RECORD,
        "yearMin": args.year_min, "yearMax": args.year_max,
    }
    metadata = {
        "source": "GBIF occurrence search API via pygbif",
        "sourceUrl": "https://www.gbif.org/occurrence/search",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "countries": len(totals), "records": record_total, "filters": filters,
        "wildOccurrenceLimitation": (
            "Basis-of-record filtering does not establish wild or native status; "
            "LIVING_SPECIMEN can include captive or cultivated organisms."),
    }
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report,
                      {"_meta": metadata, "byCountry": country_report}, indent=2)
    print("Wrote %s: %d countries, %s cleaned records" %
          (args.output, len(totals), format(record_total, ",")))
    print("Wrote %s: query filters and country totals" % args.report)


if __name__ == "__main__":
    main()
