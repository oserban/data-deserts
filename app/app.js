/* Data Deserts — country/year coverage across the generated dataset inventory. */
(function () {
  "use strict";

  var datasetOrder = META.datasetOrder;
  var query = new URLSearchParams(window.location.search);
  var remoteControl = query.get("remote") === "1";
  var detailsMode = remoteControl && query.get("details") === "1";
  var requestedDetailColumns = Number(query.get("columns"));
  var detailColumnLimit = Number.isInteger(requestedDetailColumns) &&
    requestedDetailColumns >= 1 && requestedDetailColumns <= 32 ? requestedDetailColumns : 16;
  var remoteSocket = null;
  var remoteStateFrame = null, pendingRemoteState = null;
  var remoteReconnectDelay = 500;
  var activeCountrySelection = [];
  var focusedCountry = null;
  var displayScale = 1;
  function updateDisplayScale() {
    displayScale = remoteControl
      ? Math.max(0.75, Math.min(4, Math.min(window.innerWidth / 1920, window.innerHeight / 1080)))
      : 1;
    document.documentElement.style.fontSize = (16 * displayScale) + "px";
  }
  updateDisplayScale();
  if (remoteControl) document.body.classList.add("remote-renderer");
  if (detailsMode) document.body.classList.add("remote-details");
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

  function selectedKeys() {
    return datasetOrder.filter(function (key) { return state.selected[key]; });
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

  function countInWindow(records, iso) {
    var yearly = records[iso] || {};
    return Object.keys(yearly).reduce(function (total, year) {
      var value = Number(year);
      return total + (value >= state.yearFrom && value <= state.yearTo ? yearly[year] : 0);
    }, 0);
  }

  function datasetCount(key, iso) {
    if (!countryInScope(iso)) return 0;
    return countInWindow(DATASETS[key].records, iso);
  }

  function countryCount(iso) {
    if (!countryInScope(iso)) return 0;
    return selectedKeys().reduce(function (total, key) {
      return total + datasetCount(key, iso);
    }, 0);
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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  var seriesMaxima = {}, datasetYearRanges = {}, seriesYearRanges = {};

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
          return '<text x="' + textX + '" y="' + (y + 4) + '" text-anchor="' +
            (right ? "start" : "end") + '">' + escapeHTML(entry.item.label) + '</text>' +
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
    attributionControl: false, zoomControl: true
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
    var selectedCountry = activeCountrySelection.indexOf(feature.id) !== -1;
    return {
      fillColor: count ? "#263443" : "#1b2530", fillOpacity: count ? 0.42 : 0.34,
      color: selectedCountry ? "#5ec5ff" : (count ? "#708296" : "#344250"),
      weight: selectedCountry ? 2.2 : 0.65
    };
  }

  function tooltipHTML(feature) {
    if (!countryInScope(feature.id)) {
      return "<b>" + escapeHTML(feature.properties.name) + "</b><br>Outside DHS participant-data scope";
    }
    var rows = selectedKeys().map(function (key) {
      return escapeHTML(DATASETS[key].name) + ": " + formatNumber(datasetCount(key, feature.id)) +
        " " + escapeHTML(DATASETS[key].unit);
    });
    return "<b>" + escapeHTML(feature.properties.name) + "</b><br>" +
      "Total: " + formatNumber(countryCount(feature.id)) + " records" +
      (rows.length ? "<br>" + rows.join("<br>") : "<br>No datasets selected");
  }

  function recomputeScale() {
    seriesMaxima = {}; datasetYearRanges = {}; seriesYearRanges = {};
    var series = displaySeries();
    var datasetValues = {}, seriesValues = {}, normalizationCountries = {};
    datasetOrder.forEach(function (key) {
      datasetValues[key] = [];
      Object.keys(DATASETS[key].records).forEach(function (iso) {
        normalizationCountries[iso] = true;
        Object.keys(DATASETS[key].records[iso]).forEach(function (year) {
          datasetValues[key].push(DATASETS[key].records[iso][year]);
        });
      });
    });
    series.forEach(function (item) { seriesMaxima[item.id] = 0; seriesValues[item.id] = []; });
    WORLD_GEOJSON.features.forEach(function (feature) {
      if (!countryInScope(feature.id)) return;
      series.forEach(function (item) {
        seriesMaxima[item.id] = Math.max(seriesMaxima[item.id], seriesCount(item, feature.id));
      });
    });
    Object.keys(normalizationCountries).forEach(function (iso) {
      series.forEach(function (item) {
        for (var year = META.yearMin; year <= META.yearMax; year++) {
          seriesValues[item.id].push(item.keys.reduce(function (total, key) {
            if (!state.selected[key]) return total;
            return total + ((DATASETS[key].records[iso] || {})[String(year)] || 0);
          }, 0));
        }
      });
    });
    datasetOrder.forEach(function (key) {
      datasetYearRanges[key] = positiveRange(datasetValues[key]);
    });
    series.forEach(function (item) {
      seriesYearRanges[item.id] = positiveRange(seriesValues[item.id]);
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
          assessmentColor(value, seriesMaxima[item.id]) + '" class="sector' +
          (value ? "" : " empty-sector") + '"></path>');
        return;
      }
      paths.push('<path d="' + ringPath(sectorStart, sectorEnd) + '" class="sector-outline"></path>');
      var yearCount = state.yearTo - state.yearFrom + 1;
      var bucketWidth = (sectorEnd - sectorStart) / yearCount;
      for (var year = state.yearFrom; year <= state.yearTo; year++) {
        var count = seriesYearCount(item, feature.id, year);
        if (!count) continue;
        var start = sectorStart + (year - state.yearFrom) * bucketWidth;
        var end = Math.min(sectorEnd, start + Math.max(0.08, bucketWidth - 0.08));
        paths.push('<path d="' + ringPath(start, end) + '" fill="' +
          scoreColor(minMaxScore(count, seriesYearRanges[item.id])) + '" class="bucket"></path>');
      }
    });
    var fontSize = Math.max(4 * displayScale,
      Math.min(9 * displayScale, Math.round(size * 0.105)));
    return '<div class="record-donut" style="--size:' + size + 'px;--font:' + fontSize + 'px">' +
      '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="28" class="backing"></circle>' +
      paths.join("") + labels.join("") + '<circle cx="30" cy="30" r="13" class="centre"></circle></svg><span>' +
      escapeHTML(feature.properties.name) + '</span></div>';
  }

  var recordMarkers = {};
  function markerSize() {
    var zoom = map.getZoom();
    var size = 30 + (zoom - 2) * 16;
    if (zoom > 4) size += (zoom - 4) * 12;
    return Math.max(30, Math.min(180, size)) * displayScale;
  }

  function renderDonuts() {
    var baseSize = markerSize();
    countryEntries.forEach(function (entry, markerIndex) {
      var feature = entry.feature, countryLayer = entry.layer;
      if (!countryInScope(feature.id)) return;
      var focused = focusedCountry === feature.id;
      var selected = activeCountrySelection.indexOf(feature.id) !== -1;
      var enlarged = focused || selected;
      // Slice acronyms are rendered at 110px and above. A selected wheel therefore gets a
      // guaranteed readable size even at low map zoom, while retaining a cap on dense displays.
      var size = enlarged
        ? Math.min(280 * displayScale, Math.max(150 * displayScale, baseSize * 1.9))
        : baseSize;
      var icon = L.divIcon({
        className: "record-div-icon" + (enlarged ? " selected-record-icon" : ""),
        html: donutHTML(feature, size),
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      });
      var marker = recordMarkers[markerIndex];
      if (!marker) {
        var position = MARKER_POSITIONS[feature.id] || countryLayer.getBounds().getCenter();
        marker = L.marker(position, { icon: icon, riseOnHover: true }).addTo(map);
        marker.on("click", function () { handleCountrySelection(feature); });
        marker.bindTooltip(function () { return tooltipHTML(feature); }, {
          className: "ctip leaflet-tooltip-own", direction: "top", opacity: 1
        });
        recordMarkers[markerIndex] = marker;
      } else marker.setIcon(icon);
      // Leaflet adds this offset to its latitude-derived marker z-index. Keep the focused wheel in
      // a dedicated top tier and shared selections above every ordinary or hover-raised marker.
      marker.setZIndexOffset(focused ? 200000 : selected ? 100000 + markerIndex : 0);
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

  function renderHistogram() {
    var totals = yearlyTotals();
    var range = positiveRange(Object.keys(totals).map(function (year) { return totals[year]; }));
    var html = "";
    Object.keys(totals).forEach(function (year) {
      var active = Number(year) >= state.yearFrom && Number(year) <= state.yearTo;
      var height = totals[year] ? Math.max(2, Math.round(100 * minMaxScore(totals[year], range))) : 2;
      html += '<i class="' + (active ? "active" : "") + '" style="height:' + height + '%" title="' +
        year + ": " + formatNumber(totals[year]) + ' records"></i>';
    });
    document.getElementById("yearHist").innerHTML = html;
  }

  function renderSummary() {
    var keys = selectedKeys();
    var legendSeries = displaySeries();
    document.getElementById("datasetLegend").innerHTML =
      (state.groupedDonuts ? '<div class="legend-group-title">Grouped by category</div>' :
        '<div class="legend-group-title">Individual datasets</div>') + donutLegendHTML(legendSeries) +
      '<div class="legend-group-title count-scale-title">Count scale within each sector</div>' +
      '<div class="assessment-gradient"></div><div class="assessment-gradient-labels">' +
      '<span>Low</span><span>Average</span><span>High</span></div>' + legendSeries.map(function (series) {
      var identity = state.groupedDonuts
        ? '<span class="legend-category-swatches">' + series.keys.map(function (key) {
          return '<i style="background:' + DATASETS[key].color + ';opacity:' + (state.selected[key] ? 1 : 0.25) + '"></i>';
        }).join("") + '</span>'
        : '<i class="identity-key" style="background:' + identityGradient(series) + '"></i>';
      return '<div class="dataset-legend-row" style="opacity:' + (series.selected ? 1 : 0.4) +
        '">' + identity + '<span class="legend-series-name' + (state.groupedDonuts ? ' category-name' : '') + '">' +
        escapeHTML(series.label) +
        '</span><small class="legend-maximum">' +
        (series.selected ? formatNumber(seriesMaxima[series.id]) + " max" : "off") + '</small></div>';
    }).join("") + '<details class="count-unit-guide"><summary>What does each count mean?</summary>' +
      datasetOrder.map(function (key) {
        var dataset = DATASETS[key];
        return '<div><b><i style="background:' + dataset.color + '"></i>' + escapeHTML(dataset.name) +
          '</b><span><strong>' + escapeHTML(dataset.unit) + ':</strong> ' +
          escapeHTML(dataset.description) + '.</span></div>';
      }).join("") + '</details>';
    document.getElementById("recordTotal").textContent = formatNumber(selectedTotal()) + " records";
    document.getElementById("legendMax").textContent = "Grey = no records";
    document.getElementById("mapCaption").textContent =
      (keys.length ? keys.length + " selected dataset" + (keys.length === 1 ? "" : "s") : "No datasets") +
      " · " + state.yearFrom + "–" + state.yearTo + " · " +
      (state.yearlyHistograms ? "yearly " : "") +
      (state.groupedDonuts ? "category radial sectors" : "dataset radial sectors");
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
    if (from >= META.yearMin && from <= META.yearMax) state.yearFrom = from;
    if (to >= META.yearMin && to <= META.yearMax) state.yearTo = to;
    if (state.yearFrom > state.yearTo) state.yearFrom = state.yearTo;
    if (params.has("hist")) state.yearlyHistograms = params.get("hist") === "1";
    if (params.has("group")) state.groupedDonuts = params.get("group") === "categories";
  }

  function redraw() {
    recomputeScale();
    countries.setStyle(countryStyle);
    renderDonuts();
    renderHistogram();
    renderSummary();
    updateYearControls();
    syncHash();
    if (detailsMode) {
      renderCountryComparison(activeCountrySelection);
    } else if (document.getElementById("detail").style.display === "block") {
      var iso = document.getElementById("detail").dataset.iso;
      var feature = WORLD_GEOJSON.features.find(function (item) { return item.id === iso; });
      if (feature) openDetail(feature);
    }
  }

  function applyRemoteState(next) {
    if (!next || typeof next !== "object") return;
    var from = Number(next.yearFrom), to = Number(next.yearTo);
    if (Number.isInteger(from) && Number.isInteger(to)) {
      state.yearFrom = Math.max(META.yearMin, Math.min(META.yearMax, from));
      state.yearTo = Math.max(state.yearFrom, Math.min(META.yearMax, to));
    }
    if (Array.isArray(next.selected)) {
      datasetOrder.forEach(function (key) { state.selected[key] = next.selected.indexOf(key) !== -1; });
    }
    if (typeof next.yearlyHistograms === "boolean") state.yearlyHistograms = next.yearlyHistograms;
    if (typeof next.groupedDonuts === "boolean") state.groupedDonuts = next.groupedDonuts;
    var previousCountries = activeCountrySelection.join(",");
    if (Array.isArray(next.countries)) {
      activeCountrySelection = next.countries.filter(function (iso, index, values) {
        return typeof iso === "string" && values.indexOf(iso) === index &&
          WORLD_GEOJSON.features.some(function (feature) { return feature.id === iso; });
      });
    }
    redraw();
    if (!detailsMode && activeCountrySelection.length &&
        previousCountries !== activeCountrySelection.join(",")) focusCountries(activeCountrySelection);
  }

  function focusCountries(selection) {
    var bounds = null;
    countryEntries.forEach(function (entry) {
      if (selection.indexOf(entry.feature.id) === -1) return;
      if (!bounds) bounds = L.latLngBounds(entry.layer.getBounds());
      else bounds.extend(entry.layer.getBounds());
    });
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, {
        maxZoom: selection.length === 1 ? 5 : 6,
        padding: [20 * displayScale, 20 * displayScale], animate: false
      });
    }
  }

  function queueRemoteState(next) {
    pendingRemoteState = next;
    if (remoteStateFrame !== null) return;
    remoteStateFrame = window.requestAnimationFrame(function () {
      remoteStateFrame = null;
      var latest = pendingRemoteState; pendingRemoteState = null;
      applyRemoteState(latest);
    });
  }

  function applyRemoteNavigation(message) {
    if (message.action === "zoomIn") { map.zoomIn(1, { animate: false }); return; }
    if (message.action === "zoomOut") { map.zoomOut(1, { animate: false }); return; }
    if (message.action === "pan") {
      var offsets = { north: [0, -160], south: [0, 160], west: [-200, 0], east: [200, 0] };
      if (offsets[message.value]) map.panBy(offsets[message.value], { animate: false });
      return;
    }
    if (message.action === "region") {
      var region = regions.find(function (item) { return item.name === message.value; });
      if (region) {
        if (region.name === "World") map.setView([25, 15], 4, { animate: false });
        else map.fitBounds(region.bounds, { animate: false });
      }
      return;
    }
    if (message.action === "country" && typeof message.value === "string") {
      var feature = WORLD_GEOJSON.features.find(function (item) { return item.id === message.value; });
      var entry = feature && countryEntries.find(function (item) { return item.feature === feature; });
      if (entry && !detailsMode) {
        map.fitBounds(entry.layer.getBounds(), { maxZoom: 5, animate: false });
      }
      if (feature && detailsMode) openDetail(feature);
    }
  }

  function connectRemoteController() {
    var explicitUrl = query.get("ws");
    var appMarker = location.pathname.indexOf("/app/");
    var applicationPath = appMarker === -1 ? "/" : location.pathname.slice(0, appMarker + 1);
    var defaultSocketUrl = new URL(applicationPath + "ws", location.origin);
    defaultSocketUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    var url = explicitUrl || defaultSocketUrl.href;
    var socket;
    try { socket = new WebSocket(url); remoteSocket = socket; } catch (error) {
      setRemoteConnection("error", "Connection failed — retrying");
      window.setTimeout(connectRemoteController, remoteReconnectDelay); return;
    }
    setRemoteConnection("", "Connecting…");
    socket.onopen = function () {
      setRemoteConnection("connected", "Connected · waiting for controller");
      socket.send(JSON.stringify({ type: "hello", role: detailsMode ? "details" : "renderer" }));
      sendRemoteView();
    };
    socket.onmessage = function (event) {
      try {
        var message = JSON.parse(event.data);
        if (message.type === "reload") { location.reload(); return; }
        if (message.type === "state") queueRemoteState(message.state);
        if (message.type === "navigation") applyRemoteNavigation(message);
        if (message.type === "peers") setRemoteConnection("connected",
          message.controllers ? "Connected · controller online" : "Connected · waiting for controller");
      } catch (error) { /* Ignore malformed relay messages. */ }
    };
    socket.onerror = function () { setRemoteConnection("error", "Connection interrupted"); };
    socket.onclose = function () {
      setRemoteConnection("error", "Disconnected · retrying");
      window.setTimeout(connectRemoteController, remoteReconnectDelay);
    };
  }

  function setRemoteConnection(kind, message) {
    var element = document.getElementById("remoteConnection");
    if (!element) return;
    element.className = "remote-connection " + kind;
    element.querySelector("span").textContent = message;
  }

  function sendRemoteView() {
    if (!remoteControl || detailsMode || !remoteSocket || remoteSocket.readyState !== WebSocket.OPEN) return;
    var centre = map.getCenter();
    remoteSocket.send(JSON.stringify({
      type: "view", zoom: map.getZoom(), lat: centre.lat, lng: centre.lng
    }));
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
        checkbox.onchange = function () { state.selected[key] = checkbox.checked; redraw(); };
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
    yearlyBucketsToggle.querySelector("span").textContent = state.yearlyHistograms ? "🗓" : "x̄";
    groupingToggle.classList.toggle("active", state.groupedDonuts);
    groupingToggle.setAttribute("aria-pressed", state.groupedDonuts);
    groupingToggle.setAttribute("aria-label", state.groupedDonuts
      ? "Show individual dataset radial sectors" : "Group radial sectors by category");
    groupingToggle.title = state.groupedDonuts
      ? "Currently grouped by category — switch to individual dataset sectors"
      : "Currently showing individual datasets — group radial sectors by category";
    groupingToggle.querySelector("span").textContent = state.groupedDonuts ? "⊞" : "◫";
    document.getElementById("yearRangeVal").textContent = state.yearFrom + "–" + state.yearTo;
    renderFilters();
  }

  function setHandleYear(handle, year) {
    year = Math.max(META.yearMin, Math.min(META.yearMax, Math.round(year)));
    if (handle === yearFrom) state.yearFrom = Math.min(year, state.yearTo);
    else state.yearTo = Math.max(year, state.yearFrom);
    redraw();
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
      var next = current;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") next--;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") next++;
      else if (event.key === "PageDown") next -= 10;
      else if (event.key === "PageUp") next += 10;
      else if (event.key === "Home") next = META.yearMin;
      else if (event.key === "End") next = META.yearMax;
      else return;
      event.preventDefault();
      setHandleYear(handle, next);
    });
  }
  if (!remoteControl) {
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
      datasetOrder.forEach(function (key) { state.selected[key] = true; }); redraw();
    };
    document.getElementById("selectNone").onclick = function () {
      datasetOrder.forEach(function (key) { state.selected[key] = false; }); redraw();
    };
  }

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
        var opacity = count ? 0.25 + 0.75 * minMaxScore(count, datasetYearRanges[key]) : 0;
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
        var opacity = count ? 0.25 + 0.75 * minMaxScore(count, seriesYearRanges[series.id]) : 0;
        return '<i title="' + (state.yearFrom + index) + ': ' + formatNumber(count) + '" style="background:' +
          series.color + ';opacity:' + opacity + '"></i>';
      }).join("") + '</div><div class="year-axis"><span>' + state.yearFrom + '</span><span>' + state.yearTo + '</span></div>';
  }

  function datasetDetailHTML(key, iso, nested) {
    var dataset = DATASETS[key], count = datasetCount(key, iso);
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
      ' records in this window</p>' + seriesYearStrip(series, iso) +
      '<details class="dataset-breakdown"' + (remoteControl ? ' open' : '') +
      '><summary>Show dataset details</summary>' +
      keys.map(function (key) { return datasetDetailHTML(key, iso, true); }).join("") + '</details></section>';
  }

  function countryDetailHTML(iso) {
    var keys = selectedKeys();
    return !countryInScope(iso)
      ? '<div class="empty">Records are shown only for countries with DHS participant data.</div>'
      : keys.length ? (state.groupedDonuts
        ? displaySeries().filter(function (series) { return series.selected; }).map(function (series) {
          return categoryDetailHTML(series, iso);
        }).join("")
        : keys.map(function (key) { return datasetDetailHTML(key, iso, false); }).join(""))
      : '<div class="empty">Select at least one dataset to see its records.</div>';
  }

  function openDetail(feature) {
    var iso = feature.id, panel = document.getElementById("detail");
    panel.dataset.iso = iso;
    document.getElementById("detailName").textContent = feature.properties.name;
    document.getElementById("detailMeta").textContent = countryInScope(iso)
      ? formatNumber(countryCount(iso)) + " selected records"
      : "Outside DHS participant-data scope";
    document.getElementById("detailBody").innerHTML = countryDetailHTML(iso);
    panel.style.display = "block";
  }

  function renderCountryComparison(selection) {
    var panel = document.getElementById("detail");
    panel.style.display = "block";
    delete panel.dataset.iso;
    var features = selection.map(function (iso) {
      return WORLD_GEOJSON.features.find(function (feature) { return feature.id === iso; });
    }).filter(Boolean).sort(function (first, second) {
      return first.properties.name.localeCompare(second.properties.name);
    });
    document.getElementById("detailName").textContent = features.length > 1
      ? "Country comparison" : features.length ? features[0].properties.name : "Country details";
    document.getElementById("detailMeta").textContent = features.length
      ? features.length + " selected countr" + (features.length === 1 ? "y" : "ies") +
        " · " + state.yearFrom + "–" + state.yearTo
      : "Waiting for a country selection";
    document.getElementById("detailBody").innerHTML = features.length
      ? '<div class="country-comparison" style="--max-country-columns:' + detailColumnLimit + '">' +
        features.map(function (feature) {
          return '<section class="country-column"><h2>' + escapeHTML(feature.properties.name) +
            '</h2><div class="country-column-meta">' + formatNumber(countryCount(feature.id)) +
            ' selected records</div>' + countryDetailHTML(feature.id) + '</section>';
        }).join("") + '</div>'
      : '<div class="empty">Select countries from the controller or click them on the map.</div>';
  }
  function handleCountrySelection(feature) {
    if (remoteControl && !detailsMode) {
      if (remoteSocket && remoteSocket.readyState === WebSocket.OPEN) {
        remoteSocket.send(JSON.stringify({ type: "selection", country: feature.id }));
      }
      return;
    }
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

  function setIntro(open) {
    document.getElementById("intro").classList.toggle("open", open);
  }
  document.getElementById("introClose").onclick = function () { setIntro(false); };
  document.getElementById("helpButton").onclick = function () { setIntro(true); };

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
    if (event.key === "Escape") setLicences(false);
  });

  if (!remoteControl) loadHash();
  redraw();
  if (remoteControl) {
    var resizeFrame = null;
    window.addEventListener("resize", function () {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(function () {
        resizeFrame = null; updateDisplayScale(); map.invalidateSize(); redraw();
      });
    });
    if (!detailsMode) map.on("zoomend moveend", sendRemoteView);
    if (detailsMode) {
      var detailPanel = document.getElementById("detail");
      detailPanel.style.display = "block";
      document.getElementById("detailName").textContent = "Country details";
      document.getElementById("detailMeta").textContent = "Waiting for a country selection";
      document.getElementById("detailBody").innerHTML =
        '<div class="empty">Choose a country from the controller or click one on the map.</div>';
    }
    connectRemoteController();
  }
})();
