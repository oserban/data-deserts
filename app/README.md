# Data Deserts — cross-domain coverage map

An interactive map of countries covered by the DHS Program. Each country carries a four-sector
assessment chart for Ecology, Hydrology, Agriculture, and Public Health. For the first record-count
implementation, Ecology uses GBIF occurrences, Hydrology uses GRDC gauges, and Public Health uses
individual surveys. Each sector is normalized only against the same measure in other DHS countries;
cross-domain magnitudes are deliberately not compared. Agriculture remains marked unavailable until a
country-level record count is added.

## Run it

Just double-click **`index.html`** — it opens in any browser, no install or internet
needed (Leaflet, the world map, and the data are all bundled locally).

## The story it tells

- **Global layer ON** (default): almost every country shows 3–4 domains, but the entire
  **Global North is missing Public Health** — DHS/MICS household surveys only run in LMICs.
- **Global layer OFF**: strip away the "everywhere-by-default" gridded/remote-sensing
  products and global record databases, and **~54 countries become total data deserts**;
  only Brazil & Peru reach three in-situ domains. The cross-domain overlap nearly vanishes.

Use the **"Include global-coverage datasets"** toggle live in a presentation to make the
deserts appear.

## Controls

- **Overall record assessment**: a segmented chart over each DHS country. Every domain uses the same
  red → yellow → green convention, but its values are log-normalized independently. Grey means no data
  or unavailable. Chart and label sizes grow with map zoom, with the country name in the centre.
- **Yearly donut buckets**: an optional checkbox divides every sector into one angular bucket per year
  in the selected window. Missing years remain blank. Public Health uses exact survey years; Ecology,
  Hydrology, and Agriculture use the inventory's dataset coverage spans because annual record totals are
  not yet bundled for those domains.
- **Two live fine-grain heat layers** (top bar): **Biodiversity density** (GBIF occurrence tiles)
  and **Gauge density** (GRDC's ~10,700 river-gauging stations). Both reveal *within-country*
  patchiness — gauged vs. ungauged basins, well-sampled vs. blank regions — that the
  country-level charts can't show. GRDC is the "GBIF of water": nominally global, but really a
  scatter of local stations represented by its density view and dataset footprint.
- **Click a country → public-health survey timeline.** Instead of just "has DHS / has MICS",
  it lists the actual individual surveys with years (e.g. *DHS 1990 · DHS 2003 · MIS 2010 …*),
  so you can see whether a country has one old survey or many recent ones. Sources: the live
  **DHS API**, the **World Bank microdata catalogue** for MICS, and compiled **LSMS-ISA** waves.
  The time slider also filters surveys, so you can watch them accumulate by year.
- **The global layer**: include or exclude datasets that cover everywhere by construction.
- **Time — data available by year**: a slider from 1900 to today. A dataset counts once its
  data coverage begins, so dragging forward shows data accumulating and deserts shrinking.
- **Domains** and **Access**: filter which datasets count.
- **Click a country** to list the actual datasets covering it, grouped by domain, with links,
  coverage size, year span, and the country's GBIF record count. The detail panel begins with four
  stacked linear year strips using the same normalization as the donut buckets.

## Map toolbar

- **Region presets** (World / Africa / Asia / Europe / Americas) + **country search**.
- **📊 Insights**: a drawer with the **domain co-occurrence matrix** (counts *or* Jaccard %),
  plus ranked "worst deserts" and "most data-rich" lists. All react live to the filters.
- **🖼 PNG**: download the current map as an image for slides/papers.
- **🔗 Link**: copy a URL that reproduces the exact current view (every filter is encoded in
  the link, so colleagues open the same state — works when served over http; on `file://`
  the state is written to the address bar).

## Editing the data

Everything comes from the team's `../Data Sources.xlsx`, encoded in `data/datasets.js`.
Country coverage for the targeted surveys (DHS, MICS, LSMS-ISA) and regional products is
stored as ISO3 lists in **`build_data.py`** so domain experts can correct them. After any
edit re-run:

```
python3 build_data.py
```

This regenerates `data/datasets.js` and `data/world.js`. The `coverageType` field
(`gridded` / `global-obs` / `stations` / `regional`) and the `global` flag drive the
global toggle, and are the natural hook for later swapping in **real gridded coverage**
instead of country-level approximations.

## Files

| File | Purpose |
|------|---------|
| `index.html` | semantic UI structure and script loading order |
| `styles/app.css` | application layout and visual styling |
| `app.js` | map rendering and UI orchestration |
| `js/config.js` | shared colours, filter groups, and mode configuration |
| `js/state.js` | creation of the application's default state |
| `js/share-state.js` | URL serialization and hydration for shareable views |
| `js/record-assessment.js` | per-domain normalization and country chart rendering |
| `data/datasets.js` | the 18 datasets + country coverage (generated) |
| `data/world.js` | world country polygons, ISO3 (generated) |
| `build_data.py` | rebuilds the data files from the spreadsheet |
| `data/gbif_counts.json` | raw GBIF per-country occurrence counts (from the GBIF API) |
| `data/gbif_counts_clean.json` | **cleaned** GBIF counts (quality-filtered) — preferred by `build_data.py` |
| `fetch_gbif_clean.py` / `clean_gbif.R` | regenerate the cleaned counts (see `GBIF_CLEANING.md`) |
| `GBIF_CLEANING.md` | how the GBIF counts are cleaned, and why |
| `data/iso_codes.json` | ISO2↔ISO3 lookup used to join GBIF counts to the map |
| `vendor/` | bundled Leaflet |

## Caveats / editable assumptions

- **Year ranges** (`YEARS` in `build_data.py`) are approximate data-coverage spans — refine them.
- **GBIF counts are cleaned**: per-country GBIF totals are quality-filtered (georeferenced,
  no geospatial issues, no fossils/living specimens) before use — this strips artefacts that
  most inflate data-poor tropical countries (e.g. Afghanistan −91%, DR Congo −42%). Full method
  and how to regenerate: **`GBIF_CLEANING.md`**.
- Country lists for DHS/MICS/LSMS-ISA exclude a few tiny island states absent from the
  low-resolution world map.
- **Survey lists**: DHS is authoritative (DHS API). **MICS may be incomplete** — it comes from
  the World Bank microdata catalogue (179 surveys / 78 countries), not the full MICS programme;
  missing rounds can be added in `build_data.py`. **LSMS-ISA waves are compiled/approximate.**
  Survey-level data lives in `data/dhs_surveys.json` and `data/mics_surveys.json`.
- **GRDC gauges** come from a cached copy of the 2022 station catalogue (`data/grdc_stations.csv`,
  ~10,700 stations). Countries are assigned by point-in-polygon, so a few coastal/near-border
  stations may land in a neighbour. Coordinates are the river-network-snapped `newlat/newlon`.
