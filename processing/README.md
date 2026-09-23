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

Tests are run explicitly from `processing/`; build and fetch commands do not run them:

```sh
python3 -m unittest discover -s processing -p 'test_*.py'
```

## Build app data

From the repository root:

```sh
python3 processing/build_data.py
```

This reads the nine country/year aggregation files below:

- `processing/data/biotime.json`
- `processing/data/living_planet.json`
- `processing/data/predicts.json`
- `processing/data/dhs.json`
- `processing/data/mics.json`
- `processing/data/gbif.json`
- `processing/data/lsms_isa.json`
- `processing/data/lsms.json`
- `processing/data/grdc.json`

All nine use `{ISO3: {year: count}}`. The build keeps their records separate and also calculates
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
Comoros, Maldives and São Tomé and Príncipe are retained from the Natural Earth 10m country source
so every DHS country has the exact geometry used by both the map and agriculture processor.

The DHS survey dataset defines the app's country scope. Records from MICS and the ecology
datasets are visualized only for mapped countries covered by DHS. A dataset with no records in an
in-scope country is retained as missing rather than changing the country scope. Separate source
records remain intact, while the generated combined aggregate and each dataset's `scopeSummary` use
that same DHS-country scope.
GRDC supplies Hydrology coverage. The inventory spreadsheet and sources without fetch parsers
remain excluded from this build.

## Exploratory analysis and figures

The plotting workflow, dependencies, tests, and generated figures live in [`eda/`](../eda/README.md).
Build the shared dashboard data here before running that workflow.

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

`--crop-allocation` also requests the optional agriculture computation. Missing reviewed
census inputs defer that stage with an explicit blocked summary, allowing `--build` to run.
Other agriculture errors, including invalid evidence or raster checks, still stop the pipeline.
Use `--skip crop_allocation` to omit that stage explicitly.

`--hydro-comparisons` fetches and computes the approved independent map pairs for
2000, 2010 and 2015: ERA5-Land/CHIRPS precipitation, ESA CCI/MIRCA-OS cropland,
and ESA CCI class 20/MIRCA-OS irrigated area. It writes the precomputed dashboard
payload plus `dispersion_by_scale.csv`, `effective_resolution.csv`, and the country
decay curves under `processing/data/hydro_comparisons/`. The raw cache is resumable
and checksum-audited. ERA5-Land access uses `~/.cdsapirc`; copy
`processing/cdsapirc.example` and follow its comments to obtain a CDS token.
Rainfed area remains excluded because ESA CCI Medium Resolution Land Cover has no
defensible rainfed class.

## Harvested-area allocation analysis

[`fetch_crop_allocation.py`](fetch_crop_allocation.py) handles source downloads,
harvested-area allocation dispersion within the exact country polygons displayed by both apps,
country effective resolution, and publication figures. Raster preparation is complete for the
current 264 layers. Supported census evidence is published to both apps; coverage is partial,
and failed allocation comparisons remain unavailable.

The default sources are:

| Product | Years | Selection |
| --- | --- | --- |
| [MapSPAM](https://www.mapspam.info/data/) | 2010 | v2r0 harvested area; irrigated I, rainfed H+L+S; exclude pre-summed A/R |
| [GAEZ v4](https://gaez-services.fao.org/server/rest/services/res06/ImageServer) | 2000, 2010 | Theme 5 actual harvested area; exclude potential-area themes |
| [GAEZ+2015](https://doi.org/10.7910/DVN/KAGRFI) | 2015 | Irrigated/rainfed harvested area; exclude pre-summed Total |
| [MIRCA2000](https://zenodo.org/records/7422506) | 2000 | v1.1 full-resolution annual harvested area; class 2 maize, class 3 rice |
| [MIRCA-OS](https://www.hydroshare.org/resource/e4582ca0042148338bb5e0148b749ed6/) | 2000, 2010, 2015 | v2 annual harvested area; exclude 2005 and 2020 |

The script defines the explicit 15-crop concordance. Potato remains potato-only:
excluding GAEZ's potato/sweet-potato aggregate leaves two products in 2000 and 2010,
and no qualifying 2015 pair. Maize and sorghum carry an `approximate` crosswalk flag;
other included dedicated classes carry `exact`. Residual aggregates, millet, coffee,
rye and fodder cannot enter. Cocoa is opt-in and restricted to SPAM/MIRCA2000 pairs;
default vintages provide no same-year pair. Additional SPAM vintages require
`--mapspam-vintages`, `--manifest`, and documented `crop_membership_ref` values on
their layer and evidence records.

Use the shared processing environment to prepare sources and inspect census inputs:

```sh
python3 processing/fetch_crop_allocation.py --prepare-only --offline
python3 processing/fetch_crop_allocation.py --audit-evidence-only --offline
```

Omit `--offline` when initially downloading sources. The raw cache at
`processing/data/raw/crop-allocation/` records source URL, version/vintage, access
date, byte count and SHA-256, plus provider checksums where available. Verified
cached files require no network access. Interrupted downloads resume only with an
unchanged ETag. The frozen `sources.json` manifest can be overridden with `--manifest`.
Local GAEZ+2015 ZIPs or original GeoTIFFs in `processing/data/raw/gaez2015/` fill missing
crop pairs while retaining a manifest backup and import audit; existing pinned layers
are not replaced. The supplied ZIP resolves the earlier provider HTTP 403. MIRCA-OS
archives live in `processing/data/raw/mirca-os/`. Both input folders have CLI overrides.

Every native raster must be a full global 4320 × 2160 WGS84 five-arcminute grid.
GAEZ's 1000-ha units are converted to hectares. Harvested area is retained throughout,
including multiple harvests. Each pixel is clipped to the country geometry from
`data/world.raw.geojson` and conservatively remapped into an equal-area grid; harmonised
shape, transform and CRS must match. Invalid boundaries and unsplit antimeridian countries fail.
Block widths double from one cell to the country extent, summing area. Blocks with a
nonzero cross-product mean contribute sample CV (`std(ddof=1)/mean`), averaged over blocks.
Blocks stay inside the map country; there are no sub-country analysis divisions.

The default `country-shares` basis conservatively remaps each available product to the same
equal-area country grid, then normalises each positive product total to a harvested-area share.
It therefore compares within-country allocation patterns even where products use different
census totals. Raw clipped totals remain in the audit output; they are never adjusted to force
a common total. Pairwise differences of the normalised shares must sum to numerical zero
(relative tolerance `1e-6`, absolute `1e-12`), and dispersion at the whole-country scale must
be near zero. `--allocation-basis strict-totals` retains the older 10% total screen for an
explicitly strict run.
Effective resolution is the first measured width below the default CV tolerance of `0.10`,
without interpolation. Normalised widths divide by the square root of equal-area country area.
These are allocation-pattern measures; they do not select a reference product.

Every DHS map country receives a source-availability row for every crop/year. Comparisons are
emitted when two or more products contain positive country area. A one-product or no-positive-
area case keeps its source availability and has no allocation comparison. For example, the
GAEZ 2015 potato layer combines potato with sweet potato and is not a dedicated potato product,
so 2015 potato can have fewer products. The verified undeclared `-9999` fill in the pinned
MIRCA-OS 2010 irrigated potato raster is masked only after its file checksum is checked.

The evidence audit extracts the [MIRCA-OS supplementary tables and notes](https://doi.org/10.1038/s41597-024-04313-w)
and inventories local archives into `data/crop_allocation/`. It preserves page citations
and unresolved country cells. ZIP member headers are checked even when an archive inventory
is cached; unreadable members fail the audit and are listed in `evidence_audit.json`.
This structural check does not replace CRC checks when reading member contents.
Census-to-boundary reconciliation now runs automatically when the default intermediate files
are missing. It can also be run independently, or refreshed after replacing raw inputs:

```sh
python3 processing/fetch_crop_allocation.py --reconcile-only --offline
python3 processing/fetch_crop_allocation.py --reconcile-evidence --offline
```

Two adapters currently operate on the supplied original tables:

- **FAOSTAT national harvested area:** accepts only explicit official observations, including
  reported zeros. Both modern (`A` / `Official figure`) and legacy (blank / `Official data`)
  flags are supported. Estimates, imputations, unofficial values and observations with notes
  requiring review are excluded. The supplementary table must explicitly specify admin level 0
  and the country notes must confirm national FAOSTAT use without subnational exceptions.
- **Mexico SIAP state harvested area:** reads `Harvested(Ha)`, sums documented seasons,
  irrigation modes and municipality components within the state, and counts that state once per
  crop/year. The supplementary table and country notes establish admin level 1. Repeated
  identical cells are deduplicated; conflicting cells or mixed state totals and municipality
  components reject the whole state/crop/year. Reviewed seed/grain components retain an
  `aggregated` crosswalk flag. Fodder, sweet potatoes and unreviewed crop labels are excluded.

The reconciler matches country names through ISO names and explicit aliases, checks M49 codes
when provided, and joins the resulting ISO3 to `data/world.raw.geojson`. Its coordinates are
copied exactly, including all parts of a MultiPolygon. Countries absent from the map are
reported and excluded. Released MIRCA-OS subnational boundary files are not used.
No fuzzy matches, guessed source admin levels or interpolated census years are used.

The generated files under `data/raw/mirca-os/` are:

- `reporting_units.csv`: `product,country_iso3,admin_unit_id,admin_level,crop,year,status,source_ref,admin_level_ref`
  plus reported hectares, source flags, crosswalk exactness, original state name and map
  provenance. Census IDs and levels remain unchanged: Mexico's state reports still count as
  separate observations, even though its analysis uses one country polygon. Every accepted
  observation is attributed to MIRCA-OS; it is not copied to other products.
- `analysis_units.geojson`: one exact map country feature per represented year, with
  `admin_unit_id` equal to ISO3, analysis `admin_level=0`, `analysis_scope="map country"`,
  source admin levels and citations, and the map SHA-256. The analysis level is not a claim
  that all underlying censuses are national. Likewise, `n_admin_units=1` in a resolution
  summary counts the analysis region, not the census evidence used for dashboard coverage.

`data/crop_allocation/reconciliation_report.json` records member and archive checksums,
accepted counts, conflicting observations, unresolved joins, unsupported source files and
excluded archives. Damaged ZIPs are excluded in full; valid independent archives can still
contribute. Coverage is explicitly partial until the remaining sources have reviewed adapters.
Neither quality scores, calendar rows nor polygon counts establish reporting counts.

These are generated intermediate files, **not additional provider downloads**. Cache entries
include both archive identity and member directory, preventing identical filenames in different
countries from colliding. Reruns refuse to overwrite manually edited intermediates, and computation
checks that evidence, analysis geometry and the map have not changed before publishing results.
The shared app build rejects agriculture results made with an earlier map checksum; regenerate
with `--reconcile-evidence` after changing the map. `--mirca-raw` sets their default
directory; `--evidence` accepts reviewed census inputs; `--units` must still match the canonical map exactly. Missing custom
inputs exit with status 3, which the full fetch pipeline reports as a deferred stage. Invalid
sources and failed reconciliation contracts still fail explicitly.

Reconcile, compute and build both apps through the shared pipeline:

```sh
python3 processing/fetch_crop_allocation.py --offline
python3 processing/build_data.py
# Alternatively, include this stage in the full source refresh:
processing/fetch_all.sh --crop-allocation --build
```

Outputs under `data/crop_allocation/` include `dispersion_by_scale.csv`,
`effective_resolution.csv`, `country_curves.json`, `skipped.json` and `preflight.json`.
Country/crop/year decay figures go to `eda/figures/crop-allocation/` as PDF, SVG and
300-dpi PNG, with logarithmic scale axes, effective-resolution markers and country sizes.
Successful computation also writes `mapspam.json`, `gaez.json`, `mirca2000.json`,
`mirca_os.json` and `crop_allocation_report.json` under `data/`. Counts deduplicate
reporting unit IDs across crops and irrigation systems within each product/year;
multi-year totals count unit-years. The shared build reconstructs these counts from
the audit before publishing one `agriculture_maps` overview source in both apps, with unit
`reporting admin units`. Its counts deduplicate the same unit across products and crops.
Preparation never replaces dashboard data. Verified counts may be published even when
allocation comparisons fail; failed dispersion and resolution values remain unavailable.

The build also emits the same `agriculture` payload to both apps: per-crop yearly reporting
counts, native-cell dispersion, effective resolution, completeness and crosswalk flags.
Without reviewed evidence it emits an explicit unavailable state with empty records and
no numeric scores, retaining the 15-crop controls. Neither archive inventories nor synthetic
test fixtures are used as dashboard evidence.

Each app keeps its own yearly and selected-window score calculations.
The overview offers map availability across crops (default) or reporting-unit coverage.
Detailed agriculture shows only crop sectors, with dispersion (default), effective
resolution or reporting-unit coverage selectable. Category and dataset filters are disabled
in that mode; their selections are restored on exit. Annual bins remain available in all modes.
Coverage follows the standard 60% log-normalised density / 40% reporting-year formula.
Selected-window dispersion averages available yearly country values; effective resolution
uses the coarsest available yearly value. Missing years are not interpolated, and availability
is shown separately. Dispersion and resolution use their own labelled colour scales.

Both apps consume crosswalk flags and `effective_resolution_km` by country/year/crop.
Country details show the coarsest known limit in the selected window, or unavailable.
The maps currently draw country summaries; any future agricultural raster renderer
must enforce the supplied resolution limit. Run `--help` for options and
`python3 -m unittest discover -s processing -p 'test_crop_allocation.py'` for the
scientific, provenance, grid, import and cache checks.

## Parse GRDC discharge coverage

Place the portal's downloaded GRDC Export Format ZIP files in `processing/data/raw/grdc/`, then run:

```sh
python3 processing/fetch_grdc.py
python3 processing/build_data.py
```

The parser streams the daily/monthly text files directly from all ZIPs and ignores large catchment
GeoJSON members. `--input` accepts a different folder, an individual ZIP or text file, and can be
repeated for several inputs. `fetch_all.sh --grdc PATH` forwards a custom input; `--skip grdc`
preserves an existing normalized GRDC snapshot.

Each distinct station contributes one station-year when an actual observation in that year is
finite and not the declared missing sentinel. Zero flow is valid. Entirely missing years are not
filled between a station's earliest and latest dates. Daily/monthly and repeated archive coverage
are deduplicated by station ID/year; inconsistent coordinates or truncated data fail the parser.
The country assignment uses the same polygon matcher as the ecology parsers. Unmapped stations
are reported and omitted from country counts. Multi-year totals are station-years, not unique stations.

`grdc_report.json` retains input checksums, station IDs and observed years, file/row counts, and
mapping exclusions. The shared build validates `grdc.json` against this audit before exporting
Hydrology to both apps. Raw discharge values and the station audit remain outside the app bundle.
The source's download process, definitions, and attribution are documented in [DATASETS.md](../DATASETS.md#grdc).

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

## Build yearly LSMS household-member counts

Fetch the LSMS collection and file metadata through the World Bank Microdata Library's public NADA
REST API:

```sh
python3 processing/fetch_lsms.py
```

This writes `processing/data/lsms.json` in the shared `{ISO3: {year: count}}` format and
`processing/data/lsms_report.json` with every study, access type, data file, `case_count`,
classification, and participant-file selection. The parser selects one household-member/person
roster per study and never sums file row counts. Therefore household, plot, crop, enterprise, and
transaction files cannot inflate the participant total. Roster matching recognises compact names
such as `HHRoster`, roster descriptions, and household sociodemographic sections. When these
are insufficient, the parser retrieves public `/catalog/{study_id}/variables` metadata and
requires household and member identifiers, age, sex, and relationship to the household head
in the same file. The matched variable labels and source URL are retained in the audit.
This identifies cryptic files such as Tanzania HRDS 1993's `HR1` without hardcoding its count.
Different counts among variable-based candidates remain ambiguous and are not summed.
Derived analysis releases (`_A_`) do not use this fallback: they need a reviewed counting
rule because rows may pool survey waves or represent an analytical subset.

`skipped:` messages distinguish missing metadata, missing row counts, unidentified rosters and
ambiguous candidates. The final summary and report record each reason; skipped studies are
missing observations, not zero counts. These messages do not mean a download failed unless the
reason explicitly says variable metadata could not be retrieved. Existing filename-based
heuristic selections remain labelled in the report. `build_data.py` includes LSMS in the
Public Health category and writes identical source counts to both apps.

Every normal `fetch_lsms.py` run automatically computes household-member estimates for studies
without usable roster counts. No opt-in flag or separate reprocessing step is required; this also
applies when `fetch_all.sh` runs LSMS. Estimation uses
reviewed household file rows × a frozen household-size mean. The reference database lives in
[`resources/lsms_household_estimates.json`](resources/lsms_household_estimates.json). It contains
only the reviewed LSMS studies that can receive an estimate: one approved household-file count and
one frozen household-size mean per study. The priority used when the resource was assembled was a
same-study unweighted mean, an explicitly reviewed comparable survey, then a national reference
within five years. The fetch script makes no country-wide lookup or online household-size calculation.

`lsms.json` remains observed roster counts only. The audit carries `estimatedParticipants`,
`countType`, selected mean/source/year gap, household file, and reasons an estimate was skipped.
Its `_meta.estimatedRecords` is exported separately to both apps. **Include LSMS estimates** is
on by default; toggling it updates counts, yearly bins, country/category scores and histograms.
Country details distinguish observed records from estimated household members. Neither means
unique people across studies or individually interviewed participants.

The apps' on-by-default switch controls whether already-computed estimates contribute to the
displayed counts and scores; it does not control fetch-time estimation.

Only when updating the reference resources without fetching study metadata again, reapply them
to an existing audit without network access:

```sh
python3 processing/fetch_lsms.py --reprocess-report processing/data/lsms_report.json
python3 processing/build_data.py
```

The build verifies observed totals against selected roster files and recomputes all estimates
from the resource checksums and household bindings. Changed evidence requires reprocessing.

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
