#!/usr/bin/env python3
"""Aggregate BioTIME observation records by country and year.

BioTIME's observation export contains one row per biodiversity record, including
YEAR, LATITUDE, and LONGITUDE. This script assigns each valid coordinate to a
country polygon and writes counts in this form:

    {"GBR": {"1993": 120, "1994": 137}, "ZAF": {"2001": 42}}

By default the official BioTIME raw CSV download is used. A previously downloaded
.csv, .csv.gz, or .zip can be supplied with --input (recommended for repeat runs).

Run from the repository root:
    python3 processing/fetch_biotime.py --input /path/to/BioTIMEQuery.csv
"""

import argparse
import csv
import gzip
import io
import json
import os
import sys
import tempfile
import urllib.request
import zipfile
from collections import defaultdict

from data_deserts import CountryMatcher


HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BOUNDARIES = os.path.join(HERE, "data", "world.raw.geojson")
DEFAULT_OUTPUT = os.path.join(HERE, "data", "biotime.json")
DEFAULT_URL = "https://biotime.st-andrews.ac.uk/dl_request.php?dl=raw_csv"


def download(url):
    """Download a remote export to a seekable temporary file."""
    request = urllib.request.Request(url, headers={"User-Agent": "data-deserts-pipeline/1.0"})
    temporary = tempfile.NamedTemporaryFile(prefix="biotime-", suffix=".download", delete=False)
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                temporary.write(chunk)
        return temporary.name
    except Exception:
        temporary.close()
        if os.path.exists(temporary.name):
            os.unlink(temporary.name)
        raise


def csv_binary_stream(path, member=None):
    """Open a plain, gzip, or ZIP-compressed BioTIME CSV as a binary stream."""
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
        elif candidates:
            selected = max(candidates, key=lambda name: archive.getinfo(name).file_size)
        else:
            raise ValueError("The ZIP archive contains no CSV files")
        return archive.open(selected), (archive, raw)
    if signature.startswith(b"\x1f\x8b"):
        return gzip.GzipFile(fileobj=raw), (raw,)
    return raw, ()


def normalized_fields(fieldnames):
    return {name.strip().upper(): name for name in (fieldnames or [])}


def aggregate(source_path, boundaries_path, zip_member=None, progress_every=1_000_000):
    matcher = CountryMatcher.from_file(boundaries_path)

    binary, owners = csv_binary_stream(source_path, zip_member)
    counts = defaultdict(lambda: defaultdict(int))
    stats = {"rows": 0, "matched": 0, "invalid": 0, "outside": 0}
    try:
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", errors="replace", newline="")
        reader = csv.DictReader(text)
        fields = normalized_fields(reader.fieldnames)
        missing = [name for name in ("YEAR", "LATITUDE", "LONGITUDE") if name not in fields]
        if missing:
            raise ValueError("BioTIME CSV is missing required columns: %s; found: %s" %
                             (", ".join(missing), ", ".join(reader.fieldnames or [])))

        for row in reader:
            stats["rows"] += 1
            try:
                year = int(float(row[fields["YEAR"]]))
                lat = float(row[fields["LATITUDE"]])
                lon = float(row[fields["LONGITUDE"]])
                if not (0 < year <= 9999 and -90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError
            except (TypeError, ValueError):
                stats["invalid"] += 1
                continue

            country_id = matcher.country_at(lon, lat)
            if country_id is None:
                stats["outside"] += 1
                continue
            counts[country_id][year] += 1
            stats["matched"] += 1
            if progress_every and stats["rows"] % progress_every == 0:
                print("Processed {:,} rows...".format(stats["rows"]), file=sys.stderr)
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
    parser.add_argument("--input", help="Local BioTIME .csv, .csv.gz, or .zip export")
    parser.add_argument("--url", default=DEFAULT_URL,
                        help="Download URL used when --input is omitted")
    parser.add_argument("--boundaries", default=DEFAULT_BOUNDARIES,
                        help="Country GeoJSON (default: processing/data/world.raw.geojson)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Output JSON (default: processing/data/biotime.json)")
    parser.add_argument("--zip-member", help="Specific CSV member when reading a ZIP archive")
    return parser.parse_args()


def main():
    args = parse_args()
    downloaded = None
    try:
        source = args.input
        if not source:
            print("Downloading BioTIME observations from %s" % args.url, file=sys.stderr)
            downloaded = download(args.url)
            source = downloaded
        result, stats = aggregate(source, args.boundaries, args.zip_member)
        write_json_atomic(args.output, result)
    finally:
        if downloaded and os.path.exists(downloaded):
            os.unlink(downloaded)

    print("Wrote %s: %s countries, %s matched records (%s invalid, %s outside boundaries)" %
          (args.output, len(result), format(stats["matched"], ","),
           format(stats["invalid"], ","), format(stats["outside"], ",")))


if __name__ == "__main__":
    main()
