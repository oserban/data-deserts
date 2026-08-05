/* Data Deserts — interactive cross-domain coverage map.
   Reads window.DATASETS, window.META, window.WORLD_GEOJSON, window.GBIF_DENSITY. */
(function () {
  "use strict";

  var config = window.DataDeserts.config;
  var DOMAINS = META.domains;
  var DOMAIN_COLOR = config.domainColors;
  // Domain-count uses a PURPLE sequential ramp, deliberately distinct from the categorical
  // domain hues (green/blue/orange/red) so the legend can't be confused with the domains.
  var NONE = config.noDataColor;                          // no data / desert
  var DOMAIN_COUNT = config.domainCountColors;             // 0..4 domains
  var dsMax = 1;                                         // max active datasets per country (set each redraw)
  // continuous light→deep purple for the dataset-count mode
  function datasetColor(v) {
    if (!v) return NONE;
    var t = Math.min(1, v / (dsMax || 1));
    var r = Math.round(231 - 157 * t), g = Math.round(220 - 191 * t), b = Math.round(243 - 115 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  var ACCESS_GROUPS = config.accessGroups;
  var GBIF = window.GBIF_DENSITY || {};
  var GRDC = window.GRDC_DENSITY || {};
  var GRDC_PTS = window.GRDC_POINTS || [];
  var SURVEYS = window.SURVEYS || {};
  // The application is intentionally scoped to countries in the DHS dataset coverage list.
  var DHS_DS = DATASETS.find(function (d) { return /\bDHS\b/.test(d.name); });
  var DHS_SET = {};
  if (DHS_DS && Array.isArray(DHS_DS.coverage)) DHS_DS.coverage.forEach(function (i) { DHS_SET[i] = true; });
  function countryVisible(iso) { return !!DHS_SET[iso]; }
  function visibleFeatures() { return WORLD_GEOJSON.features.filter(function (f) { return countryVisible(f.id); }); }
  var PROGRAM_COLOR = config.programColors;
  var surveyMax = 1;                                     // max surveys/country (set each redraw)
  // surveys for a country, respecting the time slider (only surveys up to the chosen year)
  function surveysFor(iso) {
    return (SURVEYS[iso] || []).filter(function (s) { return s.year >= state.yearFrom && s.year <= state.yearTo; });
  }
  // does a dataset's data-coverage span overlap the selected [yearFrom, yearTo] window?
  function inYearWindow(ds) {
    if (!ds.years) return true;
    return !(ds.years[1] < state.yearFrom || ds.years[0] > state.yearTo);
  }
  function lerpColor(t, c0, c1) {
    t = Math.max(0, Math.min(1, t));
    var r = Math.round(c0[0] + (c1[0] - c0[0]) * t),
        g = Math.round(c0[1] + (c1[1] - c0[1]) * t),
        b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  var state = window.DataDeserts.createState(META, DOMAINS, ACCESS_GROUPS);
  // colour modes that encode a magnitude (so a top-X% focus threshold is meaningful)
  var MAGNITUDE_MODES = config.magnitudeModes;
  function isMagnitudeMode() { return MAGNITUDE_MODES.indexOf(state.mode) !== -1; }
  var focusCutoff = 0;          // min value to display (0 = show everything); set each redraw

  function accessGroup(s) {
    if (/both/i.test(s)) return "Both";
    if (/private/i.test(s)) return "Private";
    return "Public";
  }
  function datasetActive(ds) {
    if (!state.includeGlobal && ds.global) return false;
    if (!inYearWindow(ds)) return false;                          // time-window filter
    if (!state.access[accessGroup(ds.access)]) return false;
    return ds.domains.some(function (d) { return state.domains[d]; });
  }
  function coversCountry(ds, iso) {
    if (ds.coverage === "GLOBAL") {
      return true;
    }
    return ds.coverage.indexOf(iso) !== -1;
  }
  function countryInfo(iso) {
    var hits = [], domSet = {};
    DATASETS.forEach(function (ds) {
      if (!datasetActive(ds) || !coversCountry(ds, iso)) return;
      hits.push(ds);
      ds.domains.forEach(function (d) {
        if (state.domains[d]) domSet[d] = true;
      });
    });
    return { datasets: hits, domains: DOMAINS.filter(function (d) { return domSet[d]; }) };
  }
  function countryStatsTooltip(iso, name) {
    var agricultureDatasets = countryInfo(iso).datasets.filter(function (dataset) {
      return dataset.domains.indexOf("Agriculture") !== -1;
    }).length;
    return '<b>' + name + '</b><br>' +
      'Ecology: ' + (GBIF[iso] || 0).toLocaleString() + ' GBIF records<br>' +
      'Hydrology: ' + (GRDC[iso] || 0).toLocaleString() + ' GRDC gauges<br>' +
      'Agriculture: ' + agricultureDatasets.toLocaleString() + ' active datasets<br>' +
      'Public health: ' + surveysFor(iso).length.toLocaleString() + ' surveys';
  }
  function countryValue(iso) {
    if (state.mode === "density") return GBIF[iso] || 0;
    if (state.mode === "grdc") return GRDC[iso] || 0;
    if (state.mode === "surveys") return surveysFor(iso).length;
    if (state.mode === "recency") {
      var sv = surveysFor(iso);
      return sv.length ? sv[sv.length - 1].year : 0;     // most recent survey year
    }
    var info = countryInfo(iso);
    if (state.mode === "datasets") return info.datasets.length;
    if (state.mode === "single") return info.domains.indexOf(state.singleDomain) !== -1 ? 1 : 0;
    return info.domains.length;
  }
  // log-scaled blue ramp for GBIF density
  function densityColor(v) {
    if (!v) return "#2a3441";
    var t = Math.log10(v) / Math.log10(META.gbifMax);   // 0..1
    t = Math.max(0, Math.min(1, t));
    var r = Math.round(247 - 210 * t), g = Math.round(252 - 140 * t), b = Math.round(190 + 40 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  // log-scaled blue ramp for GRDC gauge density (matches the gauge legend gradient)
  function grdcColor(v) {
    if (!v) return "#2a3441";
    var t = Math.log10(v) / Math.log10(META.grdcMax || 1);
    return lerpColor(t, [8, 32, 58], [215, 240, 255]);
  }
  function fillColor(iso) {
    if (focusCutoff > 0 && isMagnitudeMode() && (countryValue(iso) || 0) < focusCutoff) return NONE;
    if (state.mode === "density") {
      var c = GBIF[iso] || 0;
      return densityColor(c);
    }
    if (state.mode === "grdc") return grdcColor(GRDC[iso] || 0);
    var v = countryValue(iso);
    if (state.mode === "single") return v ? DOMAIN_COLOR[state.singleDomain] : NONE;
    if (state.mode === "datasets") return datasetColor(v);   // continuous
    if (state.mode === "surveys")                            // continuous teal, by survey count
      return v ? lerpColor(v / (surveyMax || 1), [199, 233, 222], [0, 95, 78]) : NONE;
    if (state.mode === "recency") {                          // how recent is the latest survey
      if (!v) return NONE;
      var age = state.yearTo - v;
      return age <= 5 ? "#1a9850" : age <= 15 ? "#fee08b" : "#d73027";
    }
    return DOMAIN_COUNT[Math.min(v, 4)];                      // categorical 0..4
  }

  // ---- map ----
  var map = L.map("map", {
    worldCopyJump: false, minZoom: 2, maxZoom: 10,
    attributionControl: false, zoomControl: true, preferCanvas: false
  }).setView([25, 10], 2);
  map.setMaxBounds([[-85, -200], [88, 200]]);

  // ---- live GBIF occurrence-density heatmap (fine-grain biodiversity sampling) ----
  // Tiles fetched from the GBIF map API; gives within-country patchiness that the
  // country choropleth can't show. Needs internet (the rest of the app is offline).
  map.createPane("gbifPane");
  map.getPane("gbifPane").style.zIndex = 350;          // above basemap tiles, below country vectors
  map.getPane("gbifPane").style.pointerEvents = "none";
  var cartoBase = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    { subdomains: "abcd", maxZoom: 19, detectRetina: true });
  // Point heat-glow style: detailed "painted" look (rivers, sampling tracks), empty areas
  // transparent so the dark basemap shows through. Heavier tiles, but GBIF CDN-caches them;
  // updateWhenIdle defers requests until panning stops, removing most of the perceived lag.
  var gbifHeat = L.tileLayer(
    "https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png" +
    "?srs=EPSG:3857&style=orangeHeat.point",
    { tileSize: 512, zoomOffset: -1, opacity: 0.78, pane: "gbifPane", maxNativeZoom: 14,
      updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 2 });
  // GRDC river gauges — no tile service exists, so we render the real station points
  // (the "GBIF of water"): a blue heat glow of ~10,700 gauges, dense where rivers are
  // monitored, dark over ungauged basins.
  // focus filter for the gauge heat: keep only points in the densest X% of 1° cells
  function grdcHeatData() {
    if (state.focusPct >= 100) return GRDC_PTS;
    var bins = {};
    GRDC_PTS.forEach(function (p) { var k = Math.floor(p[0]) + "_" + Math.floor(p[1]); bins[k] = (bins[k] || 0) + 1; });
    var counts = Object.keys(bins).map(function (k) { return bins[k]; }).sort(function (a, b) { return b - a; });
    var k = Math.max(1, Math.ceil(counts.length * state.focusPct / 100));
    var cut = counts[Math.min(k - 1, counts.length - 1)];
    return GRDC_PTS.filter(function (p) { return bins[Math.floor(p[0]) + "_" + Math.floor(p[1])] >= cut; });
  }
  var grdcHeat = L.heatLayer(grdcHeatData(), {
    radius: 10, blur: 13, minOpacity: 0.3, maxZoom: 8,
    gradient: { 0.2: "#1c6fae", 0.45: "#54c0e8", 0.75: "#bfe9ff", 1: "#ffffff" } });
  function anyHeat() { return state.gbifHeat || state.grdcHeat; }
  function updateHeatBase() {
    if (anyHeat()) { if (!map.hasLayer(cartoBase)) cartoBase.addTo(map); }
    else if (map.hasLayer(cartoBase)) map.removeLayer(cartoBase);
    applyStyles();
  }

  (function graticule() {
    var lines = [];
    for (var lo = -180; lo <= 180; lo += 30) lines.push([[-85, lo], [85, lo]]);
    for (var la = -60; la <= 80; la += 30) lines.push([[la, -180], [la, 180]]);
    L.polyline(lines, { color: "#9fb0c0", weight: 0.4, opacity: 0.18, interactive: false }).addTo(map);
  })();

  var idToLayer = {};
  var layer = L.geoJSON(WORLD_GEOJSON, {
    style: styleFn,
    onEachFeature: function (feat, lyr) {
      idToLayer[feat.id] = lyr;
      lyr.on({
        mouseover: function (e) { if (state.highlight) return; e.target.setStyle({ weight: 1.8, color: "#fff" }); e.target.bringToFront(); },
        mouseout: function () { applyStyles(); },
        click: function () { openDetail(feat.id, feat.properties.name); }
      });
      lyr.bindTooltip(function () { return countryStatsTooltip(feat.id, feat.properties.name); },
        { className: "ctip leaflet-tooltip-own", sticky: true, direction: "top", opacity: 1 });
    }
  }).addTo(map);

  var assessmentMarkers = {};
  function yearlyDomainValues(iso, year) {
    var values = { ecology: 0, hydrology: 0, agriculture: 0, health: 0 };
    DATASETS.forEach(function (dataset) {
      if (!datasetActiveAtYear(dataset, year) || !coversCountry(dataset, iso)) return;
      dataset.domains.forEach(function (domain) {
        if (domain === "Ecology") values.ecology++;
        else if (domain === "Hydro") values.hydrology++;
        else if (domain === "Agriculture") values.agriculture++;
      });
    });
    values.health = (SURVEYS[iso] || []).filter(function (survey) { return survey.year === year; }).length;
    return values;
  }
  function assessmentMarkerSize() {
    return Math.max(40, Math.min(190, 40 + (map.getZoom() - 2) * 20));
  }
  function renderAssessmentMarkers() {
    var markerSize = assessmentMarkerSize();
    var assessmentOptions = {
      features: visibleFeatures(), gbif: GBIF, grdc: GRDC,
      surveysFor: surveysFor
    };
    if (state.yearlyHistograms) {
      assessmentOptions.years = [];
      for (var year = state.yearFrom; year <= state.yearTo; year++) assessmentOptions.years.push(year);
      assessmentOptions.yearlyValues = yearlyDomainValues;
    }
    var assessment = window.DataDeserts.recordAssessment.create(assessmentOptions);
    visibleFeatures().forEach(function (feature) {
      var countryLayer = idToLayer[feature.id];
      if (!countryLayer) return;
      var icon = L.divIcon({
        className: "assessment-div-icon",
        html: assessment.markerHTML(feature.properties.name, feature.id, markerSize),
        iconSize: [markerSize, markerSize], iconAnchor: [markerSize / 2, markerSize / 2]
      });
      var marker = assessmentMarkers[feature.id];
      if (!marker) {
        marker = L.marker(countryLayer.getBounds().getCenter(), { icon: icon, riseOnHover: true }).addTo(map);
        marker.on("click", function () { openDetail(feature.id, feature.properties.name); });
        marker.bindTooltip("", { className: "ctip leaflet-tooltip-own", direction: "top", opacity: 1 });
        assessmentMarkers[feature.id] = marker;
      } else marker.setIcon(icon);
      marker.setTooltipContent(assessment.tooltipHTML(feature.properties.name, feature.id));
    });
  }
  map.on("zoomend", renderAssessmentMarkers);

  function styleFn(feat) {
    if (anyHeat() && !state.highlight) {
      // transparent fills so the heat layer shows through; keep faint country outlines as a guide
      return { fillColor: "#000", fillOpacity: 0, color: "#7f93a8", weight: 0.5, opacity: 0.55 };
    }
    if (state.highlight) {
      var ds = DATASETS.find(function (d) { return d.name === state.highlight; });
      // for station/record datasets, the real footprint is where data actually exists
      var on;
      if (ds && ds.densityKey) on = ((ds.densityKey === "grdc" ? GRDC : GBIF)[feat.id] || 0) > 0;
      else on = ds && coversCountry(ds, feat.id);
      return { fillColor: on ? (DOMAIN_COLOR[ds.domains[0]] || "#5ec5ff") : "#2a3441",
               fillOpacity: on ? 0.9 : 0.18, color: on ? "#ffffff" : "#1b2734", weight: on ? 1.2 : 0.5 };
    }
    if (!countryVisible(feat.id))                             // outside DHS scope: greyed out
      return { fillColor: "#0d141d", fillOpacity: 0.55, color: "#1b2734", weight: 0.4 };
    return { fillColor: "#263443", fillOpacity: 0.38, color: "#607287", weight: 0.7 };
  }
  function applyStyles() { layer.setStyle(styleFn); }

  function recomputeScales() {                            // per-render max scales + focus cutoff
    dsMax = 1; surveyMax = 1;
    visibleFeatures().forEach(function (f) {
      var n = countryInfo(f.id).datasets.length;
      if (n > dsMax) dsMax = n;
      var s = surveysFor(f.id).length;
      if (s > surveyMax) surveyMax = s;
    });
    focusCutoff = 0;
    if (state.focusPct < 100 && isMagnitudeMode()) {
      var vals = visibleFeatures().map(function (f) { return countryValue(f.id); })
        .filter(function (v) { return v > 0; }).sort(function (a, b) { return b - a; });
      if (vals.length) {
        var k = Math.max(1, Math.ceil(vals.length * state.focusPct / 100));
        focusCutoff = vals[Math.min(k - 1, vals.length - 1)];   // show values >= this
      }
    }
  }

  function redraw() {
    recomputeScales();
    applyStyles(); renderAssessmentMarkers(); updateLegend(); updateCaption();
    if (insightsOpen) renderInsights();
    syncHash();
  }

  // ---- persistent "what am I looking at" caption ----
  function updateCaption() {
    var base = {
      assessment: "Overall record assessment — each segment is normalized within its own domain",
      domains: "Colour: how many of the 4 data types each country has",
      datasets: "Colour: number of datasets per country",
      single: "Colour: where " + state.singleDomain + " data exists",
      surveys: "Colour: number of public-health surveys",
      recency: "Colour: how recent each country's latest health survey is",
      density: "Colour: biodiversity record density (GBIF)",
      grdc: "Colour: river-gauge density (GRDC)"
    }[state.mode] || "";
    var win = state.yearFrom === state.yearTo ? state.yearFrom : state.yearFrom + "–" + state.yearTo;
    var cap = document.getElementById("mapCaption");
    cap.textContent = base + "  ·  " + win + "  ·  DHS countries only" +
      (state.yearlyHistograms ? "  ·  one bucket per year; gaps are missing years" : "");
    // update the always-on legend title too
    var lt = document.getElementById("legendTitle");
    if (lt) lt.textContent = "— " + (modeLabel() || "");
    // expand whichever acronym is on screen, as a hover tooltip
    var gloss = {
      density: "GBIF = Global Biodiversity Information Facility, a worldwide species-observation database.",
      grdc: "GRDC = Global Runoff Data Centre, a catalogue of ~10,700 river-flow gauging stations.",
      surveys: "Open household-survey programmes: DHS, MICS and LSMS-ISA — mostly run in low- and middle-income countries.",
      recency: "Open household-survey programmes: DHS, MICS and LSMS-ISA — mostly run in low- and middle-income countries."
    }[state.mode];
    if (gloss) cap.title = gloss; else cap.removeAttribute("title");
  }

  // ---- detail panel ----
  var detail = document.getElementById("detail");
  document.getElementById("detailClose").onclick = function () { detail.style.display = "none"; };

  // chronological timeline of the actual public-health surveys for a country
  function surveyTimelineHTML(iso) {
    var sv = surveysFor(iso);
    if (!sv.length) return "";
    var chips = sv.map(function (s) {
      var c = PROGRAM_COLOR[s.type] || PROGRAM_COLOR[s.program] || "#8a97a6";
      return '<span class="svchip" style="border-color:' + c + ';color:' + c + '" title="' +
        s.program + ' ' + s.label + '">' + s.type + ' ' + s.year + '</span>';
    }).join("");
    return '<div class="domblock">' +
      '<div class="dlabel"><span class="swatch" style="background:' + DOMAIN_COLOR["Public Health"] + '"></span>' +
        'Public-health surveys <span class="pill">' + sv.length + '</span></div>' +
      '<div class="sv-span">' + sv[0].year + '–' + sv[sv.length - 1].year + ' &middot; individual surveys collected:</div>' +
      '<div class="sv-chips">' + chips + '</div></div>';
  }

  // is a dataset active for a single year Y (same filters as datasetActive, but a point year)?
  function datasetActiveAtYear(ds, y) {
    if (!state.includeGlobal && ds.global) return false;
    if (ds.years && !(ds.years[0] <= y && ds.years[1] >= y)) return false;
    if (!state.access[accessGroup(ds.access)]) return false;
    return ds.domains.some(function (d) { return state.domains[d]; });
  }
  // Headline score for a country within the chosen window.
  function countryScoreHTML(iso) {
    var score = countryInfo(iso).datasets.length;
    var win = state.yearFrom === state.yearTo ? state.yearFrom : state.yearFrom + "–" + state.yearTo;
    return '<div class="scorecard"><div class="sc-num">' + score + '</div>' +
      '<div class="sc-lab"><b>dataset' + (score === 1 ? '' : 's') + '</b> cover this country<br>in <b>' + win + '</b> &middot; ' +
      countryInfo(iso).domains.length + ' / 4 domains</div></div>';
  }

  function countryHistoryHTML(iso) {
    var years = [];
    for (var year = state.yearFrom; year <= state.yearTo; year++) years.push(year);
    return window.DataDeserts.recordAssessment.create({
      features: visibleFeatures(), gbif: GBIF, grdc: GRDC, surveysFor: surveysFor,
      years: years, yearlyValues: yearlyDomainValues
    }).historyHTML(iso);
  }

  function openDetail(iso, name) {
    var info = countryInfo(iso);
    document.getElementById("dName").textContent = name;
    var dens = GBIF[iso] ? ' &middot; ' + GBIF[iso].toLocaleString() + ' GBIF records' : '';
    document.getElementById("dMeta").innerHTML =
      info.domains.length + " of 4 domains &middot; " + info.datasets.length + " dataset(s) active" + dens;
    var body = document.getElementById("dBody");
    var historyHTML = countryHistoryHTML(iso);
    var scoreHTML = countryScoreHTML(iso);
    var svHTML = state.domains["Public Health"] ? surveyTimelineHTML(iso) : "";
    body.innerHTML = historyHTML + scoreHTML + svHTML;
    if (!info.datasets.length && !svHTML) {
      body.innerHTML = historyHTML + scoreHTML + '<div class="empty">No active datasets cover this country in this window — a data desert.</div>';
    } else {
      DOMAINS.forEach(function (dom) {
        if (!state.domains[dom]) return;
        var list = info.datasets.filter(function (ds) { return ds.domains.indexOf(dom) !== -1; });
        if (!list.length) return;
        var block = document.createElement("div");
        block.className = "domblock";
        block.innerHTML = '<div class="dlabel"><span class="swatch" style="background:' + DOMAIN_COLOR[dom] + '"></span>' + dom + '</div>';
        list.forEach(function (ds) {
          var cov = ds.coverage === "GLOBAL" ? "global" : ds.coverage.length + " countries";
          var yr = ds.years ? ds.years[0] + "–" + ds.years[1] : "";
          var d = document.createElement("div");
          d.className = "ds";
          d.innerHTML =
            '<div class="ds-top"><a href="' + ds.url + '" target="_blank" rel="noopener">' + ds.name + '</a>' +
            '<button class="fp" data-name="' + ds.name + '">footprint</button></div>' +
            '<div class="tags"><span class="pill">' + cov + '</span> ' + ds.modality + ' &middot; ' + ds.access +
            (yr ? ' &middot; ' + yr : '') + '</div>';
          d.querySelector(".fp").onclick = function () { showFootprint(ds.name); };
          block.appendChild(d);
        });
        body.appendChild(block);
      });
    }
    detail.style.display = "block";
  }

  // ---- footprint ----
  var fpBanner = document.getElementById("fpBanner");
  function showFootprint(name) {
    state.highlight = name;
    var ds = DATASETS.find(function (d) { return d.name === name; });
    var n;
    if (ds.densityKey) {                                  // station/record dataset: show real presence
      var dm = ds.densityKey === "grdc" ? GRDC : GBIF;
      var k = WORLD_GEOJSON.features.filter(function (f) { return (dm[f.id] || 0) > 0; }).length;
      n = "nominally global, but records exist in " + k + " countries";
    } else {
      n = ds.coverage === "GLOBAL" ? "every land country (global)" : ds.coverage.length + " countries";
    }
    document.getElementById("fpText").innerHTML = "Footprint: <b>" + name + "</b> — " + n;
    fpBanner.style.display = "flex"; applyStyles();
  }
  function clearFootprint() { state.highlight = null; fpBanner.style.display = "none"; applyStyles(); }
  document.getElementById("fpClear").onclick = clearFootprint;

  // ---- legend ----
  function updateLegend() {
    var el = document.getElementById("legend");
    if (state.mode === "assessment") {
      el.innerHTML =
        window.DataDeserts.recordAssessment.legendHTML() +
        '<div class="legend-bar" style="margin-top:9px;background:linear-gradient(90deg,#d73027,#fee08b,#1a9850)"></div>' +
        '<div class="legend-ends"><span>lower count</span><span>higher count</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:#68737f"></span>No data / unavailable</div>' +
        '<div style="font-size:11px;color:var(--muted);line-height:1.45;margin-top:7px">Red → yellow → green is log-normalized separately for each domain across DHS countries. Position identifies the domain.</div>' +
        (state.yearlyHistograms ? '<div style="font-size:11px;color:var(--accent);line-height:1.45;margin-top:6px">Yearly view: each sector runs from the earliest selected year to the latest. Blank gaps are missing years.</div>' : '');
    } else if (state.mode === "density") {
      el.innerHTML =
        '<div class="legend-bar" style="background:linear-gradient(90deg,#f7fcbe,#7fd0db,#1f6fbf,#0a2e6e)"></div>' +
        '<div class="legend-ends"><span>few records</span><span>' + (META.gbifMax / 1e9).toFixed(1) + 'B</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:#2a3441"></span>no GBIF records</div>' +
        (META.gbifCleaned ? '<div style="font-size:11px;color:var(--muted);margin-top:6px">Counts are <b>quality-filtered</b>: georeferenced, no geospatial issues, no fossils/living specimens.</div>' : '');
    } else if (state.mode === "grdc") {
      el.innerHTML =
        '<div class="legend-bar" style="background:linear-gradient(90deg,#08203a,#1c6fae,#54c0e8,#d7f0ff)"></div>' +
        '<div class="legend-ends"><span>few gauges</span><span>' + META.grdcMax + '</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:#2a3441"></span>no GRDC gauges</div>';
    } else if (state.mode === "single") {
      el.innerHTML =
        '<div class="legend-row"><span class="box" style="background:' + DOMAIN_COLOR[state.singleDomain] + '"></span>' + state.singleDomain + ' present</div>' +
        '<div class="legend-row"><span class="box" style="background:' + NONE + '"></span>absent</div>';
    } else if (state.mode === "datasets") {
      // continuous scale (0 → current max)
      el.innerHTML =
        '<div class="legend-bar" style="background:linear-gradient(90deg,#e7dcf3,#5d2a8f)"></div>' +
        '<div class="legend-ends"><span>1</span><span>' + dsMax + ' datasets</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:' + NONE + '"></span>no data in active layers</div>';
    } else if (state.mode === "surveys") {
      el.innerHTML =
        '<div class="legend-bar" style="background:linear-gradient(90deg,#c7e9de,#005f4e)"></div>' +
        '<div class="legend-ends"><span>1</span><span>' + surveyMax + ' surveys</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:' + NONE + '"></span>no DHS/MICS/LSMS surveys</div>';
    } else if (state.mode === "recency") {
      el.innerHTML =
        '<div class="legend-row"><span class="box" style="background:#1a9850"></span>latest within 5 years</div>' +
        '<div class="legend-row"><span class="box" style="background:#fee08b"></span>6–15 years ago</div>' +
        '<div class="legend-row"><span class="box" style="background:#d73027"></span>16+ years ago</div>' +
        '<div class="legend-row"><span class="box" style="background:' + NONE + '"></span>no surveys</div>';
    } else {
      // categorical (only 5 possible values: 0..4 domains)
      var labels = ["0 — none (desert)", "1 domain", "2 domains", "3 domains", "4 domains"];
      el.innerHTML = labels.map(function (l, i) {
        return '<div class="legend-row"><span class="box" style="background:' + DOMAIN_COUNT[i] + '"></span>' + l + '</div>';
      }).join("");
    }
  }

  // ---- "More ▾" dropdown menu (secondary tools) ----
  (function moreMenu() {
    var btn = document.getElementById("moreBtn");
    var wrap = btn.parentNode;                 // .menu
    btn.onclick = function (e) { e.stopPropagation(); wrap.classList.toggle("open"); };
    // any tool inside the menu closes it after its own handler runs (click bubbles up)
    document.getElementById("moreMenu").addEventListener("click", function () { wrap.classList.remove("open"); });
    // click anywhere else closes it
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) wrap.classList.remove("open"); });
  })();

  // ---- insights ----
  var insightsOpen = false;
  var insightsEl = document.getElementById("insights");
  var insightsBtn = document.getElementById("insightsBtn");
  function toggleInsights(force) {
    insightsOpen = force === undefined ? !insightsOpen : force;
    insightsEl.classList.toggle("open", insightsOpen);
    insightsBtn.classList.toggle("active", insightsOpen);
    if (insightsOpen) renderInsights();
    setTimeout(function () { map.invalidateSize(); }, 360);
  }
  insightsBtn.onclick = function () { toggleInsights(); };
  document.getElementById("insightsClose").onclick = function () { toggleInsights(false); };
  document.querySelectorAll("#matrixMode button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("#matrixMode button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active"); state.matrixMode = b.dataset.m; renderInsights();
    };
  });

  // ---- live heat layers (biodiversity records & river gauges) ----
  var gbifBtn = document.getElementById("gbifBtn");
  gbifBtn.onclick = function () {
    state.gbifHeat = !state.gbifHeat;
    gbifBtn.classList.toggle("active", state.gbifHeat);
    document.getElementById("gbifLegend").style.display = state.gbifHeat ? "block" : "none";
    if (state.gbifHeat) {
      gbifHeat.addTo(map);
      toast("Live GBIF biodiversity density on — zoom into any region to see within-country gaps.  © GBIF.org, © CARTO", 5000);
    } else map.removeLayer(gbifHeat);
    updateHeatBase();
  };
  var gaugeBtn = document.getElementById("gaugeBtn");
  gaugeBtn.onclick = function () {
    state.grdcHeat = !state.grdcHeat;
    gaugeBtn.classList.toggle("active", state.grdcHeat);
    document.getElementById("gaugeLegend").style.display = state.grdcHeat ? "block" : "none";
    if (state.grdcHeat) {
      grdcHeat.setLatLngs(grdcHeatData()); grdcHeat.addTo(map);
      toast("GRDC river gauges on — the 'GBIF of water'. Zoom in to see gauged vs. ungauged basins.  © GRDC / BfG, © CARTO", 5000);
    } else map.removeLayer(grdcHeat);
    updateHeatBase();
  };

  function renderInsights() {
    var sets = visibleFeatures().map(function (f) { return { id: f.id, name: f.properties.name, doms: countryInfo(f.id).domains }; });
    var pair = {}, uni = {};
    DOMAINS.forEach(function (a) { DOMAINS.forEach(function (b) { pair[a + "|" + b] = 0; uni[a + "|" + b] = 0; }); });
    sets.forEach(function (c) {
      DOMAINS.forEach(function (a) {
        DOMAINS.forEach(function (b) {
          var ha = c.doms.indexOf(a) !== -1, hb = c.doms.indexOf(b) !== -1;
          if (ha && hb) pair[a + "|" + b]++;
          if (ha || hb) uni[a + "|" + b]++;
        });
      });
    });
    var jac = state.matrixMode === "jaccard";
    var max = 1; DOMAINS.forEach(function (a) { DOMAINS.forEach(function (b) { max = Math.max(max, pair[a + "|" + b]); }); });
    function cellColor(v, denom) {
      var t = jac ? (denom ? v / denom : 0) : v / max;
      if (!v) return "#2a3441";
      var r = Math.round(225 - 180 * t), g = Math.round(238 - 120 * t), b = Math.round(248 - 70 * t);
      return "rgb(" + r + "," + g + "," + b + ")";
    }
    var short = { "Ecology": "Eco", "Hydro": "Hydro", "Agriculture": "Agri", "Public Health": "Health" };
    var html = '<table class="matrix"><tr><th></th>';
    DOMAINS.forEach(function (b) { html += '<th>' + short[b] + '</th>'; });
    html += '</tr>';
    DOMAINS.forEach(function (a) {
      html += '<tr><th class="rowh">' + a + '</th>';
      DOMAINS.forEach(function (b) {
        var v = pair[a + "|" + b], u = uni[a + "|" + b];
        var disp = jac ? (u ? Math.round(100 * v / u) + "%" : "0%") : v;
        var outline = a === b ? 'outline:2px solid ' + DOMAIN_COLOR[a] + ';outline-offset:-2px;' : '';
        html += '<td style="' + outline + 'background:' + cellColor(v, u) + '" title="' +
          (a === b ? v + ' countries have ' + a : v + ' countries have BOTH ' + a + ' and ' + b) + '">' + disp + '</td>';
      });
      html += '</tr>';
    });
    html += '</table><div style="font-size:11px;color:var(--muted);margin-top:8px">' +
      (jac ? 'Jaccard = |A∩B| / |A∪B|. ' : 'Diagonal = countries with that domain; off-diagonal = overlap. ') +
      'Toggle the global layer off and watch the off-diagonal collapse.</div>';
    document.getElementById("matrix").innerHTML = html;

    function chips(doms) {
      return '<span class="dchips">' + DOMAINS.map(function (d) {
        return '<i style="background:' + (doms.indexOf(d) !== -1 ? DOMAIN_COLOR[d] : "#2a3441") + '"></i>';
      }).join("") + '</span>';
    }
    function row(c, desert) {
      return '<div class="rank' + (desert ? ' desert' : '') + '">' + chips(c.doms) +
        '<span class="nm">' + c.name + '</span><span class="num">' + c.doms.length + '/4</span></div>';
    }
    var sorted = sets.slice().sort(function (a, b) { return a.doms.length - b.doms.length || a.name.localeCompare(b.name); });
    document.getElementById("rankDesert").innerHTML = sorted.slice(0, 10).map(function (c) { return row(c, true); }).join("");
    document.getElementById("rankRich").innerHTML = sorted.reverse().slice(0, 10).map(function (c) { return row(c, false); }).join("");
  }

  // ---- region presets ----
  var REGIONS = [
    { name: "World", fn: function () { map.setView([25, 10], 2); } },
    { name: "Africa", b: [[-35, -20], [38, 52]] },
    { name: "Asia", b: [[2, 38], [55, 150]] },
    { name: "Europe", b: [[34, -12], [70, 45]] },
    { name: "Americas", b: [[-55, -110], [62, -34]] }
  ];
  var regionsEl = document.getElementById("regions");
  REGIONS.forEach(function (r, i) {
    var btn = document.createElement("button");
    btn.textContent = r.name; if (i === 0) btn.classList.add("active");
    btn.onclick = function () {
      regionsEl.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active"); if (r.fn) r.fn(); else map.fitBounds(r.b);
    };
    regionsEl.appendChild(btn);
  });

  // ---- search ----
  var dl = document.getElementById("countryList"), byName = {};
  WORLD_GEOJSON.features.slice().sort(function (a, b) { return a.properties.name.localeCompare(b.properties.name); })
    .forEach(function (f) {
      byName[f.properties.name.toLowerCase()] = f;
      var o = document.createElement("option"); o.value = f.properties.name; dl.appendChild(o);
    });
  var search = document.getElementById("search");
  function goToCountry() {
    var f = byName[(search.value || "").trim().toLowerCase()]; if (!f) return;
    var lyr = idToLayer[f.id]; if (lyr) map.fitBounds(lyr.getBounds(), { maxZoom: 5 });
    openDetail(f.id, f.properties.name);
  }
  search.addEventListener("change", goToCountry);
  search.addEventListener("keydown", function (e) { if (e.key === "Enter") goToCountry(); });

  // ---- filter controls ----
  // (domain checkboxes were removed from the UI; all domains stay on by default)
  var af = document.getElementById("accessFilters");
  ACCESS_GROUPS.forEach(function (a) {
    var n = DATASETS.filter(function (ds) { return accessGroup(ds.access) === a; }).length;
    var row = document.createElement("label"); row.className = "row";
    row.innerHTML = '<input type="checkbox" checked>' + a + '<span class="count">' + n + '</span>';
    row.querySelector("input").onchange = function (e) { state.access[a] = e.target.checked; redraw(); };
    af.appendChild(row);
  });
  // time window — two sliders (from / to) + a per-year histogram of dataset availability
  var yearFromEl = document.getElementById("yearFrom"), yearToEl = document.getElementById("yearTo"),
      yearActive = document.getElementById("yearActive"), yearHistEl = document.getElementById("yearHist"),
      yearRangeControl = document.getElementById("yearRangeControl");
  [yearFromEl, yearToEl].forEach(function (el) { el.min = META.yearMin; el.max = META.yearMax; });
  yearFromEl.value = META.yearMin; yearToEl.value = META.yearMax;
  document.getElementById("yearMinL").textContent = META.yearMin;
  document.getElementById("yearMaxL").textContent = META.yearMax;
  // how many datasets have data in a given year (ignoring the window) — drives the histogram bars
  function datasetsInYear(y) {
    return DATASETS.filter(function (d) { return !d.years || (d.years[0] <= y && d.years[1] >= y); }).length;
  }
  function renderYearHist() {
    var html = "", maxN = 1, yMin = META.yearMin, yMax = META.yearMax, counts = {};
    for (var y = yMin; y <= yMax; y++) { counts[y] = datasetsInYear(y); if (counts[y] > maxN) maxN = counts[y]; }
    for (var y2 = yMin; y2 <= yMax; y2++) {
      var h = Math.round(100 * counts[y2] / maxN);
      var inWin = y2 >= state.yearFrom && y2 <= state.yearTo;
      html += '<div class="yb' + (inWin ? ' in' : '') + '" style="height:' + h + '%" title="' + y2 + ': ' + counts[y2] + ' datasets"></div>';
    }
    yearHistEl.innerHTML = html;
  }
  function updYearLabel() {
    document.getElementById("yearFromVal").textContent = state.yearFrom;
    document.getElementById("yearToVal").textContent = state.yearTo;
    document.getElementById("yearRangeVal").textContent =
      state.yearFrom === state.yearTo ? state.yearFrom : state.yearFrom + "–" + state.yearTo;
    var n = DATASETS.filter(inYearWindow).length;
    yearActive.textContent = n + " / " + DATASETS.length + " datasets";
    var span = META.yearMax - META.yearMin || 1;
    yearRangeControl.style.setProperty("--range-start", (100 * (state.yearFrom - META.yearMin) / span) + "%");
    yearRangeControl.style.setProperty("--range-end", (100 * (state.yearTo - META.yearMin) / span) + "%");
    renderYearHist();
  }
  function onYearInput() {
    var a = parseInt(yearFromEl.value, 10), b = parseInt(yearToEl.value, 10);
    if (a > b) {                                    // keep from ≤ to by pushing the other thumb
      if (document.activeElement === yearFromEl) { b = a; yearToEl.value = b; }
      else { a = b; yearFromEl.value = a; }
    }
    state.yearFrom = a; state.yearTo = b; updYearLabel(); redraw();
  }
  yearFromEl.oninput = onYearInput; yearToEl.oninput = onYearInput;
  yearFromEl.onpointerdown = function () { yearFromEl.style.zIndex = 4; yearToEl.style.zIndex = 3; };
  yearToEl.onpointerdown = function () { yearToEl.style.zIndex = 4; yearFromEl.style.zIndex = 2; };
  var yearlyHistogramsEl = document.getElementById("yearlyHistograms");
  yearlyHistogramsEl.onchange = function (event) {
    state.yearlyHistograms = event.target.checked;
    redraw();
  };

  function syncControls() {
    document.querySelectorAll('#accessFilters input').forEach(function (i, k) { i.checked = state.access[ACCESS_GROUPS[k]]; });
    yearlyHistogramsEl.checked = state.yearlyHistograms;
    yearFromEl.value = state.yearFrom; yearToEl.value = state.yearTo; updYearLabel();
  }

  // ---- shareable URL state ----
  var shareHash = "";
  function syncHash() {
    shareHash = window.DataDeserts.shareState.serialize(state, DOMAINS, ACCESS_GROUPS);
    // replaceState can throw on file:// in some browsers — never let it break redraw.
    try { history.replaceState(null, "", shareHash); } catch (e) { /* ignore */ }
  }
  function loadHash() {
    if (window.DataDeserts.shareState.hydrate(location.hash, state, META, DOMAINS, ACCESS_GROUPS)) {
      state.mode = "assessment";
      syncControls();
    }
  }
  function toast(msg, ms) {
    var t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
  }
  document.getElementById("linkBtn").onclick = function () {
    syncHash();
    try { location.hash = shareHash; } catch (e) { /* ignore */ }   // ensure it's in the address bar
    var url = location.origin && location.origin !== "null"
      ? location.href : (location.pathname + shareHash);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast("View link copied to clipboard"); },
        function () { toast("Link saved to the address bar — copy it from there"); });
    } else { toast("Link saved to the address bar — copy it from there"); }
  };

  // ---- PNG export ----
  document.getElementById("pngBtn").onclick = function () {
    try { exportPNG(); } catch (err) { toast("PNG export failed: " + err.message); }
  };
  function exportPNG() {
    var mapEl = document.getElementById("map");
    var mr = mapEl.getBoundingClientRect();
    var scale = 2, W = mr.width, H = mr.height;
    var canvas = document.createElement("canvas");
    canvas.width = W * scale; canvas.height = H * scale;
    var ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
    // ocean background (approx the CSS radial gradient)
    var bg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 1.2);
    bg.addColorStop(0, "#123049"); bg.addColorStop(0.6, "#0a2233"); bg.addColorStop(1, "#06151f");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    var svg = map.getPanes().overlayPane.querySelector("svg");
    if (!svg) { toast("Nothing to export yet"); return; }
    var sr = svg.getBoundingClientRect();
    var clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", sr.width); clone.setAttribute("height", sr.height);
    var data = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      ctx.drawImage(img, sr.left - mr.left, sr.top - mr.top, sr.width, sr.height);
      drawOverlayChrome(ctx, W, H);
      var a = document.createElement("a");
      a.download = "data-deserts-" + state.mode + "-" + state.yearFrom + "_" + state.yearTo + "-dhs.png";
      a.href = canvas.toDataURL("image/png"); a.click();
      toast("PNG downloaded");
    };
    img.onerror = function () { toast("PNG export failed while rasterising the map"); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
  }
  function drawOverlayChrome(ctx, W, H) {
    // title
    ctx.fillStyle = "rgba(15,22,32,.85)"; roundRect(ctx, 12, 12, 330, 56, 9); ctx.fill();
    ctx.fillStyle = "#e7edf3"; ctx.font = "600 17px -apple-system,Segoe UI,Roboto,sans-serif";
    ctx.fillText("Data Deserts — cross-domain coverage", 24, 34);
    ctx.fillStyle = "#9fb0c0"; ctx.font = "12px -apple-system,Segoe UI,Roboto,sans-serif";
    var sub = modeLabel() + "  ·  " + state.yearFrom + "–" + state.yearTo + "  ·  DHS countries";
    ctx.fillText(sub, 24, 54);
    // legend chip strip (domains / count)
    if (state.mode === "domains") {
      var labels = ["0", "1", "2", "3", "4"];
      ctx.font = "11px sans-serif";
      labels.forEach(function (lab, i) {
        var x = 16 + i * 56, y = H - 30;
        ctx.fillStyle = DOMAIN_COUNT[Math.min(i, 4)]; roundRect(ctx, x, y, 48, 18, 4); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText(lab + " dom", x + 6, y + 13);
      });
    }
  }
  function modeLabel() {
    return { assessment: "overall record assessment", domains: "domains with data", datasets: "dataset count", single: state.singleDomain,
             surveys: "public-health surveys", recency: "most recent survey",
             density: "GBIF record density", grdc: "GRDC gauge density" }[state.mode];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- intro / help overlay ----
  var introEl = document.getElementById("intro");
  function openIntro() { introEl.classList.add("open"); }
  function closeIntro() {
    introEl.classList.remove("open");
    try { localStorage.setItem("dd_seen", "1"); } catch (e) { /* file:// may block */ }
  }
  document.getElementById("introClose").onclick = closeIntro;
  document.getElementById("helpBtn").onclick = openIntro;
  function maybeShowIntro() {
    var seen = false;
    try { seen = localStorage.getItem("dd_seen") === "1"; } catch (e) { /* ignore */ }
    if (!seen && (!location.hash || location.hash.length < 2)) openIntro();   // skip if opening a shared view
  }

  // ---- init ----
  syncControls();
  loadHash();
  redraw();
  maybeShowIntro();
})();
