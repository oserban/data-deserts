/* Data Deserts — country/year coverage across the generated dataset inventory. */
(function () {
  "use strict";

  var observedDatasets = window.DATASETS;
  var DATASETS = observedDatasets;
  var datasetOrder = META.datasetOrder;
  var focusedCountry = null;
  var scopeDatasets = META.scopeDatasets || [META.scopeDataset];
  var scopeRecords = {};
  scopeDatasets.forEach(function (key) {
    Object.keys(DATASETS[key].records).forEach(function (iso) { scopeRecords[iso] = true; });
  });
  var state = {
    yearFrom: META.yearMin, yearTo: META.yearMax, selected: {},
    yearlyHistograms: false, groupedDonuts: false, includeLsmsEstimates: true,
    detailedAgriculture: false, detailedHydro: false, agricultureMetric: "dispersion", hydroMetric: "dispersion", agricultureAggregation: "dispersion"
  };
  var estimatedDatasets = DataDesertsScores.withHouseholdEstimates(observedDatasets, Object.keys(scopeRecords));
  var appliedEstimateMode = false;
  var agricultureModel = DataDesertsScores.create(DATASETS,
    typeof AGRICULTURE === "undefined" ? undefined : AGRICULTURE,
    WORLD_GEOJSON.features, Object.keys(scopeRecords), typeof HYDRO === "undefined" ? undefined : HYDRO);

  function agricultureSignature() {
    return state.detailedAgriculture + "|" + state.detailedHydro + "|" + state.agricultureMetric + "|" + state.hydroMetric + "|" + state.agricultureAggregation + "|" + state.includeLsmsEstimates;
  }

  function seriesResult(series, iso, from, to) {
    return series.crop ? agricultureModel.cropValue(iso, series.crop, state.agricultureMetric, from, to)
      : series.hydro ? agricultureModel.hydroValue(iso, series.hydro, state.hydroMetric, from, to)
      : agricultureModel.seriesValue(series.keys.filter(function (key) { return state.selected[key]; }),
        iso, from, to, state.agricultureAggregation);
  }
  function seriesMetric(series) {
    if (series.hydro || (series.keys && series.keys.length === 1 && series.keys[0] === 'hydro_maps')) return 'dispersion';
    if (series.crop) return state.agricultureMetric;
    if (series.keys && series.keys.length === 1 && series.keys[0] === 'agriculture_maps') return state.agricultureAggregation;
    return 'coverage';
  }
  // Bounding-box centres are unsuitable for antimeridian-spanning countries.
  // Keep their donut over the inhabited/mainland landmass instead.
  var MARKER_POSITIONS = {
    RUS: [61.5, 90],
    USA: [39.8, -98.6]
  };
  datasetOrder.forEach(function (key) { state.selected[key] = true; });

  var yearCount = META.yearMax - META.yearMin + 1;
  var recordPrefixes = {};
  function rebuildRecordPrefixes() {
    recordPrefixes = {};
    datasetOrder.forEach(function (key) {
      recordPrefixes[key] = {};
      Object.keys(DATASETS[key].records).forEach(function (iso) {
        var prefix = new Array(yearCount + 1).fill(0);
        var yearly = DATASETS[key].records[iso];
        for (var index = 0; index < yearCount; index++) {
          prefix[index + 1] = prefix[index] + (yearly[String(META.yearMin + index)] || 0);
        }
        recordPrefixes[key][iso] = prefix;
      });
    });
  }
  rebuildRecordPrefixes();
  var datasetCountCache = new Map();
  var countryCountCache = new Map();
  var scaleCache = new Map();

  function selectedKeys() {
    return datasetOrder.filter(function (key) { return state.selected[key]; });
  }
  function groupedDisplay() {
    return state.groupedDonuts && !state.selected.agriculture_maps && !state.selected.hydro_maps;
  }

  function countUnit(keys) {
    return keys.length === 1 ? DATASETS[keys[0]].unit : "records";
  }

  function categoryOrder() {
    return META.categoryOrder.filter(function (domain) {
      return datasetOrder.some(function (key) { return DATASETS[key].domain === domain; });
    });
  }

  function displaySeries() {
    if (state.detailedAgriculture) return agricultureModel.agriculture.cropOrder.map(function (crop) {
      var item = agricultureModel.agriculture.crops[crop];
      return { id: "crop:" + crop, crop: crop, label: item.name, color: item.color, keys: [], selected: true };
    });
    if (state.detailedHydro) return [{ id: "hydro:overall", hydro: "overall", label: agricultureModel.hydro.aggregate.name, color: "#d6ac54", keys: [], selected: true }].concat(agricultureModel.hydro.variableOrder.map(function (variable) {
      var item = agricultureModel.hydro.variables[variable];
      return { id: "hydro:" + variable, hydro: variable, label: item.name, color: ["#4ca6d9", "#69b578", "#c99a43"][agricultureModel.hydro.variableOrder.indexOf(variable) % 3], keys: [], selected: true };
    }));
    if (!groupedDisplay()) {
      return datasetOrder.map(function (key) {
        return {
          id: key, label: DATASETS[key].name, color: DATASETS[key].color,
          keys: [key], selected: state.selected[key], metric: seriesMetric({ keys: [key] })
        };
      });
    }
    return categoryOrder().map(function (domain) {
      var keys = datasetOrder.filter(function (key) { return DATASETS[key].domain === domain; });
      return {
        id: "domain:" + domain, label: domain, color: DATASETS[keys[0]].color,
        keys: keys, selected: keys.some(function (key) { return state.selected[key]; })
      };
    });
  }

  function countryInScope(iso) {
    return Object.prototype.hasOwnProperty.call(scopeRecords, iso);
  }

  function datasetCount(key, iso) {
    if (!countryInScope(iso)) return 0;
    var cacheKey = key + "|" + iso + "|" + state.yearFrom + "|" + state.yearTo;
    if (datasetCountCache.has(cacheKey)) return datasetCountCache.get(cacheKey);
    var prefix = recordPrefixes[key][iso];
    var count = prefix
      ? prefix[state.yearTo - META.yearMin + 1] - prefix[state.yearFrom - META.yearMin]
      : 0;
    datasetCountCache.set(cacheKey, count);
    return count;
  }

  function countryCount(iso) {
    if (!countryInScope(iso)) return 0;
    var keys = selectedKeys();
    var cacheKey = iso + "|" + state.yearFrom + "|" + state.yearTo + "|" + keys.join(",");
    if (countryCountCache.has(cacheKey)) return countryCountCache.get(cacheKey);
    var count = keys.reduce(function (total, key) {
      return total + datasetCount(key, iso);
    }, 0);
    countryCountCache.set(cacheKey, count);
    return count;
  }

  function seriesCount(series, iso) {
    return series.keys.reduce(function (total, key) {
      return total + (state.selected[key] ? datasetCount(key, iso) : 0);
    }, 0);
  }

  function seriesYearCount(series, iso, year) {
    return series.keys.reduce(function (total, key) {
      if (!state.selected[key]) return total;
      return total + ((DATASETS[key].records[iso] || {})[String(year)] || 0);
    }, 0);
  }

  var countryAreas = {};
  WORLD_GEOJSON.features.forEach(function (feature) {
    countryAreas[feature.id] = Math.max(1, feature.properties.areaKm2 || 1);
  });

  function perMillionKm2(value, iso) {
    return value / countryAreas[iso] * 1000000;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  var seriesMaxima = {}, datasetMaxima = {}, datasetYearRanges = {}, seriesYearRanges = {};

  function polar(radius, angle) {
    var radians = (angle - 90) * Math.PI / 180;
    return [30 + radius * Math.cos(radians), 30 + radius * Math.sin(radians)];
  }

  function ringPath(start, end) {
    var outerStart = polar(27, start), outerEnd = polar(27, end);
    var innerEnd = polar(14, end), innerStart = polar(14, start);
    var largeArc = end - start > 180 ? 1 : 0;
    return "M" + outerStart.join(" ") + " A27 27 0 " + largeArc + " 1 " + outerEnd.join(" ") +
      " L" + innerEnd.join(" ") + " A14 14 0 " + largeArc + " 0 " + innerStart.join(" ") + " Z";
  }

  function assessmentColor(value, maximum) {
    if (!value || !maximum) return "#4b5663";
    var score = Math.log1p(value) / Math.log1p(maximum);
    var start, end, amount;
    if (score <= 0.5) {
      start = [215, 48, 39]; end = [254, 224, 139]; amount = score * 2;
    } else {
      start = [254, 224, 139]; end = [26, 152, 80]; amount = (score - 0.5) * 2;
    }
    return "rgb(" + start.map(function (channel, index) {
      return Math.round(channel + (end[index] - channel) * amount);
    }).join(",") + ")";
  }

  function minMaxScore(value, range) {
    if (!value || !range || !range.max) return 0;
    if (range.max === range.min) return 1;
    return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  }

  function scoreColor(score) {
    var start, end, amount;
    if (score <= 0.5) {
      start = [215, 48, 39]; end = [254, 224, 139]; amount = score * 2;
    } else {
      start = [254, 224, 139]; end = [26, 152, 80]; amount = (score - 0.5) * 2;
    }
    return "rgb(" + start.map(function (channel, index) {
      return Math.round(channel + (end[index] - channel) * amount);
    }).join(",") + ")";
  }

  function positiveRange(values) {
    var positive = values.filter(function (value) { return value > 0; });
    return {
      min: positive.length ? Math.min.apply(null, positive) : 0,
      max: positive.length ? Math.max.apply(null, positive) : 0
    };
  }

  function identityColors(series) {
    if (series.crop || series.hydro) return [series.color];
    return series.keys.map(function (key) { return DATASETS[key].color; });
  }

  function identityGradient(series) {
    var colors = identityColors(series);
    if (colors.length === 1) return colors[0];
    var stops = [];
    colors.forEach(function (color, index) {
      stops.push(color + " " + (100 * index / colors.length) + "%");
      stops.push(color + " " + (100 * (index + 1) / colors.length) + "%");
    });
    return "linear-gradient(90deg," + stops.join(",") + ")";
  }

  function sectorAngles(series, index) {
    var size = 360 / series.length;
    function domain(item) {
      if (item.crop) return "Agriculture";
      if (item.hydro) return "Hydrology";
      return DATASETS[item.keys[0]].domain;
    }
    var currentDomain = domain(series[index]);
    var previousDomain = domain(series[(index + series.length - 1) % series.length]);
    var nextDomain = domain(series[(index + 1) % series.length]);
    var showCategoryGaps = series.length > categoryOrder().length;
    return {
      start: index * size + (showCategoryGaps && currentDomain !== previousDomain ? 8 : 1),
      end: (index + 1) * size - (showCategoryGaps && currentDomain !== nextDomain ? 8 : 1)
    };
  }

  function donutLegendHTML(series) {
    var legendWidth = 400, donutLeft = 170;
    var defs = '<marker id="legendArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z"></path></marker>';
    var sectors = "";
    series.forEach(function (item, index) {
      var colors = identityColors(item);
      var fill = colors[0];
      if (colors.length > 1) {
        var gradientId = "legendSeries" + index;
        var stops = colors.map(function (color, colorIndex) {
          var start = 100 * colorIndex / colors.length;
          var end = 100 * (colorIndex + 1) / colors.length;
          return '<stop offset="' + start + '%" stop-color="' + color + '"></stop>' +
            '<stop offset="' + end + '%" stop-color="' + color + '"></stop>';
        }).join("");
        defs += '<linearGradient id="' + gradientId + '" x1="0" x2="1">' + stops + '</linearGradient>';
        fill = "url(#" + gradientId + ")";
      }
      var angles = sectorAngles(series, index);
      sectors += '<path d="' + ringPath(angles.start, angles.end) +
        '" fill="' + fill + '" class="legend-identity-sector"></path>';
    });

    var annotations, legendHeight = 132, donutTop = 35;
    if (series.length === 2) {
      annotations = '<text x="240" y="68">' + escapeHTML(series[0].label) + '</text>' +
        '<path class="legend-arrow" d="M235 64 L225 64"></path>' +
        '<text x="160" y="68" text-anchor="end">' + escapeHTML(series[1].label) + '</text>' +
        '<path class="legend-arrow" d="M165 64 L175 64"></path>';
    } else {
      var sides = { left: [], right: [] };
      series.forEach(function (item, index) {
        var angles = sectorAngles(series, index);
        var midpoint = (angles.start + angles.end) / 2;
        var radians = (midpoint - 90) * Math.PI / 180;
        sides[Math.cos(radians) >= 0 ? "right" : "left"].push({
          item: item, midpoint: midpoint
        });
      });
      legendHeight = Math.max(132, Math.max(sides.left.length, sides.right.length) * 23 + 24);
      donutTop = legendHeight / 2 - 30;
      annotations = ["right", "left"].map(function (side) {
        var entries = sides[side].sort(function (first, second) {
          return polar(29, first.midpoint)[1] - polar(29, second.midpoint)[1];
        });
        return entries.map(function (entry, index) {
          var y = entries.length === 1 ? legendHeight / 2 :
            16 + index * (legendHeight - 32) / (entries.length - 1);
          var target = polar(29, entry.midpoint);
          var targetX = donutLeft + target[0], targetY = donutTop + target[1];
          var right = side === "right";
          var textX = right ? 240 : 160, lineX = right ? 235 : 165;
          var elbowX = right ? 226 : 174;
          var labelClass = right ? "legend-label-right" : "legend-label-left";
          return '<text class="' + labelClass + '" x="' + textX + '" y="' + (y + 4) + '">' +
            escapeHTML(entry.item.label) + '</text>' +
            '<path class="legend-arrow" d="M' + lineX + ' ' + y + ' L' + elbowX + ' ' + y +
            ' L' + targetX + ' ' + targetY + '"></path>';
        }).join("");
      }).join("");
    }
    var groupedLegend = series.some(function (item) { return item.keys.length > 1; });
    return '<div class="donut-legend"><svg class="' + (groupedLegend ? 'grouped-legend' : 'dataset-legend') +
      '" viewBox="0 0 ' + legendWidth + ' ' + legendHeight + '" role="img" aria-label="Radial coverage sector positions">' +
      '<defs>' + defs + '</defs><g transform="translate(' + donutLeft + ' ' + donutTop + ')">' + sectors +
      '<circle cx="30" cy="30" r="13" class="legend-centre"></circle></g>' + annotations + '</svg></div>';
  }

  var map = L.map("map", {
    worldCopyJump: true, minZoom: 2, maxZoom: 10,
    zoomSnap: 0.5, attributionControl: false, zoomControl: true
  }).setView([25, 15], 4);

  var sidebarToggle = document.getElementById("sidebarToggle");
  sidebarToggle.onclick = function () {
    var collapsed = document.body.classList.toggle("sidebar-collapsed");
    sidebarToggle.setAttribute("aria-expanded", !collapsed);
    sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    sidebarToggle.querySelector(".sidebar-toggle-icon").textContent = collapsed ? "›" : "‹";
    window.setTimeout(function () { map.invalidateSize(); }, 240);
  };

  (function addGraticule() {
    var lines = [];
    for (var lon = -180; lon <= 180; lon += 30) lines.push([[-85, lon], [85, lon]]);
    for (var lat = -60; lat <= 80; lat += 30) lines.push([[lat, -180], [lat, 180]]);
    L.polyline(lines, { color: "#9fb0c0", weight: 0.4, opacity: 0.18, interactive: false }).addTo(map);
  })();

  var countryEntries = [];
  var countries = L.geoJSON(WORLD_GEOJSON, {
    style: countryStyle,
    onEachFeature: function (feature, layer) {
      countryEntries.push({ feature: feature, layer: layer });
      layer.bindTooltip(function () { return tooltipHTML(feature); }, {
        className: "ctip leaflet-tooltip-own", sticky: true, direction: "top", opacity: 1
      });
      layer.on({
        mouseover: function (event) {
          event.target.setStyle({ weight: 1.7, color: "#fff" });
          event.target.bringToFront();
        },
        mouseout: function () { countries.setStyle(countryStyle); },
        click: function () { handleCountrySelection(feature); }
      });
    }
  }).addTo(map);

  function countryStyle(feature) {
    if (!countryInScope(feature.id)) {
      return { fillColor: "#0d141d", fillOpacity: 0.58, color: "#1b2734", weight: 0.45 };
    }
    var count = countryCount(feature.id);
    return {
      fillColor: count ? "#263443" : "#1b2530", fillOpacity: count ? 0.42 : 0.34,
      color: count ? "#708296" : "#344250",
      weight: 0.65
    };
  }

  function tooltipHTML(feature) {
    if (!countryInScope(feature.id)) {
      return "<b>" + escapeHTML(feature.properties.name) + "</b><br>Outside DHS survey-coverage scope";
    }
    if (state.detailedAgriculture || state.detailedHydro) return '<b>' + escapeHTML(feature.properties.name) + '</b><br>' +
      displaySeries().map(function (item) { return escapeHTML(item.label) + ': ' +
        agricultureModel.format(seriesResult(item, feature.id, state.yearFrom, state.yearTo), item.hydro ? state.hydroMetric : state.agricultureMetric);
      }).join('<br>');
    var rows = groupedDisplay() ? displaySeries().filter(function (series) { return series.selected; }).map(function (series) {
      var keys = series.keys.filter(function (key) { return state.selected[key]; });
      return escapeHTML(series.label) + ": " + formatNumber(seriesCount(series, feature.id)) +
        " " + escapeHTML(countUnit(keys)) + " &rarr; " + agricultureModel.formatCoverageScore(
          seriesResult(series, feature.id, state.yearFrom, state.yearTo));
    }) : selectedKeys().map(function (key) {
      if (key === 'agriculture_maps') return 'Agricultural map support: ' + agricultureModel.format(
        agricultureModel.aggregateValue(feature.id, state.agricultureAggregation, state.yearFrom, state.yearTo), state.agricultureAggregation);
      if (key === 'hydro_maps') return 'Hydrology map support: ' + agricultureModel.format(
        agricultureModel.hydroValue(feature.id, 'overall', 'dispersion', state.yearFrom, state.yearTo), 'dispersion');
      return escapeHTML(DATASETS[key].name) + ": " + formatNumber(datasetCount(key, feature.id)) +
        " " + escapeHTML(DATASETS[key].unit) + " &rarr; " + agricultureModel.formatCoverageScore(
          agricultureModel.datasetValue(key, feature.id, state.yearFrom, state.yearTo, state.agricultureAggregation));
    });
    return "<b>" + escapeHTML(feature.properties.name) + "</b><br>" +
      "Total: " + formatNumber(countryCount(feature.id)) + " " + escapeHTML(countUnit(selectedKeys())) +
      (rows.length ? "<br>" + rows.join("<br>") : "<br>No datasets selected");
  }

  function recomputeScale() {
    var cacheKey = state.yearFrom + "|" + state.yearTo + "|" +
      selectedKeys().join(",") + "|" + agricultureSignature() + "|" + (state.groupedDonuts ? "grouped" : "datasets");
    if (scaleCache.has(cacheKey)) {
      var cached = scaleCache.get(cacheKey);
      seriesMaxima = cached.seriesMaxima;
      datasetMaxima = cached.datasetMaxima;
      datasetYearRanges = cached.datasetYearRanges;
      seriesYearRanges = cached.seriesYearRanges;
      return;
    }
    seriesMaxima = {}; datasetMaxima = {}; datasetYearRanges = {}; seriesYearRanges = {};
    var series = displaySeries();
    var datasetValues = {}, seriesValues = {}, normalizationCountries = {};
    datasetOrder.forEach(function (key) {
      datasetValues[key] = [];
      datasetMaxima[key] = 0;
      Object.keys(DATASETS[key].records).forEach(function (iso) {
        normalizationCountries[iso] = true;
        Object.keys(DATASETS[key].records[iso]).forEach(function (year) {
          datasetValues[key].push(perMillionKm2(DATASETS[key].records[iso][year], iso));
        });
      });
    });
    series.forEach(function (item) { seriesMaxima[item.id] = 0; seriesValues[item.id] = []; });
    WORLD_GEOJSON.features.forEach(function (feature) {
      if (!countryInScope(feature.id)) return;
      datasetOrder.forEach(function (key) {
        datasetMaxima[key] = Math.max(datasetMaxima[key],
          perMillionKm2(datasetCount(key, feature.id), feature.id));
      });
      series.forEach(function (item) {
        seriesMaxima[item.id] = Math.max(seriesMaxima[item.id],
          perMillionKm2(seriesCount(item, feature.id), feature.id));
      });
    });
    Object.keys(normalizationCountries).forEach(function (iso) {
      series.forEach(function (item) {
        for (var year = META.yearMin; year <= META.yearMax; year++) {
            seriesValues[item.id].push(perMillionKm2(item.keys.reduce(function (total, key) {
              if (!state.selected[key]) return total;
              return total + ((DATASETS[key].records[iso] || {})[String(year)] || 0);
            }, 0), iso));
        }
      });
    });
    datasetOrder.forEach(function (key) {
      datasetYearRanges[key] = positiveRange(datasetValues[key]);
    });
    series.forEach(function (item) {
      seriesYearRanges[item.id] = positiveRange(seriesValues[item.id]);
    });
    scaleCache.set(cacheKey, {
      seriesMaxima: seriesMaxima,
      datasetMaxima: datasetMaxima,
      datasetYearRanges: datasetYearRanges,
      seriesYearRanges: seriesYearRanges
    });
  }

  function seriesAcronym(series) {
    var acronyms = {
      biotime: "BIO", living_planet: "LPI", predicts: "PRE", gbif: "GBIF",
      lsms_isa: "ISA", grdc: "GRDC", dhs: "DHS", mics: "MICS", lsms: "LSMS",
      "domain:Ecology": "ECO", "domain:Agriculture": "AGR",
      "domain:Hydrology": "HYD", "domain:Public Health": "PH"
    };
    return acronyms[series.id] || series.label.slice(0, 4).toUpperCase();
  }

  function donutHTML(feature, size) {
    var series = displaySeries();
    var paths = [], labels = [];
    series.forEach(function (item, index) {
      var angles = sectorAngles(series, index);
      var sectorStart = angles.start;
      var sectorEnd = angles.end;
      if (size >= 110) {
        var labelPoint = polar(21, (sectorStart + sectorEnd) / 2);
        labels.push('<text x="' + labelPoint[0] + '" y="' + labelPoint[1] +
          '" fill="#fff" stroke="#101923" stroke-width="1.35" paint-order="stroke"' +
          ' font-size="3.4" font-weight="800" text-anchor="middle" dominant-baseline="central"' +
          ' opacity="' + (item.selected ? 1 : 0.42) + '">' + escapeHTML(seriesAcronym(item)) + '</text>');
      }
      if (!item.selected) {
        paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" class="sector empty-sector"></path>');
        return;
      }
      if (!state.yearlyHistograms) {
        var value = seriesResult(item, feature.id, state.yearFrom, state.yearTo);
        var metric = item.crop ? state.agricultureMetric : item.hydro ? state.hydroMetric : (item.metric || "coverage");
        paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" fill="' +
          agricultureModel.color(value.value, metric) + '" class="sector' +
          (value.value !== null ? "" : " empty-sector") + '"><title>' + escapeHTML(item.label) + ': ' +
          agricultureModel.format(value, metric) + '</title></path>');
        return;
      }
      paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" class="sector-outline"></path>');
      var yearCount = state.yearTo - state.yearFrom + 1;
      var yearsPerBucket = 1;
      var bucketWidth = (sectorEnd - sectorStart) / yearCount;
      for (var firstYear = state.yearFrom; firstYear <= state.yearTo; firstYear += yearsPerBucket) {
        var lastYear = Math.min(state.yearTo, firstYear + yearsPerBucket - 1);
        var count = seriesResult(item, feature.id, firstYear, lastYear);
        var start = sectorStart + (firstYear - state.yearFrom) * bucketWidth;
        var end = sectorStart + (lastYear - state.yearFrom + 1) * bucketWidth;
        var bucketMetric = item.crop ? state.agricultureMetric : item.hydro ? state.hydroMetric : (item.metric || "coverage");
        var fill = agricultureModel.color(count.value, bucketMetric);
        var label = firstYear === lastYear ? String(firstYear) : firstYear + "–" + lastYear;
        paths.push('<path d="' + ringPath(start, end) + '" fill="' + fill +
          '" class="bucket' + (count.value !== null ? '' : ' empty-bucket') + '"><title>' + label + ': ' +
          agricultureModel.format(count, bucketMetric) + '</title></path>');
      }
    });
    var fontSize = Math.max(4, Math.min(9, Math.round(size * 0.105)));
    return '<div class="record-donut" style="--size:' + size + 'px;--font:' + fontSize + 'px">' +
      '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="28" class="backing"></circle>' +
      paths.join("") + labels.join("") + '<circle cx="30" cy="30" r="13" class="centre"></circle></svg><span>' +
      escapeHTML(feature.properties.name) + '</span></div>';
  }

  var recordMarkers = {};
  var recordMarkerSignatures = {};
  function markerSize() {
    var zoom = map.getZoom();
    var size = 30 + (zoom - 2) * 16;
    if (zoom > 4) size += (zoom - 4) * 12;
    if (state.yearlyHistograms) size *= 1.3;
    return Math.max(state.yearlyHistograms ? 52 : 30, Math.min(state.yearlyHistograms ? 220 : 180, size));
  }

  function renderDonuts() {
    var baseSize = markerSize();
    countryEntries.forEach(function (entry, markerIndex) {
      var feature = entry.feature, countryLayer = entry.layer;
      if (!countryInScope(feature.id)) return;
      var focused = focusedCountry === feature.id;
      var enlarged = focused;
      // Slice acronyms are rendered at 110px and above. A selected wheel therefore gets a
      // guaranteed readable size even at low map zoom, while retaining a cap on dense displays.
      var size = enlarged
        ? Math.min(280, Math.max(150, baseSize * 1.9))
        : baseSize;
      var marker = recordMarkers[markerIndex];
      var iconSignature = size + "|" + state.yearFrom + "|" + state.yearTo + "|" +
        selectedKeys().join(",") + "|" + state.groupedDonuts + "|" + state.yearlyHistograms +
        "|" + focused + "|" + agricultureSignature();
      if (!marker) {
        var icon = L.divIcon({
          className: "record-div-icon" + (enlarged ? " selected-record-icon" : ""),
          html: donutHTML(feature, size),
          iconSize: [size, size], iconAnchor: [size / 2, size / 2]
        });
        var position = MARKER_POSITIONS[feature.id] || countryLayer.getBounds().getCenter();
        marker = L.marker(position, { icon: icon, riseOnHover: true }).addTo(map);
        marker.on("click", function () { handleCountrySelection(feature); });
        marker.bindTooltip(function () { return tooltipHTML(feature); }, {
          className: "ctip leaflet-tooltip-own", direction: "top", opacity: 1
        });
        recordMarkers[markerIndex] = marker;
        recordMarkerSignatures[markerIndex] = iconSignature;
      } else if (recordMarkerSignatures[markerIndex] !== iconSignature) {
        marker.setIcon(L.divIcon({
          className: "record-div-icon" + (enlarged ? " selected-record-icon" : ""),
          html: donutHTML(feature, size),
          iconSize: [size, size], iconAnchor: [size / 2, size / 2]
        }));
        recordMarkerSignatures[markerIndex] = iconSignature;
      }
      // Leaflet adds this offset to its latitude-derived marker z-index. Keep the focused wheel in
      // a dedicated top tier above every ordinary or hover-raised marker.
      marker.setZIndexOffset(focused ? 200000 : 0);
    });
  }
  map.on("zoomend", renderDonuts);

  function selectedTotal() {
    return WORLD_GEOJSON.features.reduce(function (total, feature) {
      return total + countryCount(feature.id);
    }, 0);
  }

  function yearlyTotals() {
    var totals = {};
    for (var year = META.yearMin; year <= META.yearMax; year++) totals[year] = 0;
    selectedKeys().forEach(function (key) {
      Object.keys(DATASETS[key].records).forEach(function (iso) {
        if (!countryInScope(iso)) return;
        Object.keys(DATASETS[key].records[iso]).forEach(function (year) {
          if (totals[year] !== undefined) totals[year] += DATASETS[key].records[iso][year];
        });
      });
    });
    return totals;
  }

  function countryCoverageAssessment(feature) {
    var keys = selectedKeys();
    var scores = keys.map(function (key) {
      var density = perMillionKm2(datasetCount(key, feature.id), feature.id);
      var yearsWithRecords = 0;
      for (var year = state.yearFrom; year <= state.yearTo; year++) {
        var count = ((DATASETS[key].records[feature.id] || {})[String(year)] || 0);
        if (count) yearsWithRecords++;
      }
      return {
        key: key,
        score: agricultureModel.datasetValue(key, feature.id, state.yearFrom, state.yearTo, state.agricultureAggregation).value,
        present: density > 0,
        yearsWithRecords: yearsWithRecords
      };
    }).filter(function (item) { return item.score !== null; });
    var activeDatasetYears = scores.reduce(function (total, item) {
      return total + item.yearsWithRecords;
    }, 0);
    var possibleDatasetYears = scores.length * (state.yearTo - state.yearFrom + 1);
    return {
      feature: feature,
      score: scores.length ? scores.reduce(function (total, item) { return total + item.score; }, 0) / scores.length : 0,
      present: scores.filter(function (item) { return item.present; }).length,
      total: scores.length,
      activeDatasetYears: activeDatasetYears,
      possibleDatasetYears: possibleDatasetYears,
      gaps: scores.filter(function (item) { return item.score < 0.33; }).map(function (item) {
        return DATASETS[item.key].name;
      })
    };
  }

  function renderCoverageExamples() {
    var container = document.getElementById("coverageExamples");
    if (!container) return;
    var assessments = WORLD_GEOJSON.features.filter(function (feature) {
      return countryInScope(feature.id);
    }).map(countryCoverageAssessment).sort(function (first, second) {
      return second.score - first.score || first.feature.properties.name.localeCompare(second.feature.properties.name);
    });
    if (!selectedKeys().length) {
      container.innerHTML = '<div class="empty">Select at least one dataset to generate examples.</div>';
      return;
    }
    var strongest = assessments.slice(0, 4);
    var weakest = assessments.slice(-4).reverse();
    function group(title, examples, low) {
      return '<section class="example-group"><h3>' + title + '</h3>' + examples.map(function (item) {
        var note = item.present + ' of ' + item.total + ' selected sources contain records; records occur in ' +
          item.activeDatasetYears + ' of ' + item.possibleDatasetYears + ' possible source-years.';
        if (low && item.gaps.length) note += ' Lower or absent: ' + item.gaps.join(', ') + '.';
        return '<button type="button" class="example-country" data-example-country="' + item.feature.id +
          '"><b>' + escapeHTML(item.feature.properties.name) + '</b><small>' + escapeHTML(note) + '</small></button>';
      }).join('') + '</section>';
    }
    container.innerHTML = '<p class="examples-method">Each dataset is scored separately against the displayed DHS countries, then selected dataset scores are averaged. A score of 1 means the highest relative coverage in that dataset; it does not mean the datasets have the same type of record.</p>' +
      '<div class="example-columns">' + group('Relatively good coverage', strongest, false) +
      group('Very low coverage', weakest, true) + '</div>';
  }

  function renderHistogram() {
    if (state.detailedAgriculture || state.detailedHydro) {
      var isHydro = state.detailedHydro;
      var metric = isHydro ? state.hydroMetric : state.agricultureMetric, values = {};
      for (var y = META.yearMin; y <= META.yearMax; y++) {
        var available = [];
        Object.keys(scopeRecords).forEach(function (iso) {
          (isHydro ? agricultureModel.hydro.variableOrder : agricultureModel.agriculture.cropOrder).forEach(function (item) {
            var value = isHydro ? agricultureModel.hydroValue(iso, item, metric, y, y).value : agricultureModel.cropValue(iso, item, metric, y, y).value;
            if (value !== null) available.push(value);
          });
        });
        values[y] = available.length ? available.reduce(function (a, b) { return a + b; }, 0) / available.length : null;
      }
      var maximum = Math.max.apply(null, Object.values(values).filter(Number.isFinite).concat([1]));
      document.getElementById('yearHist').innerHTML = Object.keys(values).map(function (year) {
        var value = values[year], active = Number(year) >= state.yearFrom && Number(year) <= state.yearTo;
        return '<i class="' + (active ? 'active' : '') + '" style="height:' +
          (value === null ? 2 : Math.max(2, 100 * value / maximum)) + '%" title="' + year + ': ' +
          (value === null ? 'Unavailable' : 'Mean across available country/' + (isHydro ? 'comparison' : 'crop') + ' results: ' + value.toFixed(3) + ' ' + agricultureModel.metrics[metric].unit) + '"></i>';
      }).join('');
      return;
    }
    var totals = yearlyTotals();
    var range = positiveRange(Object.keys(totals).map(function (year) { return totals[year]; }));
    var html = "";
    Object.keys(totals).forEach(function (year) {
      var active = Number(year) >= state.yearFrom && Number(year) <= state.yearTo;
      var height = totals[year] ? Math.max(2, Math.round(100 * minMaxScore(totals[year], range))) : 2;
      html += '<i class="' + (active ? "active" : "") + '" style="height:' + height + '%" title="' +
        year + ": " + formatNumber(totals[year]) + ' ' + escapeHTML(countUnit(selectedKeys())) + '"></i>';
    });
    document.getElementById("yearHist").innerHTML = html;
  }

  function renderSummary() {
    if (state.detailedAgriculture || state.detailedHydro) {
      var selectedMetric = state.detailedHydro ? state.hydroMetric : state.agricultureMetric;
      var metric = agricultureModel.metrics[selectedMetric];
      var cropSeries = displaySeries();
      var maximum = agricultureModel.maxima[selectedMetric];
      var modeTitle = state.detailedHydro ? 'Hydrology comparisons' : 'Agriculture crops';
      document.getElementById("datasetLegend").innerHTML = '<div class="legend-group-title">' + modeTitle + ' · ' +
        escapeHTML(metric.label) + '</div>' + donutLegendHTML(cropSeries) +
        '<div class="assessment-gradient" style="background:linear-gradient(90deg,' + agricultureModel.color(0, selectedMetric) +
        ',' + agricultureModel.color(maximum || 1, selectedMetric) + ')"></div>' +
        '<div class="assessment-gradient-labels"><span>0 ' + metric.unit + '</span><span>' +
        (maximum ? maximum.toFixed(2) + ' ' + metric.unit : 'No available values') + '</span></div>' +
        '<p class="timeline-note">Each available map is transferred to the same country grid and converted to country-normalised shares before the metric is calculated. ' +
        escapeHTML(metric.note) + ' Grey = unavailable.</p>';
      document.getElementById("recordTotal").textContent = metric.label;
      document.getElementById("legendMax").textContent = "Grey = unavailable";
      document.getElementById("mapCaption").textContent = modeTitle + ' · ' + metric.label + ' · ' +
        state.yearFrom + '–' + state.yearTo + (state.yearlyHistograms ? ' · annual bins' : ' · selected window');
      document.getElementById("coverageExamples").innerHTML = '';
      return;
    }
    var keys = selectedKeys();
    var legendSeries = displaySeries();
    document.getElementById("datasetLegend").innerHTML =
      (state.groupedDonuts ? '<div class="legend-group-title">Grouped by category</div>' :
        '<div class="legend-group-title">Individual datasets</div>') + donutLegendHTML(legendSeries) +
      '<div class="legend-group-title count-scale-title">Relative coverage within each dataset</div>' +
      '<div class="assessment-gradient"></div><div class="assessment-gradient-labels">' +
      '<span>Lower</span><span>Mid-range</span><span>Higher</span></div>' +
      '<p class="timeline-note">Coverage combines a dataset\'s counted units per million km² (60%) and years with records (40%). Each dataset is scored separately, because its counted unit may be records, surveys, or station-years. <button type="button" class="coverage-info-button" id="coverageInfoButton" aria-label="Learn how coverage scores are calculated" title="How coverage scores are calculated">i</button></p>' +
      '<div class="dataset-legend-grid">' + legendSeries.map(function (series) {
      var identity = state.groupedDonuts
        ? '<span class="legend-category-swatches">' + series.keys.map(function (key) {
          return '<i style="background:' + DATASETS[key].color + ';opacity:' + (state.selected[key] ? 1 : 0.25) + '"></i>';
        }).join("") + '</span>'
        : '<i class="identity-key" style="background:' + identityGradient(series) + '"></i>';
      return '<div class="dataset-legend-row" style="opacity:' + (series.selected ? 1 : 0.4) +
        '">' + identity + '<span class="legend-series-name' + (state.groupedDonuts ? ' category-name' : '') + '">' +
        escapeHTML(series.label) +
        '</span></div>';
    }).join("") + '</div>' + (state.yearlyHistograms
      ? '<p class="timeline-note">Each sector runs from the first selected year to the last, with one mark per year. Zoom in or select a country to enlarge its donut.</p>'
      : '') + '<details class="count-unit-guide"><summary>What does each count mean?</summary>' +
      datasetOrder.map(function (key) {
        var dataset = DATASETS[key];
        return '<div><b><i style="background:' + dataset.color + '"></i>' + escapeHTML(dataset.name) +
          '</b><span><strong>' + escapeHTML(dataset.unit) + ':</strong> ' +
          escapeHTML(dataset.description) + '.</span></div>';
      }).join("") + '</details>';
    document.getElementById("recordTotal").textContent = formatNumber(selectedTotal()) + " " + countUnit(keys);
    document.getElementById("legendMax").textContent = "Grey = unavailable or off";
    document.getElementById("mapCaption").textContent =
      (keys.length ? keys.length + " selected dataset" + (keys.length === 1 ? "" : "s") : "No datasets") +
      " · " + state.yearFrom + "–" + state.yearTo + " · " +
      (state.yearlyHistograms ? "yearly " : "") +
      (state.groupedDonuts ? "category radial sectors" : "dataset radial sectors");
    renderCoverageExamples();
    renderCoverageMethod();
  }

  function renderCoverageMethod() {
    var list = document.getElementById('coverageMethodList');
    if (!list) return;
    function formula(unit) {
      var label = escapeHTML(unit);
      return '<div class="coverage-formula"><b>Formula</b><span>α × log(1 + ' + label +
        ' per 1 million km²) ÷ log(1 + highest density in the DHS-country pool) + β × years with ' +
        label + ' ÷ selected years</span></div>';
    }
    list.innerHTML = datasetOrder.map(function (key) {
      var dataset = DATASETS[key];
      var content = key === 'agriculture_maps'
        ? (state.agricultureAggregation === 'coverage'
          ? '<p><strong>Counted unit:</strong> distinct reporting administrative units: the reconciled census evidence behind the crop maps. A unit is counted once per country-year, even when it supports more than one crop or product.</p>' + formula('reporting administrative units')
          : '<p>The selected map metric is precomputed for every country and year by combining the available crop comparisons. Dispersion, similarity and source availability are equal-weight means across crops; effective resolution is the largest crop result.</p>' +
            '<p>Dispersion is the default. It is the average native-cell CV after each product map is converted to a share of that country’s mapped total. Zero means the products place crop area in the same pattern; larger values mean their placement differs.</p>')
        : '<p><strong>Counted unit:</strong> ' + escapeHTML(dataset.unit) + '. ' + escapeHTML(dataset.description) + '.</p>' + formula(dataset.unit);
      return '<section><h3><i style="background:' + dataset.color + '"></i>' + escapeHTML(dataset.name) + '</h3>' + content + '</section>';
    }).join('');
  }

  function syncHash() {
    var params = new URLSearchParams();
    params.set("v", "8");
    params.set("datasets", selectedKeys().join(","));
    params.set("from", state.yearFrom);
    params.set("to", state.yearTo);
    params.set("hist", state.yearlyHistograms ? "1" : "0");
    params.set("group", state.groupedDonuts ? "categories" : "datasets");
    params.set("agriculture", state.detailedAgriculture ? "1" : "0");
    params.set("hydro", state.detailedHydro ? "1" : "0");
    params.set("metric", state.agricultureMetric);
    params.set("hydroMetric", state.hydroMetric);
    params.set("lsmsEstimates", state.includeLsmsEstimates ? "1" : "0");
    params.set("aggr", state.agricultureAggregation);
    try { history.replaceState(null, "", "#" + params.toString()); } catch (error) { /* file:// */ }
  }

  function loadHash() {
    if (!location.hash) return;
    var params = new URLSearchParams(location.hash.slice(1));
    if (params.has("datasets")) {
      var requested = params.get("datasets").split(",");
      // Older links predate one or more datasets. Preserve their explicit
      // selections while leaving newly introduced datasets selected by default.
      var linkVersion = params.get("v");
      datasetOrder.forEach(function (key) {
        var isCropSource = ["mapspam", "gaez", "mirca2000", "mirca_os"].indexOf(key) !== -1;
        var isMapAggregate = key === 'agriculture_maps' || key === 'hydro_maps';
        var existedWhenShared = linkVersion === "8" || (!isMapAggregate && (linkVersion === "7" || (linkVersion === "6" || (!isCropSource && (linkVersion === "5" || (key !== "grdc" && (linkVersion === "4" ||
          ((linkVersion === "2" || linkVersion === "3") && key !== "mics") ||
          (!linkVersion && key !== "dhs" && key !== "mics"))))))));
        if (existedWhenShared)
          state.selected[key] = requested.indexOf(key) !== -1 || (key === 'agriculture_maps' && requested.indexOf('crop_agriculture') !== -1);
      });
    }
    var from = Number(params.get("from")), to = Number(params.get("to"));
    if (params.has("from") && Number.isFinite(from))
      state.yearFrom = Math.max(META.yearMin, Math.min(META.yearMax, Math.round(from)));
    if (params.has("to") && Number.isFinite(to))
      state.yearTo = Math.max(META.yearMin, Math.min(META.yearMax, Math.round(to)));
    if (state.yearFrom > state.yearTo) state.yearFrom = state.yearTo;
    if (params.has("hist")) state.yearlyHistograms = params.get("hist") === "1";
    if (params.has("group")) state.groupedDonuts = params.get("group") === "categories";
    state.detailedAgriculture = params.get('agriculture') === '1';
    state.detailedHydro = params.get('hydro') === '1' && !state.detailedAgriculture;
    if (params.has('lsmsEstimates')) state.includeLsmsEstimates = params.get('lsmsEstimates') !== '0';
    if (['dispersion', 'resolution', 'similarity', 'availability', 'coverage'].indexOf(params.get('metric')) !== -1) state.agricultureMetric = params.get('metric');
    if (['dispersion', 'resolution', 'similarity', 'availability'].indexOf(params.get('hydroMetric')) !== -1) state.hydroMetric = params.get('hydroMetric');
    if (['dispersion', 'resolution', 'similarity', 'availability', 'coverage'].indexOf(params.get('aggr')) !== -1) state.agricultureAggregation = params.get('aggr');
  }

  var renderSignatures = {};
  var redrawFrame = null;
  function redraw() {
    if (appliedEstimateMode !== state.includeLsmsEstimates) {
      appliedEstimateMode = state.includeLsmsEstimates;
      DATASETS = appliedEstimateMode ? estimatedDatasets : observedDatasets;
      rebuildRecordPrefixes();
      datasetCountCache.clear(); countryCountCache.clear(); scaleCache.clear();
      agricultureModel = DataDesertsScores.create(DATASETS,
        typeof AGRICULTURE === 'undefined' ? undefined : AGRICULTURE,
        WORLD_GEOJSON.features, Object.keys(scopeRecords),
        typeof HYDRO === 'undefined' ? undefined : HYDRO);
      renderFilters();
    }
    var selected = selectedKeys().join(",");
    var dataSignature = state.yearFrom + "|" + state.yearTo + "|" + selected + "|" + agricultureSignature();
    var seriesSignature = dataSignature + "|" + state.groupedDonuts;
    var donutSignature = seriesSignature + "|" + state.yearlyHistograms + "|" + focusedCountry;
    var controlsSignature = state.yearFrom + "|" + state.yearTo + "|" +
      state.groupedDonuts + "|" + state.yearlyHistograms + "|" + agricultureSignature();

    if (renderSignatures.scale !== seriesSignature) {
      recomputeScale();
      renderSignatures.scale = seriesSignature;
    }
    if (renderSignatures.countries !== dataSignature) {
      countries.setStyle(countryStyle);
      renderSignatures.countries = dataSignature;
    }
    if (renderSignatures.donuts !== donutSignature) {
      renderDonuts();
      renderSignatures.donuts = donutSignature;
    }
    if (renderSignatures.histogram !== dataSignature) {
      renderHistogram();
      renderSignatures.histogram = dataSignature;
    }
    if (renderSignatures.summary !== donutSignature) {
      renderSummary();
      renderSignatures.summary = donutSignature;
    }
    if (renderSignatures.controls !== controlsSignature) {
      updateYearControls();
      renderSignatures.controls = controlsSignature;
    }
    syncHash();
    if (renderSignatures.detail !== seriesSignature &&
        document.getElementById("detail").style.display === "block") {
      var iso = document.getElementById("detail").dataset.iso;
      var feature = WORLD_GEOJSON.features.find(function (item) { return item.id === iso; });
      if (feature) openDetail(feature);
    }
    renderSignatures.detail = seriesSignature;
  }

  function scheduleRedraw() {
    if (redrawFrame !== null) return;
    redrawFrame = window.requestAnimationFrame(function () {
      redrawFrame = null;
      redraw();
    });
  }

  function renderFilters() {
    var container = document.getElementById("datasetFilters");
    container.innerHTML = "";
    categoryOrder().forEach(function (domain) {
      var keys = datasetOrder.filter(function (key) { return DATASETS[key].domain === domain; });
      var selectedCount = keys.filter(function (key) { return state.selected[key]; }).length;
      var categoryTotal = keys.reduce(function (total, key) {
        return total + DATASETS[key].scopeSummary.records;
      }, 0);
      var group = document.createElement("div");
      group.className = "category-group";
      var categoryLabel = document.createElement("label");
      categoryLabel.className = "category-filter";
      categoryLabel.innerHTML = '<input type="checkbox"><b>' + escapeHTML(domain) + '</b><span class="count">' +
        selectedCount + '/' + keys.length + ' · ' + formatNumber(categoryTotal) + '</span>';
      var categoryCheckbox = categoryLabel.querySelector("input");
      categoryCheckbox.checked = selectedCount === keys.length;
      categoryCheckbox.indeterminate = selectedCount > 0 && selectedCount < keys.length;
      categoryCheckbox.onchange = function () {
        keys.forEach(function (key) { state.selected[key] = categoryCheckbox.checked; });
        renderFilters();
        redraw();
      };
      group.appendChild(categoryLabel);

      var datasetsContainer = document.createElement("div");
      datasetsContainer.className = "category-datasets";
      keys.forEach(function (key) {
        var dataset = DATASETS[key];
        var label = document.createElement("label");
        label.className = "dataset-filter";
        label.innerHTML = '<input type="checkbox"><span class="swatch" style="background:' + dataset.color + '"></span>' +
          '<span><b>' + escapeHTML(dataset.name) + '</b><small>' + escapeHTML(dataset.description) + '</small></span>' +
          '<span class="count">' + formatNumber(dataset.scopeSummary.records) + '</span>';
        var checkbox = label.querySelector("input");
        checkbox.checked = state.selected[key];
        checkbox.onchange = function () {
          state.selected[key] = checkbox.checked;
          renderFilters();
          redraw();
        };
        datasetsContainer.appendChild(label);
      });
      group.appendChild(datasetsContainer);
      container.appendChild(group);
    });
  }

  var yearFrom = document.getElementById("yearFrom");
  var yearTo = document.getElementById("yearTo");
  var yearRangeControl = document.getElementById("yearRangeControl");
  var yearRangeSelected = document.getElementById("yearRangeSelected");
  var yearlyBucketsToggle = document.getElementById("yearlyBucketsToggle");
  var groupingToggle = document.getElementById("groupingToggle");
  [yearFrom, yearTo].forEach(function (handle) {
    handle.setAttribute("aria-valuemin", META.yearMin);
    handle.setAttribute("aria-valuemax", META.yearMax);
  });
  document.getElementById("yearMinLabel").textContent = META.yearMin;
  document.getElementById("yearMaxLabel").textContent = META.yearMax;

  function updateYearControls() {
    var span = META.yearMax - META.yearMin || 1;
    var fromPosition = 100 * (state.yearFrom - META.yearMin) / span;
    var toPosition = 100 * (state.yearTo - META.yearMin) / span;
    yearFrom.style.left = fromPosition + "%";
    yearTo.style.left = toPosition + "%";
    yearRangeSelected.style.left = fromPosition + "%";
    yearRangeSelected.style.width = (toPosition - fromPosition) + "%";
    yearFrom.setAttribute("aria-valuenow", state.yearFrom);
    yearTo.setAttribute("aria-valuenow", state.yearTo);
    yearFrom.dataset.value = state.yearFrom;
    yearTo.dataset.value = state.yearTo;
    yearlyBucketsToggle.classList.toggle("active", state.yearlyHistograms);
    yearlyBucketsToggle.setAttribute("aria-pressed", state.yearlyHistograms);
    yearlyBucketsToggle.setAttribute("aria-label",
      (state.yearlyHistograms ? "Disable" : "Enable") + " annual time bins");
    yearlyBucketsToggle.title = state.yearlyHistograms
      ? "Currently showing annual time bins — switch to the aggregated view"
      : "Currently showing the aggregated view — split each dataset sector into annual time bins";
    groupingToggle.classList.toggle("active", state.groupedDonuts);
    groupingToggle.setAttribute("aria-pressed", state.groupedDonuts);
    groupingToggle.setAttribute("aria-label", state.groupedDonuts
      ? "Show individual dataset radial sectors" : "Group radial sectors by category");
    groupingToggle.title = state.groupedDonuts
      ? "Currently grouped by category — switch to individual dataset sectors"
      : "Currently showing individual datasets — group radial sectors by category";
    var detailMode = state.detailedAgriculture || state.detailedHydro;
    var mapAggregateSelected = state.selected.agriculture_maps || state.selected.hydro_maps;
    groupingToggle.disabled = detailMode || mapAggregateSelected;
    groupingToggle.classList.toggle('active', groupedDisplay());
    groupingToggle.setAttribute('aria-pressed', groupedDisplay());
    if (detailMode || mapAggregateSelected) groupingToggle.title = 'Category grouping is unavailable while map-comparison aggregates are shown';
    document.getElementById('lsmsEstimatesToggle').checked = state.includeLsmsEstimates;
    document.getElementById('lsmsEstimatesToggle').disabled = detailMode;
    document.getElementById('agricultureToggle').setAttribute('aria-pressed', state.detailedAgriculture);
    document.getElementById('agricultureToggle').classList.toggle('active', state.detailedAgriculture);
    document.getElementById('agricultureMetricControl').hidden = !state.detailedAgriculture;
    document.getElementById('hydroToggle').setAttribute('aria-pressed', state.detailedHydro);
    document.getElementById('hydroToggle').classList.toggle('active', state.detailedHydro);
    document.getElementById('hydroMetricControl').hidden = !state.detailedHydro;
    document.getElementById('agricultureAggregationControl').hidden = detailMode;
    document.getElementById('agricultureMetric').value = state.agricultureMetric;
    document.getElementById('hydroMetric').value = state.hydroMetric;
    document.getElementById('agricultureAggregation').value = state.agricultureAggregation;
    document.querySelectorAll('#datasetFilters input, #selectAll, #selectNone').forEach(function (input) { input.disabled = detailMode; });
    document.getElementById("yearRangeVal").textContent = state.yearFrom + "–" + state.yearTo;
  }

  function setHandleYear(handle, year) {
    year = Math.max(META.yearMin, Math.min(META.yearMax, Math.round(year)));
    if (handle === yearFrom) state.yearFrom = Math.min(year, state.yearTo);
    else state.yearTo = Math.max(year, state.yearFrom);
    scheduleRedraw();
  }

  function yearAtPointer(clientX) {
    var bounds = yearRangeControl.getBoundingClientRect();
    var amount = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return META.yearMin + amount * (META.yearMax - META.yearMin);
  }

  function bindHandle(handle) {
    handle.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");
      setHandleYear(handle, yearAtPointer(event.clientX));
    });
    handle.addEventListener("pointermove", function (event) {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      setHandleYear(handle, yearAtPointer(event.clientX));
    });
    function finishDrag(event) {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      handle.classList.remove("dragging");
    }
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
    handle.addEventListener("keydown", function (event) {
      var current = handle === yearFrom ? state.yearFrom : state.yearTo;
      var next;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + 1;
      else if (event.key === "PageDown") next = current - 10;
      else if (event.key === "PageUp") next = current + 10;
      else if (event.key === "Home") next = META.yearMin;
      else if (event.key === "End") next = META.yearMax;
      else return;
      event.preventDefault();
      setHandleYear(handle, next);
    });
  }
  bindHandle(yearFrom); bindHandle(yearTo);
  yearRangeControl.addEventListener("pointerdown", function (event) {
    if (event.target === yearFrom || event.target === yearTo) return;
    var year = yearAtPointer(event.clientX);
    var handle = Math.abs(year - state.yearFrom) <= Math.abs(year - state.yearTo) ? yearFrom : yearTo;
    handle.focus();
    setHandleYear(handle, year);
  });
  yearlyBucketsToggle.onclick = function () {
    state.yearlyHistograms = !state.yearlyHistograms;
    redraw();
  };
  groupingToggle.onclick = function () {
    if (state.detailedAgriculture || state.detailedHydro) return;
    state.groupedDonuts = !state.groupedDonuts;
    redraw();
  };
  document.getElementById('lsmsEstimatesToggle').onchange = function (event) {
    state.includeLsmsEstimates = event.target.checked; redraw();
  };
  document.getElementById('agricultureToggle').onclick = function () {
    state.detailedAgriculture = !state.detailedAgriculture;
    if (state.detailedAgriculture) state.detailedHydro = false;
    redraw();
  };
  document.getElementById('hydroToggle').onclick = function () {
    state.detailedHydro = !state.detailedHydro;
    if (state.detailedHydro) state.detailedAgriculture = false;
    redraw();
  };
  document.getElementById('agricultureMetric').onchange = function (event) { state.agricultureMetric = event.target.value; redraw(); };
  document.getElementById('hydroMetric').onchange = function (event) { state.hydroMetric = event.target.value; redraw(); };
  document.getElementById('agricultureAggregation').onchange = function (event) { state.agricultureAggregation = event.target.value; redraw(); };
  document.getElementById("selectAll").onclick = function () {
    datasetOrder.forEach(function (key) { state.selected[key] = true; }); renderFilters(); redraw();
  };
  document.getElementById("selectNone").onclick = function () {
    datasetOrder.forEach(function (key) { state.selected[key] = false; }); renderFilters(); redraw();
  };

  function yearStrip(key, iso) {
    var years = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) years.push(year);
    return '<div class="year-strip" style="grid-template-columns:repeat(' + years.length + ',1fr)">' +
      years.map(function (year) {
        var count = (DATASETS[key].records[iso] || {})[String(year)] || 0;
        var value = agricultureModel.datasetValue(key, iso, year, year, state.agricultureAggregation);
        return '<i title="' + year + ': ' + formatNumber(count) + ' ' + escapeHTML(DATASETS[key].unit) +
          ' &rarr; ' + agricultureModel.formatCoverageScore(value) + '" style="background:' +
          agricultureModel.color(value.value, 'coverage') + '"></i>';
      }).join("") + '</div><div class="year-axis"><span>' + state.yearFrom + '</span><span>' + state.yearTo + '</span></div>';
  }

  function seriesYearStrip(series, iso) {
    var years = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) years.push(year);
    return '<div class="year-strip" style="grid-template-columns:repeat(' + years.length + ',1fr)">' +
      years.map(function (year) {
        var count = seriesYearCount(series, iso, year);
        var value = seriesResult(series, iso, year, year);
        return '<i title="' + year + ': ' + formatNumber(count) + ' ' + escapeHTML(countUnit(series.keys)) +
          ' &rarr; ' + agricultureModel.formatCoverageScore(value) + '" style="background:' +
          agricultureModel.color(value.value, 'coverage') + '"></i>';
      }).join("") + '</div><div class="year-axis"><span>' + state.yearFrom + '</span><span>' + state.yearTo + '</span></div>';
  }

  function cropResolution(dataset, iso) {
    if (!dataset.spatialSupport) return "";
    var years = (dataset.effective_resolution_km || {})[iso] || {};
    var values = [];
    var missing = false;
    Object.keys(dataset.records[iso] || {}).forEach(function (year) {
      if (+year < state.yearFrom || +year > state.yearTo) return;
      var crops = Object.values(years[year] || {});
      if (!crops.length) missing = true;
      crops.forEach(function (value) {
        if (!Number.isFinite(value) || value <= 0) missing = true;
        else values.push(value);
      });
    });
    return missing || !values.length
      ? "Effective resolution unavailable for this selection; raster detail is withheld."
      : "Minimum raster cell width for this selection: " + Math.max.apply(null, values).toFixed(1) +
        " km (map country curves). Country summaries do not show within-country allocation.";
  }

  function lsmsEstimationNote(iso) {
    function sum(records) { return Object.keys(records[iso] || {}).reduce(function (total, year) {
      return total + (+year >= state.yearFrom && +year <= state.yearTo ? records[iso][year] : 0);
    }, 0); }
    var observed = sum(observedDatasets.lsms.records), estimated = sum(observedDatasets.lsms.estimatedRecords || {});
    return '<p class="unit-explanation">' + formatNumber(observed) + ' observed roster records; ' +
      formatNumber(estimated) + ' estimated household members ' + (state.includeLsmsEstimates ? 'included' : 'available but excluded') +
      '. Estimates multiply reviewed household counts by a cited household-size mean; they are not interview counts.</p>';
  }

  function datasetDetailHTML(key, iso, nested) {
    var dataset = DATASETS[key], count = datasetCount(key, iso);
    var score = agricultureModel.datasetValue(key, iso, state.yearFrom, state.yearTo, state.agricultureAggregation);
    if (key === 'agriculture_maps') {
      var result = agricultureModel.aggregateValue(iso, state.agricultureAggregation, state.yearFrom, state.yearTo);
      var method = agricultureModel.metrics[state.agricultureAggregation].label;
      return '<div class="dataset-detail"><h3>Agricultural map support</h3><p>' + method + ': ' +
        agricultureModel.format(result, state.agricultureAggregation) + '</p><p class="unit-explanation">' +
        result.available + ' of ' + result.expected + (state.agricultureAggregation === 'coverage' ? ' years have reporting-unit evidence.' : ' years have precomputed crop aggregates.') + '</p>' +
        (state.agricultureAggregation === 'dispersion' ? '<p class="unit-explanation">A coefficient of variation is the standard deviation divided by the mean difference between map products. Zero means the products place crop area in the same pattern; larger values mean their placement differs.</p>' : '') +
        agricultureYearStrip(iso, null) + '</div>';
    }
    if (key === 'hydro_maps') {
      var hydroResult = agricultureModel.hydroValue(iso, 'overall', 'dispersion', state.yearFrom, state.yearTo);
      return '<div class="dataset-detail"><h3>Hydrology map support</h3><p>Overall allocation dispersion (coefficient of variation): ' +
        agricultureModel.format(hydroResult, 'dispersion') + '</p><p class="unit-explanation">' +
        hydroResult.available + ' of ' + hydroResult.expected + ' selected years have precomputed map comparisons.</p>' +
        '<p class="unit-explanation">A coefficient of variation is the standard deviation divided by the mean difference between the map products. Zero means the products place the mapped quantity in the same pattern; larger values mean their placement differs.</p>' +
        hydroYearStrip(iso, 'overall') + '</div>';
    }
    if (key === "dhs") {
      var years = (dataset.surveyYears[iso] || []).filter(function (entry) {
        return entry.year >= state.yearFrom && entry.year <= state.yearTo;
      });
      return '<div class="dataset-detail' + (nested ? ' nested' : '') + '"><h3><i style="background:' +
        dataset.color + '"></i><a href="' + dataset.url + '" target="_blank" rel="noopener" style="color:inherit">DHS</a></h3>' +
        '<p>' + formatNumber(count) + ' survey' + (count === 1 ? '' : 's') + ' in this window &rarr; ' +
        agricultureModel.formatCoverageScore(score) + '</p><p>Survey years in this window</p>' + (years.length
          ? '<ul class="survey-years" aria-label="DHS survey years">' + years.map(function (entry) {
            var nutrition = entry.nutrition === true;
            var title = entry.surveyCount + ' survey' + (entry.surveyCount === 1 ? '' : 's') +
              ' (' + entry.surveyTypes.join(', ') + '); ' + (nutrition
                ? 'Nutrition: ' + entry.nutritionTopics.join('; ')
                : 'Nutrition not confirmed in DHS metadata');
            return '<li class="survey-year' + (nutrition ? ' has-nutrition' : '') + '" title="' +
              escapeHTML(title) + '">' + escapeHTML(entry.label) + (nutrition
                ? ' <span class="nutrition-label">Nutrition</span>' : '') + '</li>';
          }).join('') + '</ul>'
          : '<p class="empty">No DHS surveys in this window.</p>') +
        '<p class="unit-explanation">' + escapeHTML(dataset.nutritionDefinition) +
        '.</p><p class="unit-explanation">Survey ranges show fieldwork years; filters and charts use the principal survey year. Each survey counts once, regardless of its individual or household files.</p></div>';
    }
    return '<div class="dataset-detail' + (nested ? ' nested' : '') + '"><h3><i style="background:' +
      dataset.color + '"></i><a href="' + dataset.url + '" target="_blank" rel="noopener" style="color:inherit">' +
      escapeHTML(dataset.name) + '</a></h3><p>' + formatNumber(count) + ' ' + escapeHTML(dataset.unit) +
      ' in this window &rarr; ' + agricultureModel.formatCoverageScore(score) + '</p><p class="unit-explanation">' + escapeHTML(dataset.description) +
      '.</p>' + (key === 'lsms' ? lsmsEstimationNote(iso) : '') + (dataset.spatialSupport ? '<p class="unit-explanation">' + escapeHTML(cropResolution(dataset, iso)) + '</p>' : '') + yearStrip(key, iso) + '</div>';
  }

  function categoryDetailHTML(series, iso) {
    var keys = series.keys.filter(function (key) { return state.selected[key]; });
    var score = seriesResult(series, iso, state.yearFrom, state.yearTo);
    var swatches = keys.map(function (key) {
      return '<i style="background:' + DATASETS[key].color + '"></i>';
    }).join("");
    return '<section class="category-detail"><h3><span class="category-swatches">' + swatches + '</span>' +
      escapeHTML(series.label) + '</h3><p>' + formatNumber(seriesCount(series, iso)) +
      ' ' + escapeHTML(countUnit(keys)) + ' in this window &rarr; ' +
      agricultureModel.formatCoverageScore(score) + '</p>' + seriesYearStrip(series, iso) +
      '<details class="dataset-breakdown"><summary>Show dataset details</summary>' +
      keys.map(function (key) { return datasetDetailHTML(key, iso, true); }).join("") + '</details></section>';
  }

  function countryDetailHTML(iso) {
    if ((state.detailedAgriculture || state.detailedHydro) && countryInScope(iso)) return displaySeries().map(function (item) {
        var value = seriesResult(item, iso, state.yearFrom, state.yearTo);
        var metric = item.hydro ? state.hydroMetric : state.agricultureMetric;
        var bars = [];
        for (var year = state.yearFrom; year <= state.yearTo; year++) {
          var annual = seriesResult(item, iso, year, year);
          bars.push('<i style="background:' + agricultureModel.color(annual.value, metric) + '" title="' + year + ': ' + agricultureModel.format(annual, metric) + '"></i>');
        }
        return '<div class="dataset-detail"><h3>' + escapeHTML(item.label) + '</h3><p>' +
          agricultureModel.format(value, metric) + '</p><small>' + value.available +
          ' of ' + value.expected + ' selected years have results.</small><div class="agriculture-years">' + bars.join('') + '</div></div>';
      }).join('');
    var keys = selectedKeys();
    return !countryInScope(iso)
      ? '<div class="empty">Records are shown only for countries with DHS survey data.</div>'
      : keys.length ? coverageSummaryHTML(iso) + (state.groupedDonuts
        ? displaySeries().filter(function (series) { return series.selected; }).map(function (series) {
          return categoryDetailHTML(series, iso);
        }).join("")
        : keys.map(function (key) { return datasetDetailHTML(key, iso, false); }).join(""))
      : '<div class="empty">Select at least one dataset to see its records.</div>';
  }

  function coverageSummaryHTML(iso) {
    var assessed = selectedKeys().map(function (key) {
      return { key: key, score: agricultureModel.datasetValue(key, iso, state.yearFrom, state.yearTo, state.agricultureAggregation).value };
    }).filter(function (item) { return item.score !== null; });
    if (!assessed.length) return '<section class="coverage-profile"><h3>Coverage unavailable</h3><p>No verified results for the selected sources and years.</p></section>';
    var wellCovered = assessed.filter(function (item) { return item.score >= 0.66; });
    var gaps = assessed.filter(function (item) { return item.score < 0.33; });
    var headline = wellCovered.length === assessed.length
      ? "Broad coverage across selected sources"
      : gaps.length ? "Coverage gaps across selected sources" : "Mixed coverage across selected sources";
    var detail = gaps.length
      ? "Lower or absent relative coverage: " + gaps.map(function (item) {
        return DATASETS[item.key].name;
      }).join(", ") + "."
      : "No selected source falls in the lower third of the displayed coverage scale.";
    return '<section class="coverage-profile"><h3>' + headline + '</h3><p>' + escapeHTML(detail) +
      '</p><small>For each dataset, coverage combines its counted units per million km² (60%) and years with records (40%), relative to the DHS-country pool.</small></section>';
  }

  function agricultureYearStrip(iso, crop) {
    var metric = crop ? state.agricultureMetric : state.agricultureAggregation, bars = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) {
      var value = crop ? agricultureModel.cropValue(iso, crop, metric, year, year)
        : agricultureModel.aggregateValue(iso, state.agricultureAggregation, year, year);
      bars.push('<i style="background:' + agricultureModel.color(value.value, metric) + '" title="' +
        year + ': ' + agricultureModel.format(value, metric) + '"></i>');
    }
    return '<div class="agriculture-years">' + bars.join('') + '</div>';
  }

  function hydroYearStrip(iso, variable) {
    var metric = 'dispersion', bars = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) {
      var value = agricultureModel.hydroValue(iso, variable, metric, year, year);
      bars.push('<i style="background:' + agricultureModel.color(value.value, metric) + '" title="' +
        year + ': ' + agricultureModel.format(value, metric) + '"></i>');
    }
    return '<div class="agriculture-years">' + bars.join('') + '</div>';
  }

  function openDetail(feature) {
    var iso = feature.id, panel = document.getElementById("detail");
    panel.dataset.iso = iso;
    document.getElementById("detailName").textContent = feature.properties.name;
    document.getElementById("detailMeta").textContent = countryInScope(iso)
      ? formatNumber(countryCount(iso)) + " selected " + countUnit(selectedKeys())
      : "Outside DHS survey-coverage scope";
    document.getElementById("detailBody").innerHTML = countryDetailHTML(iso);
    panel.style.display = "block";
  }

  function handleCountrySelection(feature) {
    focusedCountry = feature.id;
    renderDonuts();
    openDetail(feature);
  }
  document.getElementById("detailClose").onclick = function () {
    document.getElementById("detail").style.display = "none";
    focusedCountry = null; renderDonuts();
  };

  var regions = [
    { name: "World", view: function () { map.setView([25, 15], 4); } },
    { name: "Africa", bounds: [[-35, -20], [38, 52]] },
    { name: "Asia", bounds: [[2, 38], [55, 150]] },
    { name: "Europe", bounds: [[34, -12], [70, 45]] },
    { name: "Americas", bounds: [[-55, -110], [62, -34]] }
  ];
  regions.forEach(function (region, index) {
    var button = document.createElement("button"); button.textContent = region.name;
    if (!index) button.className = "active";
    button.onclick = function () {
      document.querySelectorAll("#regions button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      if (region.view) region.view(); else map.fitBounds(region.bounds);
    };
    document.getElementById("regions").appendChild(button);
  });

  var countryByName = {}, countryList = document.getElementById("countryList");
  WORLD_GEOJSON.features.slice().sort(function (a, b) { return a.properties.name.localeCompare(b.properties.name); })
    .forEach(function (feature) {
      countryByName[feature.properties.name.toLowerCase()] = feature;
      var option = document.createElement("option"); option.value = feature.properties.name; countryList.appendChild(option);
    });
  function searchCountry() {
    var feature = countryByName[document.getElementById("search").value.trim().toLowerCase()];
    if (!feature) return;
    var entry = countryEntries.find(function (item) { return item.feature === feature; });
    if (entry) map.fitBounds(entry.layer.getBounds(), { maxZoom: 5 });
    openDetail(feature);
  }
  document.getElementById("search").onchange = searchCountry;
  document.getElementById("search").onkeydown = function (event) { if (event.key === "Enter") searchCountry(); };

  function toast(message) {
    var element = document.getElementById("toast"); element.textContent = message; element.classList.add("show");
    clearTimeout(element.timer); element.timer = setTimeout(function () { element.classList.remove("show"); }, 2200);
  }
  document.getElementById("shareButton").onclick = function () {
    syncHash();
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast("View link copied"); }, function () { toast("Copy the URL from the address bar"); });
    } else toast("Copy the URL from the address bar");
  };

  function setCoverage(open) {
    var modal = document.getElementById("coverageModal");
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) document.getElementById("coverageClose").focus();
  }
  document.getElementById("coverageButton").onclick = function () { setCoverage(true); };
  document.getElementById("coverageClose").onclick = function () { setCoverage(false); };
  document.getElementById("coverageModal").onclick = function (event) {
    if (event.target === event.currentTarget) setCoverage(false);
  };
  function setCoverageInfo(open) {
    var modal = document.getElementById("coverageInfoModal");
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) document.getElementById("coverageInfoClose").focus();
  }
  document.getElementById("datasetLegend").onclick = function (event) {
    if (event.target.closest("#coverageInfoButton")) setCoverageInfo(true);
  };
  document.getElementById("coverageInfoClose").onclick = function () { setCoverageInfo(false); };
  document.getElementById("coverageInfoModal").onclick = function (event) {
    if (event.target === event.currentTarget) setCoverageInfo(false);
  };
  document.getElementById("coverageExamples").onclick = function (event) {
    var button = event.target.closest("[data-example-country]");
    if (!button) return;
    var feature = WORLD_GEOJSON.features.find(function (item) {
      return item.id === button.dataset.exampleCountry;
    });
    if (!feature) return;
    setCoverage(false);
    var entry = countryEntries.find(function (item) { return item.feature === feature; });
    if (entry) map.fitBounds(entry.layer.getBounds(), { maxZoom: 5 });
    handleCountrySelection(feature);
  };

  function setLicences(open) {
    var modal = document.getElementById("licencesModal");
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) document.getElementById("licencesClose").focus();
  }
  document.getElementById("licencesButton").onclick = function () { setLicences(true); };
  document.getElementById("licencesClose").onclick = function () { setLicences(false); };
  document.getElementById("licencesModal").onclick = function (event) {
    if (event.target === event.currentTarget) setLicences(false);
  };
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { setLicences(false); setCoverage(false); setCoverageInfo(false); }
  });

  loadHash();
  renderFilters();
  redraw();
})();
