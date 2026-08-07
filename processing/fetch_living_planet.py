#!/usr/bin/env python3
"""Aggregate Living Planet Database population records by country and year.

The Living Planet data portal requires a name, email address, intended use, and
acceptance of its data-use agreement before download. Download the public export
at https://livingplanetindex.org/data_portal, then pass the resulting CSV, gzip,
or ZIP file to this script:

    python3 processing/fetch_living_planet.py \
        --input /path/to/LivingPlanetIndexDatabase_<download-timestamp>.zip

Both long-form exports (one observation per row with a YEAR column) and wide-form
exports (one population per row with columns named 1970, 1971, ...) are supported.
The output counts population observations, not individual animals:

    {"GBR": {"1993": 120, "1994": 137}, "ZAF": {"2001": 42}}
"""

import argparse
import csv
import gzip
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict

from data_deserts import CountryMatcher


HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BOUNDARIES = os.path.join(HERE, "data", "world.raw.geojson")
DEFAULT_OUTPUT = os.path.join(HERE, "data", "living_planet.json")
PORTAL_URL = "https://livingplanetindex.org/data_portal"
FIELD_ALIASES = {
    "year": ("YEAR", "SURVEY_YEAR", "DATA_YEAR"),
    "latitude": ("LATITUDE", "LAT", "DECIMAL_LATITUDE"),
    "longitude": ("LONGITUDE", "LON", "LNG", "LONG", "DECIMAL_LONGITUDE"),
}
MISSING_VALUES = {"", "NA", "N/A", "NAN", "NULL", "NONE", "-"}


def csv_binary_stream(path, member=None):
    """Open a plain, gzip, or ZIP-compressed CSV as a binary stream."""
    raw = open(path, "rb")
    signature = raw.read(4)
    raw.seek(0)
    if signature.startswith(b"PK\x03\x04"):
        archive = zipfile.ZipFile(raw)
        candidates = [name for name in archive.namelist()
                      if name.lower().endswith(".csv") and not name.endswith("/")]
        if member:
            if member not in archive.namelist():
                raise ValueError("ZIP member not found: %s" % member)
            selected = member
        elif len(candidates) == 1:
            selected = candidates[0]
        elif candidates:
            selected = max(candidates, key=lambda name: archive.getinfo(name).file_size)
            print("ZIP contains multiple CSV files; using largest member: %s" % selected,
                  file=sys.stderr)
        else:
            raise ValueError("The ZIP archive contains no CSV files")
        return archive.open(selected), (archive, raw)
    if signature.startswith(b"\x1f\x8b"):
        return gzip.GzipFile(fileobj=raw), (raw,)
    return raw, ()


def normalized_name(name):
    """Normalize an export heading while retaining meaningful words."""
    return re.sub(r"[^A-Z0-9]+", "_", (name or "").strip().upper()).strip("_")


def find_field(fieldnames, kind):
    normalized = {normalized_name(name): name for name in fieldnames}
    for alias in FIELD_ALIASES[kind]:
        if alias in normalized:
            return normalized[alias]
    return None


def year_columns(fieldnames):
    """Return ``[(source heading, year), ...]`` for wide-form year columns."""
    columns = []
    for name in fieldnames:
        match = re.fullmatch(r"(?:X|YR|YEAR)?_?(\d{4})", normalized_name(name))
        if match:
            year = int(match.group(1))
            if 1800 <= year <= 2100:
                columns.append((name, year))
    return columns


def has_value(value):
    return value is not None and value.strip().upper() not in MISSING_VALUES


def aggregate(source_path, boundaries_path, zip_member=None, progress_every=100_000):
    """Return country/year population-observation counts and processing statistics."""
    matcher = CountryMatcher.from_file(boundaries_path)
    binary, owners = csv_binary_stream(source_path, zip_member)
    counts = defaultdict(lambda: defaultdict(int))
    stats = {"rows": 0, "observations": 0, "matched": 0, "invalid": 0, "outside": 0}
    try:
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", errors="replace", newline="")
        reader = csv.DictReader(text)
        fields = reader.fieldnames or []
        latitude = find_field(fields, "latitude")
        longitude = find_field(fields, "longitude")
        year = find_field(fields, "year")
        wide_years = year_columns(fields) if not year else []
        if not latitude or not longitude:
            raise ValueError("Living Planet CSV needs latitude and longitude columns; found: %s" %
                             ", ".join(fields))
        if not year and not wide_years:
            raise ValueError("Living Planet CSV needs a YEAR column or four-digit year columns; "
                             "found: %s" % ", ".join(fields))

        for row in reader:
            stats["rows"] += 1
            try:
                lat = float(row[latitude])
                lon = float(row[longitude])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError
            except (TypeError, ValueError):
                stats["invalid"] += 1
                continue

            country_id = matcher.country_at(lon, lat)
            if country_id is None:
                stats["outside"] += 1
                continue

            if year:
                try:
                    years = [int(float(row[year]))]
                    if not (1800 <= years[0] <= 2100):
                        raise ValueError
                except (TypeError, ValueError):
                    stats["invalid"] += 1
                    continue
            else:
                years = [column_year for column, column_year in wide_years
                         if has_value(row.get(column))]

            for observation_year in years:
                counts[country_id][observation_year] += 1
            stats["observations"] += len(years)
            stats["matched"] += 1
            if progress_every and stats["rows"] % progress_every == 0:
                print("Processed {:,} population rows...".format(stats["rows"]), file=sys.stderr)
    finally:
        binary.close()
        for owner in owners:
            owner.close()

    result = {
        country_id: {str(year): yearly[year] for year in sorted(yearly)}
        for country_id, yearly in sorted(counts.items())
    }
    return result, stats


def write_json_atomic(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True,
                        help="Public Living Planet .csv, .csv.gz, or .zip export")
    parser.add_argument("--boundaries", default=DEFAULT_BOUNDARIES,
                        help="Country GeoJSON (default: processing/data/world.raw.geojson)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Output JSON (default: processing/data/living_planet.json)")
    parser.add_argument("--zip-member", help="Specific CSV member when reading a ZIP archive")
    return parser.parse_args()


def main():
    args = parse_args()
    result, stats = aggregate(args.input, args.boundaries, args.zip_member)
    write_json_atomic(args.output, result)
    print("Wrote %s: %s countries, %s observations from %s matched population rows "
          "(%s invalid, %s outside boundaries)" %
          (args.output, len(result), format(stats["observations"], ","),
           format(stats["matched"], ","), format(stats["invalid"], ","),
           format(stats["outside"], ",")))


if __name__ == "__main__":
    main()
