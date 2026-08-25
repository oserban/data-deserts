export type DatasetReference = {
    title: string;
    provider: string;
    description: string;
    licence: string;
    source: string;
};

export const DATASET_REFERENCE: Record<string, DatasetReference> = {
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
            'Terrestrial biodiversity sampling sites assigned to the midpoint year of sampling. Sites are counted to avoid inflating intensively sampled locations.',
        licence: 'Creative Commons Attribution–NonCommercial 4.0 International (CC BY-NC 4.0).',
        source: 'https://data.nhm.ac.uk/dataset/the-2016-release-of-the-predicts-database-v1-1'
    },
    gbif: {
        title: 'Global Biodiversity Information Facility',
        provider: 'GBIF network and contributing data publishers',
        description:
            'Filtered modern biodiversity occurrence records with coordinates, no flagged geospatial issue, and present status.',
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
    dhs: {
        title: 'Demographic and Health Surveys',
        provider: 'The DHS Program, implemented by ICF',
        description:
            'Interviewed women plus interviewed men reported for each survey. DHS coverage defines the countries displayed by Data Deserts.',
        licence:
            'Access is project-specific under DHS terms. DHS microdata must not be redistributed or exposed through a data tool.',
        source: 'https://api.dhsprogram.com/'
    },
    mics: {
        title: 'Multiple Indicator Cluster Surveys',
        provider: 'UNICEF',
        description:
            'Interviewed women plus interviewed men where individual questionnaire files are available; roster and child files are excluded.',
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
