#!/usr/bin/env python3
"""
Fetch CLEANED per-country GBIF occurrence counts.

Why not CoordinateCleaner?
    CoordinateCleaner (the standard R package) flags bad *individual records* by their
    lat/lon — country centroids, capital cities, biodiversity-institution coordinates,
    the ocean, 0/0, etc. That needs the record-level occurrence data. GBIF holds ~3.8
    BILLION records, so downloading them to clean is infeasible for a country-level
    density map. Instead we apply GBIF's own quality filters *at query time* and read
    back the filtered totals. This is reproducible, fast, and documented.

    The equivalent record-level pipeline (rgbif + CoordinateCleaner) is described in
    GBIF_CLEANING.md as the upgrade path; clean_gbif.R fetches the same filtered counts
    via the canonical rgbif package.

Filters applied (see GBIF_CLEANING.md for the rationale of each):
    hasCoordinate      = true      -> record is georeferenced (this is a spatial map)
    hasGeospatialIssue = false     -> drops 0/0, out-of-range, country-centroid mismatch…
    occurrenceStatus   = PRESENT   -> drops explicit ABSENT records
    basisOfRecord      in KEEP_BOR -> keeps observations & specimens; drops FOSSIL_SPECIMEN
                                      (palaeo, not modern biodiversity) and LIVING_SPECIMEN
                                      (zoo / botanical-garden / cultivated, not wild)

Reads:   data/gbif_counts.json        (raw ISO2 -> count, the countries to refresh)
Writes:  data/gbif_counts_clean.json  (cleaned ISO2 -> count)  <- consumed by build_data.py
         data/gbif_clean_report.json  (per-country raw, clean, % removed, + run metadata)

Run:   python3 fetch_gbif_clean.py
"""
import json
import os
import ssl
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
API = "https://api.gbif.org/v1/occurrence/search"

# macOS python.org builds ship without a CA bundle wired in, so verification fails.
# Use certifi's bundle if present; fall back to an unverified context (public read-only API).
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl._create_unverified_context()

# basisOfRecord values we KEEP (everything except FOSSIL_SPECIMEN and LIVING_SPECIMEN)
KEEP_BOR = [
    "PRESERVED_SPECIMEN", "MATERIAL_SAMPLE", "MATERIAL_CITATION",
    "HUMAN_OBSERVATION", "MACHINE_OBSERVATION", "OBSERVATION", "OCCURRENCE",
]
FILTERS = [
    ("hasCoordinate", "true"),
    ("hasGeospatialIssue", "false"),
    ("occurrenceStatus", "PRESENT"),
] + [("basisOfRecord", b) for b in KEEP_BOR]

# a compact record of exactly what was applied, embedded in the report for provenance
FILTER_DOC = {
    "hasCoordinate": "true",
    "hasGeospatialIssue": "false",
    "occurrenceStatus": "PRESENT",
    "basisOfRecord_kept": KEEP_BOR,
    "basisOfRecord_dropped": ["FOSSIL_SPECIMEN", "LIVING_SPECIMEN"],
}


def cleaned_count(iso2, retries=4):
    """Filtered GBIF total for one ISO2 country code, or None if the code is unknown."""
    params = [("country", iso2)] + FILTERS + [("limit", "0")]
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60, context=SSL_CTX) as r:
                return json.load(r).get("count")
        except Exception as e:                       # network hiccup / rate limit -> back off
            if attempt == retries - 1:
                print("   ! %s failed: %s" % (iso2, e))
                return None
            time.sleep(1.5 * (attempt + 1))


def main():
    raw = json.load(open(os.path.join(DATA, "gbif_counts.json")))   # ISO2 -> raw count
    codes = sorted(raw, key=lambda k: -raw[k])                      # busiest first (nicer log)
    clean, report = {}, {}
    print("Refreshing %d countries with GBIF quality filters…\n" % len(codes))
    for i, iso2 in enumerate(codes, 1):
        c = cleaned_count(iso2)
        if c is None:                                # unknown ISO2 (e.g. non-GBIF enum): keep raw
            continue
        clean[iso2] = c
        r = raw[iso2]
        pct = round(100 * (r - c) / r, 1) if r else 0.0
        report[iso2] = {"raw": r, "clean": c, "removed_pct": pct}
        if i <= 25 or i % 25 == 0:
            print("  [%3d/%3d] %s  raw %-12s clean %-12s (-%.1f%%)" % (i, len(codes), iso2, r, c, pct))
        time.sleep(0.15)                             # be polite to the API

    tot_raw = sum(raw[k] for k in clean)
    tot_clean = sum(clean.values())
    meta = {
        "source": "GBIF occurrence search API (filtered counts)",
        "filters": FILTER_DOC,
        "countries": len(clean),
        "total_raw": tot_raw,
        "total_clean": tot_clean,
        "total_removed_pct": round(100 * (tot_raw - tot_clean) / tot_raw, 1) if tot_raw else 0.0,
    }
    json.dump(clean, open(os.path.join(DATA, "gbif_counts_clean.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    json.dump({"_meta": meta, "byCountry": report},
              open(os.path.join(DATA, "gbif_clean_report.json"), "w"),
              ensure_ascii=False, indent=1)
    print("\nDone. %d countries." % len(clean))
    print("Total: raw %s -> clean %s  (-%.1f%%)" % (tot_raw, tot_clean, meta["total_removed_pct"]))
    print("Wrote data/gbif_counts_clean.json and data/gbif_clean_report.json")


if __name__ == "__main__":
    main()
