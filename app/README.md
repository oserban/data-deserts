# Data Deserts — cross-domain coverage map

An interactive world map showing **how little data from different domains overlaps**
geographically. Each country is coloured by how many of the four domains
(Ecology, Hydrology, Agriculture, Public Health) have data there, given the layers
you switch on. The focus is on **whether data exists**, not its quality.

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

- **Colour the map by**: number of domains / number of datasets / a single domain /
  **public-health surveys (number)** / **public-health surveys (most recent)** /
  **GBIF biodiversity record density** / **GRDC river-gauge density** (real per-country counts).
- **Two live fine-grain heat layers** (top bar): **Biodiversity density** (GBIF occurrence tiles)
  and **Gauge density** (GRDC's ~10,700 river-gauging stations). Both reveal *within-country*
  patchiness — gauged vs. ungauged basins, well-sampled vs. blank regions — that the
  country-level choropleths can't show. GRDC is the "GBIF of water": nominally global, really a
  scatter of local stations, so it gets the same density view and patchy/footprint treatment.
- **Click a country → public-health survey timeline.** Instead of just "has DHS / has MICS",
  it lists the actual individual surveys with years (e.g. *DHS 1990 · DHS 2003 · MIS 2010 …*),
  so you can see whether a country has one old survey or many recent ones. Sources: the live
  **DHS API**, the **World Bank microdata catalogue** for MICS, and compiled **LSMS-ISA** waves.
  The time slider also filters surveys, so you can watch them accumulate by year.
- **The global layer**: include or exclude datasets that cover everywhere by construction.
- **Biodiversity records are patchy**: global species databases (GBIF, BioTime…) nominally
  cover the world, but records cluster in the US/Europe. Switch this on and a country only
  counts as having ecology data if its GBIF record count clears the threshold slider — and
  land-cover rasters (a remote-sensing product, not field data) stop counting as biodiversity
  observations. Watch the tropics lose their "ecology" coverage.
- **Time — data available by year**: a slider from 1900 to today. A dataset counts once its
  data coverage begins, so dragging forward shows data accumulating and deserts shrinking.
- **Domains** and **Access**: filter which datasets count.
- **Click a country** to list the actual datasets covering it, grouped by domain, with links,
  coverage size, year span, and the country's GBIF record count.

## Map toolbar

- **Region presets** (World / Africa / Asia / Europe / Americas) + **country search**.
- **📊 Insights**: a drawer with the **domain co-occurrence matrix** (counts *or* Jaccard %),
  plus ranked "worst deserts" and "most data-rich" lists. All react live to the filters.
- **▶ Story**: a guided 6-step walkthrough (all-on → no health data in the rich world →
  strip globals → deserts appear → GBIF mirage → empty overlap matrix) with a Play button —
  built for presenting to the team.
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
| `index.html` | UI + layout |
| `app.js` | map logic, filters, stats |
| `data/datasets.js` | the 18 datasets + country coverage (generated) |
| `data/world.js` | world country polygons, ISO3 (generated) |
| `build_data.py` | rebuilds the data files from the spreadsheet |
| `data/gbif_counts.json` | real GBIF per-country occurrence counts (fetched from the GBIF API) |
| `data/iso_codes.json` | ISO2↔ISO3 lookup used to join GBIF counts to the map |
| `vendor/` | bundled Leaflet |

## Caveats / editable assumptions

- **Year ranges** (`YEARS` in `build_data.py`) are approximate data-coverage spans — refine them.
- **Patchy threshold & land-cover flags**: the GBIF density is used as a *proxy* for biodiversity
  sampling effort across all global record databases; the "land-cover isn't field data" rule
  (MapBiomas, ESA CCI) is a deliberate, editable stance in `build_data.py`.
- Country lists for DHS/MICS/LSMS-ISA exclude a few tiny island states absent from the
  low-resolution world map.
- **Survey lists**: DHS is authoritative (DHS API). **MICS may be incomplete** — it comes from
  the World Bank microdata catalogue (179 surveys / 78 countries), not the full MICS programme;
  missing rounds can be added in `build_data.py`. **LSMS-ISA waves are compiled/approximate.**
  Survey-level data lives in `data/dhs_surveys.json` and `data/mics_surveys.json`.
- **GRDC gauges** come from a cached copy of the 2022 station catalogue (`data/grdc_stations.csv`,
  ~10,700 stations). Countries are assigned by point-in-polygon, so a few coastal/near-border
  stations may land in a neighbour. Coordinates are the river-network-snapped `newlat/newlon`.
