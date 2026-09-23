#!/usr/bin/env python3
"""Create print-ready figures from the same validated snapshot as both dashboards.

Run after build_data.py. No downloads, raw-data changes, or cross-source count sums.
Plotting dependencies are separate: pip install -r eda/requirements.txt
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "do-app-wall/src/data/datasets.json"
DEFAULT_WORLD = ROOT / "do-app-wall/src/data/world.json"
SHORT_NAMES = {"living_planet": "Living Planet", "lsms_isa": "LSMS-ISA"}


def analyse(bundle, world, year_from=None, year_to=None, countries=None):
    """Calculate availability and within-source intensity without pooling units.

    Scope and intensity reference countries remain fixed to the dashboard's full
    DHS scope, even for a narrower time window or a selected-country figure.
    Missing entries and explicit zeros both mean 'no positive records in snapshot'.
    """
    datasets, meta = bundle["datasets"], bundle["meta"]
    all_keys = meta["datasetOrder"]
    if not all_keys or len(set(all_keys)) != len(all_keys) or any(k not in datasets for k in all_keys):
        raise ValueError("datasetOrder must identify each plotted dataset once")
    if "dhs" not in datasets or meta.get("scopeDatasets") != ["dhs"]:
        raise ValueError("Expected the validated DHS-scoped dashboard export")
    first = meta["yearMin"] if year_from is None else year_from
    last = meta["yearMax"] if year_to is None else year_to
    if not meta["yearMin"] <= first <= last <= meta["yearMax"]:
        raise ValueError(f"Years must lie within {meta['yearMin']}–{meta['yearMax']} in ascending order")
    features = {str(f["id"]): f for f in world["features"] if str(f["id"]) != "-99"}
    scope = sorted(datasets["dhs"]["records"])
    if not scope or set(scope) - features.keys():
        raise ValueError("Every DHS scope country must have a mapped boundary")
    selected = sorted(set(countries)) if countries else scope
    if set(selected) - set(scope):
        raise ValueError("Countries outside mapped DHS scope: " + ", ".join(sorted(set(selected) - set(scope))))
    areas = {iso: features[iso]["properties"].get("areaKm2", 0) for iso in scope}
    if any(not math.isfinite(a) or a <= 0 for a in areas.values()):
        raise ValueError("Use world.json from build_data.py with positive areaKm2 values")
    years = list(range(first, last + 1))
    # Map-comparison aggregates are measurements, not record counts.  They are
    # plotted separately and never enter density, source-breadth, or temporal
    # record-overlap denominators.
    map_keys = [key for key in ("agriculture_maps", "hydro_maps") if key in all_keys]
    keys = [key for key in all_keys if key not in map_keys]
    domains = [d for d in meta["categoryOrder"] if any(datasets[k]["domain"] == d for k in all_keys)]
    if any(datasets[k]["domain"] not in domains for k in all_keys):
        raise ValueError("Every dataset must belong to a declared domain")
    counts, totals = {}, {}
    for iso in scope:
        counts[iso], totals[iso] = {}, {}
        for key in keys:
            rows = datasets[key]["records"].get(iso, {})
            values = [rows.get(str(year), 0) for year in years]
            if any(type(v) is not int or v < 0 for v in values):
                raise ValueError(f"Expected non-negative integer counts for {iso}/{key}")
            counts[iso][key] = values
            totals[iso][key] = sum(values)
    maxima = {
        key: max(totals[iso][key] / areas[iso] * 1_000_000 for iso in scope)
        for key in keys
    }
    intensity, active_years, breadth = {}, {}, {}
    annual_sources = {key: [0] * len(years) for key in keys}
    annual_domains = [[0] * len(years) for _ in range(len(domains) + 1)]
    overlap_countries = 0
    for iso in selected:
        intensity[iso], active_years[iso] = {}, {}
        for key in keys:
            density = totals[iso][key] / areas[iso] * 1_000_000
            intensity[iso][key] = math.log1p(density) / math.log1p(maxima[key]) if density else None
            active_years[iso][key] = sum(v > 0 for v in counts[iso][key])
            for yi, value in enumerate(counts[iso][key]):
                annual_sources[key][yi] += value > 0
        breadth[iso] = sum(totals[iso][key] > 0 for key in keys)
        has_overlap = False
        for yi in range(len(years)):
            present = {datasets[key]["domain"] for key in keys if counts[iso][key][yi] > 0}
            annual_domains[len(present)][yi] += 1
            has_overlap |= len(present) == len(domains)
        overlap_countries += has_overlap
    map_metrics = {iso: {key: {} for key in map_keys} for iso in scope}
    agriculture = bundle.get("agriculture", {})
    hydro = bundle.get("hydro", {})
    agriculture_rows = agriculture.get("aggregateMetrics", {})
    hydro_rows = hydro.get("aggregate", {}).get("metrics", {})
    for iso in scope:
        for year in years:
            agriculture_metric = agriculture_rows.get(iso, {}).get(str(year), {})
            hydro_metric = hydro_rows.get(iso, {}).get(str(year), {})
            for key, row in (("agriculture_maps", agriculture_metric), ("hydro_maps", hydro_metric)):
                if key not in map_keys or row.get("complete") is False:
                    continue
                value = row.get("dispersion")
                if isinstance(value, (int, float)) and math.isfinite(value) and value >= 0:
                    map_metrics[iso][key][year] = value
    map_summary = {
        key: {
            iso: (sum(map_metrics[iso][key].values()) / len(map_metrics[iso][key])
                  if map_metrics[iso][key] else None)
            for iso in scope
        }
        for key in map_keys
    }
    map_annual_values = {
        key: [[map_metrics[iso][key][year] for iso in selected if year in map_metrics[iso][key]]
              for year in years]
        for key in map_keys
    }
    # All eleven sources belong in the portfolio.  A map source is present only
    # where it has a valid precomputed comparison, never because its raster has
    # cells by construction.  Keep these presence indicators distinct from the
    # record-only arrays used for density in Figure 2.
    portfolio_keys = all_keys
    portfolio_annual = {key: list(annual_sources[key]) for key in keys}
    for key in map_keys:
        portfolio_annual[key] = [len(values) for values in map_annual_values[key]]
    portfolio_source_countries = {
        key: (sum(map_summary[key][iso] is not None for iso in selected) if key in map_keys
              else sum(totals[iso][key] > 0 for iso in selected))
        for key in portfolio_keys
    }
    portfolio_breadth = {
        iso: (sum(totals[iso][key] > 0 for key in keys) +
              sum(map_summary[key][iso] is not None for key in map_keys))
        for iso in selected
    }
    portfolio_domain_counts = [[0] * len(years) for _ in range(len(domains) + 1)]
    portfolio_overlap_countries = 0
    for iso in selected:
        has_overlap = False
        for yi, year in enumerate(years):
            present = {
                datasets[key]["domain"] for key in portfolio_keys
                if (year in map_metrics[iso][key] if key in map_keys else counts[iso][key][yi] > 0)
            }
            portfolio_domain_counts[len(present)][yi] += 1
            has_overlap |= len(present) == len(domains)
        portfolio_overlap_countries += has_overlap
    names = {iso: features[iso]["properties"].get("name", iso) for iso in selected}
    selected = sorted(selected, key=lambda iso: (breadth[iso], names[iso].casefold()))
    return {
        "countries": selected, "referenceCountries": scope, "names": names,
        "keys": keys, "mapKeys": map_keys, "portfolioKeys": portfolio_keys, "years": years, "domains": domains,
        "datasets": {k: {field: datasets[k][field] for field in
                          ("name", "domain", "unit", "url", "description", "sources", "filters", "coverage")
                          if field in datasets[k]}
                     for k in all_keys},
        "intensity": intensity, "activeYears": active_years, "breadth": breadth,
        "densityMaxima": maxima, "annualSourceCountries": annual_sources,
        "annualDomainCounts": annual_domains,
        "sourceCountries": {k: sum(totals[c][k] > 0 for c in selected) for k in keys},
        "allDomainCountryYears": sum(annual_domains[-1]),
        "countriesWithAllDomainOverlap": overlap_countries,
        "mapMetrics": map_metrics, "mapSummary": map_summary,
        "mapAnnualValues": map_annual_values,
        "portfolioAnnualSourceCountries": portfolio_annual,
        "portfolioSourceCountries": portfolio_source_countries,
        "portfolioBreadth": portfolio_breadth,
        "portfolioDomainCounts": portfolio_domain_counts,
        "portfolioAllDomainCountryYears": sum(portfolio_domain_counts[-1]),
        "portfolioCountriesWithAllDomainOverlap": portfolio_overlap_countries,
    }


def configure_plotting(monochrome):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 8,
        "axes.titlesize": 9, "axes.labelsize": 8,
        "xtick.labelsize": 7, "ytick.labelsize": 7,
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.linewidth": 0.5, "grid.linewidth": 0.35,
        "text.color": "#222222", "axes.labelcolor": "#222222",
        "figure.facecolor": "white", "axes.facecolor": "white",
        "savefig.facecolor": "white", "pdf.fonttype": 42, "ps.fonttype": 42,
        "svg.fonttype": "none", "svg.hashsalt": "data-deserts-figures",
    })
    return plt, matplotlib.colormaps["Greys" if monochrome else "cividis_r"]


def short_name(data, key):
    return SHORT_NAMES.get(key, data["datasets"][key]["name"])


def vector_colourbar(fig, mappable, cax, ticks):
    bar = fig.colorbar(mappable, cax=cax, orientation="horizontal", ticks=ticks)
    # Matplotlib rasterizes continuous colourbars by default; keep the entire PDF/SVG vector.
    if bar.solids is not None:
        bar.solids.set_rasterized(False)


def header(fig, title, data):
    title_size = min(12, 12 * fig.get_figwidth() / (180 / 25.4))
    height = fig.get_figheight()
    fig.text(0.025, 1 - 0.16 / height, title, fontsize=title_size, weight="bold", va="top")
    fig.text(0.025, 1 - 0.43 / height,
             f"{len(data['countries'])} DHS-covered countries  |  {data['years'][0]}–{data['years'][-1]}  |  Dashboard snapshot",
             fontsize=8, color="#555555", va="top")


def geography_figure(data, world, plt, cmap, width):
    """All-source breadth, using records or valid map comparisons as appropriate."""
    import numpy as np
    from matplotlib.colors import BoundaryNorm, ListedColormap
    from matplotlib.cm import ScalarMappable
    from matplotlib.path import Path as MplPath
    from matplotlib.patches import PathPatch, Patch

    fig = plt.figure(figsize=(width, width * 1.09))
    header(fig, "Geographic breadth of the assembled evidence", data)
    ax = fig.add_axes([0.04, 0.50, 0.92, 0.39], projection="mollweide")
    ax.set_title("a   Number of sources with usable data in the selected period", loc="left", pad=9)
    keys = data["portfolioKeys"]
    k = len(keys)
    discrete = ListedColormap(cmap(np.linspace(0.1, 1, k + 1)))
    norm = BoundaryNorm(np.arange(-0.5, k + 1.5), discrete.N)
    for feature in world["features"]:
        iso = str(feature["id"])
        if iso == "ATA":
            continue
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        breadth = data["portfolioBreadth"].get(iso)
        colour = discrete(norm(breadth)) if breadth is not None else "#eeeeee"
        for polygon in polygons:
            vertices, codes = [], []
            for ring in polygon:
                points = np.deg2rad(ring)
                vertices.extend(points)
                codes.extend([MplPath.MOVETO] + [MplPath.LINETO] * (len(points) - 2) + [MplPath.CLOSEPOLY])
            # Project the existing coastline vertices once. The geographic axes' default
            # path interpolation otherwise expands every edge into 75 vector segments.
            projected = ax.transAxes.inverted().transform(ax.transData.transform(vertices))
            ax.add_patch(PathPatch(MplPath(projected, codes), transform=ax.transAxes, facecolor=colour,
                                   edgecolor="#777777", linewidth=0.18))
    ax.set_xticklabels([])
    ax.set_yticklabels([])
    ax.grid(False)
    ax.spines["geo"].set_visible(False)
    cax = fig.add_axes([0.26, 0.476, 0.53, 0.014])
    vector_colourbar(fig, ScalarMappable(norm=norm, cmap=discrete), cax, range(k + 1))
    cax.set_xlabel("Sources with records or valid map comparisons", labelpad=3)
    ax.legend(handles=[Patch(facecolor="#eeeeee", edgecolor="#777777", label="Outside selected DHS scope")],
              loc="lower left", bbox_to_anchor=(-0.015, -0.025), frameon=False, fontsize=6.5)

    bars = fig.add_axes([0.24, 0.13, 0.68, 0.255])
    bars.set_title("b   Availability differs between sources", loc="left", pad=11)
    positions = np.arange(k)
    values = [data["portfolioSourceCountries"][key] for key in keys]
    bars.barh(positions, values, height=0.6, color=cmap(0.8))
    bars.set_yticks(positions, [short_name(data, key) for key in keys])
    bars.invert_yaxis()
    n = len(data["countries"])
    bars.set_xlim(0, n * 1.20)
    bars.set_xticks(np.linspace(0, n, 5), [f"{p}%" for p in (0, 25, 50, 75, 100)])
    bars.set_xlabel("Share of selected countries with usable data")
    bars.spines["left"].set_visible(False)
    bars.tick_params(axis="y", length=0)
    bars.xaxis.grid(True, color="#dddddd")
    bars.set_axisbelow(True)
    for y, value in enumerate(values):
        bars.text(value + n * 0.025, y, f"{value}/{n}", fontsize=7, va="center")
    fig.text(0.025, 0.021,
             "Record sources require a positive record count. Agricultural and hydrology map support require a valid precomputed comparison.\n"
             "Availability in this collection is not a census of all existing data. DHS defines the country scope.",
             fontsize=7, color="#555555", linespacing=1.5)
    return fig


def matrix_figure(data, plt, cmap, width):
    import numpy as np
    from matplotlib.cm import ScalarMappable
    from matplotlib.colors import Normalize
    n, k = len(data["countries"]), len(data["keys"])
    map_keys = data["mapKeys"]
    # Keep labels readable at full-page print size; do not squeeze 84 rows into a small panel.
    height = max(5.5, (64 + 2.5 * n) / 25.4)
    fig = plt.figure(figsize=(width, height))
    header(fig, "Country/source divides: record density and map allocation", data)
    # The two panels share country rows but have separate scales: record density
    # cannot be compared numerically with allocation dispersion.
    ax = fig.add_axes([0.28, 1.20 / height, 0.52, 1 - 2.62 / height])
    values = np.array([[data["intensity"][iso][key] if data["intensity"][iso][key] is not None else np.nan
                        for key in data["keys"]] for iso in data["countries"]])
    palette = cmap.copy()
    palette.set_bad("#eeeeee")
    ax.pcolormesh(np.ma.masked_invalid(values), cmap=palette, vmin=0, vmax=1,
                  edgecolors="white", linewidth=0.2)
    ax.set_ylim(n, 0)
    ax.set_xticks(np.arange(k) + 0.5, [short_name(data, key).replace(" ", "\n") for key in data["keys"]])
    ax.xaxis.tick_top()
    ax.set_yticks(np.arange(n) + 0.5, [data["names"][iso] for iso in data["countries"]], fontsize=6.7)
    ax.tick_params(length=0, pad=4)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for row, iso in enumerate(data["countries"]):
        if row and data["breadth"][iso] != data["breadth"][data["countries"][row - 1]]:
            ax.axhline(row, color="#777777", linewidth=0.7)
        for col, key in enumerate(data["keys"]):
            value = values[row, col]
            years = data["activeYears"][iso][key]
            colour = "#777777" if not years else ("white" if value > 0.57 else "#222222")
            ax.text(col + 0.5, row + 0.5, str(years) if years else "×",
                    ha="center", va="center", fontsize=5.8, color=colour)
    for domain in data["domains"]:
        columns = [i for i, key in enumerate(data["keys"]) if data["datasets"][key]["domain"] == domain]
        left, right = min(columns), max(columns) + 1
        ax.annotate(domain.replace(" ", "\n"), ((left + right) / (2 * k), 1),
                    xycoords="axes fraction", xytext=(0, 36), textcoords="offset points",
                    ha="center", va="bottom", fontsize=7, weight="bold", rotation=40)
        if left:
            ax.axvline(left, color="#555555", linewidth=0.7)
    cax = fig.add_axes([0.31, 0.72 / height, 0.43, 0.10 / height])
    vector_colourbar(fig, ScalarMappable(norm=Normalize(0, 1), cmap=palette), cax, [0, 0.5, 1])
    cax.set_xlabel("Lower ← within-source log density → higher", fontsize=7, labelpad=2)
    if map_keys:
        map_ax = fig.add_axes([0.82, 1.20 / height, 0.14, 1 - 2.62 / height], sharey=ax)
        map_values = np.array([[data["mapSummary"][key][iso]
                                if data["mapSummary"][key][iso] is not None else np.nan
                                for key in map_keys] for iso in data["countries"]])
        finite = map_values[np.isfinite(map_values)]
        maximum = float(finite.max()) if finite.size else 1.0
        map_palette = cmap.copy()
        map_palette.set_bad("#eeeeee")
        map_ax.pcolormesh(np.ma.masked_invalid(map_values), cmap=map_palette, vmin=0, vmax=maximum,
                          edgecolors="white", linewidth=0.2)
        map_ax.set_ylim(n, 0)
        map_ax.set_xticks(np.arange(len(map_keys)) + .5,
                          ["Agricultural allocation" if key == "agriculture_maps" else "Hydrological allocation"
                           for key in map_keys], rotation=45, ha="left", rotation_mode="anchor")
        map_ax.xaxis.tick_top()
        map_ax.tick_params(axis="both", length=0, pad=4)
        map_ax.tick_params(axis="y", labelleft=False)
        for spine in map_ax.spines.values():
            spine.set_visible(False)
        for row, iso in enumerate(data["countries"]):
            for col, key in enumerate(map_keys):
                years = len(data["mapMetrics"][iso][key])
                if years:
                    value = map_values[row, col]
                    map_ax.text(col + .5, row + .5, str(years), ha="center", va="center", fontsize=5.8,
                                color="white" if value > maximum * .57 else "#222222")
        map_cax = fig.add_axes([0.81, 0.72 / height, 0.15, 0.10 / height])
        vector_colourbar(fig, ScalarMappable(norm=Normalize(0, maximum), cmap=map_palette), map_cax,
                         [0, round(maximum / 2, 2), round(maximum, 2)])
        map_cax.set_xlabel("Allocation dispersion (CV)", fontsize=7, labelpad=2)
    fig.text(0.025, 0.16 / height,
             f"Left cells: years with records (out of {len(data['years'])}); ×: no records. Right cells: years with valid map comparisons (maximum 3).\n"
             "Left colour: within-source record density. Right colour: allocation dispersion (coefficient of variation); scales are separate.\n"
             "Countries are ordered by record-source breadth, then name. CV describes different map placement, not accuracy or confidence.",
             fontsize=6.8, linespacing=1.5)
    return fig


def timeline_figure(data, plt, cmap, width):
    import numpy as np
    from matplotlib.colors import Normalize
    from matplotlib.cm import ScalarMappable
    from matplotlib.ticker import MaxNLocator
    fig = plt.figure(figsize=(width, width * 0.97))
    header(fig, "Usable data do not imply temporal overlap", data)
    years, keys = data["years"], data["portfolioKeys"]
    n, d = len(data["countries"]), len(data["domains"])
    xedges = np.arange(years[0] - 0.5, years[-1] + 1.5)
    ticks = [year for year in years if year % 5 == 0] or [years[0]]
    top = fig.add_axes([0.20, 0.57, 0.76, 0.30])
    top.set_title("a   Countries with usable records or map comparisons in each year", loc="left", pad=11)
    values = np.array([data["portfolioAnnualSourceCountries"][key] for key in keys]) / n * 100
    top.pcolormesh(xedges, np.arange(len(keys) + 1), values, cmap=cmap,
                   vmin=0, vmax=100, edgecolors="white", linewidth=0.25)
    top.set_yticks(np.arange(len(keys)) + 0.5, [short_name(data, k) for k in keys])
    top.set_ylim(len(keys), 0)
    top.set_xticks(ticks)
    top.tick_params(length=0)
    for spine in top.spines.values():
        spine.set_visible(False)
    cax = fig.add_axes([0.48, 0.505, 0.48, 0.014])
    vector_colourbar(fig, ScalarMappable(norm=Normalize(0, 100), cmap=cmap), cax, [0, 50, 100])
    cax.set_xlabel("% of selected countries", fontsize=7, labelpad=2)

    bottom = fig.add_axes([0.20, 0.18, 0.76, 0.215])
    bottom.set_title("b   How many domains have usable data in the same country and year?", loc="left", pad=12)
    baseline = np.zeros(len(years))
    for count in range(d + 1):
        values = np.array(data["portfolioDomainCounts"][count])
        label = "No usable data" if count == 0 else f"{count} domain{'s' if count != 1 else ''}"
        bottom.bar(years, values, bottom=baseline, width=1, color=cmap(count / d),
                   edgecolor="#888888" if count == 0 else "white", linewidth=0.2, label=label,
                   hatch=".." if count == 0 else None)
        baseline += values
    bottom.set_xlim(years[0] - 0.5, years[-1] + 0.5)
    bottom.set_ylim(0, n)
    bottom.yaxis.set_major_locator(MaxNLocator(integer=True))
    bottom.set_xticks(ticks)
    bottom.set_ylabel("Countries")
    bottom.set_xlabel("Year")
    bottom.legend(loc="upper center", bbox_to_anchor=(0.5, -0.26), ncol=d + 1,
                   frameon=False, fontsize=7, handlelength=1.1, columnspacing=1.2)
    total = n * len(years)
    fig.text(0.025, 0.032,
             f"All {d} domains have usable data in {data['portfolioAllDomainCountryYears']:,}/{total:,} country-years "
             f"({data['portfolioAllDomainCountryYears'] / total:.1%}).\n"
             "Map sources are present only in years with valid precomputed comparisons. Overlap does not imply linked records or spatial agreement.",
             fontsize=7, linespacing=1.5)
    return fig


def write_notes(output, data, args):
    n, t = len(data["countries"]), len(data["years"])
    coverage = "; ".join(f"{short_name(data, k)} {data['portfolioSourceCountries'][k]}/{n}" for k in data["portfolioKeys"])
    notes = f"""# Data divides: figure captions and methods

Scope: {n} selected countries from the {len(data['referenceCountries'])}-country mapped DHS scope;
{data['years'][0]}–{data['years'][-1]}, inclusive. DHS scope is fixed over the complete exported
timeline, rather than redefined for the selected period. Years before the first DHS survey are excluded.

## Figure 1 — Geographic breadth of the assembled evidence

(a) Number of the {len(data['portfolioKeys'])} integrated sources with usable data in
each country during the selected period, on a Mollweide equal-area map. Grey countries are outside
the selected DHS scope. Antarctica is omitted. (b) Countries with records from each source; every
bar has the same denominator ({n}). Record sources require a positive record count; map sources
require a valid precomputed comparison. Availability: {coverage}. This describes the assembled
collection, not all data that may exist in a country. DHS presence is determined by the sampling
frame when using the complete exported period.

## Figure 2 — Country/source divides: record density and map allocation

Rows are countries, ordered by source breadth (ascending), then alphabetically. Colours use the
dashboard's source-specific intensity formula: density = records / areaKm2 × 1,000,000;
intensity = log(1 + density) / log(1 + maximum density). Maxima use all
{len(data['referenceCountries'])} mapped DHS countries for the selected time window, including
when plotting a country subset. Each source is normalized independently. This is neither a
percentile nor a comparable quantity across sources. Cell numbers give years with positive
records out of {t}; × marks no positive records in the snapshot. Country area comes from the
same generated boundary export as the dashboard. No population denominator is used. The two right-hand
columns show precomputed agricultural and hydrology allocation dispersion (coefficient of variation),
with their own shared scale and numbers of valid map years. Those cells are not record density and do
not enter its colour scale.

## Figure 3 — Availability does not imply temporal overlap

(a) Percentage of the {n} selected countries with usable data in each source and calendar year.
Record sources require positive records; map sources require valid comparisons. (b) Number of
countries with usable data in zero, one, or more integrated domains in the same calendar year. A
domain is present if any constituent source is present; count magnitudes are never summed across
sources. The domains are {', '.join(data['domains'])}. All domains overlap in
{data['portfolioAllDomainCountryYears']:,} of {n*t:,} country-years
({data['portfolioAllDomainCountryYears']/(n*t):.2%}), across {data['portfolioCountriesWithAllDomainOverlap']} countries.
The denominator includes every selected country in every selected year, including years before
that country's first DHS survey. This is descriptive calendar-year alignment, not evidence of
spatial co-location, comparable populations, compatible measurements, or linkable records.

## Interpretation and limitations

- Missing entries and explicit zero counts both mean no positive records in this processed
  snapshot. They do not establish that data were never collected, nor that a biological quantity is zero.
- Source-specific mandates, collection designs, release dates, and ingestion coverage contribute
  to these patterns. Recent years may be incomplete; the graphs make no inference about trends
  in investment, data quality, research need, or causal drivers of coverage.
- LSMS-ISA covers a documented eight-country programme. Its absence elsewhere should not be
  interpreted as absence of agricultural data. Likewise, the integrated public-health sources
  are a selected portfolio. Domains absent from an input snapshot are not treated as measured zeros.
- Survey sources are intermittent by design. A blank year is not automatically a failure of
  survey design. PREDICTS sites use their sampling midpoint year; DHS uses principal survey years.
- DHS counts unique surveys, not participants or households. All source units remain separate;
  neither pooled participant counts nor cross-source record totals are used in these figures.
- Where GRDC is included, Hydrology counts station-years with at least one actual valid observation
  in the supplied exports. This does not establish year-round monitoring or catchment coverage;
  multi-year totals do not represent unique stations. Valid zero-flow observations count as coverage.
- Country boundaries have limited resolution and omit some small states. Political boundaries
  and country assignment are those of the shared dashboard snapshot.
- These are descriptive summaries of the snapshot, not sampled estimates with confidence intervals.

## Reproduction and print settings

Use `python3 eda/plot_data_divides.py --help` for country/year selection and output options.
Default widths are 180 mm for two-column publication. The country matrix uses a full-height page
so country labels remain legible; use a country subset for a smaller main-text panel. PDFs and SVGs
contain vector marks; PDFs embed TrueType fonts and SVG text remains editable. PNG resolution is
{args.dpi} dpi. The default sequential cividis palette is colourblind-friendly and has ordered lightness;
`--monochrome` uses greyscale. Reversed lightness makes larger values darker on white paper.
Full captions belong outside the artwork in a manuscript. Read `manifest.json` for exact inputs,
SHA-256 hashes, options, versions, and calculated summary statistics.

Plotting references: [Matplotlib geographic projections](https://matplotlib.org/stable/gallery/subplots_axes_and_figures/geo_demo.html)
and [font embedding](https://matplotlib.org/stable/users/explain/text/fonts.html).

## Source acknowledgements

"""
    for key in data["portfolioKeys"]:
        ds = data["datasets"][key]
        notes += f"- [{ds['name']}]({ds['url']}): {ds['unit']}; {ds['domain']}.\n"
        for source in ds.get("sources", []):
            notes += f"  - [{source['name']}]({source['url']})\n"
    notes += "\nSee DATASETS.md for complete provenance, both PREDICTS releases, counting definitions, and provider terms.\n"
    (output / "captions-and-methods.md").write_text(notes, encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Validated dashboard JSON export")
    parser.add_argument("--world", type=Path, default=DEFAULT_WORLD, help="Generated world.json with country areas")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "eda/figures/data-divides")
    parser.add_argument("--year-from", type=int)
    parser.add_argument("--year-to", type=int)
    parser.add_argument("--countries", nargs="+", help="ISO3 codes; default: all mapped DHS countries")
    parser.add_argument("--monochrome", action="store_true", help="Use a black-and-white palette")
    parser.add_argument("--dpi", type=int, default=600, help="PNG resolution (default: 600)")
    parser.add_argument("--width-mm", type=float, default=180, help="Figure width; at least 160 mm for country labels")
    parser.add_argument("--formats", nargs="+", choices=("pdf", "svg", "png"), default=["pdf", "svg", "png"])
    args = parser.parse_args(argv)
    if args.dpi < 72 or not math.isfinite(args.width_mm) or args.width_mm < 160:
        parser.error("Use dpi >= 72 and width-mm >= 160 to preserve legibility")
    try:
        bundle = json.loads(args.data.read_text(encoding="utf-8"))
        world = json.loads(args.world.read_text(encoding="utf-8"))
        data = analyse(bundle, world, args.year_from, args.year_to,
                       [c.upper() for c in args.countries] if args.countries else None)
    except (OSError, ValueError, KeyError) as error:
        parser.error(f"{error}. Generate inputs with python3 processing/build_data.py first.")
    try:
        plt, cmap = configure_plotting(args.monochrome)
        import matplotlib
        import numpy
        from matplotlib.backends.backend_pdf import PdfPages
    except ImportError:
        parser.error("Install plotting dependencies: pip install -r eda/requirements.txt")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    figures = [
        ("01_geographic_breadth", geography_figure(data, world, plt, cmap, args.width_mm / 25.4)),
        ("02_country_source_divides", matrix_figure(data, plt, cmap, args.width_mm / 25.4)),
        ("03_temporal_overlap", timeline_figure(data, plt, cmap, args.width_mm / 25.4)),
    ]
    for name, figure in figures:
        for fmt in dict.fromkeys(args.formats):
            figure.savefig(output / f"{name}.{fmt}", dpi=args.dpi)
        print(f"Wrote {name}: {', '.join(dict.fromkeys(args.formats))}")
    if "pdf" in args.formats:
        with PdfPages(output / "data-divides.pdf", metadata={"Title": "Data Deserts: data divides"}) as pdf:
            for _, figure in figures:
                pdf.savefig(figure)
    for _, figure in figures:
        plt.close(figure)
    write_notes(output, data, args)
    manifest = {
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "inputs": {label: {"path": str(path.resolve()), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                   for label, path in (("data", args.data), ("world", args.world))},
        "options": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
        "versions": {"python": sys.version.split()[0], "matplotlib": matplotlib.__version__, "numpy": numpy.__version__},
        "analysis": data,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Captions, methods, and reproducibility manifest: {output}")


if __name__ == "__main__":
    main()
