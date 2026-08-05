(function (global) {
  "use strict";

  global.DataDeserts = global.DataDeserts || {};

  global.DataDeserts.createState = function (meta, domains, accessGroups) {
    var state = {
      mode: "assessment",
      includeGlobal: true,
      yearFrom: meta.yearMin,
      yearTo: meta.yearMax,
      singleDomain: domains[0],
      domains: {},
      access: {},
      highlight: null,
      matrixMode: "count",
      gbifHeat: false,
      grdcHeat: false,
      yearlyHistograms: false,
      focusPct: 100
    };

    domains.forEach(function (domain) { state.domains[domain] = true; });
    accessGroups.forEach(function (access) { state.access[access] = true; });
    return state;
  };
})(window);
