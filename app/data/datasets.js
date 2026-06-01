window.DATASETS = [
 {
  "name": "BioTime",
  "domains": [
   "Ecology"
  ],
  "access": "Public",
  "modality": "Data frame",
  "coverage": "GLOBAL",
  "coverageType": "global-obs",
  "global": true,
  "lastUpdate": "2025",
  "frequency": "Sporadic (1 update so far)",
  "application": "Biodiversity timeseries data",
  "url": "https://biotime.st-andrews.ac.uk/",
  "years": [
   1900,
   2023
  ],
  "landcover": false,
  "densityProxy": true
 },
 {
  "name": "Living Planet Database",
  "domains": [
   "Ecology"
  ],
  "access": "Both",
  "modality": "Data frame",
  "coverage": "GLOBAL",
  "coverageType": "global-obs",
  "global": true,
  "lastUpdate": "2020",
  "frequency": "Unknown",
  "application": "Vertebrate timeseries data",
  "url": "https://www.livingplanetindex.org/data_portal",
  "years": [
   1970,
   2020
  ],
  "landcover": false,
  "densityProxy": true
 },
 {
  "name": "PREDICTS Project Database",
  "domains": [
   "Ecology"
  ],
  "access": "Public",
  "modality": "Data frame",
  "coverage": "GLOBAL",
  "coverageType": "global-obs",
  "global": true,
  "lastUpdate": "2022",
  "frequency": "Sporadic (2 updates so far)",
  "application": "Biodiversity space-for-time data",
  "url": "https://www.nhm.ac.uk/our-science/data/predicts.html",
  "years": [
   1984,
   2022
  ],
  "landcover": false,
  "densityProxy": true
 },
 {
  "name": "GBIF",
  "domains": [
   "Ecology"
  ],
  "access": "Public",
  "modality": "Data frame",
  "coverage": "GLOBAL",
  "coverageType": "global-obs",
  "global": true,
  "lastUpdate": "2026",
  "frequency": "Ongoing",
  "application": "Species occurrence data (plants and animals)",
  "url": "https://www.gbif.org/",
  "years": [
   1960,
   2026
  ],
  "landcover": false,
  "densityProxy": true
 },
 {
  "name": "North American Breeding Bird Survey",
  "domains": [
   "Ecology"
  ],
  "access": "Public",
  "modality": "Data frame",
  "coverage": [
   "CAN",
   "USA"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2025 (data to 2024)",
  "frequency": "Annual",
  "application": "Bird timeseries data",
  "url": "https://www.usgs.gov/centers/eesc/science/north-american-breeding-bird-survey",
  "years": [
   1966,
   2024
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "Breeding Bird Survey (UK)",
  "domains": [
   "Ecology"
  ],
  "access": "Private",
  "modality": "Data frame",
  "coverage": [
   "GBR"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2025",
  "frequency": "Annual",
  "application": "Bird timeseries data",
  "url": "https://www.bto.org/our-science/projects/breeding-bird-survey",
  "years": [
   1994,
   2025
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "MapBiomas",
  "domains": [
   "Ecology",
   "Hydro"
  ],
  "access": "Public",
  "modality": "GeoTiff (LZW)",
  "coverage": [
   "BRA",
   "PER"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2025",
  "frequency": "Annual (1985-2024)",
  "landcover": true,
  "application": "Land-cover / land-use mapping",
  "url": "https://brasil.mapbiomas.org/en/",
  "years": [
   1985,
   2024
  ],
  "densityProxy": false
 },
 {
  "name": "ESA CCI Landcover",
  "domains": [
   "Ecology",
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "1992-2020",
  "frequency": "Sporadic",
  "landcover": true,
  "application": "Land-cover data",
  "url": "https://www.esa-landcover-cci.org/",
  "years": [
   1992,
   2020
  ],
  "densityProxy": false
 },
 {
  "name": "Demographic and Health Surveys (DHS)",
  "domains": [
   "Public Health"
  ],
  "access": "Public (login + registration)",
  "modality": "Data frame (subset georef.)",
  "coverage": [
   "AFG",
   "AGO",
   "ALB",
   "ARM",
   "AZE",
   "BDI",
   "BEN",
   "BFA",
   "BGD",
   "BOL",
   "BRA",
   "BWA",
   "CAF",
   "CIV",
   "CMR",
   "COD",
   "COG",
   "COL",
   "DOM",
   "ECU",
   "EGY",
   "ERI",
   "ETH",
   "GAB",
   "GHA",
   "GIN",
   "GMB",
   "GNQ",
   "GTM",
   "GUY",
   "HND",
   "HTI",
   "IDN",
   "IND",
   "JOR",
   "KAZ",
   "KEN",
   "KGZ",
   "KHM",
   "LAO",
   "LBR",
   "LKA",
   "LSO",
   "MAR",
   "MDA",
   "MDG",
   "MEX",
   "MLI",
   "MMR",
   "MOZ",
   "MRT",
   "MWI",
   "NAM",
   "NER",
   "NGA",
   "NIC",
   "NPL",
   "PAK",
   "PER",
   "PHL",
   "PNG",
   "PRY",
   "RWA",
   "SDN",
   "SEN",
   "SLE",
   "SLV",
   "SWZ",
   "TCD",
   "TGO",
   "THA",
   "TJK",
   "TKM",
   "TLS",
   "TTO",
   "TUN",
   "TUR",
   "TZA",
   "UGA",
   "UKR",
   "UZB",
   "VNM",
   "YEM",
   "ZAF",
   "ZMB",
   "ZWE"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2025",
  "frequency": "~every 5 years (since late 80s, inconsistent)",
  "application": "Individual/household nutrition & socioeconomic data",
  "url": "https://dhsprogram.com/",
  "years": [
   1986,
   2025
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "Multiple Indicator Cluster Surveys (MICS)",
  "domains": [
   "Public Health"
  ],
  "access": "Public (login + registration)",
  "modality": "Data frame (subset georef.)",
  "coverage": [
   "AFG",
   "AGO",
   "ALB",
   "ARG",
   "ARM",
   "AZE",
   "BDI",
   "BEN",
   "BFA",
   "BGD",
   "BIH",
   "BLR",
   "BLZ",
   "BOL",
   "BTN",
   "BWA",
   "CAF",
   "CHN",
   "CIV",
   "CMR",
   "COD",
   "COG",
   "CRI",
   "CS-KM",
   "CUB",
   "DJI",
   "DOM",
   "DZA",
   "EGY",
   "ETH",
   "FJI",
   "GAB",
   "GEO",
   "GHA",
   "GIN",
   "GMB",
   "GNB",
   "GNQ",
   "GTM",
   "GUY",
   "HND",
   "HRV",
   "IDN",
   "IND",
   "IRN",
   "IRQ",
   "JAM",
   "KAZ",
   "KEN",
   "KGZ",
   "LAO",
   "LBN",
   "LBR",
   "LBY",
   "LSO",
   "MAR",
   "MDA",
   "MDG",
   "MEX",
   "MKD",
   "MLI",
   "MMR",
   "MNE",
   "MNG",
   "MOZ",
   "MRT",
   "MWI",
   "NER",
   "NGA",
   "NIC",
   "NPL",
   "OMN",
   "PAK",
   "PAN",
   "PHL",
   "PRK",
   "PRY",
   "PSE",
   "QAT",
   "RWA",
   "SAU",
   "SDN",
   "SEN",
   "SLE",
   "SLV",
   "SOM",
   "SRB",
   "SSD",
   "SUR",
   "SWZ",
   "SYR",
   "TCD",
   "TGO",
   "THA",
   "TJK",
   "TKM",
   "TTO",
   "TUN",
   "TUR",
   "TZA",
   "UKR",
   "URY",
   "UZB",
   "VEN",
   "VNM",
   "VUT",
   "YEM",
   "ZMB",
   "ZWE"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2024-2025",
  "frequency": "~every 3-5 years (since mid 90s)",
  "application": "Individual/household nutrition & socioeconomic data",
  "url": "https://mics.unicef.org/",
  "years": [
   1995,
   2025
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "LSMS-ISA",
  "domains": [
   "Public Health",
   "Agriculture"
  ],
  "access": "Public (login)",
  "modality": "Data frame",
  "coverage": [
   "BFA",
   "ETH",
   "MLI",
   "MWI",
   "NER",
   "NGA",
   "TZA",
   "UGA"
  ],
  "coverageType": "regional",
  "global": false,
  "lastUpdate": "2019/20",
  "frequency": "Longitudinal, 4-6 waves (2010/11-2019/20)",
  "application": "Household-level data focused on agriculture",
  "url": "https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA",
  "years": [
   2010,
   2020
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "MAPSPAM",
  "domains": [
   "Agriculture",
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "2025",
  "frequency": "~every 5 years (2000-2020)",
  "application": "Crop- & irrigation-specific cultivated areas and production",
  "url": "https://www.mapspam.info/",
  "years": [
   2000,
   2020
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "GAEZ",
  "domains": [
   "Agriculture",
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "",
  "frequency": "",
  "application": "Agricultural suitability & productivity (incl. climate scenarios)",
  "url": "https://gaez.fao.org/pages/data-viewer",
  "years": [
   2000,
   2020
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "MIRCA2000",
  "domains": [
   "Agriculture",
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "",
  "frequency": "",
  "application": "Crop- & irrigation-specific cultivated areas",
  "url": "https://www.fao.org/land-water/land/land-governance/land-resources-planning-toolbox/category/details/en/c/1032166/",
  "years": [
   2000,
   2000
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "MIRCA-OS",
  "domains": [
   "Agriculture",
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "2025",
  "frequency": "One release (2000-2015)",
  "application": "Crop- & irrigation-specific cultivated areas",
  "url": "https://www.nature.com/articles/s41597-024-04313-w",
  "years": [
   2000,
   2015
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "ERA5-Land",
  "domains": [
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "today",
  "frequency": "Daily (hourly timestep)",
  "application": "Reanalysis of climate variables over land",
  "url": "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=overview",
  "years": [
   1950,
   2026
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "CHIRPS",
  "domains": [
   "Hydro"
  ],
  "access": "Public",
  "modality": "Raster",
  "coverage": "GLOBAL",
  "coverageType": "gridded",
  "global": true,
  "lastUpdate": "2026",
  "frequency": "Monthly (~2 week lag)",
  "application": "Gridded rainfall data (0.05deg)",
  "url": "https://data.chc.ucsb.edu/products/CHIRPS/",
  "years": [
   1981,
   2026
  ],
  "landcover": false,
  "densityProxy": false
 },
 {
  "name": "GRDC",
  "domains": [
   "Hydro"
  ],
  "access": "Public",
  "modality": "Georeferenced data frame",
  "coverage": "GLOBAL",
  "coverageType": "stations",
  "global": true,
  "lastUpdate": "",
  "frequency": "Depends on station",
  "application": "River discharge data (11,455 stations)",
  "url": "https://portal.grdc.bafg.de/",
  "years": [
   1900,
   2024
  ],
  "landcover": false,
  "densityProxy": false
 }
];
window.META = {
 "domains": [
  "Ecology",
  "Hydro",
  "Agriculture",
  "Public Health"
 ],
 "coverageTypes": {
  "gridded": "Global gridded / remote-sensing / modelled raster (covers all land)",
  "global-obs": "Global but observation/record-based (patchy in reality)",
  "stations": "Global but station / point based",
  "regional": "Bounded to specific countries"
 },
 "counts": {
  "dhs": 86,
  "mics": 109,
  "lsms": 8
 },
 "yearMin": 1900,
 "yearMax": 2026,
 "gbifTotal": 3782499829,
 "gbifMax": 1303799396
};
window.GBIF_DENSITY = {"USA":1303799396,"AUS":258451835,"GBR":232706825,"CAN":219160552,"FRA":212749813,"SWE":171781312,"NLD":142185624,"ESP":93971829,"NOR":91086648,"DEU":80145165,"IND":65312463,"DNK":64867371,"FIN":53071227,"ZAF":48272366,"BEL":46314391,"BRA":43381176,"CHE":42297003,"COL":40448523,"CRI":39487565,"MEX":39239941,"TWN":26114152,"PRT":26031210,"CHL":22221295,"RUS":19959855,"NZL":19378430,"ARG":18722705,"AUT":18598695,"POL":18416595,"JPN":17439162,"ECU":14952047,"CHN":14941069,"ITA":13700183,"PER":12296923,"EST":10389023,"PAN":10233425,"ISR":9305496,"KOR":8748382,"CZE":8315542,"THA":8298213,"BLZ":7882038,"IRL":6265282,"KEN":6083298,"VEN":5767270,"GTM":5622256,"IDN":5418781,"ATA":5411808,"PRI":4840792,"UKR":4761992,"MYS":4715733,"TUR":4705739,"GRC":4676413,"SVK":4594661,"HND":3963687,"PHL":3823317,"MDG":3576721,"TZA":3563563,"LUX":3516638,"LKA":3012118,"BGR":3009404,"BOL":2998417,"NAM":2923614,"UGA":2910125,"ISL":2705928,"PNG":2699536,"HUN":2647630,"GUF":2555510,"CUB":2488889,"NIC":2423429,"URY":2169520,"MAR":2099303,"ARE":1996637,"NPL":1978618,"ZWE":1820917,"PRY":1819336,"ROU":1791815,"LTU":1660732,"SRB":1651623,"COD":1571453,"HRV":1512392,"SLV":1485733,"GEO":1478724,"TTO":1445752,"BWA":1438599,"VNM":1412513,"NCL":1382006,"ZMB":1362349,"GHA":1323303,"ETH":1304728,"NGA":1290580,"IRN":1285043,"BHS":1271642,"KHM":1201476,"GUY":1179161,"BEN":1167149,"PAK":1148153,"SVN":1147432,"DOM":1139960,"GRL":1129408,"CMR":1084096,"JAM":1079855,"SAU":1076970,"MOZ":1024734,"LVA":960238,"GAB":954104,"BGD":924431,"SEN":902584,"GMB":897446,"MNG":855391,"EGY":854055,"SUR":841032,"BTN":778479,"CYP":756584,"OMN":755156,"AFG":749846,"KAZ":747235,"BLR":746231,"BMU":733987,"CIV":660729,"MWI":560925,"RWA":557177,"DZA":557158,"FJI":511024,"MMR":485064,"SWZ":464280,"AGO":443557,"PSE":423465,"ATF":359712,"KWT":355139,"LAO":354611,"MRT":343207,"SLB":342337,"ARM":335601,"AZE":334357,"TUN":329195,"KGZ":309343,"GIN":304714,"HTI":300659,"FLK":300435,"BFA":278248,"ESH":266678,"LBN":260639,"LBR":252185,"UZB":234548,"VUT":228843,"MNE":216939,"MKD":215663,"YEM":205607,"JOR":205542,"MLI":201599,"SDN":199263,"ALB":191680,"COG":186763,"IRQ":186534,"QAT":177281,"SLE":168110,"MDA":163622,"GNQ":162240,"SYR":159263,"LSO":150224,"CAF":149989,"BIH":146355,"TJK":146140,"BDI":145503,"MLT":144519,"TGO":130104,"NER":113721,"TLS":112555,"GNB":99887,"SOM":97089,"TCD":96499,"BRN":91817,"LBY":87199,"PRK":72591,"TKM":60557,"DJI":40938,"ERI":38456,"SSD":35223};
