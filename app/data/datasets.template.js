/*
 * Public schema template only. This file contains no processed project data.
 *
 * A protected build/deployment environment creates app/data/datasets.js by
 * running: python3 processing/build_data.py
 *
 * DHS uses unit "surveys". It additionally exports nutritionDefinition and
 * surveyYears: { "<ISO3>": [{ year: 2000, label: "2000-01", surveyCount: 1,
 *   surveyTypes: ["DHS"], nutrition: true, nutritionTopics: ["<topic>"] }] }.
 * nutrition is true when confirmed, otherwise null (not confirmed, not absent).
 * Counts and filters use the principal year; labels preserve fieldwork ranges.
 */
window.DATASETS = {
  "<dataset_key>": {
    "name": "<display name>",
    "domain": "<category>",
    "url": "https://example.org/dataset",
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

// Generated from reviewed census observations and qualifying allocation comparisons.
// Absent observations/metrics have no numeric placeholder. Measured CV=0 is valid.
// The real payload lists all 15 supported crops, even when evidence is unavailable.
window.AGRICULTURE = {
  schemaVersion: 1,
  status: "unavailable",
  reason: "Verified census evidence linked to map countries is not yet available.",
  defaultMetric: "dispersion",
  defaultAggregation: "dispersion",
  cropOrder: ["<crop>"],
  records: {}, // Deduplicated reporting admin units: ISO3 -> year -> count.
  effective_resolution_km: {}, // ISO3 -> year -> crop -> km or null.
  crops: {
    "<crop>": {
      name: "<crop name>", color: "#d6ac54", records: {},
      metrics: {} // ISO3 -> year -> {dispersion, resolution, complete, crosswalkExactness}.
    }
  }
};

// Generated only from the three approved independent map comparisons:
// precipitation (ERA5-Land/CHIRPS), cropland extent (ESA CCI/MIRCA), and
// irrigated extent (ESA CCI/MIRCA). Rainfed extent is explicitly excluded.
window.HYDRO = {
  schemaVersion: 1,
  status: "unavailable",
  reason: "Hydro comparison rasters have not been processed yet.",
  variableOrder: ["precipitation", "cropland_extent", "irrigated_area_extent"],
  variables: {
    "<variable>": {
      name: "<display name>",
      metrics: {} // ISO3 -> year -> {dispersion, resolution, allocationSimilarity, complete}
    }
  },
  excluded: { rainfed_area_extent: "ESA CCI Medium Resolution Land Cover has no defensible rainfed class." }
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
