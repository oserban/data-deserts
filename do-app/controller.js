(function () {
  "use strict";

  var scaleFrame = null;
  function updateControllerScale() {
    var scale = Math.max(0.75, Math.min(2.5,
      Math.min(window.innerWidth / 1920, window.innerHeight / 1080)));
    document.documentElement.style.fontSize = (16 * scale) + "px";
  }
  updateControllerScale();
  window.addEventListener("resize", function () {
    if (scaleFrame !== null) return;
    scaleFrame = window.requestAnimationFrame(function () {
      scaleFrame = null; updateControllerScale();
    });
  });

  var order = META.datasetOrder;
  var state = {
    yearFrom: META.yearMin,
    yearTo: META.yearMax,
    selected: order.slice(),
    yearlyHistograms: false,
    groupedDonuts: false,
    countries: []
  };
  var socket, reconnectTimer;
  var reconnectDelay = 500;
  var applicationBase = new URL(".", location.href);
  var mobileUrl = new URL("mini-controller", applicationBase);
  var publicUrl = new URLSearchParams(location.search).get("publicUrl");
  if (publicUrl) {
    try {
      var publicBase = new URL(publicUrl);
      if (!publicBase.pathname.endsWith("/")) publicBase.pathname += "/";
      mobileUrl = new URL("mini-controller", publicBase);
    } catch (error) { /* Use current origin. */ }
  }
  var mobileLink = document.getElementById("mobileControllerLink");
  mobileLink.href = mobileUrl.href; mobileLink.textContent = mobileUrl.href;
  document.getElementById("mobileControllerQr").src =
    new URL("qr?text=" + encodeURIComponent(mobileUrl.href), applicationBase).href;

  function sendState() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "state", state: state }));
    }
  }

  function sendNavigation(action, value) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "navigation", action: action, value: value }));
    }
  }

  function renderLegend() {
    var items = state.groupedDonuts ? META.categoryOrder.map(function (domain) {
      var keys = order.filter(function (key) { return DATASETS[key].domain === domain; });
      var colors = keys.map(function (key) { return DATASETS[key].color; });
      return { label: domain, keys: keys, color: "linear-gradient(90deg," + colors.join(",") + ")" };
    }).filter(function (item) { return item.keys.length; }) : order.map(function (key) {
      return { label: DATASETS[key].name, keys: [key], color: DATASETS[key].color };
    });
    document.getElementById("controllerLegend").innerHTML = items.map(function (item) {
      var selected = item.keys.some(function (key) { return state.selected.indexOf(key) !== -1; });
      return '<div class="controller-legend-row' + (selected ? '' : ' off') + '"><i style="background:' +
        item.color + '"></i><span>' + item.label + '</span></div>';
    }).join("");
  }

  function setConnection(kind, message) {
    var element = document.getElementById("connection");
    element.className = "status " + kind;
    element.querySelector("span").textContent = message;
  }

  function connect() {
    clearTimeout(reconnectTimer);
    var params = new URLSearchParams(location.search);
    var defaultSocketUrl = new URL("ws", applicationBase);
    defaultSocketUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    var url = params.get("ws") || defaultSocketUrl.href;
    setConnection("", "Connecting…");
    try { socket = new WebSocket(url); } catch (error) {
      setConnection("error", "Connection failed — retrying");
      reconnectTimer = setTimeout(connect, reconnectDelay); return;
    }
    socket.onopen = function () {
      setConnection("connected", "Connected");
      socket.send(JSON.stringify({ type: "hello", role: "controller" }));
      sendState();
    };
    socket.onmessage = function (event) {
      try {
        var message = JSON.parse(event.data);
        if (message.type === "reload") { location.reload(); return; }
        if (message.type === "peers") {
          setConnection("connected", "Connected · " + message.renderers + " renderer" +
            (message.renderers === 1 ? "" : "s") + " · " + (message.details || 0) + " info panel" +
            (message.details === 1 ? "" : "s"));
        }
        if (message.type === "view" && Number.isFinite(message.zoom)) {
          document.getElementById("zoomLevel").textContent = message.zoom;
        }
        if (message.type === "selection" && typeof message.country === "string") {
          toggleCountry(message.country);
        }
        if (message.type === "countries" && Array.isArray(message.countries)) {
          state.countries = message.countries.slice(); updateCountrySelectionUI();
        }
      } catch (error) { /* Ignore malformed relay messages. */ }
    };
    socket.onerror = function () { setConnection("error", "Connection interrupted"); };
    socket.onclose = function () {
      setConnection("error", "Disconnected — retrying");
      reconnectTimer = setTimeout(connect, reconnectDelay);
    };
  }

  var from = document.getElementById("yearFrom"), to = document.getElementById("yearTo");
  var rangeControl = document.getElementById("yearRangeControl");
  var rangeSelected = document.getElementById("yearRangeSelected");
  [from, to].forEach(function (handle) {
    handle.setAttribute("aria-valuemin", META.yearMin);
    handle.setAttribute("aria-valuemax", META.yearMax);
  });
  document.getElementById("yearMinLabel").textContent = META.yearMin;
  document.getElementById("yearMaxLabel").textContent = META.yearMax;

  function updateYears() {
    var span = META.yearMax - META.yearMin || 1;
    var fromPosition = 100 * (state.yearFrom - META.yearMin) / span;
    var toPosition = 100 * (state.yearTo - META.yearMin) / span;
    from.style.left = fromPosition + "%"; to.style.left = toPosition + "%";
    rangeSelected.style.left = fromPosition + "%";
    rangeSelected.style.width = (toPosition - fromPosition) + "%";
    from.setAttribute("aria-valuenow", state.yearFrom); to.setAttribute("aria-valuenow", state.yearTo);
    from.dataset.value = state.yearFrom; to.dataset.value = state.yearTo;
    document.getElementById("yearOutput").textContent = state.yearFrom + "–" + state.yearTo;
    sendState();
  }

  function setHandleYear(handle, year) {
    year = Math.max(META.yearMin, Math.min(META.yearMax, Math.round(year)));
    if (handle === from) state.yearFrom = Math.min(year, state.yearTo);
    else state.yearTo = Math.max(year, state.yearFrom);
    updateYears();
  }

  function yearAtPointer(clientX) {
    var bounds = rangeControl.getBoundingClientRect();
    var amount = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return META.yearMin + amount * (META.yearMax - META.yearMin);
  }

  function bindHandle(handle) {
    handle.addEventListener("pointerdown", function (event) {
      event.preventDefault(); handle.setPointerCapture(event.pointerId); handle.classList.add("dragging");
      setHandleYear(handle, yearAtPointer(event.clientX));
    });
    handle.addEventListener("pointermove", function (event) {
      if (handle.hasPointerCapture(event.pointerId)) setHandleYear(handle, yearAtPointer(event.clientX));
    });
    function finish(event) {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      handle.classList.remove("dragging");
    }
    handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
    handle.addEventListener("keydown", function (event) {
      var value = handle === from ? state.yearFrom : state.yearTo;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") value--;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") value++;
      else if (event.key === "PageDown") value -= 10;
      else if (event.key === "PageUp") value += 10;
      else if (event.key === "Home") value = META.yearMin;
      else if (event.key === "End") value = META.yearMax;
      else return;
      event.preventDefault(); setHandleYear(handle, value);
    });
  }
  bindHandle(from); bindHandle(to);
  rangeControl.addEventListener("pointerdown", function (event) {
    if (event.target === from || event.target === to) return;
    var year = yearAtPointer(event.clientX);
    var handle = Math.abs(year - state.yearFrom) <= Math.abs(year - state.yearTo) ? from : to;
    handle.focus(); setHandleYear(handle, year);
  });
  updateYears();

  ["yearlyHistograms", "groupedDonuts"].forEach(function (key) {
    document.getElementById(key).onchange = function () {
      state[key] = this.checked;
      if (key === "groupedDonuts") renderLegend();
      sendState();
    };
  });

  document.getElementById("zoomIn").onclick = function () { sendNavigation("zoomIn"); };
  document.getElementById("zoomOut").onclick = function () { sendNavigation("zoomOut"); };
  document.querySelectorAll(".pan-controls button").forEach(function (button) {
    button.onclick = function () { sendNavigation("pan", button.dataset.direction); };
  });
  ["World", "Africa", "Asia", "Europe", "Americas"].forEach(function (region, index) {
    var button = document.createElement("button"); button.type = "button"; button.textContent = region;
    if (!index) button.className = "active";
    button.onclick = function () {
      document.querySelectorAll("#regionControls button").forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active"); sendNavigation("region", region);
    };
    document.getElementById("regionControls").appendChild(button);
  });

  var countriesByName = {}, countryList = document.getElementById("controllerCountryList");
  var countriesByIso = {};
  WORLD_GEOJSON.features.slice().sort(function (a, b) {
    return a.properties.name.localeCompare(b.properties.name);
  }).forEach(function (feature) {
    countriesByName[feature.properties.name.toLowerCase()] = feature.id;
    countriesByIso[feature.id] = feature;
    var option = document.createElement("option"); option.value = feature.properties.name;
    countryList.appendChild(option);
  });
  var navigateButton = document.getElementById("navigateCountry");
  function selectedCountry() {
    var input = document.getElementById("countrySearch");
    return countriesByName[input.value.trim().toLowerCase()];
  }
  function updateCountrySelection() { navigateButton.disabled = !selectedCountry(); }
  function navigateCountry() {
    var iso = selectedCountry();
    if (iso && state.countries.indexOf(iso) === -1) {
      state.countries.push(iso); updateCountrySelectionUI(); sendState();
    }
  }
  function toggleCountry(iso) {
    if (!countriesByIso[iso]) return;
    var index = state.countries.indexOf(iso);
    if (index === -1) state.countries.push(iso); else state.countries.splice(index, 1);
    updateCountrySelectionUI(); sendState();
  }
  function updateCountrySelectionUI() {
    state.countries.sort(function (first, second) {
      return countriesByIso[first].properties.name.localeCompare(countriesByIso[second].properties.name);
    });
    var selectedContainer = document.getElementById("selectedCountries");
    selectedContainer.innerHTML = "";
    if (!state.countries.length) {
      var empty = document.createElement("small"); empty.textContent = "No countries selected";
      selectedContainer.appendChild(empty);
    }
    state.countries.forEach(function (iso) {
      var button = document.createElement("button"); button.type = "button";
      button.textContent = countriesByIso[iso].properties.name + " ×";
      button.title = "Remove " + countriesByIso[iso].properties.name;
      button.onclick = function () { toggleCountry(iso); };
      selectedContainer.appendChild(button);
    });
    document.querySelectorAll("#quickCountries button").forEach(function (button) {
      button.classList.toggle("active", state.countries.indexOf(button.dataset.iso) !== -1);
    });
    document.getElementById("clearCountries").disabled = !state.countries.length;
  }
  document.getElementById("countrySearch").oninput = updateCountrySelection;
  document.getElementById("countrySearch").onchange = updateCountrySelection;
  document.getElementById("countrySearch").onkeydown = function (event) {
    if (event.key === "Enter" && !navigateButton.disabled) navigateCountry();
  };
  navigateButton.onclick = navigateCountry;
  document.getElementById("clearCountries").onclick = function () {
    state.countries = []; updateCountrySelectionUI(); sendState();
  };

  function stableScore(value) {
    var score = 2166136261;
    for (var index = 0; index < value.length; index++) {
      score ^= value.charCodeAt(index);
      score = Math.imul(score, 16777619);
    }
    return score >>> 0;
  }
  var scopeKeys = META.scopeDatasets || [META.scopeDataset];
  var scopeCountries = {};
  scopeKeys.forEach(function (key) {
    Object.keys(DATASETS[key].records).forEach(function (iso) { scopeCountries[iso] = true; });
  });
  var candidates = Object.keys(scopeCountries).filter(function (iso) { return countriesByIso[iso]; }).map(function (iso) {
    var available = order.filter(function (key) {
      return DATASETS[key].records[iso] && Object.keys(DATASETS[key].records[iso]).length;
    });
    return { iso: iso, name: countriesByIso[iso].properties.name, available: available };
  }).sort(function (first, second) { return first.available.length - second.available.length; });
  var third = Math.ceil(candidates.length / 3);
  var coverageBands = [
    candidates.slice(0, third),
    candidates.slice(third, third * 2),
    candidates.slice(third * 2)
  ];
  coverageBands.forEach(function (band) {
    band.sort(function (first, second) { return stableScore(first.iso) - stableScore(second.iso); });
  });
  var quickSelection = [], bandIndex = 0;
  while (quickSelection.length < 30 && coverageBands.some(function (band) { return band.length; })) {
    var band = coverageBands[bandIndex % coverageBands.length];
    if (band.length) quickSelection.push(band.shift());
    bandIndex++;
  }
  quickSelection.sort(function (first, second) { return first.name.localeCompare(second.name); });
  var quickContainer = document.getElementById("quickCountries");
  quickSelection.forEach(function (country) {
    var button = document.createElement("button"); button.type = "button";
    var name = document.createElement("span"); name.textContent = country.name; button.appendChild(name);
    var count = document.createElement("small"); count.textContent = country.available.length + "/" + order.length;
    button.appendChild(count);
    button.dataset.iso = country.iso;
    button.title = country.available.length + " datasets with records: " +
      country.available.map(function (key) { return DATASETS[key].name; }).join(", ");
    button.onclick = function () {
      document.getElementById("countrySearch").value = country.name;
      updateCountrySelection(); toggleCountry(country.iso);
    };
    quickContainer.appendChild(button);
  });
  updateCountrySelectionUI();

  var container = document.getElementById("datasetFilters");
  META.categoryOrder.forEach(function (domain) {
    var keys = order.filter(function (key) { return DATASETS[key].domain === domain; });
    if (!keys.length) return;
    var group = document.createElement("div"); group.className = "category";
    var heading = document.createElement("h3"); heading.textContent = domain; group.appendChild(heading);
    keys.forEach(function (key) {
      var label = document.createElement("label"); label.className = "dataset";
      label.innerHTML = '<input type="checkbox" checked><i style="background:' + DATASETS[key].color + '"></i><span></span>';
      label.querySelector("span").textContent = DATASETS[key].name;
      label.querySelector("input").onchange = function () {
        state.selected = order.filter(function (candidate) {
          var checkbox = container.querySelector('[data-key="' + candidate + '"]');
          return checkbox && checkbox.checked;
        });
        renderLegend();
        sendState();
      };
      label.querySelector("input").dataset.key = key;
      group.appendChild(label);
    });
    container.appendChild(group);
  });

  function selectAll(selected) {
    container.querySelectorAll("input").forEach(function (checkbox) { checkbox.checked = selected; });
    state.selected = selected ? order.slice() : [];
    renderLegend();
    sendState();
  }
  document.getElementById("selectAll").onclick = function () { selectAll(true); };
  document.getElementById("selectNone").onclick = function () { selectAll(false); };
  renderLegend();
  connect();
})();
