# How the GBIF biodiversity counts are cleaned

The map uses **per-country GBIF occurrence counts** as a proxy for *biodiversity
sampling effort* — "how much has anyone actually looked here?". Raw GBIF totals are
badly distorted by data-quality artefacts, so we clean them. This note records exactly
what we do and why, so the numbers on the map are defensible.

## The problem with raw counts

`data/gbif_counts.json` is the **unfiltered** total per country straight from the GBIF
API — about **3.8 billion records**. Those totals include things that should *not* count
as "a species was observed at this place":

- records with **no coordinates** at all (can't support a spatial map);
- records with **geospatial issues** — 0/0 coordinates, points in the sea, coordinates
  that fall in the wrong country, or snapped to the **country centroid**;
- **fossils** (palaeontological, not modern biodiversity);
- **living specimens** (zoo / botanical-garden / cultivated animals & plants — not wild);
- explicit **absence** records.

These artefacts inflate exactly the countries we care most about: a poorly-sampled
tropical country can have a large share of its records pinned to its centroid, making it
look better-sampled than it is.

## Why not `CoordinateCleaner`?

`CoordinateCleaner` is the standard R package for this, **but it flags bad *individual
records*** by their latitude/longitude (country centroids, capital cities,
biodiversity-institution HQ coordinates, the ocean, 0/0, …). That requires the
**record-level** occurrence data. GBIF holds ~3.8 B records; downloading them to clean is
infeasible — and unnecessary for a **country-level** density map.

So we clean by applying **GBIF's own quality filters at query time** and reading back the
filtered totals. This is fast (one count query per country), fully reproducible, and
captures the largest artefact classes (`hasGeospatialIssue` already removes 0/0,
out-of-range, and country-centroid mismatches).

## The filters we apply

| Filter | Value | Removes |
|--------|-------|---------|
| `hasCoordinate` | `true` | records with no lat/lon |
| `hasGeospatialIssue` | `false` | 0/0, out-of-range, sea, **country-centroid mismatch** |
| `occurrenceStatus` | `PRESENT` | explicit absence records |
| `basisOfRecord` | drop `FOSSIL_SPECIMEN` | palaeontological records |
| `basisOfRecord` | drop `LIVING_SPECIMEN` | zoo / garden / cultivated (not wild) |

Everything else (`PRESERVED_SPECIMEN`, `HUMAN_OBSERVATION`, `MACHINE_OBSERVATION`,
`MATERIAL_SAMPLE`, `MATERIAL_CITATION`, `OBSERVATION`, `OCCURRENCE`) is kept.

We deliberately **do not** filter by year — the density map represents *cumulative*
sampling effort, independent of the app's time slider.

## How to reproduce

Two equivalent implementations produce `data/gbif_counts_clean.json`:

- **`fetch_gbif_clean.py`** — pure Python, no dependencies, hits the GBIF search API.
  `python3 fetch_gbif_clean.py`
- **`clean_gbif.R`** — the canonical route via the **`rgbif`** package
  (`rgbif::occ_count()`), for provenance. `install.packages(c("rgbif","jsonlite"))` then
  `Rscript clean_gbif.R`.

Both also write **`data/gbif_clean_report.json`** — the raw vs. cleaned count and the
percentage removed for every country, plus the exact filter set used (audit trail).

`build_data.py` automatically prefers `gbif_counts_clean.json` when it exists and falls
back to the raw `gbif_counts.json` otherwise, then bakes the result into
`data/datasets.js` (the `GBIF_DENSITY` used by the map's density view and threshold).

## Upgrade path (full record-level cleaning)

If country-level filtering is ever not enough, the rigorous pipeline is:

1. `rgbif::occ_download()` with the filters above for the target countries/taxa;
2. `CoordinateCleaner::clean_coordinates()` to flag centroids, capitals, institutions,
   sea, duplicates, and equal/zero coordinates on the actual points;
3. re-aggregate the cleaned records to per-country (or per-grid-cell) counts.

This is heavier (GBIF account, asynchronous downloads, GBs of data) and is worth it only
if we move from a country choropleth to a finer within-country grid.
