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
- `do-app-wall/src/data/datasets.json`
- `do-app-wall/src/data/world.json`

The wall JSON artifacts are written directly from the validated Python data structures rather than
being converted from the legacy JavaScript bundles.

The map export loads and validates `processing/data/world.raw.geojson` as a GeoJSON FeatureCollection
of identified Polygon/MultiPolygon country features. Natural Earth's shared `-99` fallback ID is
allowed for territories without an assigned ISO3 code. The exporter wraps that document as
`window.WORLD_GEOJSON` in `app/data/world.js`, allowing the static app to work when opened directly
through `file://` without fetching a separate GeoJSON resource.

The DHS survey dataset defines the app's country scope. Records from MICS and the ecology
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

Fetch site summaries for both **2016 V1.1** and the **November 2022 additions** from
NHM's public datastore. Both are assigned to their sampling midpoint year, not their release year:

```sh
python3 processing/fetch_predicts.py
```

This writes `processing/data/predicts.json` and per-release provenance in `predicts_report.json`.
Each release is validated separately before merging. Counts use the `SSBS` source/study/block/site
identifier; exact duplicate sites are counted once and conflicting coordinates or dates fail the
build for review. Distinct studies at the same coordinates remain distinct sites. Species-level
measurements are not counted separately. Invalid dates/coordinates and sites outside the project
boundaries are reported separately. Both app exports retain the shared DHS timeline cutoff.

The Python JSON/CSV path uses actual text labels and has no R factor codes or unused factor levels
to combine. It therefore avoids the unused-level issue addressed by `droplevels()`; it does not
claim to execute an R function on CSV/JSON. If preparing CSV files from RDS, clean **each release**
first, before combining:

```r
sites_2016 <- droplevels(readRDS("sites-2016.rds"))
sites_2022 <- droplevels(readRDS("sites-2022.rds"))
write.csv(sites_2016, "sites-2016.csv", row.names = FALSE)
write.csv(sites_2022, "sites-2022.csv", row.names = FALSE)
```

For an offline build, download the site-summary CSV/ZIP resources from the
[2016 V1.1 page](https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1) and
[November 2022 page](https://data.nhm.ac.uk/dataset/release-of-data-added-to-the-predicts-database-november-2022):

```sh
python3 processing/fetch_predicts.py --input sites-2016.zip --input-2022 sites-2022.zip
```

`--input` overrides only V1.1; `--input-2022` overrides only the additions. Any omitted release is
fetched from the API. ZIPs with multiple CSVs require `--zip-member` / `--zip-member-2022` rather
than guessing which file is the site summary. Site summaries must contain `SSBS`, `Latitude`,
`Longitude` and `Sample_midpoint` columns. The app build rejects missing/inconsistent provenance
or an old single-release aggregate; rerun the fetcher when migrating an existing checkout.

## Build yearly DHS survey counts

Fetch every survey and the official DHS-to-ISO3 country mapping from the DHS Program API:

```sh
python3 processing/fetch_dhs.py
```

This writes `processing/data/dhs.json` as `{ISO3: {principal_year: survey_count}}`.
Each completed DHS Program survey with published indicator data counts once by `SurveyId`,
including DHS, AIS and MIS surveys. Interview and household sample counts are kept separately
in `dhs_report.json` for provenance and never contribute to coverage totals.

Nutrition means **any nutrition topic**, including feeding practices, dietary diversity, food
insecurity, anthropometry, anemia and micronutrients. Evidence is the union of the official
nutrition-related survey characteristics and published indicators under the API's `Child Nutrition`
and `Adult Nutrition` subjects. A missing match is recorded as unconfirmed (`null`), not absence.
The report records evidence topics, survey IDs, principal years and fieldwork year labels.

`build_data.py` validates the count file against unique report survey IDs and exports identical
`surveyYears` and `nutritionDefinition` fields to both apps. It rejects the old participant schema;
refresh DHS with the command above before building an existing checkout. Country details list
fieldwork year labels and highlight years where at least one survey has confirmed nutrition
coverage. Time filtering and map/chart calculations use the principal survey year and survey counts.

The earliest mapped DHS survey defines the global timeline start. The build omits earlier years
from every exported dataset and recalculates summaries and aggregates after filtering, so older
GBIF records cannot influence timelines or chart scales. Source JSON files retain their full history.

Regression checks: `python3 -m unittest discover -s processing -p 'test_*.py'`.

## Build yearly MICS participant counts

Download the available SPSS dataset bundle from the
[UNICEF MICS survey catalogue](https://mics.unicef.org/surveys?display=card&f%5B0%5D=status%3A241),
save it as `processing/data/raw/MICS_Datasets.zip`, and run:

```sh
python3 processing/fetch_mics.py
```

This writes `processing/data/mics.json` in the shared `{ISO3: {year: count}}` format.
Counts represent interview records for women plus men where those individual
questionnaire files are available. Household rosters and child files are excluded to avoid counting
households or people more than once. The parser reads case counts directly from the nested SPSS file
headers, so it does not need to extract the 1+ GB archive or install an SPSS library.
`processing/data/mics_report.json` records every survey's national/subnational scope, MICS round,
women and men counts, completeness, and source filenames.
`build_data.py` includes MICS in the Public Health category. DHS remains the sole reference defining
the app's LMIC-focused country scope.

## Build yearly cleaned GBIF occurrence counts

Query cleaned GBIF occurrences grouped by interpreted occurrence country and year:

```sh
python3 processing/fetch_gbif.py

# Animals and plants, restricted to selected countries
python3 processing/fetch_gbif.py --include-plants --country KE --country GH
```

The default scope is Animalia from 1900 through the current year. Pass `--include-plants` to add
Plantae, `--year-min` and `--year-max` to change the date range, or repeat `--country ISO2` to run a
smaller country subset; without `--country`, the script queries every country in GBIF's official
country enumeration. Each retained record must:

- have interpreted coordinates and no GBIF geospatial issue;
- have occurrence status `PRESENT`;
- have basis of record `HUMAN_OBSERVATION`, `MACHINE_OBSERVATION` or `LIVING_SPECIMEN`; and
- fall within the selected year range.

All other basis types are excluded, including `PRESERVED_SPECIMEN`, `FOSSIL_SPECIMEN`,
`MATERIAL_SAMPLE`, `MATERIAL_CITATION`, `OBSERVATION` and generic `OCCURRENCE` records.
Explicit absences and undated/out-of-range occurrences are also excluded.
GBIF's interpreted geospatial flag covers core problems such as zero,
invalid, out-of-range, and country-coordinate mismatches; it is not equivalent to applying a
record-level tool such as CoordinateCleaner.

The script queries GBIF year facets rather than downloading occurrence rows, once per country and
kingdom. It verifies that each facet sum equals GBIF's filtered total and fails rather than accepting
a truncated response. Kingdom keys are resolved against the current GBIF backbone, and GBIF's
official country enumeration supplies the ISO2-to-ISO3 mapping.

The outputs are:

- `processing/data/gbif.json`: counts in the shared `{ISO3: {year: count}}` format;
- `processing/data/gbif_report.json`: generation time, resolved kingdom keys, exact filters, the
  known wild-status limitation, and per-country totals split by kingdom.

These are occurrence-record counts, not counts of distinct species or individual organisms. GBIF
has no universal flag proving every record came from a wild or native organism; included
`LIVING_SPECIMEN` records may represent captive or cultivated organisms. `build_data.py` validates
the allowlist and country totals against the audit report, rejecting stale counts generated under
the former filters. It exports the same filter metadata to both apps and retains the shared DHS
timeline cutoff. Rerun `fetch_gbif.py` before building older data.

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
