(function (global) {
  "use strict";

  global.DataDeserts = global.DataDeserts || {};

  function serialize(state, domains, accessGroups) {
    var params = new URLSearchParams();
    params.set("mode", state.mode);
    params.set("g", state.includeGlobal ? 1 : 0);
    params.set("fo", state.focusPct);
    params.set("yf", state.yearFrom);
    params.set("yt", state.yearTo);
    params.set("yh", state.yearlyHistograms ? 1 : 0);
    params.set("sd", state.singleDomain);
    params.set("d", domains.map(function (domain) { return state.domains[domain] ? 1 : 0; }).join(""));
    params.set("a", accessGroups.map(function (access) { return state.access[access] ? 1 : 0; }).join(""));
    return "#" + params.toString();
  }

  function hydrate(hash, state, meta, domains, accessGroups) {
    if (!hash || hash.length < 2) return false;
    var params = new URLSearchParams(hash.slice(1));
    if (params.has("mode")) state.mode = params.get("mode");
    if (params.has("g")) state.includeGlobal = params.get("g") === "1";
    if (params.has("fo")) state.focusPct = parseInt(params.get("fo"), 10);
    if (params.has("yf")) state.yearFrom = parseInt(params.get("yf"), 10);
    if (params.has("yt")) state.yearTo = parseInt(params.get("yt"), 10);
    else if (params.has("y")) {
      state.yearFrom = meta.yearMin;
      state.yearTo = parseInt(params.get("y"), 10);
    }
    if (params.has("yh")) state.yearlyHistograms = params.get("yh") === "1";
    if (params.has("sd")) state.singleDomain = params.get("sd");
    if (params.has("d")) {
      var selectedDomains = params.get("d");
      domains.forEach(function (domain, index) { state.domains[domain] = selectedDomains[index] !== "0"; });
    }
    if (params.has("a")) {
      var selectedAccess = params.get("a");
      accessGroups.forEach(function (access, index) { state.access[access] = selectedAccess[index] !== "0"; });
    }
    return true;
  }

  global.DataDeserts.shareState = Object.freeze({ serialize: serialize, hydrate: hydrate });
})(window);
