(function (global) {
  "use strict";

  global.DataDeserts = global.DataDeserts || {};

  function polar(radius, angle) {
    var radians = (angle - 90) * Math.PI / 180;
    return [30 + radius * Math.cos(radians), 30 + radius * Math.sin(radians)];
  }

  function ringPath(start, end) {
    var outerStart = polar(27, start), outerEnd = polar(27, end);
    var innerEnd = polar(14, end), innerStart = polar(14, start);
    return "M" + outerStart.join(" ") + " A27 27 0 0 1 " + outerEnd.join(" ") +
      " L" + innerEnd.join(" ") + " A14 14 0 0 0 " + innerStart.join(" ") + " Z";
  }

  function sectorPath(index) {
    return ringPath(index * 90 + 2, (index + 1) * 90 - 2);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  function interpolateColor(start, end, amount) {
    var channels = start.map(function (value, index) {
      return Math.round(value + (end[index] - value) * amount);
    });
    return "rgb(" + channels.join(",") + ")";
  }

  // Shared assessment convention: low record count = red, middle = yellow, high = green.
  // Scores are still calculated independently within each domain.
  function assessmentColor(value, score) {
    if (!value) return "#68737f";
    if (score <= 0.5) return interpolateColor([215, 48, 39], [254, 224, 139], score * 2);
    return interpolateColor([254, 224, 139], [26, 152, 80], (score - 0.5) * 2);
  }

  function create(options) {
    var rows = options.features.map(function (feature) {
      return {
        iso: feature.id,
        values: {
          ecology: options.gbif[feature.id] || 0,
          hydrology: options.grdc[feature.id] || 0,
          health: options.surveysFor(feature.id).length
        }
      };
    });
    var maxima = { ecology: 0, hydrology: 0, health: 0 };
    rows.forEach(function (row) {
      Object.keys(maxima).forEach(function (key) { maxima[key] = Math.max(maxima[key], row.values[key]); });
    });
    var byIso = {};
    rows.forEach(function (row) {
      var scores = {};
      Object.keys(maxima).forEach(function (key) {
        scores[key] = maxima[key] ? Math.log1p(row.values[key]) / Math.log1p(maxima[key]) : 0;
      });
      byIso[row.iso] = { values: row.values, scores: scores };
    });

    var yearlyByIso = {}, yearlyMaxima = { ecology: 0, hydrology: 0, agriculture: 0, health: 0 };
    if (options.years && options.yearlyValues) {
      rows.forEach(function (row) {
        yearlyByIso[row.iso] = options.years.map(function (year) {
          var values = options.yearlyValues(row.iso, year);
          Object.keys(yearlyMaxima).forEach(function (key) {
            yearlyMaxima[key] = Math.max(yearlyMaxima[key], values[key] || 0);
          });
          return values;
        });
      });
    }

    function histogramPaths(iso) {
      var keys = ["ecology", "hydrology", "agriculture", "health"];
      var yearCount = options.years.length;
      var domainGap = 5;
      var bucketWidth = (90 - domainGap * 2) / yearCount;
      var paths = [];
      keys.forEach(function (key, sectorIndex) {
        paths.push('<path d="' + ringPath(sectorIndex * 90 + domainGap, (sectorIndex + 1) * 90 - domainGap) +
          '" class="assessment-histogram-outline"></path>');
        yearlyByIso[iso].forEach(function (values, yearIndex) {
          var value = values[key] || 0;
          if (!value) return; // Missing years are deliberately left completely unpainted.
          var score = yearlyMaxima[key] ? Math.log1p(value) / Math.log1p(yearlyMaxima[key]) : 0;
          var start = sectorIndex * 90 + domainGap + yearIndex * bucketWidth;
          var end = Math.min((sectorIndex + 1) * 90 - domainGap, start + Math.max(0.15, bucketWidth - 0.12));
          paths.push('<path d="' + ringPath(start, end) + '" fill="' + assessmentColor(value, score) +
            '" class="assessment-year-bucket"></path>');
        });
      });
      return paths.join("");
    }

    function markerHTML(name, iso, size) {
      size = size || 60;
      var assessment = byIso[iso];
      var parts = [
        { key: "ecology" },
        { key: "hydrology" },
        { key: null },
        { key: "health" }
      ];
      var paths = options.years ? histogramPaths(iso) : parts.map(function (part, index) {
        var available = !!part.key;
        var score = available ? assessment.scores[part.key] : 0;
        var value = available ? assessment.values[part.key] : 0;
        return '<path d="' + sectorPath(index) + '" fill="' + assessmentColor(value, score) +
          '" class="' + (available ? "" : "assessment-unavailable") + '"></path>';
      }).join("");
      var fontSize = Math.max(5, Math.min(10, Math.round(size * 0.1)));
      return '<div class="assessment-marker" style="--assessment-size:' + size + 'px;--assessment-font:' + fontSize + 'px">' +
        '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="28" class="assessment-backing"></circle>' + paths +
        '<circle cx="30" cy="30" r="13" class="assessment-centre"></circle></svg>' +
        '<span>' + escapeHTML(name) + '</span></div>';
    }

    function historyHTML(iso) {
      if (!options.years || !yearlyByIso[iso]) return "";
      var rows = [
        { key: "ecology", label: "Ecology" },
        { key: "hydrology", label: "Hydrology" },
        { key: "agriculture", label: "Agriculture" },
        { key: "health", label: "Public health" }
      ];
      var history = yearlyByIso[iso];
      var html = '<div class="detail-history"><div class="detail-history-title">Yearly data availability</div>';
      rows.forEach(function (row) {
        var buckets = history.map(function (values, index) {
          var value = values[row.key] || 0;
          var title = options.years[index] + ': ' + value;
          if (!value) return '<i class="missing" title="' + title + '"></i>';
          var score = yearlyMaxima[row.key] ? Math.log1p(value) / Math.log1p(yearlyMaxima[row.key]) : 0;
          return '<i style="background:' + assessmentColor(value, score) + '" title="' + title + '"></i>';
        }).join("");
        html += '<div class="detail-history-row"><span>' + row.label + '</span><div class="detail-history-buckets" style="grid-template-columns:repeat(' +
          options.years.length + ',1fr)">' + buckets + '</div></div>';
      });
      html += '<div class="detail-history-years"><span>' + options.years[0] + '</span><span>' +
        options.years[options.years.length - 1] + '</span></div></div>';
      return html;
    }

    function tooltipHTML(name, iso) {
      if (options.years) {
        var history = yearlyByIso[iso];
        var availableYears = { ecology: 0, hydrology: 0, agriculture: 0, health: 0 };
        history.forEach(function (values) {
          Object.keys(availableYears).forEach(function (key) { if (values[key]) availableYears[key]++; });
        });
        return '<b>' + escapeHTML(name) + '</b><br>' + options.years[0] + '–' + options.years[options.years.length - 1] +
          ' · years with data<br>' +
          'Ecology: ' + availableYears.ecology + '<br>' +
          'Hydrology: ' + availableYears.hydrology + '<br>' +
          'Agriculture: ' + availableYears.agriculture + '<br>' +
          'Public health: ' + availableYears.health;
      }
      var values = byIso[iso].values;
      return '<b>' + escapeHTML(name) + '</b><br>' +
        'Ecology: ' + values.ecology.toLocaleString() + ' GBIF records<br>' +
        'Hydrology: ' + values.hydrology.toLocaleString() + ' GRDC gauges<br>' +
        'Agriculture: record count unavailable<br>' +
        'Public health: ' + values.health.toLocaleString() + ' surveys';
    }

    return { markerHTML: markerHTML, historyHTML: historyHTML, tooltipHTML: tooltipHTML };
  }

  function legendHTML() {
    var sectors = [0, 1, 2, 3].map(function (index) {
      return '<path d="' + sectorPath(index) + '" class="assessment-legend-sector"></path>';
    }).join("");
    return '<div class="assessment-legend-donut">' +
      '<svg viewBox="0 0 280 132" role="img" aria-label="Donut sector positions: health top-left, ecology top-right, agriculture bottom-left, hydrology bottom-right">' +
        '<defs><marker id="assessmentLegendArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">' +
          '<path d="M0 0 L8 4 L0 8 Z"></path></marker></defs>' +
        '<g transform="translate(104 30) scale(1.2)">' + sectors +
          '<circle cx="30" cy="30" r="13" class="assessment-legend-centre"></circle></g>' +
        '<text x="4" y="18">Health</text><path class="assessment-legend-arrow" d="M55 20 C82 21 99 32 121 48"></path>' +
        '<text x="276" y="18" text-anchor="end">Ecology</text><path class="assessment-legend-arrow" d="M225 20 C198 21 181 32 159 48"></path>' +
        '<text x="4" y="122">Agriculture</text><path class="assessment-legend-arrow" d="M76 113 C93 108 108 98 122 84"></path>' +
        '<text x="276" y="122" text-anchor="end">Hydrology</text><path class="assessment-legend-arrow" d="M212 113 C193 108 176 98 158 84"></path>' +
      '</svg></div>';
  }

  global.DataDeserts.recordAssessment = Object.freeze({ create: create, legendHTML: legendHTML });
})(window);
