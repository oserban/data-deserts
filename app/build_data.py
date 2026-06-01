#!/usr/bin/env python3
"""
Build the data files consumed by the Data Deserts map.

Reads:   ../Data Sources.xlsx          (the team's master dataset inventory)
         data/world.raw.geojson        (Natural Earth 110m countries, ISO3 ids)
Writes:  data/world.js                 (window.WORLD_GEOJSON = {...})
         data/datasets.js              (window.DATASETS = [...], window.META = {...})

The country coverage for the targeted surveys (DHS, MICS, LSMS-ISA) and the
regional products is encoded here as ISO3 lists so the domain experts can edit
them directly. Global products use the literal "GLOBAL" sentinel rather than
enumerating every country.

Re-run after editing the spreadsheet or the coverage lists:
    python3 build_data.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, "..", "Data Sources.xlsx")
GEOJSON = os.path.join(HERE, "data", "world.raw.geojson")

# ---------------------------------------------------------------------------
# 1. Country-name -> ISO3 resolution
# ---------------------------------------------------------------------------
geo = json.load(open(GEOJSON))
NAME2ISO = {f["properties"]["name"]: f["id"] for f in geo["features"]}
VALID_ISO = set(f["id"] for f in geo["features"])

# Aliases: how a name appears in the DHS/MICS/etc. lists -> name in the geojson.
# (Only the ones that don't match verbatim.)
ALIASES = {
    "Congo Democratic Republic": "Democratic Republic of the Congo",
    "Democratic Republic of Congo": "Democratic Republic of the Congo",
    "Congo": "Republic of the Congo",
    "Cote d'Ivoire": "Ivory Coast",
    "Côte d'Ivoire": "Ivory Coast",
    "Cape Verde": None,                     # not in 110m geojson (small island)
    "Kyrgyz Republic": "Kyrgyzstan",
    "Lao People's Democratic Republic": "Laos",
    "Tanzania": "United Republic of Tanzania",
    "United Republic of Tanzania": "United Republic of Tanzania",
    "Serbia": "Republic of Serbia",
    "Eswatini": "Swaziland",
    "Timor-Leste": "East Timor",
    "Guinea-Bissau": "Guinea Bissau",
    "Sao Tome and Principe": None,          # too small for 110m
    "São Tomé and Príncipe": None,
    "Nigeria (Ondo State)": "Nigeria",
    "Samoa": None,
    "Maldives": None,
    "Trinidad and Tobago": "Trinidad and Tobago",
    "Palestine": "West Bank",
    "North Macedonia": "Macedonia",
    "Yugoslavia": None,                     # historical
    "Kiribati": None, "Nauru": None, "Tuvalu": None, "Tonga": None,
    "Marshall Islands": None, "Federated States of Micronesia": None,
    "Barbados": None, "Saint Lucia": None, "Comoros": None, "Bahrain": None,
    "Turks and Caicos Islands": None, "Fiji": "Fiji", "Vanuatu": "Vanuatu",
    "Brunei": "Brunei",
}

UNRESOLVED = set()

def to_iso(name):
    """Map a free-text country name to an ISO3 code present in the geojson."""
    name = name.strip()
    if name in ALIASES:
        target = ALIASES[name]
        if target is None:
            return None                     # deliberately skipped (not on map)
        return NAME2ISO.get(target)
    iso = NAME2ISO.get(name)
    if iso is None:
        UNRESOLVED.add(name)
    return iso

def isos(names):
    out = []
    for n in names:
        i = to_iso(n)
        if i:
            out.append(i)
    return sorted(set(out))

# ---------------------------------------------------------------------------
# 2. Country lists for the targeted / regional datasets
# ---------------------------------------------------------------------------
DHS = """Afghanistan, Albania, Angola, Armenia, Azerbaijan, Bangladesh, Benin, Bolivia,
Botswana, Brazil, Burkina Faso, Burundi, Cambodia, Cameroon, Cape Verde,
Central African Republic, Chad, Colombia, Comoros, Congo, Congo Democratic Republic,
Cote d'Ivoire, Dominican Republic, Ecuador, Egypt, El Salvador, Equatorial Guinea,
Eritrea, Eswatini, Ethiopia, Gabon, Gambia, Ghana, Guatemala, Guinea, Guyana, Haiti,
Honduras, India, Indonesia, Jordan, Kazakhstan, Kenya, Kyrgyz Republic,
Lao People's Democratic Republic, Lesotho, Liberia, Madagascar, Malawi, Maldives,
Mali, Mauritania, Mexico, Moldova, Morocco, Mozambique, Myanmar, Namibia, Nepal,
Nicaragua, Niger, Nigeria, Pakistan, Papua New Guinea, Paraguay, Peru, Philippines,
Rwanda, Samoa, Sao Tome and Principe, Senegal, Sierra Leone, South Africa, Sri Lanka,
Sudan, Tajikistan, Tanzania, Thailand, Timor-Leste, Togo, Trinidad and Tobago,
Tunisia, Turkey, Turkmenistan, Uganda, Ukraine, Uzbekistan, Vietnam, Yemen, Zambia,
Zimbabwe""".replace("\n", " ").split(",")

MICS = """Afghanistan, Albania, Algeria, Angola, Argentina, Armenia, Azerbaijan, Bahrain,
Bangladesh, Barbados, Belarus, Belize, Benin, Bhutan, Bolivia, Bosnia and Herzegovina,
Botswana, Burkina Faso, Burundi, Cameroon, Central African Republic, Chad, China,
Comoros, Democratic Republic of Congo, Congo, Costa Rica, Cote d'Ivoire, Croatia,
Cuba, North Korea, Djibouti, Dominican Republic, Egypt, El Salvador, Equatorial Guinea,
Eswatini, Ethiopia, Federated States of Micronesia, Fiji, Gabon, Gambia, Georgia,
Ghana, Guatemala, Guinea, Guinea-Bissau, Guyana, Honduras, India, Indonesia, Iran,
Iraq, Jamaica, Kazakhstan, Kenya, Kiribati, Kosovo, Kyrgyzstan, Laos, Lebanon, Lesotho,
Liberia, Libya, Madagascar, Malawi, Maldives, Mali, Marshall Islands, Mauritania,
Mexico, Moldova, Mongolia, Montenegro, Morocco, Mozambique, Myanmar, Nauru, Nepal,
Nicaragua, Niger, Nigeria, North Macedonia, Oman, Pakistan, Palestine, Panama,
Paraguay, Philippines, Qatar, Rwanda, Saint Lucia, Samoa, São Tomé and Príncipe,
Saudi Arabia, Senegal, Serbia, Sierra Leone, Somalia, South Sudan, Sudan, Suriname,
Syria, Tajikistan, Tanzania, Thailand, Togo, Tonga, Trinidad and Tobago, Tunisia,
Turkey, Turkmenistan, Turks and Caicos Islands, Tuvalu, Ukraine, Uruguay, Uzbekistan,
Vanuatu, Venezuela, Vietnam, Yemen, Zambia, Zimbabwe""".replace("\n", " ").split(",")

# LSMS-ISA: the 8 Sub-Saharan African countries with Integrated Surveys on Agriculture.
LSMS = ["Burkina Faso", "Ethiopia", "Malawi", "Mali", "Niger", "Nigeria",
        "Tanzania", "Uganda"]

DHS_ISO = isos(DHS)
MICS_ISO = isos(MICS)
LSMS_ISO = isos(LSMS)
NA_BBS_ISO = isos(["United States of America", "Canada"])
UK_BBS_ISO = isos(["United Kingdom"])
MAPBIOMAS_ISO = isos(["Brazil", "Peru"])

# ---------------------------------------------------------------------------
# 3. The dataset records (mirrors the spreadsheet, plus map-ready coverage)
# ---------------------------------------------------------------------------
# coverageType:  "gridded"  = global remote-sensing / reanalysis / modelled raster
#                             (covers all land by construction -> the "everywhere"
#                              layer the user can toggle off)
#                "global-obs" = global but observation/record-based (patchy in reality)
#                "regional"  = bounded to specific countries
#                "stations"  = global but point/station based
GLOBAL = "GLOBAL"

DATASETS = [
    {"name": "BioTime", "domains": ["Ecology"], "access": "Public",
     "modality": "Data frame", "coverage": GLOBAL, "coverageType": "global-obs",
     "global": True, "lastUpdate": "2025", "frequency": "Sporadic (1 update so far)",
     "application": "Biodiversity timeseries data",
     "url": "https://biotime.st-andrews.ac.uk/"},

    {"name": "Living Planet Database", "domains": ["Ecology"], "access": "Both",
     "modality": "Data frame", "coverage": GLOBAL, "coverageType": "global-obs",
     "global": True, "lastUpdate": "2020", "frequency": "Unknown",
     "application": "Vertebrate timeseries data",
     "url": "https://www.livingplanetindex.org/data_portal"},

    {"name": "PREDICTS Project Database", "domains": ["Ecology"], "access": "Public",
     "modality": "Data frame", "coverage": GLOBAL, "coverageType": "global-obs",
     "global": True, "lastUpdate": "2022", "frequency": "Sporadic (2 updates so far)",
     "application": "Biodiversity space-for-time data",
     "url": "https://www.nhm.ac.uk/our-science/data/predicts.html"},

    {"name": "GBIF", "domains": ["Ecology"], "access": "Public",
     "modality": "Data frame", "coverage": GLOBAL, "coverageType": "global-obs",
     "global": True, "lastUpdate": "2026", "frequency": "Ongoing",
     "application": "Species occurrence data (plants and animals)",
     "url": "https://www.gbif.org/"},

    {"name": "North American Breeding Bird Survey", "domains": ["Ecology"],
     "access": "Public", "modality": "Data frame", "coverage": NA_BBS_ISO,
     "coverageType": "regional", "global": False, "lastUpdate": "2025 (data to 2024)",
     "frequency": "Annual", "application": "Bird timeseries data",
     "url": "https://www.usgs.gov/centers/eesc/science/north-american-breeding-bird-survey"},

    {"name": "Breeding Bird Survey (UK)", "domains": ["Ecology"], "access": "Private",
     "modality": "Data frame", "coverage": UK_BBS_ISO, "coverageType": "regional",
     "global": False, "lastUpdate": "2025", "frequency": "Annual",
     "application": "Bird timeseries data",
     "url": "https://www.bto.org/our-science/projects/breeding-bird-survey"},

    {"name": "MapBiomas", "domains": ["Ecology", "Hydro"], "access": "Public",
     "modality": "GeoTiff (LZW)", "coverage": MAPBIOMAS_ISO, "coverageType": "regional",
     "global": False, "lastUpdate": "2025", "frequency": "Annual (1985-2024)",
     "landcover": True, "application": "Land-cover / land-use mapping",
     "url": "https://brasil.mapbiomas.org/en/"},

    {"name": "ESA CCI Landcover", "domains": ["Ecology", "Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "1992-2020", "frequency": "Sporadic",
     "landcover": True, "application": "Land-cover data",
     "url": "https://www.esa-landcover-cci.org/"},

    {"name": "Demographic and Health Surveys (DHS)", "domains": ["Public Health"],
     "access": "Public (login + registration)", "modality": "Data frame (subset georef.)",
     "coverage": DHS_ISO, "coverageType": "regional", "global": False,
     "lastUpdate": "2025", "frequency": "~every 5 years (since late 80s, inconsistent)",
     "application": "Individual/household nutrition & socioeconomic data",
     "url": "https://dhsprogram.com/"},

    {"name": "Multiple Indicator Cluster Surveys (MICS)", "domains": ["Public Health"],
     "access": "Public (login + registration)", "modality": "Data frame (subset georef.)",
     "coverage": MICS_ISO, "coverageType": "regional", "global": False,
     "lastUpdate": "2024-2025", "frequency": "~every 3-5 years (since mid 90s)",
     "application": "Individual/household nutrition & socioeconomic data",
     "url": "https://mics.unicef.org/"},

    {"name": "LSMS-ISA", "domains": ["Public Health", "Agriculture"],
     "access": "Public (login)", "modality": "Data frame", "coverage": LSMS_ISO,
     "coverageType": "regional", "global": False, "lastUpdate": "2019/20",
     "frequency": "Longitudinal, 4-6 waves (2010/11-2019/20)",
     "application": "Household-level data focused on agriculture",
     "url": "https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA"},

    {"name": "MAPSPAM", "domains": ["Agriculture", "Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "2025", "frequency": "~every 5 years (2000-2020)",
     "application": "Crop- & irrigation-specific cultivated areas and production",
     "url": "https://www.mapspam.info/"},

    {"name": "GAEZ", "domains": ["Agriculture", "Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "", "frequency": "",
     "application": "Agricultural suitability & productivity (incl. climate scenarios)",
     "url": "https://gaez.fao.org/pages/data-viewer"},

    {"name": "MIRCA2000", "domains": ["Agriculture", "Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "", "frequency": "",
     "application": "Crop- & irrigation-specific cultivated areas",
     "url": "https://www.fao.org/land-water/land/land-governance/land-resources-planning-toolbox/category/details/en/c/1032166/"},

    {"name": "MIRCA-OS", "domains": ["Agriculture", "Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "2025", "frequency": "One release (2000-2015)",
     "application": "Crop- & irrigation-specific cultivated areas",
     "url": "https://www.nature.com/articles/s41597-024-04313-w"},

    {"name": "ERA5-Land", "domains": ["Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "today", "frequency": "Daily (hourly timestep)",
     "application": "Reanalysis of climate variables over land",
     "url": "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=overview"},

    {"name": "CHIRPS", "domains": ["Hydro"], "access": "Public",
     "modality": "Raster", "coverage": GLOBAL, "coverageType": "gridded",
     "global": True, "lastUpdate": "2026", "frequency": "Monthly (~2 week lag)",
     "application": "Gridded rainfall data (0.05deg)",
     "url": "https://data.chc.ucsb.edu/products/CHIRPS/"},

    {"name": "GRDC", "domains": ["Hydro"], "access": "Public",
     "modality": "Georeferenced data frame", "coverage": GLOBAL,
     "coverageType": "stations", "global": True, "lastUpdate": "",
     "frequency": "Depends on station",
     "application": "River discharge data (11,455 stations)",
     "url": "https://portal.grdc.bafg.de/"},
]

# ---------------------------------------------------------------------------
# 3b. Data-coverage time spans  [first year of data, last year]
# ---------------------------------------------------------------------------
# APPROXIMATE ranges of the *data* each product covers (not when it was published).
# Drives the year slider: a dataset counts at year Y if start <= Y <= end.
# Edit freely - the domain experts know these better than the web does.
YEAR_NOW = 2026
YEARS = {
    "BioTime": [1900, 2023],
    "Living Planet Database": [1970, 2020],
    "PREDICTS Project Database": [1984, 2022],
    "GBIF": [1960, YEAR_NOW],
    "North American Breeding Bird Survey": [1966, 2024],
    "Breeding Bird Survey (UK)": [1994, 2025],
    "MapBiomas": [1985, 2024],
    "ESA CCI Landcover": [1992, 2020],
    "Demographic and Health Surveys (DHS)": [1986, 2025],
    "Multiple Indicator Cluster Surveys (MICS)": [1995, 2025],
    "LSMS-ISA": [2010, 2020],
    "MAPSPAM": [2000, 2020],
    "GAEZ": [2000, 2020],
    "MIRCA2000": [2000, 2000],
    "MIRCA-OS": [2000, 2015],
    "ERA5-Land": [1950, YEAR_NOW],
    "CHIRPS": [1981, YEAR_NOW],
    "GRDC": [1900, 2024],
}
for ds in DATASETS:
    ds["years"] = YEARS.get(ds["name"], [2000, YEAR_NOW])
    ds.setdefault("landcover", False)         # land-cover raster vs biodiversity field data

# ---------------------------------------------------------------------------
# 3c. Real GBIF biodiversity record density (honest ecology coverage)
# ---------------------------------------------------------------------------
# GBIF nominally "covers the world", but occurrence records are hugely
# concentrated in the US / Europe / Australia. We attach the real per-country
# record counts (fetched from the GBIF API) as a proxy for biodiversity
# *sampling effort*, so the tool can show that global ecology data is itself a
# desert across much of the tropics. ISO2 (GBIF) -> ISO3 (map) via iso_codes.json.
gbif_counts = json.load(open(os.path.join(HERE, "data", "gbif_counts.json")))   # ISO2 -> count
iso_tbl = json.load(open(os.path.join(HERE, "data", "iso_codes.json")))
ISO2_TO_ISO3 = {c["alpha-2"]: c["alpha-3"] for c in iso_tbl}
GBIF_DENSITY = {}
for iso2, cnt in gbif_counts.items():
    iso3 = ISO2_TO_ISO3.get(iso2)
    if iso3 and iso3 in VALID_ISO:
        GBIF_DENSITY[iso3] = GBIF_DENSITY.get(iso3, 0) + cnt
# datasets whose "global" coverage is really biodiversity-record-based:
for ds in DATASETS:
    ds["densityProxy"] = ds["coverageType"] == "global-obs"

DOMAINS = ["Ecology", "Hydro", "Agriculture", "Public Health"]
META = {
    "domains": DOMAINS,
    "coverageTypes": {
        "gridded": "Global gridded / remote-sensing / modelled raster (covers all land)",
        "global-obs": "Global but observation/record-based (patchy in reality)",
        "stations": "Global but station / point based",
        "regional": "Bounded to specific countries",
    },
    "counts": {"dhs": len(DHS_ISO), "mics": len(MICS_ISO), "lsms": len(LSMS_ISO)},
    "yearMin": min(y[0] for y in YEARS.values()),
    "yearMax": YEAR_NOW,
    "gbifTotal": sum(GBIF_DENSITY.values()),
    "gbifMax": max(GBIF_DENSITY.values()),
}

# ---------------------------------------------------------------------------
# 4. Emit the JS data files (loaded via <script>, so file:// works, no CORS)
# ---------------------------------------------------------------------------
def write_js(path, varname, obj):
    with open(path, "w") as fh:
        fh.write("window.%s = " % varname)
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

write_js(os.path.join(HERE, "data", "world.js"), "WORLD_GEOJSON", geo)
with open(os.path.join(HERE, "data", "datasets.js"), "w") as fh:
    fh.write("window.DATASETS = ")
    json.dump(DATASETS, fh, ensure_ascii=False, indent=1)
    fh.write(";\nwindow.META = ")
    json.dump(META, fh, ensure_ascii=False, indent=1)
    fh.write(";\nwindow.GBIF_DENSITY = ")
    json.dump(GBIF_DENSITY, fh, ensure_ascii=False, separators=(",", ":"))
    fh.write(";\n")

print("DHS  ->", len(DHS_ISO), "countries on map")
print("MICS ->", len(MICS_ISO), "countries on map")
print("LSMS ->", len(LSMS_ISO), "countries on map:", LSMS_ISO)
if UNRESOLVED:
    print("\n!! UNRESOLVED names (add to ALIASES):")
    for n in sorted(UNRESOLVED):
        print("   -", repr(n))
else:
    print("\nAll country names resolved.")
print("\nWrote data/world.js and data/datasets.js")
