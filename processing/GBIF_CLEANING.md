# GBIF country/year occurrence cleaning

`fetch_gbif.py` produces `processing/data/gbif.json` in the BioTIME format:

```json
{"ARG": {"1990": 123, "1991": 456}}
```

Counts are GBIF occurrence records grouped by interpreted occurrence country and year. They are not
numbers of distinct species or individual animals.

## Default scope

The default query includes **Animalia only** and years from 1900 through the current year. Use
`--include-plants` to add Plantae, or change the date range with `--year-min` and `--year-max`.

```sh
python3 -m pip install -r processing/requirements.txt
python3 processing/fetch_gbif.py

# Animals and plants, restricted to selected countries
python3 processing/fetch_gbif.py --include-plants --country KE --country GH
```

The script uses GBIF year facets instead of downloading occurrence rows. One filtered facet query is
made per country and kingdom. The facet sum must equal GBIF's filtered total; the run fails instead
of silently accepting a truncated response.

## Cleaning rules

| Filter | Value | Purpose |
|---|---|---|
| `kingdomKey` | Animalia | Animals only by default |
| `hasCoordinate` | `true` | Require interpreted coordinates |
| `hasGeospatialIssue` | `false` | Exclude records GBIF flags with spatial issues |
| `occurrenceStatus` | `PRESENT` | Exclude explicit absences |
| `basisOfRecord` | observations, preserved specimens, material samples, generic occurrences | Retain field evidence/material records |
| `basisOfRecord` | excludes `FOSSIL_SPECIMEN` | Exclude palaeontological records |
| `basisOfRecord` | excludes `LIVING_SPECIMEN` | Exclude explicitly captive or cultivated collection records |
| `year` | 1900–current year by default | Remove undated, implausibly old, and future records |

GBIF determines `hasGeospatialIssue` during record interpretation. It covers core suspicious
coordinate classes including zero, invalid, out-of-range, and country-coordinate mismatches. This is
not the same as applying CoordinateCleaner to every point, but is reproducible and practical for
country/year totals.

## Wild-occurrence limitation

GBIF has no universal search flag proving every observation or preserved specimen came from a wild
organism. Excluding `LIVING_SPECIMEN` removes records explicitly represented as zoo, aquarium,
living-collection, or cultivated specimens, but publishers can omit that context. The report records
this limitation. Stronger verification requires a GBIF download and record-level review.

## Outputs and provenance

- `processing/data/gbif.json`: compact ISO3/year counts.
- `processing/data/gbif_report.json`: generation time, resolved kingdom keys, exact filters, and
  per-country totals split by kingdom.

Kingdom keys are resolved against the current GBIF backbone. GBIF's official country enumeration
provides the ISO2-to-ISO3 mapping. By default every enumerated country is queried; repeat
`--country ISO2` for a smaller test or partial run.
