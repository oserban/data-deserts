# Data Deserts — biodiversity record coverage

This static Leaflet app compares country/year record coverage from four ecology datasets, one
agriculture dataset, and three public-health datasets:

- BioTIME
- Living Planet Database
- PREDICTS
- GBIF
- LSMS-ISA agricultural file-row records
- DHS participant counts
- MICS participant counts
- LSMS household-roster person records

See [`../DATASETS.md`](../DATASETS.md) for source provenance, counting-unit definitions, cleaning,
access constraints, and the distinction between missing records and confirmed zero counts.

Only countries with DHS participant data are included in the assessment. MICS and ecology records
are evaluated within that DHS country coverage; missing source data remains visibly missing.
Hydrology remains a disabled placeholder.

## Run it

Open `index.html` directly, or serve the repository with any static HTTP server. Leaflet, country
boundaries, and generated data are bundled locally.

For production, run `npm run build` from the repository root and deploy `dist/`. The asset build
combines the generated records, geometry, and app logic into one minified/mangled JavaScript file,
minifies CSS, and omits source maps. This makes casual inspection harder but cannot make browser-side
data confidential. The same command creates `data-deserts-vercel.zip` for direct upload, without an
extra enclosing directory inside the archive.

## Controls

- The two-ended time control filters exact country/year record counts.
- The **Filters** section contains the time window and two icon state buttons: annual time bins
  and dataset/category grouping. Each button changes icon and pressed styling when active, with its
  full description available as a tooltip.
- **Advanced filtering** contains category and individual-dataset selection. A category checkbox
  toggles every source in that category, while nested checkboxes control individual datasets. All
  datasets are selected by default.
- The grouping icon switches between eight source-level sectors and three category-level sectors.
  Category mode aggregates BioTIME, Living Planet, PREDICTS, and GBIF into Ecology, shows LSMS-ISA
  as Agriculture, and combines DHS, MICS, and LSMS as Public Health; tooltips and country details
  continue to show the underlying datasets separately.
- The arrowed radial-chart legend adapts to the display mode. Dataset sectors use their identity colours;
  grouped categories combine the identity colours of all datasets they contain. A separate red → yellow → green scale explains count
  magnitude inside every sector.
- Sector and legend ordering comes from generated metadata and is shared everywhere: BioTIME →
  Living Planet → PREDICTS → GBIF → LSMS-ISA → DHS → MICS → LSMS in dataset mode, and Ecology →
  Agriculture → Public Health in category mode.
- Every in-scope country has an eight-sector radial coverage chart. Sector intensity is
  log-normalized independently within its dataset. Every sector uses the same red → yellow → green
  scale for low → average → high counts; grey means no records. Raw magnitudes are not compared
  across sources.
- **Annual time bins** divide each sector into one bin per selected year. Missing years stay
  blank. Time-series intensities use a min–max scale calculated independently for each dataset from
  all of that dataset's country-year observations, so the same value has the same intensity in every
  country. Grouped categories receive an equivalent cross-country category scale.
- Hovering shows the selected-source breakdown. Clicking shows one yearly strip per selected dataset
  in dataset mode; category mode shows an aggregate category strip with a collapsible dataset breakdown.
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
`mics.json`, `gbif.json`, `lsms_isa.json`, and `lsms.json`. Each file
uses `{ISO3: {year: count}}`. It writes:

- `data/world.js`: country polygons
- `data/datasets.js`: separate source records, their aggregate, and summary metadata

`data/datasets.js` is generated during protected deployment and ignored by Git because it contains
processed records. `data/datasets.template.js` is the public, data-free schema reference committed
to GitHub. The template is not loaded by the application.

The generated metadata marks DHS as the sole scope dataset. The app suppresses all records and radial-chart
markers outside its mapped country coverage; the combined aggregate, displayed year range, and
per-dataset scope summaries use that same country scope. GRDC, inventory-spreadsheet, and
access-control data are not included in the build.

## Files

| File | Purpose |
|---|---|
| `index.html` | Application structure and script loading |
| `styles/app.css` | Layout and visual styling |
| `app.js` | Dataset filtering, aggregation, map rendering, and URL state |
| `data/datasets.js` | Generated separate and aggregated country/year counts |
| `data/world.js` | Generated country polygons |
| `vendor/` | Bundled Leaflet |
