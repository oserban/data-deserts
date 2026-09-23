# Data Deserts — biodiversity record coverage

This static Leaflet app compares country/year record coverage from four ecology datasets, two
agriculture datasets, one hydrology dataset, and three public-health datasets:

- BioTIME
- Living Planet Database
- PREDICTS
- GBIF
- LSMS-ISA agricultural file-row records
- Agricultural map support: deduplicated reporting administrative units
- GRDC observed river-discharge station-years
- DHS survey counts
- MICS interview-record counts
- LSMS household-roster person records

**Include LSMS estimates** optionally adds estimated household members for studies without usable
roster counts, using the [frozen reviewed-study dictionary](../processing/resources/lsms_household_estimates.json). It is on
by default and saved in shared URL state. Toggling it updates counts, yearly bins, histograms, and country
and category scores together. Country details separate observed and estimated records. The control
is disabled while detailed agriculture is shown and retains its setting when returning.

See [`../DATASETS.md`](../DATASETS.md) for source provenance, counting-unit definitions, cleaning,
access constraints, and the distinction between missing records and confirmed zero counts.

Only countries with DHS survey data are included in the assessment. MICS and ecology records
are evaluated within that DHS country coverage; missing source data remains visibly missing.
Hydrology uses GRDC station-years: a station counts once in each year with valid observations;
multi-year totals do not represent distinct stations across the whole window.

PREDICTS combines the 2016 V1.1 site summaries and the November 2022 additions through the
shared Python pipeline, counting unique source/study/block/site IDs by sampling midpoint year.

The shared timeline begins at the earliest available DHS survey (currently 1985). Earlier
records are excluded from both apps’ generated coverage data, summaries and chart scales.
The cutoff is global, not the first DHS survey in each individual country.

## Run it

Open `index.html` directly, or serve the repository with any static HTTP server. Leaflet, country
boundaries, and generated data are bundled locally.

For production, run `npm run build` from the repository root and deploy `dist/`. The asset build
combines the generated records, geometry, and app logic into one minified/mangled JavaScript file,
minifies CSS, and omits source maps. This makes casual inspection harder but cannot make browser-side
data confidential. The same command creates `data-deserts-vercel.zip` for direct upload, without an
extra enclosing directory inside the archive.

## Controls

- A four-step dashboard tour opens on the first visit. The compass icon in the map toolbar
  (**Restart dashboard tour**) restarts it;
  **Skip tour** or Escape dismisses it. The browser remembers that it has been shown using local
  storage (if storage is blocked, it appears again on the next visit). The tour preserves filters,
  the time window, and the sidebar's previous state.
- The two-ended time control filters exact country/year record counts.
- The **Filters** section contains the time window, annual time bins, dataset/category grouping,
  and detailed agriculture controls. Each button changes icon and pressed styling when active, with its
  full description available as a tooltip.
- **Advanced filtering** contains category and individual-dataset selection. A category checkbox
  toggles every source in that category, while nested checkboxes control individual datasets. All
  datasets are selected by default.
- The grouping icon switches between ten source-level sectors and four category-level sectors.
  Category mode aggregates BioTIME, Living Planet, PREDICTS, and GBIF into Ecology, combines LSMS-ISA and Agricultural map support
  as Agriculture, GRDC as Hydrology, and combines DHS, MICS, and LSMS as Public Health; tooltips and country details
  continue to show the underlying datasets separately.
- The arrowed radial-chart legend adapts to the display mode. Dataset sectors use their identity colours;
  grouped categories combine the identity colours of all datasets they contain. A separate red → yellow → green scale explains coverage
  inside overview sectors. Detailed agriculture has a separate scale for the selected metric.
- Sector and legend ordering comes from generated metadata and is shared everywhere: BioTIME →
  Living Planet → PREDICTS → GBIF → LSMS-ISA → Agricultural map support → GRDC → DHS → MICS → LSMS in dataset mode, and Ecology →
  Agriculture → Hydrology → Public Health in category mode.
- Overview sector coverage combines log-normalised records per million km² (60%) and the
  fraction of selected years with records (40%). Category sectors average the available source
  scores. Raw counts remain in country details.
- **Agriculture aggregate** selects map availability across crops (default) or reporting-unit
  coverage; shared census units are counted once across products and crops.
- **Detailed agriculture scores** shows only the 15 crop sectors. Select dispersion (default),
  effective resolution in km, or reporting-unit coverage. Category grouping and overview dataset
  filters are disabled while active, preserving selections for when the overview is restored.
- **Annual time bins** divide sectors into one bin per selected year in every mode. Without
  annual bins, dispersion averages available yearly country values and effective resolution
  uses the coarsest available yearly value. Agriculture gaps remain grey/unavailable; measured
  zero dispersion remains a valid value. Availability is listed separately in country details.
  Dispersion and resolution use distinct colour scales and do not express accuracy.
- Hovering shows the selected-source breakdown. Country details list DHS survey years, highlighting
  those with any confirmed nutrition topic (including feeding practices and micronutrients). Other
  datasets show yearly strips. Category mode includes the same DHS year list inside its breakdown.
  DHS charts count unique surveys, never participants or households; filters use principal survey
  years and displayed fieldwork labels may span years.
- Search and region buttons navigate the map. **Share view** preserves dataset and year filters in
  the URL hash.
- **Data & licences** opens source acknowledgements, provider terms, and the processed-bundle
  redistribution notice. It is available on demand and is not shown at startup.

## Generated data

Run from the repository root:

```sh
python3 processing/build_data.py
```

The build reads `processing/data/biotime.json`, `living_planet.json`, `predicts.json`, `dhs.json`,
`mics.json`, `gbif.json`, `lsms_isa.json`, `grdc.json`, and `lsms.json`. Each file
uses `{ISO3: {year: count}}`. DHS also requires `dhs_report.json` for validated survey counts,
year labels and nutrition evidence; rerun `fetch_dhs.py` when migrating old participant data.
GRDC requires `grdc_report.json` to validate distinct observed station-years. Agriculture uses
`crop_allocation_report.json`, retaining yearly metrics and exactness flags separately from
reporting counts. Supported census tables are linked to the map’s exact country polygons
automatically, retaining source census-unit counts. Coverage is marked partial and unresolved
observations remain unavailable. See the [processing documentation](../processing/README.md#harvested-area-allocation-analysis).
The build writes:

- `data/world.js`: country polygons
- `data/datasets.js`: separate source records, their aggregate, and summary metadata

`data/datasets.js` is generated during protected deployment and ignored by Git because it contains
processed records. `data/datasets.template.js` is the public, data-free schema reference committed
to GitHub. The template is not loaded by the application.

The generated metadata marks DHS as the sole scope dataset. The app suppresses all records and radial-chart
markers outside its mapped country coverage; the combined aggregate, displayed year range, and
per-dataset scope summaries use that same country scope. Inventory-spreadsheet and
access-control data are not included in the build.

## Files

| File | Purpose |
|---|---|
| `index.html` | Application structure and script loading |
| `styles/app.css` | Layout and visual styling |
| `app.js` | Dataset filtering, aggregation, map rendering, and URL state |
| `score-model.js` | Static-app yearly and selected-window coverage and crop calculations |
| `tour.js` | First-visit dashboard tour and manual restart |
| `data/datasets.js` | Generated separate and aggregated country/year counts |
| `data/world.js` | Generated country polygons |
| `vendor/` | Bundled Leaflet |
