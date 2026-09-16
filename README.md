# Data Deserts

Data Deserts is a static interactive map for comparing the geographic and temporal coverage of
ecology and public-health datasets. Countries are represented by radial coverage charts, allowing sources
to be viewed individually or grouped into Ecology and Public Health categories.

The current visualisation is scoped to countries with DHS survey data. For those countries, a
missing source-country-year combination remains missing; it is not inferred from another dataset.

## About the project

This project grew out of the
[European Talent Academy 2025](https://www.imperial.ac.uk/news/259556/call-early-career-researchers-develop-healthy/)
programme as a collaboration between researchers at Imperial College London and Politecnico di
Milano. Research project authors are listed alphabetically by surname:

- [Nikolas Galli](https://re.public.polimi.it/cris/rp/rp50671) — Politecnico di Milano
- [Paraskevi Seferidi](https://profiles.imperial.ac.uk/paraskevi.seferidi14) — Imperial College London
- [Ovidiu Șerban](https://www.imperial.ac.uk/people/o.serban) — Imperial College London
- [Jessica Williams](https://profiles.imperial.ac.uk/jessica.williams15) — Imperial College London

The visualisation was initially developed by
[Rose Cymbler](https://www.linkedin.com/in/rose-cymbler/), who was a student and Data Visualisation
Intern in 2026, and subsequently expanded by
[Ovidiu Șerban](https://www.imperial.ac.uk/people/o.serban).

## Project structure

```text
data-deserts/
├── app/                         Static browser application
│   ├── index.html               Page structure
│   ├── app.js                   Map, filters, radial coverage charts, tooltips, and details
│   ├── styles/app.css           Application styling
│   ├── data/                    Generated JavaScript data bundles
│   └── vendor/                  Bundled Leaflet assets
├── do-app-wall/                 SSR application for the distributed 16×4 display wall
├── scripts/build-app.mjs        Production asset builder
├── dist/                        Ignored production build output
├── processing/                  Data acquisition and transformation
│   ├── build_data.py            Builds the app data bundles
│   ├── fetch_all.sh             Runs all fetchers, optionally followed by the build
│   ├── fetch_*.py               Source-specific executable parsers
│   ├── data_deserts/            Reusable Python package
│   └── data/                    Normalized data, with source archives under data/raw/
├── DATASETS.md                  Dataset inventory, definitions, and provenance
└── README.md                    Project overview
```

Executable workflows live directly under `processing/`. Reusable Python code lives in the
`processing/data_deserts/` package. Generated browser artifacts are written to `app/data/`; they
should not be edited by hand.

See [DATASETS.md](DATASETS.md) before adding, interpreting, or comparing sources. It records what
each count means, how each source is obtained and cleaned, and whether it is currently included in
the app build. More implementation detail is available in
[processing/README.md](processing/README.md), while [app/README.md](app/README.md) documents the UI.

## Build the application data

Prepare the normalized source files described in [DATASETS.md](DATASETS.md), then run from the
repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r processing/requirements.txt
python3 processing/build_data.py
```

The build validates the common `{ISO3: {year: count}}` schema and the world boundaries, then writes:

- `app/data/datasets.js`
- `app/data/world.js`
- `do-app-wall/src/data/datasets.json`
- `do-app-wall/src/data/world.json`

`app/data/datasets.js` is a deployable artifact containing processed records and is ignored by Git.
GitHub contains the data-free schema example `app/data/datasets.template.js`. A deployment must make
the ignored normalized inputs available privately and run `python3 processing/build_data.py` before
publishing the `app/` directory. A checkout without that protected build step intentionally has no
runtime dataset bundle.

The build includes BioTIME, Living Planet Database, PREDICTS, GBIF, LSMS-ISA, DHS, MICS, and LSMS. To refresh
all sources and build the app in one pipeline, run:

```sh
processing/fetch_all.sh --build
```

The agreement-protected Living Planet and MICS archives are discovered under `processing/data/raw/` by
default; `--living-planet` and `--mics` accept explicit paths. Outputs already updated today are
skipped unless `--force` is supplied. Run `processing/fetch_all.sh --help` for selective skips and
other options.

## Run the app

The app has no server-side runtime. Open `app/index.html` directly, or serve the repository with a
static HTTP server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/app/`.

## Build production assets

Install the Node development dependency once, then build the generated data and deployable app:

```sh
npm install
npm run build
```

`npm run build:data` runs the protected data build. `npm run build:app` creates `dist/`, combines the
generated map, processed records, and application code into a minified and identifier-mangled
JavaScript bundle, minifies the CSS, copies Leaflet, and emits no source maps. It also creates
`data-deserts-vercel.zip`, with the deployable files directly at the archive root. Upload that ZIP
to Vercel, or deploy `dist/` directly; do not deploy the source `app/` directory.

Obfuscation is only a deterrent. Data delivered to a web browser can still be recovered through its
network and debugging tools. Data that must remain secret requires server-side aggregation or an API
that returns only the values needed for the current view.

The distributed SSR wall has a separate standalone production build:

```sh
npm run build:do-wall
```

It creates `data-deserts-do-wall-linux.zip`. After extracting it on a Linux server with Node.js
22.13 or newer, run `HOST=0.0.0.0 PORT=8080 node server/index.mjs`. No package installation is
required on the server. See [do-app-wall/README.md](do-app-wall/README.md) for display addressing and
deployment details.

## Adding a dataset

1. Document its source, access terms, counting unit, temporal meaning, cleaning, and limitations in
   [DATASETS.md](DATASETS.md).
2. Add or update a source-specific executable parser under `processing/`.
3. Emit the normalized `{ISO3: {year: non-negative integer}}` format under `processing/data/`.
4. Add the source definition and stable ordering to `processing/build_data.py` when it is ready for
   visualisation.
5. Rebuild the generated app data and verify dataset mode, category mode, time filtering, missing
   sectors, tooltips, and country details.
