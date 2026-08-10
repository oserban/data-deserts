(function () {
  "use strict";
  var selected = [], socket, reconnectTimer;
  var countries = WORLD_GEOJSON.features.filter(function (feature) {
    return (META.scopeDatasets || [META.scopeDataset]).some(function (key) {
      return DATASETS[key].records[feature.id];
    });
  }).map(function (feature) {
    return { iso: feature.id, name: feature.properties.name };
  }).sort(function (first, second) { return first.name.localeCompare(second.name); });

  function setConnection(kind, message) {
    var element = document.getElementById("connection");
    element.className = "status " + kind; element.querySelector("span").textContent = message;
  }
  function sendCountries() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "countries", countries: selected }));
    }
  }
  function toggleCountry(iso) {
    var index = selected.indexOf(iso);
    if (index === -1) selected.push(iso); else selected.splice(index, 1);
    selected.sort(function (first, second) {
      return countryName(first).localeCompare(countryName(second));
    });
    render(); sendCountries();
  }
  function countryName(iso) {
    var country = countries.find(function (item) { return item.iso === iso; });
    return country ? country.name : iso;
  }
  function render() {
    var query = document.getElementById("countrySearch").value.trim().toLowerCase();
    var list = document.getElementById("countryList"); list.innerHTML = "";
    countries.filter(function (country) { return country.name.toLowerCase().indexOf(query) !== -1; })
      .forEach(function (country) {
        var button = document.createElement("button"); button.type = "button";
        button.textContent = country.name; button.classList.toggle("active", selected.indexOf(country.iso) !== -1);
        button.onclick = function () { toggleCountry(country.iso); }; list.appendChild(button);
      });
    var chosen = document.getElementById("selectedCountries"); chosen.innerHTML = "";
    selected.forEach(function (iso) {
      var button = document.createElement("button"); button.type = "button";
      button.textContent = countryName(iso) + " ×"; button.onclick = function () { toggleCountry(iso); };
      chosen.appendChild(button);
    });
    if (!selected.length) {
      var empty = document.createElement("small"); empty.textContent = "No countries selected"; chosen.appendChild(empty);
    }
    document.getElementById("clearCountries").disabled = !selected.length;
  }
  function connect() {
    clearTimeout(reconnectTimer);
    var params = new URLSearchParams(location.search);
    var url = params.get("ws") || ((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    setConnection("", "Connecting…"); socket = new WebSocket(url);
    socket.onopen = function () {
      setConnection("connected", "Connected to display");
      socket.send(JSON.stringify({ type: "hello", role: "mini-controller" }));
    };
    socket.onmessage = function (event) {
      try {
        var message = JSON.parse(event.data);
        if (message.type === "reload") { location.reload(); return; }
        if (message.type === "state" && message.state && Array.isArray(message.state.countries)) {
          selected = message.state.countries.filter(function (iso) {
            return countries.some(function (country) { return country.iso === iso; });
          }); render();
        }
      } catch (error) { /* Ignore malformed relay messages. */ }
    };
    socket.onerror = function () { setConnection("error", "Connection interrupted"); };
    socket.onclose = function () {
      setConnection("error", "Disconnected · retrying"); reconnectTimer = setTimeout(connect, 500);
    };
  }
  document.getElementById("countrySearch").oninput = render;
  document.getElementById("clearCountries").onclick = function () { selected = []; render(); sendCountries(); };
  render(); connect();
}());
