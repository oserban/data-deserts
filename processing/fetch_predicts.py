#!/usr/bin/env python3
"""Fetch and aggregate PREDICTS sampling sites by country and year.

The PREDICTS database contains millions of species-level measurements nested
within sampling sites. For geographic coverage, this script uses the official
site-summary resource so a site is counted once rather than once per species.
The observation year is taken from each site's Sample_midpoint date.

By default records are fetched from the Natural History Museum datastore API.
A downloaded sites CSV, gzip, or ZIP can instead be supplied with --input:

    python3 processing/fetch_predicts.py
    python3 processing/fetch_predicts.py --input /path/to/sites.zip

Output form:

    {"BRA": {"2001": 120, "2002": 137}, "ZAF": {"2010": 42}}
"""

import argparse
import csv
import gzip
import io
import json
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict

from data_deserts import CountryMatcher


HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BOUNDARIES = os.path.join(HERE, "data", "world.raw.geojson")
DEFAULT_OUTPUT = os.path.join(HERE, "data", "predicts.json")
DATASET_URL = (
    "https://data.nhm.ac.uk/dataset/"
    "the-2016-release-of-the-predicts-database-v1-1"
)
DATASTORE_API = "https://data.nhm.ac.uk/api/3/action/datastore_search"
SITE_RESOURCE_ID = "db834791-c9e4-4bfe-aba7-bb25b706d5f9"
API_FIELDS = "_id,Latitude,Longitude,Sample_midpoint"

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def fetch_page(after, limit, retries=4):
    """Fetch one page of site summaries from the official NHM datastore."""
    params = {
        "resource_id": SITE_RESOURCE_ID,
        "fields": API_FIELDS,
        "limit": limit,
    }
    if after is not None:
        params["after"] = json.dumps(after, separators=(",", ":"))
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        DATASTORE_API + "?" + query,
        headers={"User-Agent": "data-deserts-pipeline/1.0"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
                payload = json.load(response)
            if not payload.get("success"):
                raise RuntimeError("NHM datastore returned an unsuccessful response")
            return payload["result"]
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def api_records(page_size=5_000):
    """Yield every PREDICTS site record from paginated API responses."""
    fetched = 0
    total = None
    after = None
    while total is None or fetched < total:
        page = fetch_page(after, page_size)
        total = int(page["total"])
        records = page.get("records", [])
        if not records:
            if fetched < total:
                raise RuntimeError("NHM datastore returned an empty page before all records")
            break
        yield from records
        fetched += len(records)
        next_after = page.get("after")
        if fetched < total and (next_after is None or next_after == after):
            raise RuntimeError("NHM datastore did not return a usable pagination cursor")
        after = next_after
        print("Fetched {:,}/{:,} PREDICTS sites...".format(min(fetched, total), total),
              file=sys.stderr)


def csv_binary_stream(path, member=None):
    """Open a plain, gzip, or ZIP-compressed site-summary CSV."""
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


def local_records(path, zip_member=None):
    """Yield records from a downloaded site-summary CSV or compressed archive."""
    binary, owners = csv_binary_stream(path, zip_member)
    try:
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", errors="replace", newline="")
        reader = csv.DictReader(text)
        required = {"Latitude", "Longitude", "Sample_midpoint"}
        missing = sorted(required.difference(reader.fieldnames or []))
        if missing:
            raise ValueError("PREDICTS site CSV is missing required columns: %s; found: %s" %
                             (", ".join(missing), ", ".join(reader.fieldnames or [])))
        yield from reader
    finally:
        binary.close()
        for owner in owners:
            owner.close()


def midpoint_year(value):
    """Extract a four-digit year from an ISO-like sample midpoint."""
    text = str(value or "").strip()
    if len(text) < 4 or not text[:4].isdigit():
        raise ValueError("invalid Sample_midpoint")
    year = int(text[:4])
    if not 1800 <= year <= 2100:
        raise ValueError("invalid Sample_midpoint year")
    return year


def aggregate(records, boundaries_path, progress_every=100_000):
    """Return country/year site counts and processing statistics."""
    matcher = CountryMatcher.from_file(boundaries_path)
    counts = defaultdict(lambda: defaultdict(int))
    stats = {"rows": 0, "matched": 0, "invalid": 0, "outside": 0}
    for row in records:
        stats["rows"] += 1
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
            year = midpoint_year(row["Sample_midpoint"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            stats["invalid"] += 1
            continue

        country_id = matcher.country_at(lon, lat)
        if country_id is None:
            stats["outside"] += 1
            continue
        counts[country_id][year] += 1
        stats["matched"] += 1
        if progress_every and stats["rows"] % progress_every == 0:
            print("Processed {:,} PREDICTS sites...".format(stats["rows"]), file=sys.stderr)

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
    parser.add_argument("--input", help="Local PREDICTS sites .csv, .csv.gz, or .zip export")
    parser.add_argument("--boundaries", default=DEFAULT_BOUNDARIES,
                        help="Country GeoJSON (default: processing/data/world.raw.geojson)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Output JSON (default: processing/data/predicts.json)")
    parser.add_argument("--zip-member", help="Specific CSV member when reading a ZIP archive")
    parser.add_argument("--page-size", type=int, default=1_000,
                        help="API records per request when --input is omitted (default: 1000)")
    args = parser.parse_args()
    if args.page_size <= 0:
        parser.error("--page-size must be positive")
    if args.zip_member and not args.input:
        parser.error("--zip-member requires --input")
    return args


def main():
    args = parse_args()
    records = (local_records(args.input, args.zip_member) if args.input
               else api_records(args.page_size))
    result, stats = aggregate(records, args.boundaries)
    write_json_atomic(args.output, result)
    print("Wrote %s: %s countries, %s matched sites (%s invalid, %s outside boundaries)" %
          (args.output, len(result), format(stats["matched"], ","),
           format(stats["invalid"], ","), format(stats["outside"], ",")))


if __name__ == "__main__":
    main()
