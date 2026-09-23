# Dataset inventory and provenance

This file is the central reference for data used or prepared by Data Deserts. It records the source,
unit of analysis, normalization, cleaning, access requirements, and current integration status for
each dataset.

## Common normalized format

Every parser intended for aggregation emits a JSON object keyed by ISO 3166-1 alpha-3 country code
and four-digit year:

```json
{
  "KEN": {
    "2019": 1234,
    "2020": 5678
  }
}
```

Counts must be non-negative integers. Missing countries or years mean **missing data**, not zero
observations confirmed by the source. The app currently displays countries covered by DHS; other
datasets do not expand this scope, and missing source data within a DHS country remains a grey radial
sector or annual time bin.

The counts are not directly comparable across sources. Depending on the dataset, one count may mean
an occurrence record, population observation, sampling site, survey, or interview record. The app
normalizes visual intensity independently within each dataset or displayed category.

The app's **Data & licences** dialog acknowledges every integrated provider and links to its current
terms. Licences are not uniform: BioTIME studies and GBIF occurrence datasets carry source-level
licences, while Living Planet, DHS, MICS, and World Bank studies have provider or study-specific
conditions. The processed deployment bundle is not offered as a replacement download for any source.

## Current status

| Dataset | Category | Count represents | Normalized output | App build |
|---|---|---|---|---|
| BioTIME | Ecology | Biodiversity observation record | `processing/data/biotime.json` | Included |
| Living Planet Database | Ecology | Population-year observation | `processing/data/living_planet.json` | Included |
| PREDICTS | Ecology | Sampling site assigned to a sampling year | `processing/data/predicts.json` | Included |
| GBIF | Ecology | Cleaned occurrence record | `processing/data/gbif.json` | Included |
| LSMS-ISA | Agriculture | Row in a classified agricultural data file | `processing/data/lsms_isa.json` | Included |
| Crop agriculture | Agriculture | Reporting administrative unit/year, deduplicated across crops and products | `processing/data/crop_allocation_report.json` | Included; partial reconciled evidence |
| GRDC | Hydrology | Distinct station with observations in a calendar year | `processing/data/grdc.json` | Included; station-years |
| DHS | Public Health | Unique available surveys | `processing/data/dhs.json` | Included; defines country scope |
| MICS | Public Health | Interviewed women plus interviewed men | `processing/data/mics.json` | Included |
| LSMS | Public Health | Person/household-member roster record | `processing/data/lsms.json` | Included |

Ecology, Agriculture, Hydrology, and Public Health are included. The historical inventory
spreadsheet is not part of the current aggregation.

Crop agriculture uses verified MIRCA-OS census observations linked to the countries in
`processing/data/world.raw.geojson`. Allocation calculations use those exact map geometries,
without sub-country divisions; evidence counts retain the original census units. The current adapters cover official national FAOSTAT exports and
Mexico's SIAP state statistics. Calendar rows, imputed values, damaged archives and unresolved
joins do not contribute counts. MapSPAM, GAEZ and MIRCA harvested-area rasters are used for
allocation comparisons; their pixels are never counted as observations. Dispersion and effective
resolution remain unavailable wherever those comparisons fail the statistical-base checks.
Source scope, reconciliation commands and exclusions are documented in the
[processing README](processing/README.md#harvested-area-allocation-analysis).

## BioTIME

- **Source:** [BioTIME](https://biotime.st-andrews.ac.uk/)
- **Parser:** `processing/fetch_biotime.py`
- **Input:** downloaded observation CSV, ZIP, or the parser's official default endpoint
- **Output:** `processing/data/biotime.json`
- **Unit:** one source observation record
- **Country assignment:** observation coordinates are matched to
  `processing/data/world.raw.geojson`
- **Cleaning:** invalid coordinates and points outside mapped country polygons are omitted; this can
  exclude marine observations
- **Interpretation:** counts describe record coverage, not abundance, individuals, or species richness

Example:

```sh
python3 processing/fetch_biotime.py --input /path/to/BioTIME-export.zip
```

## Living Planet Database

- **Source:** [Living Planet data portal](https://livingplanetindex.org/data_portal)
- **Parser:** `processing/fetch_living_planet.py`
- **Input:** agreement-protected ZIP downloaded manually from the portal; CSV and gzip are also supported
- **Output:** `processing/data/living_planet.json`
- **Unit:** one population observation in one year
- **Country assignment:** population coordinates are matched to the project country boundaries
- **Cleaning:** invalid or unmappable coordinates are omitted; metadata and agreement files inside
  downloads are not parsed as observations
- **Interpretation:** counts are observations of vertebrate population time series, not numbers of
  animals and not Living Planet Index values

The source requires submission of contact and intended-use information and acceptance of its data
agreement. Do not redistribute its raw download without checking those terms.

```sh
python3 processing/fetch_living_planet.py \
  --input /path/to/LivingPlanetIndexDatabase_<timestamp>.zip
```

## PREDICTS

- **Sources:** [2016 V1.1](https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1) and [November 2022 additions](https://data.nhm.ac.uk/dataset/release-of-data-added-to-the-predicts-database-november-2022)
- **Parser:** `processing/fetch_predicts.py`
- **Input:** both NHM site-summary resources, or separate offline CSV/ZIP files
- **Output:** `processing/data/predicts.json`; per-release audit in `predicts_report.json`
- **Unit:** one sampling site, assigned to the year of its sampling midpoint
- **Cleaning:** validate each release independently as JSON/CSV text labels (no unused R factor levels); deduplicate `SSBS` across releases, fail on conflicting site dates/coordinates, then match coordinates to project country boundaries. For RDS-to-CSV preparation, apply `droplevels()` to each release before combining
- **Interpretation:** species-level measurements are not counted separately, preventing species-rich
  or intensively sampled sites from inflating geographic coverage

```sh
python3 processing/fetch_predicts.py
```

## GRDC

- **Source:** [GRDC Data Portal](https://grdc.bafg.de/data/data_portal/) and contributing national hydrological services
- **Parser:** `processing/fetch_grdc.py`
- **Input:** locally downloaded GRDC Export Format daily/monthly text files, ZIPs, or a folder of ZIPs;
  default `processing/data/raw/grdc/`. The portal requires a data request; there is no automatic
  discharge-download API. The old `grdc_stations.csv` contains no dates and is not used
- **Output:** `processing/data/grdc.json`; audit in `grdc_report.json`
- **Unit:** an observed **station-year**: each GRDC station ID counts once per calendar year with
  at least one finite, non-missing observation. A multi-year sum is not a count of unique stations
- **Cleaning:** read actual observation dates, not the declared start/end span; honour missing-value
  markers; zero flow and finite signed flow count as observations. Current Value and legacy
  Original/Calculated exports are supported. Valid calculated values take precedence; original values
  are the fallback. Daily flag 99 is excluded; monthly flags are completeness percentages
- **Deduplication:** union observed years by station ID across daily/monthly files and overlapping
  archives. Conflicting station locations, malformed rows, unsupported formats, and truncated
  exports fail explicitly. Build-time provenance validates every exported station-year count
- **Country assignment:** station coordinates matched to the shared country polygons, not the
  upstream catchment area. Stations outside mapped polygons remain in the audit but not the apps
- **Interpretation:** measures observed station coverage, not discharge volume, measurement counts,
  continuous monitoring, or catchment coverage. A single valid observation qualifies a year;
  no inference is made about completeness within that year
- **Access and attribution:** downloaded discharge values must not be redistributed. Derived
  statistical products require attribution to “The Global Runoff Data Centre, 56068 Koblenz,
  Germany”. Only country/year counts enter the apps; station-level audit and raw files are ignored
  by Git. See the provider's [source and terms](https://grdc.bafg.de/data/data_portal/)

```sh
python3 processing/fetch_grdc.py
python3 processing/fetch_grdc.py --input /path/to/grdc-exports
```

The shared build applies the same first-DHS-year cutoff and DHS country scope as every other
source. It does not treat countries without downloaded GRDC observations as confirmed zero flow.

## DHS

- **Source:** [DHS Program API](https://api.dhsprogram.com/)
- **Parser:** `processing/fetch_dhs.py`
- **Output:** `processing/data/dhs.json`
- **Audit output:** `processing/data/dhs_report.json`
- **Unit:** unique completed DHS Program surveys with published indicators, including DHS, AIS and MIS; one count per `SurveyId` in its principal survey year
- **Country mapping:** official DHS country-code to ISO3 mapping from the API
- **Cleaning:** survey IDs are deduplicated; women, men and household sample sizes are retained separately in the audit report and never summed into the coverage measure
- **Nutrition:** any nutrition topic, including feeding practices, dietary diversity, food insecurity, anthropometry, anemia and micronutrients. Evidence comes from official survey characteristics or published Child Nutrition / Adult Nutrition indicators. Unconfirmed coverage is not treated as absence
- **Display:** both apps show fieldwork year labels and highlight years with at least one nutrition survey; filters and charts use principal years and survey counts
- **Integration role:** DHS is the sole reference defining which countries are visible in the app

```sh
python3 processing/fetch_dhs.py
```

## MICS

- **Source:** [UNICEF Multiple Indicator Cluster Surveys](https://mics.unicef.org/surveys)
- **Parser:** `processing/fetch_mics.py`
- **Input:** manually downloaded `processing/data/raw/MICS_Datasets.zip`
- **Output:** `processing/data/mics.json`
- **Audit output:** `processing/data/mics_report.json`
- **Unit:** rows in women's interview files plus rows in men's interview files where available
- **Cleaning:** household, household-member, birth-history, and child files are excluded to prevent
  counting households or duplicate people; national and subnational survey components are preserved
- **Interpretation:** some rounds only contain a women's file, so completeness must be read from the
  report rather than inferred from the total

The parser reads SPSS case counts directly from nested file headers without extracting the full
archive or requiring an SPSS library.

```sh
python3 processing/fetch_mics.py
```

## GBIF

- **Source:** [GBIF occurrence API](https://techdocs.gbif.org/en/openapi/v1/occurrence)
- **Parser:** `processing/fetch_gbif.py`
- **Output:** `processing/data/gbif.json`
- **Audit output:** `processing/data/gbif_report.json`
- **Unit:** one filtered occurrence record
- **Default taxonomic scope:** Animalia; `--include-plants` adds Plantae
- **Default temporal scope:** 1900 through the current year
- **Cleaning:** requires coordinates, rejects GBIF geospatial issues and explicit absences, and
  includes only `HUMAN_OBSERVATION`, `MACHINE_OBSERVATION` and `LIVING_SPECIMEN`
- **Integration status:** included in the Ecology category

GBIF counts are neither species richness nor individual abundance. GBIF has no universal query flag
proving every record represents a wild organism. Preserved museum specimens and all other
basis types are excluded. Included living specimens may represent captive or cultivated organisms;
these filters do not establish native-range occurrence. See the
[processing README](processing/README.md#build-yearly-cleaned-gbif-occurrence-counts) for the exact
basis types, geospatial rules, facet validation, and limitations.

```sh
python3 -m pip install -r processing/requirements.txt
python3 processing/fetch_gbif.py
```

## LSMS

- **Source:** [World Bank Microdata Library LSMS collection](https://microdata.worldbank.org/catalog/lsms)
- **API:** [NADA REST catalog API](https://microdata.worldbank.org/api-documentation/catalog/index.html)
- **Parser:** `processing/fetch_lsms.py`
- **Output:** `processing/data/lsms.json`
- **Audit output:** `processing/data/lsms_report.json`
- **Unit:** one person or household-member record in a selected roster file
- **Cleaning:** exactly one canonical roster is selected per study; file case counts are never added
  within a study
- **Integration status:** included in the Public Health category

NADA's `case_count` is the number of rows in one data file, not automatically a participant count.
LSMS studies can include separate household, member, plot, crop, livestock, enterprise, expenditure,
and transaction files. The parser classifies every file using its API filename and description,
selects the strongest person-roster candidate, and records alternatives and confidence in the audit
report. If names and descriptions do not identify a roster, public variable metadata must establish
household and member identifiers, age, sex, and relationship to the household head in the same
file. The audit retains the matched labels and source URL. Variable-based candidates with different
row counts remain ambiguous. Derived analysis releases do not use variable-based inference.
Skips distinguish missing file metadata, missing counts, ambiguous
rosters and failed variable-metadata requests; they are not counted as zero observations.

Roster records represent people described by the survey and do not prove that every household member
was interviewed individually.

Both apps offer **Include LSMS estimates**, on by default. It adds estimated household members for
reviewed studies lacking a usable roster count, using one household file's rows multiplied by a
cited household-size mean. Observed rosters always take priority. Estimates are stored separately
from observed counts and labelled in country details; they affect both annual and aggregate scores
when enabled. Records across studies/years do not represent deduplicated people.

The offline [reviewed-study household-size dictionary](processing/resources/lsms_household_estimates.json)
contains only the approved LSMS household-file counts and frozen means used by the estimator.

```sh
python3 processing/fetch_lsms.py
```

## LSMS-ISA

- **Source:** [World Bank LSMS-ISA](https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA)
- **Metadata API:** World Bank Microdata Library NADA REST API
- **Parser:** `processing/fetch_lsms_isa.py`
- **Output:** `processing/data/lsms_isa.json`
- **Audit output:** `processing/data/lsms_isa_report.json`
- **Unit:** one row in a classified agricultural data file
- **Scope:** documented LSMS-ISA survey series in Burkina Faso, Ethiopia, Malawi, Mali, Niger,
  Nigeria, Tanzania, and Uganda
- **Integration status:** included in the Agriculture category

The parser sums `case_count` across files classified as agriculture, crop, input, parcel, plot,
land, farm, livestock, fisheries, or tree modules. Generic planting/harvest visit labels do not
qualify because those visits also contain non-agricultural household modules. This is a record-coverage measure. It is
not a count of unique farmers, households, farms, plots, crops, or animals: the same entity can
appear in several modules. Every included and excluded file and its classification is retained in
the audit report.

```sh
python3 processing/fetch_lsms_isa.py
```

## World boundaries and country identifiers

`processing/data/world.raw.geojson` is the authoritative map geometry for the build. Dataset parsers
must emit ISO3 keys compatible with its feature IDs. `processing/build_data.py` validates identifiers
before exporting the map as `app/data/world.js`.

Some small states and territories are absent from the low-resolution boundary file. Records for
those identifiers may remain valid in source-level parser outputs while being omitted from the app
build. Natural Earth's shared `-99` fallback is permitted only for map features without an assigned
ISO3 identifier.

## Generated app data

`processing/build_data.py` reads all nine normalized datasets, preserves them as separate
sources, calculates scoped summaries and an aggregate, and writes:

- `app/data/datasets.js`
- `app/data/world.js`

The aggregate is used for totals and metadata; it does not replace the separate dataset records used
by filters, radial coverage charts, tooltips, and country details.

`app/data/datasets.js` contains processed country/year records and is deliberately ignored by Git.
The public repository contains only `app/data/datasets.template.js`, which documents the runtime
schema with placeholders. Build `datasets.js` inside the protected deployment environment after its
ignored normalized inputs have been supplied. Do not copy the template over the built file.

## Adding or changing a source

When changing a dataset pipeline, update this file with:

1. source URL and access or redistribution restrictions;
2. the exact counting unit and temporal assignment;
3. input, normalized output, and audit-report paths;
4. country mapping and exclusion rules;
5. known completeness and interpretation limitations;
6. whether the dataset is included in `processing/build_data.py`.

Do not describe missing records as confirmed zeros, and do not compare raw magnitudes across datasets
with different counting units.
