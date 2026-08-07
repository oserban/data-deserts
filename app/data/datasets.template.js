/*
 * Public schema template only. This file contains no processed project data.
 *
 * A protected build/deployment environment creates app/data/datasets.js by
 * running: python3 processing/build_data.py
 */
window.DATASETS = {
  "<dataset_key>": {
    "name": "<display name>",
    "domain": "<category>",
    "url": "<source URL>",
    "description": "<counting-unit description>",
    "unit": "<unit>",
    "color": "#000000",
    "records": {
      "<ISO3>": {
        "<YYYY>": 0
      }
    },
    "summary": {
      "countries": 0,
      "records": 0,
      "yearMin": null,
      "yearMax": null
    },
    "scopeSummary": {
      "countries": 0,
      "records": 0,
      "yearMin": null,
      "yearMax": null
    }
  }
};

window.AGGREGATED_RECORDS = {
  "<ISO3>": {
    "<YYYY>": 0
  }
};

window.META = {
  "datasetOrder": ["<dataset_key>"],
  "categoryOrder": ["<category>"],
  "datasetCount": 0,
  "scopeDatasets": ["<scope_dataset_key>"],
  "scopeCountries": 0,
  "yearMin": null,
  "yearMax": null,
  "aggregate": {
    "countries": 0,
    "records": 0,
    "yearMin": null,
    "yearMax": null
  }
};
