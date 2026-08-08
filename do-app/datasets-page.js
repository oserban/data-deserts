(function () {
  "use strict";
  var number = new Intl.NumberFormat("en-GB");

  function globalYearCounts(dataset) {
    var totals = {};
    Object.values(dataset.records || {}).forEach(function (years) {
      Object.keys(years).forEach(function (year) {
        totals[year] = (totals[year] || 0) + Number(years[year] || 0);
      });
    });
    return totals;
  }

  function draw(card) {
    var dataset = window.DATASETS && window.DATASETS[card.dataset.dataset];
    if (!dataset) return;
    var totals = globalYearCounts(dataset);
    var years = Object.keys(totals).map(Number).sort(function (a, b) { return a - b; });
    if (!years.length) return;
    var first = years[0], last = years[years.length - 1], allYears = [];
    for (var year = first; year <= last; year += 1) allYears.push(year);
    var max = Math.max.apply(null, years.map(function (value) { return totals[value]; }));
    var total = years.reduce(function (sum, value) { return sum + totals[value]; }, 0);
    var width = 1000, height = 150, barWidth = width / allYears.length;
    var gap = Math.min(1.4, barWidth * .16);
    var section = document.createElement("section");
    section.className = "histogram";
    section.setAttribute("aria-label", dataset.name + " global records by year");
    section.innerHTML = '<div class="histogram-heading"><strong>Global records by year</strong><span>' + number.format(total) + ' records</span></div>';
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", dataset.name + " yearly global counts from " + first + " to " + last);
    allYears.forEach(function (value, index) {
      var count = totals[value] || 0;
      var scaledHeight = count ? Math.log10(count + 1) / Math.log10(max + 1) * (height - 5) : 0;
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "bar");
      rect.setAttribute("x", index * barWidth + gap / 2);
      rect.setAttribute("y", height - scaledHeight);
      rect.setAttribute("width", Math.max(.8, barWidth - gap));
      rect.setAttribute("height", scaledHeight);
      var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = value + ": " + number.format(count) + " records";
      rect.appendChild(title);
      svg.appendChild(rect);
    });
    var baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    baseline.setAttribute("class", "baseline");
    baseline.setAttribute("x1", "0"); baseline.setAttribute("x2", width);
    baseline.setAttribute("y1", height); baseline.setAttribute("y2", height);
    svg.appendChild(baseline);
    section.appendChild(svg);
    section.insertAdjacentHTML("beforeend", '<div class="histogram-labels"><span>' + first + '</span><span>' + last + '</span></div><div class="histogram-note">Bar height uses a logarithmic scale. Hover a bar for its exact count.</div>');
    card.querySelector("h2").insertAdjacentElement("afterend", section);
  }

  document.querySelectorAll(".dataset-card[data-dataset]").forEach(draw);
}());
