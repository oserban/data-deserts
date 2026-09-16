/* Data Deserts — country/year coverage across the generated dataset inventory. */
(function () {
  "use strict";

  var datasetOrder = META.datasetOrder;
  var focusedCountry = null;
  var scopeDatasets = META.scopeDatasets || [META.scopeDataset];
  var scopeRecords = {};
  scopeDatasets.forEach(function (key) {
    Object.keys(DATASETS[key].records).forEach(function (iso) { scopeRecords[iso] = true; });
  });
  var state = {
    yearFrom: META.yearMin, yearTo: META.yearMax, selected: {},
    yearlyHistograms: false, groupedDonuts: false
  };
  // Bounding-box centres are unsuitable for antimeridian-spanning countries.
  // Keep their donut over the inhabited/mainland landmass instead.
  var MARKER_POSITIONS = {
    RUS: [61.5, 90],
    USA: [39.8, -98.6]
  };
  datasetOrder.forEach(function (key) { state.selected[key] = true; });

  var yearCount = META.yearMax - META.yearMin + 1;
  var recordPrefixes = {};
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
  var datasetCountCache = new Map();
  var countryCountCache = new Map();
  var scaleCache = new Map();

  function selectedKeys() {
    return datasetOrder.filter(function (key) { return state.selected[key]; });
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
    if (!state.groupedDonuts) {
      return datasetOrder.map(function (key) {
        return {
          id: key, label: DATASETS[key].name, color: DATASETS[key].color,
          keys: [key], selected: state.selected[key]
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
    var currentDomain = DATASETS[series[index].keys[0]].domain;
    var previousDomain = DATASETS[series[(index + series.length - 1) % series.length].keys[0]].domain;
    var nextDomain = DATASETS[series[(index + 1) % series.length].keys[0]].domain;
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
    var rows = selectedKeys().map(function (key) {
      return escapeHTML(DATASETS[key].name) + ": " + formatNumber(datasetCount(key, feature.id)) +
        " " + escapeHTML(DATASETS[key].unit);
    });
    return "<b>" + escapeHTML(feature.properties.name) + "</b><br>" +
      "Total: " + formatNumber(countryCount(feature.id)) + " " + escapeHTML(countUnit(selectedKeys())) +
      (rows.length ? "<br>" + rows.join("<br>") : "<br>No datasets selected");
  }

  function recomputeScale() {
    var cacheKey = state.yearFrom + "|" + state.yearTo + "|" +
      selectedKeys().join(",") + "|" + (state.groupedDonuts ? "grouped" : "datasets");
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
      lsms_isa: "ISA", dhs: "DHS", mics: "MICS", lsms: "LSMS",
      "domain:Ecology": "ECO", "domain:Agriculture": "AGR",
      "domain:Public Health": "PH"
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
        var value = seriesCount(item, feature.id);
        paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" fill="' +
          assessmentColor(perMillionKm2(value, feature.id), seriesMaxima[item.id]) + '" class="sector' +
          (value ? "" : " empty-sector") + '"></path>');
        return;
      }
      paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" class="sector-outline"></path>');
      var yearCount = state.yearTo - state.yearFrom + 1;
      var arcPixels = (sectorEnd - sectorStart) * Math.PI / 180 * 27 * size / 60;
      var visibleBuckets = Math.min(yearCount, Math.max(4, Math.floor(arcPixels / 3)));
      var yearsPerBucket = Math.ceil(yearCount / visibleBuckets);
      var bucketWidth = (sectorEnd - sectorStart) / yearCount;
      for (var firstYear = state.yearFrom; firstYear <= state.yearTo; firstYear += yearsPerBucket) {
        var lastYear = Math.min(state.yearTo, firstYear + yearsPerBucket - 1);
        var count = 0;
        for (var year = firstYear; year <= lastYear; year++) {
          count += seriesYearCount(item, feature.id, year);
        }
        var start = sectorStart + (firstYear - state.yearFrom) * bucketWidth;
        var end = sectorStart + (lastYear - state.yearFrom + 1) * bucketWidth;
        var annualAverage = count / (lastYear - firstYear + 1);
        var fill = count
          ? scoreColor(minMaxScore(perMillionKm2(annualAverage, feature.id), seriesYearRanges[item.id]))
          : "#283644";
        var label = firstYear === lastYear ? String(firstYear) : firstYear + "–" + lastYear;
        paths.push('<path d="' + ringPath(start, end) + '" fill="' + fill +
          '" class="bucket' + (count ? '' : ' empty-bucket') + '"><title>' + label + ': ' +
          formatNumber(count) + ' ' + escapeHTML(countUnit(item.keys.filter(function (key) {
            return state.selected[key];
          }))) + '</title></path>');
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
        "|" + focused;
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
      var maximum = datasetMaxima[key] || 0;
      var annualMaximum = (datasetYearRanges[key] || {}).max || 0;
      var yearsWithRecords = 0, temporalScore = 0;
      for (var year = state.yearFrom; year <= state.yearTo; year++) {
        var count = ((DATASETS[key].records[feature.id] || {})[String(year)] || 0);
        if (count) yearsWithRecords++;
        if (count && annualMaximum) {
          temporalScore += Math.log1p(perMillionKm2(count, feature.id)) / Math.log1p(annualMaximum);
        }
      }
      var yearCount = state.yearTo - state.yearFrom + 1;
      temporalScore = yearCount ? temporalScore / yearCount : 0;
      var totalScore = density && maximum ? Math.log1p(density) / Math.log1p(maximum) : 0;
      return {
        key: key,
        // Reward both total volume and sustained annual volume. This prevents a single
        // unusually large year from dominating the "good coverage" examples.
        score: totalScore * 0.6 + temporalScore * 0.4,
        present: density > 0,
        yearsWithRecords: yearsWithRecords
      };
    });
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
    container.innerHTML = '<p class="examples-method">Examples update with the selected sources and time window. “Good” combines total records per million km² with sustained annual record volume, so broad coverage over time ranks above a single-year spike. It does not mean good data quality overall.</p>' +
      '<div class="example-columns">' + group('Relatively good coverage', strongest, false) +
      group('Very low coverage', weakest, true) + '</div>';
  }

  function renderHistogram() {
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
    var keys = selectedKeys();
    var legendSeries = displaySeries();
    document.getElementById("datasetLegend").innerHTML =
      (state.groupedDonuts ? '<div class="legend-group-title">Grouped by category</div>' :
        '<div class="legend-group-title">Individual datasets</div>') + donutLegendHTML(legendSeries) +
      '<div class="legend-group-title count-scale-title">Relative coverage within each source</div>' +
      '<div class="assessment-gradient"></div><div class="assessment-gradient-labels">' +
      '<span>Lower</span><span>Mid-range</span><span>Higher</span></div>' + legendSeries.map(function (series) {
      var identity = state.groupedDonuts
        ? '<span class="legend-category-swatches">' + series.keys.map(function (key) {
          return '<i style="background:' + DATASETS[key].color + ';opacity:' + (state.selected[key] ? 1 : 0.25) + '"></i>';
        }).join("") + '</span>'
        : '<i class="identity-key" style="background:' + identityGradient(series) + '"></i>';
      return '<div class="dataset-legend-row" style="opacity:' + (series.selected ? 1 : 0.4) +
        '">' + identity + '<span class="legend-series-name' + (state.groupedDonuts ? ' category-name' : '') + '">' +
        escapeHTML(series.label) +
        '</span><small class="legend-maximum">' +
        (series.selected ? formatNumber(Math.round(seriesMaxima[series.id])) + " / million km² max" : "off") + '</small></div>';
    }).join("") + (state.yearlyHistograms
      ? '<p class="timeline-note">Each sector runs from the first selected year to the last. Individual years are shown when space allows; on smaller donuts adjacent years are combined into wider, readable marks.</p>'
      : '') + '<details class="count-unit-guide"><summary>What does each count mean?</summary>' +
      datasetOrder.map(function (key) {
        var dataset = DATASETS[key];
        return '<div><b><i style="background:' + dataset.color + '"></i>' + escapeHTML(dataset.name) +
          '</b><span><strong>' + escapeHTML(dataset.unit) + ':</strong> ' +
          escapeHTML(dataset.description) + '.</span></div>';
      }).join("") + '</details>';
    document.getElementById("recordTotal").textContent = formatNumber(selectedTotal()) + " " + countUnit(keys);
    document.getElementById("legendMax").textContent = "Grey = no records";
    document.getElementById("mapCaption").textContent =
      (keys.length ? keys.length + " selected dataset" + (keys.length === 1 ? "" : "s") : "No datasets") +
      " · " + state.yearFrom + "–" + state.yearTo + " · " +
      (state.yearlyHistograms ? "yearly " : "") +
      (state.groupedDonuts ? "category radial sectors" : "dataset radial sectors");
    renderCoverageExamples();
  }

  function syncHash() {
    var params = new URLSearchParams();
    params.set("v", "4");
    params.set("datasets", selectedKeys().join(","));
    params.set("from", state.yearFrom);
    params.set("to", state.yearTo);
    params.set("hist", state.yearlyHistograms ? "1" : "0");
    params.set("group", state.groupedDonuts ? "categories" : "datasets");
    try { history.replaceState(null, "", "#" + params.toString()); } catch (error) { /* file:// */ }
  }

  function loadHash() {
    if (!location.hash) return;
    var params = new URLSearchParams(location.hash.slice(1));
    if (params.has("datasets")) {
      var requested = params.get("datasets").split(",");
      // Older links predate one or more survey datasets. Preserve their explicit
      // selections while leaving newly introduced datasets selected by default.
      var linkVersion = params.get("v");
      datasetOrder.forEach(function (key) {
        var existedWhenShared = linkVersion === "4" ||
          ((linkVersion === "2" || linkVersion === "3") && key !== "mics") ||
          (!linkVersion && key !== "dhs" && key !== "mics");
        if (existedWhenShared)
          state.selected[key] = requested.indexOf(key) !== -1;
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
  }

  var renderSignatures = {};
  var redrawFrame = null;
  function redraw() {
    var selected = selectedKeys().join(",");
    var dataSignature = state.yearFrom + "|" + state.yearTo + "|" + selected;
    var seriesSignature = dataSignature + "|" + state.groupedDonuts;
    var donutSignature = seriesSignature + "|" + state.yearlyHistograms + "|" + focusedCountry;
    var controlsSignature = state.yearFrom + "|" + state.yearTo + "|" +
      state.groupedDonuts + "|" + state.yearlyHistograms;

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
    state.groupedDonuts = !state.groupedDonuts;
    redraw();
  };
  document.getElementById("selectAll").onclick = function () {
    datasetOrder.forEach(function (key) { state.selected[key] = true; }); renderFilters(); redraw();
  };
  document.getElementById("selectNone").onclick = function () {
    datasetOrder.forEach(function (key) { state.selected[key] = false; }); renderFilters(); redraw();
  };

  function yearStrip(key, iso) {
    var dataset = DATASETS[key];
    var yearly = dataset.records[iso] || {};
    var years = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) {
      var count = yearly[String(year)] || 0;
      years.push(count);
    }
    return '<div class="year-strip" style="grid-template-columns:repeat(' + years.length + ',1fr)">' +
      years.map(function (count, index) {
      var opacity = count ? 0.25 + 0.75 * minMaxScore(
        perMillionKm2(count, iso), datasetYearRanges[key]) : 0;
        return '<i title="' + (state.yearFrom + index) + ': ' + formatNumber(count) + '" style="background:' +
      dataset.color + ';opacity:' + opacity + '"></i>';
      }).join("") + '</div><div class="year-axis"><span>' + state.yearFrom + '</span><span>' + state.yearTo + '</span></div>';
  }

  function seriesYearStrip(series, iso) {
    var years = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) {
      var count = seriesYearCount(series, iso, year);
      years.push(count);
    }
    return '<div class="year-strip" style="grid-template-columns:repeat(' + years.length + ',1fr)">' +
      years.map(function (count, index) {
      var opacity = count ? 0.25 + 0.75 * minMaxScore(
        perMillionKm2(count, iso), seriesYearRanges[series.id]) : 0;
        return '<i title="' + (state.yearFrom + index) + ': ' + formatNumber(count) + '" style="background:' +
          series.color + ';opacity:' + opacity + '"></i>';
      }).join("") + '</div><div class="year-axis"><span>' + state.yearFrom + '</span><span>' + state.yearTo + '</span></div>';
  }

  function datasetDetailHTML(key, iso, nested) {
    var dataset = DATASETS[key], count = datasetCount(key, iso);
    if (key === "dhs") {
      var years = (dataset.surveyYears[iso] || []).filter(function (entry) {
        return entry.year >= state.yearFrom && entry.year <= state.yearTo;
      });
      return '<div class="dataset-detail' + (nested ? ' nested' : '') + '"><h3><i style="background:' +
        dataset.color + '"></i><a href="' + dataset.url + '" target="_blank" rel="noopener" style="color:inherit">DHS</a></h3>' +
        '<p>Survey years in this window</p>' + (years.length
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
      ' in this window</p><p class="unit-explanation">' + escapeHTML(dataset.description) +
      '.</p>' + yearStrip(key, iso) + '</div>';
  }

  function categoryDetailHTML(series, iso) {
    var keys = series.keys.filter(function (key) { return state.selected[key]; });
    var swatches = keys.map(function (key) {
      return '<i style="background:' + DATASETS[key].color + '"></i>';
    }).join("");
    return '<section class="category-detail"><h3><span class="category-swatches">' + swatches + '</span>' +
      escapeHTML(series.label) + '</h3><p>' + formatNumber(seriesCount(series, iso)) +
      ' ' + escapeHTML(countUnit(keys)) + ' in this window</p>' + seriesYearStrip(series, iso) +
      '<details class="dataset-breakdown"><summary>Show dataset details</summary>' +
      keys.map(function (key) { return datasetDetailHTML(key, iso, true); }).join("") + '</details></section>';
  }

  function countryDetailHTML(iso) {
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
      var density = perMillionKm2(datasetCount(key, iso), iso);
      var maximum = datasetMaxima[key] || 0;
      return { key: key, score: density && maximum ? Math.log1p(density) / Math.log1p(maximum) : 0 };
    });
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
      '</p><small>Screening summary based on records per million km² relative to other DHS-covered countries; it does not assess data quality or research need.</small></section>';
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
    if (event.key === "Escape") { setLicences(false); setCoverage(false); }
  });

  loadHash();
  renderFilters();
  redraw();
})();
