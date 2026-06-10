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
 "gbifMax": 1303799396,
 "surveyCount": 547,
 "surveyCountries": 110
};
window.GBIF_DENSITY = {"USA":1303799396,"AUS":258451835,"GBR":232706825,"CAN":219160552,"FRA":212749813,"SWE":171781312,"NLD":142185624,"ESP":93971829,"NOR":91086648,"DEU":80145165,"IND":65312463,"DNK":64867371,"FIN":53071227,"ZAF":48272366,"BEL":46314391,"BRA":43381176,"CHE":42297003,"COL":40448523,"CRI":39487565,"MEX":39239941,"TWN":26114152,"PRT":26031210,"CHL":22221295,"RUS":19959855,"NZL":19378430,"ARG":18722705,"AUT":18598695,"POL":18416595,"JPN":17439162,"ECU":14952047,"CHN":14941069,"ITA":13700183,"PER":12296923,"EST":10389023,"PAN":10233425,"ISR":9305496,"KOR":8748382,"CZE":8315542,"THA":8298213,"BLZ":7882038,"IRL":6265282,"KEN":6083298,"VEN":5767270,"GTM":5622256,"IDN":5418781,"ATA":5411808,"PRI":4840792,"UKR":4761992,"MYS":4715733,"TUR":4705739,"GRC":4676413,"SVK":4594661,"HND":3963687,"PHL":3823317,"MDG":3576721,"TZA":3563563,"LUX":3516638,"LKA":3012118,"BGR":3009404,"BOL":2998417,"NAM":2923614,"UGA":2910125,"ISL":2705928,"PNG":2699536,"HUN":2647630,"GUF":2555510,"CUB":2488889,"NIC":2423429,"URY":2169520,"MAR":2099303,"ARE":1996637,"NPL":1978618,"ZWE":1820917,"PRY":1819336,"ROU":1791815,"LTU":1660732,"SRB":1651623,"COD":1571453,"HRV":1512392,"SLV":1485733,"GEO":1478724,"TTO":1445752,"BWA":1438599,"VNM":1412513,"NCL":1382006,"ZMB":1362349,"GHA":1323303,"ETH":1304728,"NGA":1290580,"IRN":1285043,"BHS":1271642,"KHM":1201476,"GUY":1179161,"BEN":1167149,"PAK":1148153,"SVN":1147432,"DOM":1139960,"GRL":1129408,"CMR":1084096,"JAM":1079855,"SAU":1076970,"MOZ":1024734,"LVA":960238,"GAB":954104,"BGD":924431,"SEN":902584,"GMB":897446,"MNG":855391,"EGY":854055,"SUR":841032,"BTN":778479,"CYP":756584,"OMN":755156,"AFG":749846,"KAZ":747235,"BLR":746231,"BMU":733987,"CIV":660729,"MWI":560925,"RWA":557177,"DZA":557158,"FJI":511024,"MMR":485064,"SWZ":464280,"AGO":443557,"PSE":423465,"ATF":359712,"KWT":355139,"LAO":354611,"MRT":343207,"SLB":342337,"ARM":335601,"AZE":334357,"TUN":329195,"KGZ":309343,"GIN":304714,"HTI":300659,"FLK":300435,"BFA":278248,"ESH":266678,"LBN":260639,"LBR":252185,"UZB":234548,"VUT":228843,"MNE":216939,"MKD":215663,"YEM":205607,"JOR":205542,"MLI":201599,"SDN":199263,"ALB":191680,"COG":186763,"IRQ":186534,"QAT":177281,"SLE":168110,"MDA":163622,"GNQ":162240,"SYR":159263,"LSO":150224,"CAF":149989,"BIH":146355,"TJK":146140,"BDI":145503,"MLT":144519,"TGO":130104,"NER":113721,"TLS":112555,"GNB":99887,"SOM":97089,"TCD":96499,"BRN":91817,"LBY":87199,"PRK":72591,"TKM":60557,"DJI":40938,"ERI":38456,"SSD":35223};
window.SURVEYS = {"AFG":[{"program":"MICS","type":"MICS","year":2010,"label":"2010-11"},{"program":"DHS","type":"DHS","year":2015,"label":"2015"},{"program":"MICS","type":"MICS","year":2022,"label":"2022-23"}],"ALB":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2008,"label":"2008-09"},{"program":"DHS","type":"DHS","year":2017,"label":"2017-18"}],"AGO":[{"program":"MICS","type":"MICS","year":2001,"label":"2001"},{"program":"DHS","type":"MIS","year":2006,"label":"2006-07"},{"program":"DHS","type":"MIS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2015,"label":"2015-16"},{"program":"DHS","type":"DHS","year":2023,"label":"2023-24"}],"ARM":[{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2016,"label":"2015-16"}],"AZE":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"}],"BGD":[{"program":"DHS","type":"DHS","year":1994,"label":"1993-94"},{"program":"DHS","type":"DHS","year":1997,"label":"1996-97"},{"program":"DHS","type":"DHS","year":2000,"label":"1999-00"},{"program":"DHS","type":"DHS","year":2004,"label":"2004"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2012,"label":"2012-13"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2017,"label":"2017-18"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"BEN":[{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"DHS","type":"DHS","year":2001,"label":"2001"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"},{"program":"DHS","type":"DHS","year":2012,"label":"2011-12"},{"program":"DHS","type":"DHS","year":2017,"label":"2017-18"}],"BOL":[{"program":"DHS","type":"DHS","year":1989,"label":"1989"},{"program":"DHS","type":"DHS","year":1994,"label":"1994"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"}],"BWA":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"}],"BRA":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":1996,"label":"1996"}],"BFA":[{"program":"DHS","type":"DHS","year":1993,"label":"1993"},{"program":"DHS","type":"DHS","year":1999,"label":"1998-99"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"MIS","year":2014,"label":"2014"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2014,"label":"2014"},{"program":"DHS","type":"MIS","year":2017,"label":"2017-18"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2021,"label":"2021"}],"BDI":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"MIS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2016,"label":"2016-17"}],"KHM":[{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2021,"label":"2021-22"}],"CMR":[{"program":"DHS","type":"DHS","year":1991,"label":"1991"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2004,"label":"2004"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"DHS","type":"MIS","year":2022,"label":"2022"}],"CAF":[{"program":"DHS","type":"DHS","year":1994,"label":"1994-95"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"TCD":[{"program":"DHS","type":"DHS","year":1997,"label":"1996-97"},{"program":"DHS","type":"DHS","year":2004,"label":"2004"},{"program":"DHS","type":"DHS","year":2014,"label":"2014-15"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"COL":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":1990,"label":"1990"},{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2015,"label":"2015"}],"COG":[{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"AIS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2011,"label":"2011-12"}],"COD":[{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"DHS","year":2013,"label":"2013-14"},{"program":"MICS","type":"MICS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2023,"label":"2023-24"}],"CIV":[{"program":"DHS","type":"DHS","year":1994,"label":"1994"},{"program":"DHS","type":"DHS","year":1998,"label":"1998-99"},{"program":"DHS","type":"AIS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2012,"label":"2011-12"},{"program":"DHS","type":"DHS","year":2021,"label":"2021"}],"DOM":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":1991,"label":"1991"},{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"DHS","type":"DHS","year":1999,"label":"1999"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2002,"label":"2002"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"ECU":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"}],"EGY":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"MICS","type":"MICS","year":2013,"label":"2013-14"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"}],"SLV":[{"program":"DHS","type":"DHS","year":1985,"label":"1985"}],"ERI":[{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":2002,"label":"2002"}],"SWZ":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2006,"label":"2006-07"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"}],"ETH":[{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2011,"label":"2011"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2013,"label":"2013"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2015,"label":"2015"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2019,"label":"2019"}],"GAB":[{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2019,"label":"2019-21"}],"GMB":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2019,"label":"2019-20"}],"GHA":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"DHS","type":"DHS","year":1993,"label":"1993"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"MICS","type":"MICS","year":2010,"label":"2010-11"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"DHS","type":"MIS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2017,"label":"2017"},{"program":"DHS","type":"MIS","year":2019,"label":"2019"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"GTM":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":1999,"label":"1998-99"},{"program":"DHS","type":"DHS","year":2015,"label":"2014-15"}],"GIN":[{"program":"DHS","type":"DHS","year":1999,"label":"1999"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"DHS","type":"MIS","year":2021,"label":"2021"}],"GUY":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"AIS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2009,"label":"2009"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"HTI":[{"program":"DHS","type":"DHS","year":1994,"label":"1994-95"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2006,"label":"2005-06"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2016,"label":"2016-17"}],"HND":[{"program":"DHS","type":"DHS","year":2005,"label":"2005-06"},{"program":"DHS","type":"DHS","year":2011,"label":"2011-12"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"IND":[{"program":"DHS","type":"DHS","year":1993,"label":"1992-93"},{"program":"DHS","type":"DHS","year":1999,"label":"1998-99"},{"program":"DHS","type":"DHS","year":2006,"label":"2005-06"},{"program":"DHS","type":"DHS","year":2015,"label":"2015-16"},{"program":"DHS","type":"DHS","year":2020,"label":"2019-21"}],"IDN":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"DHS","type":"DHS","year":1991,"label":"1991"},{"program":"DHS","type":"DHS","year":1994,"label":"1994"},{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2003,"label":"2002-03"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2017,"label":"2017"}],"JOR":[{"program":"DHS","type":"DHS","year":1990,"label":"1990"},{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"DHS","type":"DHS","year":2002,"label":"2002"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"DHS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2017,"label":"2017-18"},{"program":"DHS","type":"DHS","year":2023,"label":"2023"}],"KAZ":[{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":1999,"label":"1999"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2015,"label":"2015"}],"KEN":[{"program":"DHS","type":"DHS","year":1989,"label":"1989"},{"program":"DHS","type":"DHS","year":1993,"label":"1993"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008-09"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2013,"label":"2013-14"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"DHS","type":"MIS","year":2015,"label":"2015"},{"program":"DHS","type":"MIS","year":2020,"label":"2020"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"KGZ":[{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"LSO":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2004,"label":"2004"},{"program":"DHS","type":"DHS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2023,"label":"2023-24"}],"LBR":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"MIS","year":2009,"label":"2009"},{"program":"DHS","type":"MIS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2016,"label":"2016"},{"program":"DHS","type":"DHS","year":2019,"label":"2019-20"},{"program":"DHS","type":"MIS","year":2022,"label":"2022"}],"MDG":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"DHS","type":"DHS","year":2004,"label":"2003-04"},{"program":"DHS","type":"DHS","year":2008,"label":"2008-09"},{"program":"DHS","type":"MIS","year":2011,"label":"2011"},{"program":"DHS","type":"MIS","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2021,"label":"2021"}],"MWI":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2004,"label":"2004"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2010,"label":"2010"},{"program":"DHS","type":"MIS","year":2012,"label":"2012"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2015,"label":"2015-16"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2016,"label":"2016"},{"program":"DHS","type":"MIS","year":2017,"label":"2017"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2019,"label":"2019"},{"program":"MICS","type":"MICS","year":2019,"label":"2019-20"},{"program":"DHS","type":"DHS","year":2024,"label":"2024"}],"MLI":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"DHS","type":"DHS","year":1996,"label":"1995-96"},{"program":"DHS","type":"DHS","year":2001,"label":"2001"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"},{"program":"DHS","type":"DHS","year":2012,"label":"2012-13"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2014,"label":"2014"},{"program":"DHS","type":"MIS","year":2015,"label":"2015"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2018,"label":"2018"},{"program":"DHS","type":"MIS","year":2021,"label":"2021"},{"program":"DHS","type":"DHS","year":2023,"label":"2023-24"}],"MRT":[{"program":"DHS","type":"DHS","year":2000,"label":"2000-01"},{"program":"DHS","type":"DHS","year":2020,"label":"2019-21"}],"MEX":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"}],"MDA":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"MICS","type":"MICS","year":2012,"label":"2012"}],"MAR":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":2003,"label":"2003-04"}],"MOZ":[{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"AIS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"DHS","type":"AIS","year":2015,"label":"2015"},{"program":"DHS","type":"MIS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2022,"label":"2022-23"}],"MMR":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2016,"label":"2015-16"}],"NAM":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2006,"label":"2006-07"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"}],"NPL":[{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"DHS","type":"DHS","year":2001,"label":"2001"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"NIC":[{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2001,"label":"2001"}],"NER":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2014,"label":"2014"},{"program":"DHS","type":"MIS","year":2021,"label":"2021"}],"NGA":[{"program":"DHS","type":"DHS","year":1990,"label":"1990"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"DHS","type":"MIS","year":2010,"label":"2010"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2010,"label":"2010"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2015,"label":"2015"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2015,"label":"2015"},{"program":"MICS","type":"MICS","year":2016,"label":"2016-17"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2018,"label":"2018"},{"program":"DHS","type":"MIS","year":2021,"label":"2021"},{"program":"MICS","type":"MICS","year":2021,"label":"2021"},{"program":"DHS","type":"DHS","year":2024,"label":"2024"}],"PAK":[{"program":"DHS","type":"DHS","year":1991,"label":"1990-91"},{"program":"DHS","type":"DHS","year":2006,"label":"2006-07"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2012,"label":"2012-13"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"MICS","type":"MICS","year":2016,"label":"2016"},{"program":"DHS","type":"DHS","year":2017,"label":"2017-18"},{"program":"MICS","type":"MICS","year":2017,"label":"2017-18"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"PNG":[{"program":"DHS","type":"DHS","year":2017,"label":"2016-18"}],"PRY":[{"program":"DHS","type":"DHS","year":1990,"label":"1990"}],"PER":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":1992,"label":"1991-92"},{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2004,"label":"2004-06"},{"program":"DHS","type":"DHS","year":2007,"label":"2007-08"},{"program":"DHS","type":"DHS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"}],"PHL":[{"program":"DHS","type":"DHS","year":1993,"label":"1993"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"MICS","type":"MICS","year":1999,"label":"1999"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"DHS","type":"DHS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"RWA":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2008,"label":"2007-08"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"DHS","type":"MIS","year":2013,"label":"2013"},{"program":"DHS","type":"DHS","year":2015,"label":"2014-15"},{"program":"DHS","type":"MIS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2019,"label":"2019-20"},{"program":"DHS","type":"MIS","year":2023,"label":"2023"}],"SEN":[{"program":"DHS","type":"DHS","year":1986,"label":"1986"},{"program":"DHS","type":"DHS","year":1993,"label":"1992-93"},{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"DHS","type":"DHS","year":2005,"label":"2005"},{"program":"DHS","type":"MIS","year":2006,"label":"2006"},{"program":"DHS","type":"MIS","year":2008,"label":"2008-09"},{"program":"DHS","type":"DHS","year":2010,"label":"2010-11"},{"program":"DHS","type":"DHS","year":2012,"label":"2012-13"},{"program":"DHS","type":"DHS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2015,"label":"2015"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"},{"program":"DHS","type":"DHS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2019,"label":"2019"},{"program":"DHS","type":"MIS","year":2020,"label":"2020-21"},{"program":"DHS","type":"DHS","year":2023,"label":"2023"}],"SLE":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2019,"label":"2019"}],"ZAF":[{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"}],"LKA":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"}],"SDN":[{"program":"DHS","type":"DHS","year":1990,"label":"1989-90"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"}],"TJK":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2012,"label":"2012"},{"program":"DHS","type":"DHS","year":2017,"label":"2017"},{"program":"DHS","type":"DHS","year":2023,"label":"2023"}],"TZA":[{"program":"DHS","type":"DHS","year":1992,"label":"1991-92"},{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"DHS","type":"DHS","year":1999,"label":"1999"},{"program":"DHS","type":"AIS","year":2003,"label":"2003-04"},{"program":"DHS","type":"DHS","year":2004,"label":"2004-05"},{"program":"DHS","type":"AIS","year":2007,"label":"2007-08"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2008,"label":"2008"},{"program":"DHS","type":"DHS","year":2010,"label":"2010"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2010,"label":"2010"},{"program":"DHS","type":"AIS","year":2012,"label":"2011-12"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2012,"label":"2012"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2015,"label":"2015-16"},{"program":"DHS","type":"MIS","year":2017,"label":"2017"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2019,"label":"2019"},{"program":"DHS","type":"DHS","year":2022,"label":"2022"}],"THA":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2012,"label":"2012"},{"program":"MICS","type":"MICS","year":2015,"label":"2015-16"},{"program":"MICS","type":"MICS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"TLS":[{"program":"DHS","type":"DHS","year":2009,"label":"2009-10"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"}],"TGO":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2013,"label":"2013-14"},{"program":"DHS","type":"MIS","year":2017,"label":"2017"},{"program":"MICS","type":"MICS","year":2017,"label":"2017"}],"TTO":[{"program":"DHS","type":"DHS","year":1987,"label":"1987"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"}],"TUN":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"TUR":[{"program":"DHS","type":"DHS","year":1993,"label":"1993"},{"program":"DHS","type":"DHS","year":1998,"label":"1998"},{"program":"DHS","type":"DHS","year":2003,"label":"2003"},{"program":"DHS","type":"DHS","year":2008,"label":"2008"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"}],"TKM":[{"program":"DHS","type":"DHS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2015,"label":"2015-16"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"UGA":[{"program":"DHS","type":"DHS","year":1988,"label":"1988-89"},{"program":"DHS","type":"DHS","year":1995,"label":"1995"},{"program":"DHS","type":"DHS","year":2000,"label":"2000-01"},{"program":"DHS","type":"AIS","year":2004,"label":"2004-05"},{"program":"DHS","type":"DHS","year":2006,"label":"2006"},{"program":"DHS","type":"MIS","year":2009,"label":"2009"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2009,"label":"2009"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2010,"label":"2010"},{"program":"DHS","type":"DHS","year":2011,"label":"2011"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2011,"label":"2011"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2013,"label":"2013"},{"program":"DHS","type":"MIS","year":2014,"label":"2014-15"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2015,"label":"2015"},{"program":"DHS","type":"DHS","year":2016,"label":"2016"},{"program":"DHS","type":"MIS","year":2018,"label":"2018-19"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2018,"label":"2018"},{"program":"LSMS-ISA","type":"LSMS-ISA","year":2019,"label":"2019"},{"program":"DHS","type":"MIS","year":2024,"label":"2024-25"}],"UKR":[{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"MICS","type":"MICS","year":2012,"label":"2012"}],"UZB":[{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2021,"label":"2021-22"}],"VNM":[{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"DHS","type":"DHS","year":2002,"label":"2002"},{"program":"DHS","type":"AIS","year":2005,"label":"2005"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2010,"label":"2010-11"},{"program":"MICS","type":"MICS","year":2013,"label":"2013-14"},{"program":"MICS","type":"MICS","year":2020,"label":"2020-21"}],"YEM":[{"program":"DHS","type":"DHS","year":1991,"label":"1991-92"},{"program":"DHS","type":"DHS","year":1997,"label":"1997"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"DHS","type":"DHS","year":2013,"label":"2013"}],"ZMB":[{"program":"DHS","type":"DHS","year":1992,"label":"1992"},{"program":"DHS","type":"DHS","year":1996,"label":"1996"},{"program":"MICS","type":"MICS","year":1999,"label":"1999"},{"program":"DHS","type":"DHS","year":2002,"label":"2001-02"},{"program":"DHS","type":"DHS","year":2007,"label":"2007"},{"program":"DHS","type":"DHS","year":2013,"label":"2013-14"},{"program":"DHS","type":"DHS","year":2018,"label":"2018"},{"program":"DHS","type":"DHS","year":2024,"label":"2024"}],"ZWE":[{"program":"DHS","type":"DHS","year":1988,"label":"1988"},{"program":"DHS","type":"DHS","year":1994,"label":"1994"},{"program":"DHS","type":"DHS","year":1999,"label":"1999"},{"program":"DHS","type":"DHS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2009,"label":"2009"},{"program":"DHS","type":"DHS","year":2010,"label":"2010-11"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"DHS","type":"DHS","year":2015,"label":"2015"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"DZA":[{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"ARG":[{"program":"MICS","type":"MICS","year":2019,"label":"2019-20"}],"BLR":[{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"MICS","type":"MICS","year":2012,"label":"2012"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"BLZ":[{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2015,"label":"2015-16"}],"BTN":[{"program":"MICS","type":"MICS","year":2010,"label":"2010"}],"BIH":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2011,"label":"2011-12"}],"CRI":[{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"CUB":[{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"FJI":[{"program":"MICS","type":"MICS","year":2021,"label":"2021"}],"GEO":[{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"GNB":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"IRQ":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"JAM":[{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"}],"CS-KM":[{"program":"MICS","type":"MICS","year":2013,"label":"2013-14"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"LAO":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2006,"label":"2006"}],"LBN":[{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"}],"MKD":[{"program":"MICS","type":"MICS","year":2011,"label":"2011"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"MNG":[{"program":"MICS","type":"MICS","year":2000,"label":"2000"},{"program":"MICS","type":"MICS","year":2005,"label":"2005"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2012,"label":"2012"},{"program":"MICS","type":"MICS","year":2016,"label":"2016"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"MNE":[{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2013,"label":"2013"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"OMN":[{"program":"MICS","type":"MICS","year":2014,"label":"2014"}],"QAT":[{"program":"MICS","type":"MICS","year":2012,"label":"2012"}],"SRB":[{"program":"MICS","type":"MICS","year":2005,"label":"2005-06"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"MICS","type":"MICS","year":2019,"label":"2019"}],"SOM":[{"program":"MICS","type":"MICS","year":2006,"label":"2006"},{"program":"MICS","type":"MICS","year":2011,"label":"2011"}],"SUR":[{"program":"MICS","type":"MICS","year":1999,"label":"1999-00"},{"program":"MICS","type":"MICS","year":2010,"label":"2010"},{"program":"MICS","type":"MICS","year":2018,"label":"2018"}],"SYR":[{"program":"MICS","type":"MICS","year":2006,"label":"2006"}],"PSE":[{"program":"MICS","type":"MICS","year":2014,"label":"2014"},{"program":"MICS","type":"MICS","year":2019,"label":"2019-20"}]};
