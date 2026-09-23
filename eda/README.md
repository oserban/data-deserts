# Exploratory data analysis and publication figures

This directory owns the plotting workflow, its dependencies, tests, and generated figures.
Data acquisition and dashboard data preparation remain in [`processing/`](../processing/README.md).
Run the commands below from the repository root.

## Create publication figures

`plot_data_divides.py` produces three print-ready figure sets from the validated JSON exports
shared by both dashboards. It reads local files and does not fetch data or alter the apps.

```sh
python3 -m pip install -r eda/requirements.txt
python3 processing/build_data.py
python3 eda/plot_data_divides.py
```

Default output is `eda/figures/data-divides/` (ignored by Git):

- `01_geographic_breadth`: equal-area country map of all 11 sources with usable data and source-availability bars.
- `02_country_source_divides`: aligned country/source matrices: independent, log-scaled record density
  for record sources and allocation dispersion (coefficient of variation) for the two map sources.
  Cell numbers show years with records or valid map comparisons.
- `03_temporal_overlap`: annual country availability for all 11 sources and coincident domain availability.
- Individual vector PDFs/SVGs, 600 dpi PNGs, and the combined `data-divides.pdf`.
- `captions-and-methods.md` with manuscript captions and interpretation limits, plus `manifest.json`
  with input hashes, versions, configuration, country selection, and the exact plotted statistics.

The default is all mapped DHS countries, the full exported DHS-era timeline, a white background,
and an ordered, colourblind-friendly palette. Figures are 180 mm wide for two-column publication;
the country matrix is a full-page figure to keep all country names readable. PDF fonts are embedded;
SVG labels remain editable. Use the vector files for manuscripts and PNGs for previews.

These figures describe the assembled source portfolio, not a census of all data or a measure of
research need. Record units are never pooled across sources. Country and year denominators are
explicit; missing records do not establish non-existence, and same-year domain overlap does not
establish spatial or record-level linkage. Agriculture record coverage reflects the eight-country
LSMS-ISA programme. Agricultural and hydrology map comparisons enter source availability only when a
valid precomputed comparison exists; their allocation metrics are shown separately and never used as
record counts or coverage scores. Different source release cycles and survey schedules affect temporal coverage. The
generated captions document these limits and the exact formulae. See `--help` for all options.

## Checks

The analysis tests do not require plotting dependencies:

```sh
python3 -m unittest discover -s eda -p 'test_*.py'
```
