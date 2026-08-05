(function (global) {
  "use strict";

  global.DataDeserts = global.DataDeserts || {};
  global.DataDeserts.config = Object.freeze({
    domainColors: Object.freeze({
      "Ecology": "#4daf4a",
      "Hydro": "#377eb8",
      "Agriculture": "#ff7f00",
      "Public Health": "#e41a1c"
    }),
    programColors: Object.freeze({
      "DHS": "#c0392b",
      "MIS": "#e0875b",
      "AIS": "#d98880",
      "MICS": "#2980b9",
      "LSMS-ISA": "#27ae60"
    }),
    accessGroups: Object.freeze(["Public", "Private", "Both"]),
    magnitudeModes: Object.freeze(["datasets", "surveys", "density", "grdc"]),
    noDataColor: "#39424f",
    domainCountColors: Object.freeze(["#39424f", "#cbb3e3", "#a779cf", "#8347b5", "#5d2a8f"])
  });
})(window);
