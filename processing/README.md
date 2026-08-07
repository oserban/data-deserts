# Data processing service

This directory owns the source data and transformations that generate the static data consumed by
the browser app. The app itself does not perform these transformations. The project-wide dataset
inventory, counting-unit definitions, provenance, and integration status are maintained in
[`../DATASETS.md`](../DATASETS.md).

Install the processing dependencies from the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r processing/requirements.txt
```

## Build app data

From the repository root:

```sh
python3 processing/build_data.py
```

This reads the eight country/year aggregation files below:

- `processing/data/biotime.json`
- `processing/data/living_planet.json`
- `processing/data/predicts.json`
- `processing/data/dhs.json`
- `processing/data/mics.json`
- `processing/data/gbif.json`
- `processing/data/lsms_isa.json`
- `processing/data/lsms.json`

All eight use `{ISO3: {year: count}}`. The build keeps their records separate and also calculates
their country/year sum, then writes:

- `app/data/datasets.js`
- `app/data/world.js`

The map export loads and validates `processing/data/world.raw.geojson` as a GeoJSON FeatureCollection
of identified Polygon/MultiPolygon country features. Natural Earth's shared `-99` fallback ID is
allowed for territories without an assigned ISO3 code. The exporter wraps that document as
`window.WORLD_GEOJSON` in `app/data/world.js`, allowing the static app to work when opened directly
through `file://` without fetching a separate GeoJSON resource.

The DHS participant dataset defines the app's country scope. Records from MICS and the ecology
datasets are visualized only for mapped countries covered by DHS. A dataset with no records in an
in-scope country is retained as missing rather than changing the country scope. Separate source
records remain intact, while the generated combined aggregate and each dataset's `scopeSummary` use
that same DHS-country scope.
GRDC, the inventory spreadsheet, and sources without fetch parsers remain excluded from this build.

## Refresh every normalized dataset

Run every source parser in a single fail-fast pipeline:

```sh
processing/fetch_all.sh
processing/fetch_all.sh --build
processing/fetch_all.sh --force --build
```

The second form rebuilds the browser bundles only after every selected fetch succeeds. The script
auto-detects the agreement-protected Living Planet archive and uses the default MICS archive under
`processing/data/`. Outputs already modified on the current local date are skipped by default; use
`--force` to refresh them anyway. Use `--living-planet`, `--mics`, or repeatable `--skip` options
when needed.

## Build yearly BioTIME counts

Download the BioTIME observation CSV (or ZIP) and run:

```sh
python3 processing/fetch_biotime.py --input /path/to/BioTIME-export.zip
```

If `--input` is omitted, the script requests the current raw CSV from BioTIME's official download
endpoint. It assigns each record's latitude and longitude to the country polygons in
`processing/data/world.raw.geojson` and writes `processing/data/biotime.json`, keyed first by the
GeoJSON country ID and then by year. Records with invalid coordinates or coordinates outside the
country polygons (including marine observations) are reported and omitted.

## Build yearly Living Planet Database counts

The Living Planet data portal requires contact details, a description of intended use, and explicit
acceptance of its data-use agreement. Download the public export from
[`livingplanetindex.org/data_portal`](https://livingplanetindex.org/data_portal), then run:

```sh
python3 processing/fetch_living_planet.py \
  --input /path/to/LivingPlanetIndexDatabase_<download-timestamp>.zip
```

The downloaded ZIP can be passed directly; the script selects its main CSV rather than the bundled
metadata and data-agreement files. It also accepts standalone CSV and gzip exports in either long
form (a `YEAR` column) or wide form (one column per year). It assigns population coordinates to
country polygons and writes
`processing/data/living_planet.json`. Counts represent population observations, not individual
animals. Use `--zip-member` if an archive contains multiple CSV files and the data file is not the
largest member.

## Build yearly PREDICTS site counts

Fetch site summaries from the Natural History Museum's public datastore and aggregate them by the
year of each site's sampling midpoint:

```sh
python3 processing/fetch_predicts.py
```

This writes `processing/data/predicts.json`. It counts sampling sites rather than species-level
measurements, preventing species-rich or intensively sampled sites from artificially inflating
geographic coverage. For a repeatable offline build, download the `sites.zip` resource from the
[PREDICTS V1.1 dataset page](https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1)
and use `--input /path/to/sites.zip`.

## Build yearly DHS participant counts

Fetch every survey and the official DHS-to-ISO3 country mapping from the DHS Program API:

```sh
python3 processing/fetch_dhs.py
```

This writes `processing/data/dhs.json` in the same `{ISO3: {year: count}}` format as BioTIME.
Participants are defined as interviewed women plus interviewed men where those API fields are
available; household counts are not treated as people. `processing/data/dhs_report.json` retains
every survey's ID, type, women, men, household count, total known participants, and completeness
status. `build_data.py` includes this output in the Public Health category.

## Build yearly MICS participant counts

Download the available SPSS dataset bundle from the
[UNICEF MICS survey catalogue](https://mics.unicef.org/surveys?display=card&f%5B0%5D=status%3A241),
save it as `processing/data/raw/MICS_Datasets.zip`, and run:

```sh
python3 processing/fetch_mics.py
```

This writes `processing/data/mics.json` in the shared `{ISO3: {year: count}}` format. As with DHS,
participants are defined as interviewed women plus interviewed men where those individual
questionnaire files are available. Household rosters and child files are excluded to avoid counting
households or people more than once. The parser reads case counts directly from the nested SPSS file
headers, so it does not need to extract the 1+ GB archive or install an SPSS library.
`processing/data/mics_report.json` records every survey's national/subnational scope, MICS round,
women and men counts, completeness, and source filenames.
`build_data.py` includes MICS in the Public Health category. DHS remains the sole reference defining
the app's LMIC-focused country scope.

## Build yearly cleaned GBIF occurrence counts

Install the processing requirements, then query cleaned animal occurrences grouped by country and
year:

```sh
python3 -m pip install -r processing/requirements.txt
python3 processing/fetch_gbif.py
```

This writes `processing/data/gbif.json` in the shared `{ISO3: {year: count}}` format and an audit
report at `processing/data/gbif_report.json`. Records without coordinates, with GBIF geospatial
issues, explicit absences, fossils, and living specimens are excluded. Animalia is the default;
pass `--include-plants` to add Plantae. See `GBIF_CLEANING.md` for the exact rules and limitations of
inferring wild status from GBIF metadata. `build_data.py` includes GBIF in the Ecology category.

## Build yearly LSMS participant-record counts

Fetch the LSMS collection and file metadata through the World Bank Microdata Library's public NADA
REST API:

```sh
python3 processing/fetch_lsms.py
```

This writes `processing/data/lsms.json` in the shared `{ISO3: {year: count}}` format and
`processing/data/lsms_report.json` with every study, access type, data file, `case_count`,
classification, and participant-file selection. The parser selects one household-member/person
roster per study and never sums file row counts. Therefore household, plot, crop, enterprise, and
transaction files cannot inflate the participant total. Ambiguous studies remain explicit in the
report. `build_data.py` includes LSMS in the Public Health category.

## Build yearly LSMS-ISA agricultural record counts

```sh
python3 processing/fetch_lsms_isa.py
```

This writes `processing/data/lsms_isa.json` and an auditable file-classification report at
`processing/data/lsms_isa_report.json`. Counts are rows across agricultural modules, not unique
agricultural entities; a household, plot, crop, or animal may be represented in multiple files.
`build_data.py` exposes the result as the Agriculture category.

## Directory boundary

- `processing/data/raw/`: manually downloaded source archives
- `processing/data/`: normalized JSON outputs and other pipeline inputs
- `app/data/`: generated JavaScript artifacts loaded directly by the app

Reusable Python libraries live in the `processing/data_deserts/` package. Shared
country-boundary loading, spatial indexing, and point-in-polygon matching are provided by
`processing/data_deserts/geojson_matcher.py` and used by the BioTIME, Living Planet, and PREDICTS
pipelines.

Executable Python scripts remain outside the package, directly under `processing/`.
