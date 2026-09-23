export type DatasetReference = {
    title: string;
    provider: string;
    description: string;
    licence: string;
    source: string;
};

export const DATASET_REFERENCE: Record<string, DatasetReference> = {
    agriculture_maps: {
        title: 'Harvested-area census evidence and allocation dispersion',
        provider: 'MapSPAM, FAO GAEZ, MIRCA2000 and MIRCA-OS',
        description:
            'Coverage counts reporting administrative units once per year across crops and products. Detailed crop views separate native-cell dispersion, allocation similarity, effective resolution and source availability. These describe allocation patterns and map availability; no product is used as a reference.',
        licence:
            'Consult and cite each original product and census source; this derived summary does not replace their terms.',
        source: 'https://doi.org/10.1038/s41597-024-04313-w'
    },
    hydro_maps: {
        title: 'Hydrology map support',
        provider: 'ERA5-Land, CHIRPS, ESA CCI Land Cover and MIRCA-OS',
        description:
            'Precomputed country-level dispersion across the three approved hydrology map comparisons. It is not a record-coverage score.',
        licence:
            'Consult and cite each original data product; this derived summary does not replace their terms.',
        source: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means'
    },
    biotime: {
        title: 'BioTIME biodiversity time-series database',
        provider: 'BioTIME Project, University of St Andrews',
        description:
            'Sample-level records from ecological assemblage time series. Counts represent sampling events, not species or individual organisms.',
        licence:
            'Individual studies retain their own licences; consult study metadata and cite BioTIME and the original study.',
        source: 'https://biotime.st-andrews.ac.uk/'
    },
    living_planet: {
        title: 'Living Planet Database',
        provider: 'Zoological Society of London and WWF',
        description:
            'Yearly observations from monitored vertebrate population time series. Counts are population observations, not animals or index values.',
        licence:
            'Living Planet Database Data Use Policy, including attribution and sharing conditions.',
        source: 'https://livingplanetindex.org/data_portal'
    },
    predicts: {
        title: 'Projecting Responses of Ecological Diversity In Changing Terrestrial Systems',
        provider: 'Natural History Museum, London',
        description:
            'Sites from 2016 V1.1 and the November 2022 additions, assigned to the sampling midpoint year. Source/study/block/site IDs are deduplicated across releases.',
        licence: 'Creative Commons Attribution–NonCommercial 4.0 International (CC BY-NC 4.0).',
        source: 'https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1 · https://data.nhm.ac.uk/dataset/release-of-data-added-to-the-predicts-database-november-2022'
    },
    gbif: {
        title: 'Global Biodiversity Information Facility',
        provider: 'GBIF network and contributing data publishers',
        description:
            'Human observations, machine observations and living specimens with coordinates, no flagged geospatial issues and present status. All other basis-of-record types are excluded.',
        licence:
            'Record-level sources use CC0, CC BY 4.0, or CC BY-NC 4.0; applicable attribution and non-commercial terms must be followed.',
        source: 'https://www.gbif.org/occurrence/search'
    },
    lsms_isa: {
        title: 'Living Standards Measurement Study — Integrated Surveys on Agriculture',
        provider: 'World Bank',
        description:
            'Rows in agricultural modules covering crops, inputs, plots, land, farms, livestock, fisheries, and trees.',
        licence:
            'World Bank Microdata Library study-level access types, licences, and citation requirements apply.',
        source: 'https://www.worldbank.org/en/programs/lsms/initiatives/lsms-ISA'
    },
    mapspam: {
        title: 'MapSPAM 2010',
        provider: 'IFPRI',
        description:
            'Counts represent documented census-reporting administrative units, deduplicated across crops within each year. Allocation dispersion and map country effective resolution describe spatial allocation; these products are not independent observations.',
        licence: 'Consult the cited provider release and underlying census sources before reuse.',
        source: 'https://www.mapspam.info/data/'
    },
    gaez: {
        title: 'GAEZ Theme 5 and GAEZ+2015 harvested area',
        provider: 'FAO and IIASA',
        description:
            'Counts represent documented census-reporting administrative units, deduplicated across crops within each year. Allocation dispersion and map country effective resolution describe spatial allocation; these products are not independent observations.',
        licence: 'Consult the cited provider release and underlying census sources before reuse.',
        source: 'https://www.fao.org/gaez/gaezv4/en'
    },
    mirca2000: {
        title: 'MIRCA2000 harvested area',
        provider: 'MIRCA research teams and contributing census agencies',
        description:
            'Counts represent documented census-reporting administrative units, deduplicated across crops within each year. Allocation dispersion and map country effective resolution describe spatial allocation; these products are not independent observations.',
        licence: 'Consult the cited provider release and underlying census sources before reuse.',
        source: 'https://zenodo.org/records/7422506'
    },
    mirca_os: {
        title: 'MIRCA-OS harvested area',
        provider: 'MIRCA research teams and contributing census agencies',
        description:
            'Counts represent documented census-reporting administrative units, deduplicated across crops within each year. Allocation dispersion and map country effective resolution describe spatial allocation; these products are not independent observations.',
        licence: 'Consult the cited provider release and underlying census sources before reuse.',
        source: 'https://doi.org/10.1038/s41597-024-04313-w'
    },
    grdc: {
        title: 'Global Runoff Data Centre river-discharge coverage',
        provider: 'The Global Runoff Data Centre, 56068 Koblenz, Germany, and national services',
        description:
            'Each station counts once per year with a valid daily or monthly observation. Zero flow is valid; missing values and duplicate station-years are excluded. Totals are station-years, not unique stations or discharge volume.',
        licence:
            'Research use and derived statistical products require attribution. Downloaded discharge data must not be redistributed; only country/year coverage counts are shown.',
        source: 'https://grdc.bafg.de/data/data_portal/'
    },
    dhs: {
        title: 'Demographic and Health Surveys',
        provider: 'The DHS Program, implemented by ICF',
        description:
            'Unique completed DHS Program surveys with published indicators, counted once per survey ID. Nutrition includes any nutrition topic: feeding practices, dietary diversity, food insecurity, anthropometry, anemia, and micronutrients. Highlighting uses survey topics or published nutrition indicators.',
        licence:
            'Access is project-specific under DHS terms. DHS microdata must not be redistributed or exposed through a data tool.',
        source: 'https://api.dhsprogram.com/'
    },
    mics: {
        title: 'Multiple Indicator Cluster Surveys',
        provider: 'UNICEF',
        description:
            'Women’s and men’s interview records where individual questionnaire files are available; household and child files are excluded. Counts do not establish unique people across surveys.',
        licence:
            'UNICEF and survey-specific access, use, acknowledgement, and citation conditions apply.',
        source: 'https://mics.unicef.org/surveys'
    },
    lsms: {
        title: 'Living Standards Measurement Study',
        provider: 'World Bank',
        description:
            'Person or household-member records from one selected roster per study; transaction files cannot inflate participant coverage.',
        licence:
            'World Bank Microdata Library study-level access types, licences, and citation requirements apply.',
        source: 'https://microdata.worldbank.org/catalog/lsms'
    }
};
