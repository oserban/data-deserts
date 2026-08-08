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
an occurrence record, population observation, sampling site, or interviewed participant. The app
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
| DHS | Public Health | Interviewed women plus interviewed men | `processing/data/dhs.json` | Included; defines country scope |
| MICS | Public Health | Interviewed women plus interviewed men | `processing/data/mics.json` | Included |
| LSMS | Public Health | Person/household-member roster record | `processing/data/lsms.json` | Included |

Hydrology, Agriculture, GRDC, and the historical inventory spreadsheet are not part of the current
aggregation. Their UI entries are placeholders only.

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

- **Source:** [PREDICTS database V1.1](https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1)
- **Parser:** `processing/fetch_predicts.py`
- **Input:** Natural History Museum datastore or an offline `sites.zip`
- **Output:** `processing/data/predicts.json`
- **Unit:** one sampling site, assigned to the year of its sampling midpoint
- **Cleaning:** site coordinates are matched to the project country boundaries
- **Interpretation:** species-level measurements are not counted separately, preventing species-rich
  or intensively sampled sites from inflating geographic coverage

```sh
python3 processing/fetch_predicts.py
```

## DHS

- **Source:** [DHS Program API](https://api.dhsprogram.com/)
- **Parser:** `processing/fetch_dhs.py`
- **Output:** `processing/data/dhs.json`
- **Audit output:** `processing/data/dhs_report.json`
- **Unit:** interviewed women plus interviewed men reported for a survey
- **Country mapping:** official DHS country-code to ISO3 mapping from the API
- **Cleaning:** households are retained in the audit report but never counted as people; partial
  women-only or men-only surveys remain explicitly identified
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
  excludes `FOSSIL_SPECIMEN` and `LIVING_SPECIMEN`
- **Integration status:** included in the Ecology category

GBIF counts are neither species richness nor individual abundance. GBIF has no universal query flag
proving every record represents a wild organism. Excluding living specimens removes explicitly
identified zoo, aquarium, cultivated, and living-collection records, but cannot repair missing
publisher context. See the
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
report. When no defensible roster exists, the study remains unresolved rather than being counted.

Roster records represent people described by the survey and do not prove that every household member
was interviewed individually.

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

`processing/build_data.py` reads all eight normalized datasets, preserves them as separate
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
