#!/usr/bin/env python3
"""Fetch and aggregate PREDICTS sampling sites by country and year.

The PREDICTS database contains millions of species-level measurements nested
within sampling sites. For geographic coverage, this script uses the official
site-summary resource so a site is counted once rather than once per species.
The observation year is taken from each site's Sample_midpoint date.

The 2016 V1.1 and November 2022 additions are both included by default.
Each release is read and validated separately as JSON/CSV labels, never as R
factors or integer factor codes. These formats have no unused factor levels to
carry into the merge (the issue addressed by droplevels() on R data frames).
When exporting RDS inputs to CSV in R, run droplevels() on each release first.

By default records are fetched from the Natural History Museum datastore API.
Local site-summary CSV, gzip, or ZIP files can override either release:

    python3 processing/fetch_predicts.py
    python3 processing/fetch_predicts.py --input /path/to/2016-sites.zip --input-2022 /path/to/2022-sites.zip

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
DEFAULT_REPORT = os.path.join(HERE, "data", "predicts_report.json")
RELEASES = [
    {
        "id": "2016-v1.1",
        "name": "2016 release V1.1",
        "url": "https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1",
        "resourceId": "db834791-c9e4-4bfe-aba7-bb25b706d5f9",
    },
    {
        "id": "2022-additions",
        "name": "November 2022 additions",
        "url": "https://data.nhm.ac.uk/dataset/release-of-data-added-to-the-predicts-database-november-2022",
        "resourceId": "e71e008f-8059-45be-81f9-06425915b929",
    },
]
DATASTORE_API = "https://data.nhm.ac.uk/api/3/action/datastore_search"
API_FIELDS = "_id,SSBS,Latitude,Longitude,Sample_midpoint"

try:
    import certifi
except ImportError:
    certifi = None

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where() if certifi is not None else None)


def fetch_page(resource_id, after, limit, retries=4):
    """Fetch one page of site summaries from the official NHM datastore."""
    params = {
        "resource_id": resource_id,
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


def api_records(resource_id, page_size=1_000):
    """Yield every PREDICTS site record from paginated API responses."""
    fetched = 0
    total = None
    after = None
    while total is None or fetched < total:
        page = fetch_page(resource_id, after, page_size)
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
            archive.close()
            raw.close()
            raise ValueError("ZIP contains multiple CSV files; select the site summary with --zip-member")
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
        text = io.TextIOWrapper(binary, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text)
        required = {"SSBS", "Latitude", "Longitude", "Sample_midpoint"}
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


def prepare_release(records):
    """Validate one release using observed text labels, with no factor levels.

    SSBS identifies a source/study/block/site. Never use API _id, which is local
    to a resource, or coordinates alone, which can be shared by distinct sites.
    Conflicting rows fail explicitly instead of choosing a release silently.
    """
    sites = {}
    stats = {"rows": 0, "invalid": 0, "duplicateRows": 0}
    for row in records:
        stats["rows"] += 1
        site_id = row.get("SSBS")
        if not isinstance(site_id, str) or not site_id.strip() or site_id.strip() == "NA":
            raise ValueError("PREDICTS site is missing its text SSBS identifier")
        site_id = site_id.strip()
        try:
            lat, lon = float(row["Latitude"]), float(row["Longitude"])
            midpoint = str(row["Sample_midpoint"]).strip()
            midpoint_year(midpoint)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            stats["invalid"] += 1
            continue
        site = {"SSBS": site_id, "Latitude": lat, "Longitude": lon,
                "Sample_midpoint": midpoint}
        if site_id in sites:
            if sites[site_id] != site:
                raise ValueError("Conflicting PREDICTS site: %s" % site_id)
            stats["duplicateRows"] += 1
        else:
            sites[site_id] = site
    return sites, stats


def aggregate_releases(releases, boundaries_path):
    """Clean each release before merging, counting overlapping site IDs once."""
    combined, seen, reports = {}, {}, []
    for release, records in releases:
        sites, stats = prepare_release(records)
        retained = []
        duplicates = 0
        for site_id, site in sites.items():
            if site_id in seen:
                if seen[site_id] != site:
                    raise ValueError("Conflicting PREDICTS site across releases: %s" % site_id)
                duplicates += 1
            else:
                seen[site_id] = site
                retained.append(site)
        counts, geographic = aggregate(retained, boundaries_path)
        for iso, yearly in counts.items():
            country = combined.setdefault(iso, {})
            for year, count in yearly.items():
                country[year] = country.get(year, 0) + count
        reports.append({**release, **stats, "uniqueSites": len(sites),
                        "duplicatesFromEarlierReleases": duplicates,
                        "matched": geographic["matched"], "outside": geographic["outside"]})
    combined = {iso: dict(sorted(yearly.items())) for iso, yearly in sorted(combined.items())}
    return combined, reports


def write_json_atomic(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Local 2016 V1.1 sites .csv, .csv.gz, or .zip (otherwise API)")
    parser.add_argument("--input-2022", help="Local November 2022 site summary (otherwise API)")
    parser.add_argument("--report", default=DEFAULT_REPORT, help="Per-release provenance report")
    parser.add_argument("--boundaries", default=DEFAULT_BOUNDARIES,
                        help="Country GeoJSON (default: processing/data/world.raw.geojson)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Output JSON (default: processing/data/predicts.json)")
    parser.add_argument("--zip-member", help="Specific CSV member for --input")
    parser.add_argument("--zip-member-2022", help="Specific CSV member for --input-2022")
    parser.add_argument("--page-size", type=int, default=1_000,
                        help="API records per request for releases without a local input (default: 1000)")
    args = parser.parse_args()
    if args.page_size <= 0:
        parser.error("--page-size must be positive")
    if args.zip_member and not args.input:
        parser.error("--zip-member requires --input")
    if args.zip_member_2022 and not args.input_2022:
        parser.error("--zip-member-2022 requires --input-2022")
    return args


def main():
    args = parse_args()
    inputs = [(args.input, args.zip_member), (args.input_2022, args.zip_member_2022)]
    releases = [
        ({**release, "input": os.path.abspath(path) if path else "NHM datastore API"},
         local_records(path, member) if path else api_records(release["resourceId"], args.page_size))
        for release, (path, member) in zip(RELEASES, inputs)
    ]
    result, reports = aggregate_releases(releases, args.boundaries)
    matched = sum(report["matched"] for report in reports)
    report = {
        "_meta": {
            "schemaVersion": 1,
            "unit": "sites",
            "siteIdentity": "SSBS (source/study/block/site), deduplicated across releases",
            "yearDefinition": "Sample_midpoint year, not release/publication year",
            "factorHandling": "Each JSON/CSV release uses observed text labels, never R factors; "
                              "unused levels and factor codes cannot enter the merge. "
                              "For RDS exports, apply droplevels to each release before exporting CSV.",
            "matched": matched,
        },
        "releases": reports,
    }
    write_json_atomic(args.output, result)
    write_json_atomic(args.report, report)
    for release in reports:
        print("%s: %s rows, %s matched sites, %s invalid, %s outside, %s duplicates" % (
            release["name"], release["rows"], release["matched"], release["invalid"],
            release["outside"], release["duplicateRows"] + release["duplicatesFromEarlierReleases"]))
    print("Wrote %s: %s countries, %s matched sites from both releases" %
          (args.output, len(result), format(matched, ",")))
    print("Wrote %s: per-release provenance" % args.report)


if __name__ == "__main__":
    main()
