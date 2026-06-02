/* Data Deserts — interactive cross-domain coverage map.
   Reads window.DATASETS, window.META, window.WORLD_GEOJSON, window.GBIF_DENSITY. */
(function () {
  "use strict";

  var DOMAINS = META.domains;
  var DOMAIN_COLOR = {
    "Ecology": "#4daf4a", "Hydro": "#377eb8",
    "Agriculture": "#ff7f00", "Public Health": "#e41a1c"
  };
  var COUNT_COLOR = ["#3a4654", "#d7191c", "#fdae61", "#a6d96a", "#1a9641", "#0d6b2c"];
  var ACCESS_GROUPS = ["Public", "Private", "Both"];
  var GBIF = window.GBIF_DENSITY || {};

  var state = {
    mode: "domains", includeGlobal: true, patchy: false, threshLog: 6,
    year: META.yearMax, singleDomain: DOMAINS[0],
    domains: {}, access: {}, highlight: null, matrixMode: "count", gbifHeat: false
  };
  DOMAINS.forEach(function (d) { state.domains[d] = true; });
  ACCESS_GROUPS.forEach(function (a) { state.access[a] = true; });

  function thresh() { return Math.round(Math.pow(10, state.threshLog)); }
  function accessGroup(s) {
    if (/both/i.test(s)) return "Both";
    if (/private/i.test(s)) return "Private";
    return "Public";
  }
  function datasetActive(ds) {
    if (!state.includeGlobal && ds.global) return false;
    if (ds.years && ds.years[0] > state.year) return false;       // time filter
    if (!state.access[accessGroup(ds.access)]) return false;
    return ds.domains.some(function (d) { return state.domains[d]; });
  }
  function coversCountry(ds, iso) {
    if (ds.coverage === "GLOBAL") {
      if (state.patchy && ds.densityProxy) return (GBIF[iso] || 0) >= thresh();
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
        // strict mode: a land-cover raster is not biodiversity field data, so it
        // doesn't by itself confer "Ecology" presence.
        if (state.patchy && ds.landcover && d === "Ecology") return;
        if (state.domains[d]) domSet[d] = true;
      });
    });
    return { datasets: hits, domains: DOMAINS.filter(function (d) { return domSet[d]; }) };
  }
  function countryValue(iso) {
    if (state.mode === "density") return GBIF[iso] || 0;
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
  function fillColor(iso) {
    if (state.mode === "density") {
      var c = GBIF[iso] || 0;
      if (state.patchy) return c >= thresh() ? "#1a9641" : (c ? "#d7191c" : "#2a3441");  // hard cutoff
      return densityColor(c);
    }
    var v = countryValue(iso);
    if (state.mode === "single") return v ? DOMAIN_COLOR[state.singleDomain] : COUNT_COLOR[0];
    if (state.mode === "datasets") {
      if (v === 0) return COUNT_COLOR[0];
      if (v <= 2) return COUNT_COLOR[1];
      if (v <= 4) return COUNT_COLOR[2];
      if (v <= 6) return COUNT_COLOR[3];
      if (v <= 9) return COUNT_COLOR[4];
      return COUNT_COLOR[5];
    }
    return COUNT_COLOR[Math.min(v, 4)];
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
      lyr.bindTooltip(function () {
        if (state.mode === "density") {
          var c = GBIF[feat.id] || 0;
          return '<b>' + feat.properties.name + '</b><br>' +
            (c ? c.toLocaleString() + ' GBIF records' : '<span style="color:#ff7b6b">no GBIF records</span>');
        }
        var info = countryInfo(feat.id);
        var chips = info.domains.map(function (d) {
          return '<span class="dom" style="background:' + DOMAIN_COLOR[d] + '"></span>' + d;
        }).join("&nbsp; ");
        return '<b>' + feat.properties.name + '</b><br>' +
          (info.domains.length ? info.domains.length + ' / 4 domains<br>' + chips
            : '<span style="color:#ff7b6b">no data in active layers</span>');
      }, { className: "ctip leaflet-tooltip-own", sticky: true, direction: "top", opacity: 1 });
    }
  }).addTo(map);

  function styleFn(feat) {
    if (state.gbifHeat && !state.highlight) {
      // transparent fills so the heatmap shows through; keep faint country outlines as a guide
      return { fillColor: "#000", fillOpacity: 0, color: "#7f93a8", weight: 0.5, opacity: 0.55 };
    }
    if (state.highlight) {
      var ds = DATASETS.find(function (d) { return d.name === state.highlight; });
      var on = ds && coversCountry(ds, feat.id);
      return { fillColor: on ? (DOMAIN_COLOR[ds.domains[0]] || "#5ec5ff") : "#2a3441",
               fillOpacity: on ? 0.9 : 0.18, color: on ? "#ffffff" : "#1b2734", weight: on ? 1.2 : 0.5 };
    }
    return { fillColor: fillColor(feat.id), fillOpacity: 0.85, color: "#1b2734", weight: 0.6 };
  }
  function applyStyles() { layer.setStyle(styleFn); }

  function redraw() {
    applyStyles(); updateStats(); updateLegend();
    if (insightsOpen) renderInsights();
    syncHash();
  }

  // ---- detail panel ----
  var detail = document.getElementById("detail");
  document.getElementById("detailClose").onclick = function () { detail.style.display = "none"; };
  function openDetail(iso, name) {
    var info = countryInfo(iso);
    document.getElementById("dName").textContent = name;
    var dens = GBIF[iso] ? ' &middot; ' + GBIF[iso].toLocaleString() + ' GBIF records' : '';
    document.getElementById("dMeta").innerHTML =
      info.domains.length + " of 4 domains &middot; " + info.datasets.length + " dataset(s) active" + dens;
    var body = document.getElementById("dBody");
    body.innerHTML = "";
    if (!info.datasets.length) {
      body.innerHTML = '<div class="empty">No active datasets cover this country under the current filters — a data desert.</div>';
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
    var n = ds.coverage === "GLOBAL" ? "every land country (global)" : ds.coverage.length + " countries";
    document.getElementById("fpText").innerHTML = "Footprint: <b>" + name + "</b> — " + n;
    fpBanner.style.display = "flex"; applyStyles();
  }
  function clearFootprint() { state.highlight = null; fpBanner.style.display = "none"; applyStyles(); }
  document.getElementById("fpClear").onclick = clearFootprint;

  // ---- stats ----
  function domainDistribution() {
    var dist = [0, 0, 0, 0, 0];
    WORLD_GEOJSON.features.forEach(function (f) { dist[Math.min(countryInfo(f.id).domains.length, 4)]++; });
    return dist;
  }
  function updateStats() {
    var dist = domainDistribution(), total = WORLD_GEOJSON.features.length;
    document.getElementById("stats").innerHTML =
      '<div class="stat desert"><b>' + (dist[0] + dist[1]) + '</b> data deserts <span class="count">(0–1 domains, of ' + total + ')</span></div>' +
      '<div class="stat"><b>' + dist[2] + '</b> with 2 domains</div>' +
      '<div class="stat"><b>' + dist[3] + '</b> with 3 domains</div>' +
      '<div class="stat"><b>' + dist[4] + '</b> with all 4 domains</div>';
  }

  // ---- legend ----
  function updateLegend() {
    var el = document.getElementById("legend");
    if (state.mode === "density") {
      if (state.patchy) {
        el.innerHTML =
          '<div class="legend-row"><span class="box" style="background:#1a9641"></span>&ge; ' + thresh().toLocaleString() + ' records</div>' +
          '<div class="legend-row"><span class="box" style="background:#d7191c"></span>below threshold (biodiversity desert)</div>' +
          '<div class="legend-row"><span class="box" style="background:#2a3441"></span>no GBIF records</div>';
      } else {
        el.innerHTML =
          '<div class="legend-bar" style="background:linear-gradient(90deg,#f7fcbe,#7fd0db,#1f6fbf,#0a2e6e)"></div>' +
          '<div class="legend-ends"><span>few records</span><span>' + (META.gbifMax / 1e9).toFixed(1) + 'B</span></div>' +
          '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:#2a3441"></span>no GBIF records</div>';
      }
    } else if (state.mode === "single") {
      el.innerHTML =
        '<div class="legend-row"><span class="box" style="background:' + DOMAIN_COLOR[state.singleDomain] + '"></span>' + state.singleDomain + ' present</div>' +
        '<div class="legend-row"><span class="box" style="background:' + COUNT_COLOR[0] + '"></span>absent</div>';
    } else if (state.mode === "datasets") {
      var bins = [["0", COUNT_COLOR[0]], ["1–2", COUNT_COLOR[1]], ["3–4", COUNT_COLOR[2]], ["5–6", COUNT_COLOR[3]], ["7–9", COUNT_COLOR[4]], ["10+", COUNT_COLOR[5]]];
      el.innerHTML = bins.map(function (b) { return '<div class="legend-row"><span class="box" style="background:' + b[1] + '"></span>' + b[0] + ' datasets</div>'; }).join("");
    } else {
      el.innerHTML = '<div class="legend-bar"></div><div class="legend-ends"><span>0 — desert</span><span>4 — rich</span></div>' +
        '<div class="legend-row" style="margin-top:6px"><span class="box" style="background:' + COUNT_COLOR[0] + '"></span>no data in active layers</div>';
    }
  }

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

  // ---- GBIF live density heatmap toggle ----
  var gbifBtn = document.getElementById("gbifBtn");
  gbifBtn.onclick = function () {
    state.gbifHeat = !state.gbifHeat;
    gbifBtn.classList.toggle("active", state.gbifHeat);
    document.getElementById("gbifLegend").style.display = state.gbifHeat ? "block" : "none";
    if (state.gbifHeat) {
      cartoBase.addTo(map); gbifHeat.addTo(map);
      toast("Live GBIF density on — scroll to zoom into any region to see within-country patchiness.  © GBIF.org, © CARTO", 5000);
    } else {
      map.removeLayer(gbifHeat); map.removeLayer(cartoBase);
    }
    applyStyles();
  };

  function renderInsights() {
    var sets = WORLD_GEOJSON.features.map(function (f) { return { id: f.id, name: f.properties.name, doms: countryInfo(f.id).domains }; });
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
  function datasetsInDomain(d) { return DATASETS.filter(function (ds) { return ds.domains.indexOf(d) !== -1; }).length; }
  var df = document.getElementById("domainFilters");
  DOMAINS.forEach(function (d) {
    var row = document.createElement("label"); row.className = "row";
    row.innerHTML = '<input type="checkbox" checked><span class="swatch" style="background:' + DOMAIN_COLOR[d] + '"></span>' + d + '<span class="count">' + datasetsInDomain(d) + '</span>';
    row.querySelector("input").onchange = function (e) { state.domains[d] = e.target.checked; redraw(); };
    df.appendChild(row);
  });
  var af = document.getElementById("accessFilters");
  ACCESS_GROUPS.forEach(function (a) {
    var n = DATASETS.filter(function (ds) { return accessGroup(ds.access) === a; }).length;
    var row = document.createElement("label"); row.className = "row";
    row.innerHTML = '<input type="checkbox" checked>' + a + '<span class="count">' + n + '</span>';
    row.querySelector("input").onchange = function (e) { state.access[a] = e.target.checked; redraw(); };
    af.appendChild(row);
  });
  var sd = document.getElementById("singleDomain");
  DOMAINS.forEach(function (d) { var o = document.createElement("option"); o.value = d; o.textContent = d; sd.appendChild(o); });
  sd.onchange = function (e) { state.singleDomain = e.target.value; redraw(); };

  document.getElementById("mode").onchange = function (e) {
    state.mode = e.target.value;
    document.getElementById("singleWrap").style.display = state.mode === "single" ? "block" : "none";
    redraw();
  };
  var igEl = document.getElementById("includeGlobal");
  igEl.onchange = function (e) { state.includeGlobal = e.target.checked; redraw(); };
  var patchyEl = document.getElementById("patchy"), threshWrap = document.getElementById("threshWrap"),
      threshEl = document.getElementById("thresh"), threshVal = document.getElementById("threshVal");
  function updThreshLabel() { threshVal.textContent = thresh().toLocaleString(); }
  patchyEl.onchange = function (e) { state.patchy = e.target.checked; threshWrap.style.display = state.patchy ? "block" : "none"; redraw(); };
  threshEl.oninput = function (e) { state.threshLog = parseFloat(e.target.value); updThreshLabel(); redraw(); };

  // time slider
  var yearEl = document.getElementById("year"), yearVal = document.getElementById("yearVal"), yearActive = document.getElementById("yearActive");
  yearEl.min = META.yearMin; yearEl.max = META.yearMax; yearEl.value = META.yearMax;
  document.getElementById("yearMinL").textContent = META.yearMin;
  document.getElementById("yearMaxL").textContent = META.yearMax;
  function updYearLabel() {
    yearVal.textContent = state.year;
    var n = DATASETS.filter(function (d) { return !d.years || d.years[0] <= state.year; }).length;
    yearActive.textContent = n + " / " + DATASETS.length + " datasets exist";
  }
  yearEl.oninput = function (e) { state.year = parseInt(e.target.value, 10); updYearLabel(); redraw(); };

  document.getElementById("reset").onclick = function () { resetState(); redraw(); };

  function resetState() {
    DOMAINS.forEach(function (d) { state.domains[d] = true; });
    ACCESS_GROUPS.forEach(function (a) { state.access[a] = true; });
    state.includeGlobal = true; state.patchy = false; state.mode = "domains";
    state.year = META.yearMax; state.threshLog = 6; clearFootprint();
    syncControls(); detail.style.display = "none";
  }
  function syncControls() {
    document.querySelectorAll('#domainFilters input').forEach(function (i, k) { i.checked = state.domains[DOMAINS[k]]; });
    document.querySelectorAll('#accessFilters input').forEach(function (i, k) { i.checked = state.access[ACCESS_GROUPS[k]]; });
    igEl.checked = state.includeGlobal;
    patchyEl.checked = state.patchy; threshWrap.style.display = state.patchy ? "block" : "none";
    threshEl.value = state.threshLog; updThreshLabel();
    document.getElementById("mode").value = state.mode;
    document.getElementById("singleWrap").style.display = state.mode === "single" ? "block" : "none";
    sd.value = state.singleDomain;
    yearEl.value = state.year; updYearLabel();
  }

  // ---- shareable URL state ----
  var shareHash = "";
  function syncHash() {
    var p = new URLSearchParams();
    p.set("mode", state.mode);
    p.set("g", state.includeGlobal ? 1 : 0);
    p.set("p", state.patchy ? 1 : 0);
    p.set("t", state.threshLog);
    p.set("y", state.year);
    p.set("sd", state.singleDomain);
    p.set("d", DOMAINS.map(function (d) { return state.domains[d] ? 1 : 0; }).join(""));
    p.set("a", ACCESS_GROUPS.map(function (a) { return state.access[a] ? 1 : 0; }).join(""));
    shareHash = "#" + p.toString();
    // replaceState can throw on file:// in some browsers — never let it break redraw.
    try { history.replaceState(null, "", shareHash); } catch (e) { /* ignore */ }
  }
  function loadHash() {
    if (!location.hash || location.hash.length < 2) return;
    var p = new URLSearchParams(location.hash.slice(1));
    if (p.has("mode")) state.mode = p.get("mode");
    if (p.has("g")) state.includeGlobal = p.get("g") === "1";
    if (p.has("p")) state.patchy = p.get("p") === "1";
    if (p.has("t")) state.threshLog = parseFloat(p.get("t"));
    if (p.has("y")) state.year = parseInt(p.get("y"), 10);
    if (p.has("sd")) state.singleDomain = p.get("sd");
    if (p.has("d")) { var d = p.get("d"); DOMAINS.forEach(function (dom, k) { state.domains[dom] = d[k] !== "0"; }); }
    if (p.has("a")) { var a = p.get("a"); ACCESS_GROUPS.forEach(function (ac, k) { state.access[ac] = a[k] !== "0"; }); }
    syncControls();
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
      a.download = "data-deserts-" + state.mode + "-" + state.year + (state.includeGlobal ? "" : "-insitu") + ".png";
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
    var sub = modeLabel() + "  ·  data by " + state.year + (state.includeGlobal ? "  ·  all layers" : "  ·  in-situ only") + (state.patchy ? "  ·  patchy" : "");
    ctx.fillText(sub, 24, 54);
    // legend chip strip (domains / count)
    if (state.mode === "domains") {
      var labels = ["0", "1", "2", "3", "4"];
      ctx.font = "11px sans-serif";
      labels.forEach(function (lab, i) {
        var x = 16 + i * 56, y = H - 30;
        ctx.fillStyle = COUNT_COLOR[Math.min(i, 4)]; roundRect(ctx, x, y, 48, 18, 4); ctx.fill();
        ctx.fillStyle = "#06151f"; ctx.fillText(lab + " dom", x + 6, y + 13);
      });
    }
  }
  function modeLabel() {
    return { domains: "domains with data", datasets: "dataset count", single: state.singleDomain, density: "GBIF record density" }[state.mode];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- story mode ----
  var STORY = [
    { cap: "Start with <b>everything</b>. With all 18 datasets switched on, almost every country shows 3 or 4 domains — the world looks comfortably data-rich.",
      fn: function () { resetState(); state.mode = "domains"; syncControls(); } },
    { cap: "But look closer. <b>No wealthy country has any public-health survey data</b> — DHS and MICS only run in low- and middle-income countries. The Global North is a health-data desert.",
      fn: function () { resetState(); state.mode = "single"; state.singleDomain = "Public Health"; syncControls(); } },
    { cap: "Now strip away the <b>global products</b> — the satellites and reanalyses that blanket the planet by default — and keep only data someone actually collected on the ground.",
      fn: function () { resetState(); state.includeGlobal = false; state.mode = "domains"; syncControls(); } },
    { cap: "Most of the map collapses into <b>total data deserts</b>. Only a couple of countries hold in-situ data in three domains at once.",
      fn: function () { resetState(); state.includeGlobal = false; state.mode = "domains"; syncControls(); toggleInsights(false); } },
    { cap: "Even 'global' biodiversity data is a mirage. GBIF's <b>billions of records cluster in the US and Europe</b>; across much of the tropics there is almost nothing.",
      fn: function () { resetState(); state.mode = "density"; syncControls(); } },
    { cap: "The real story is the <b>overlap between domains</b>. Require ground-truth data and Ecology &amp; Agriculture share almost no countries. The cross-domain map is nearly empty — that is the data desert.",
      fn: function () { resetState(); state.includeGlobal = false; state.mode = "domains"; syncControls(); toggleInsights(true); } }
  ];
  var storyEl = document.getElementById("story"), storyIdx = 0, playing = false, playTimer = null;
  function showStory(i) {
    storyIdx = (i + STORY.length) % STORY.length;
    STORY[storyIdx].fn(); redraw();
    document.getElementById("storyStep").textContent = "Step " + (storyIdx + 1) + " of " + STORY.length;
    document.getElementById("storyCap").innerHTML = STORY[storyIdx].cap;
  }
  function openStory() { storyEl.classList.add("open"); document.getElementById("storyBtn").classList.add("active"); showStory(0); }
  function exitStory() {
    storyEl.classList.remove("open"); document.getElementById("storyBtn").classList.remove("active");
    stopPlay(); toggleInsights(false);
  }
  function stopPlay() { playing = false; clearInterval(playTimer); document.getElementById("storyPlay").textContent = "Play"; }
  document.getElementById("storyBtn").onclick = function () { storyEl.classList.contains("open") ? exitStory() : openStory(); };
  document.getElementById("storyNext").onclick = function () { stopPlay(); showStory(storyIdx + 1); };
  document.getElementById("storyPrev").onclick = function () { stopPlay(); showStory(storyIdx - 1); };
  document.getElementById("storyExit").onclick = exitStory;
  document.getElementById("storyPlay").onclick = function () {
    if (playing) { stopPlay(); return; }
    playing = true; this.textContent = "Pause";
    playTimer = setInterval(function () {
      if (storyIdx === STORY.length - 1) { stopPlay(); return; }
      showStory(storyIdx + 1);
    }, 6500);
  };

  // ---- intro / help overlay ----
  var introEl = document.getElementById("intro");
  function openIntro() { introEl.classList.add("open"); }
  function closeIntro() {
    introEl.classList.remove("open");
    try { localStorage.setItem("dd_seen", "1"); } catch (e) { /* file:// may block */ }
  }
  document.getElementById("introClose").onclick = closeIntro;
  document.getElementById("introTour").onclick = function () { closeIntro(); openStory(); };
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
