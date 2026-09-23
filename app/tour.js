(function () {
  "use strict";

  var storageKey = "data-deserts.dashboard-tour.seen.v1";
  var steps = [
    {
      target: "#map",
      title: "Explore a country",
      description: "Click a country or use the search box to inspect its datasets and survey years. The map covers countries with DHS surveys; other countries stay grey."
    },
    {
      target: ".legend-section",
      title: "Read the coverage charts",
      description: "Each sector represents a dataset. Red to green shows coverage from record density and years with records. Detailed agriculture switches to crop sectors and the chosen metric; grey means unavailable."
    },
    {
      target: ".filters-section",
      title: "Choose a time window",
      description: "Drag the two year handles to narrow the timeline, which starts at the first DHS survey. Turn on Annual bins to see gaps over time, or Categories to group the datasets."
    },
    {
      target: ".advanced > summary",
      title: "Choose your datasets",
      description: "Open Advanced filtering to select categories or individual datasets. Your choices update the map and country details. You can restart this guide anytime with the compass button in the toolbar."
    }
  ];
  var dialog = document.getElementById("dashboardTour");
  var card = dialog.querySelector(".tour-card");
  var spotlight = document.getElementById("tourSpotlight");
  var title = document.getElementById("tourTitle");
  var back = document.getElementById("tourBack");
  var next = document.getElementById("tourNext");
  var restart = document.getElementById("tourButton");
  var sidebar = document.getElementById("sidebar");
  var sidebarToggle = document.getElementById("sidebarToggle");
  var step = 0;
  var previousFocus;
  var previousScroll;
  var sidebarWasCollapsed;
  var frame;

  function position() {
    if (!dialog.open) return;
    var target = document.querySelector(steps[step].target);
    var rect = target.getBoundingClientRect();
    var width = window.innerWidth;
    var height = window.innerHeight;
    var left = Math.max(4, rect.left);
    var top = Math.max(4, rect.top);
    spotlight.style.left = left + "px";
    spotlight.style.top = top + "px";
    spotlight.style.width = Math.max(0, Math.min(width - 4, rect.right) - left) + "px";
    spotlight.style.height = Math.max(0, Math.min(height - 4, rect.bottom) - top) + "px";

    // Place sidebar explanations alongside their controls; use a bottom card on small screens.
    var cardWidth = card.offsetWidth;
    var cardHeight = card.offsetHeight;
    var beside = step > 0 && rect.right + cardWidth + 28 <= width;
    card.style.left = (beside ? rect.right + 14 : Math.max(12, (width - cardWidth) / 2)) + "px";
    card.style.top = (beside
      ? Math.max(12, Math.min(top, height - cardHeight - 12))
      : Math.max(12, height - cardHeight - 16)) + "px";
  }

  function schedulePosition() {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(position);
  }

  function showStep() {
    title.textContent = steps[step].title;
    document.getElementById("tourDescription").textContent = steps[step].description;
    document.getElementById("tourProgress").textContent = "Step " + (step + 1) + " of " + steps.length;
    back.hidden = step === 0;
    next.textContent = step === steps.length - 1 ? "Explore the map" : "Next";
    title.focus({ preventScroll: true });
    var target = document.querySelector(steps[step].target);
    target.scrollIntoView({ block: "center", behavior: "instant" });
    if (window.innerWidth <= 760) {
      // Leave room below the highlighted controls for the explanation.
      var rect = target.getBoundingClientRect();
      var available = Math.max(0, window.innerHeight - card.offsetHeight - 40);
      window.scrollBy(0, rect.top - Math.max(12, (available - rect.height) / 2));
    }
    position();
  }

  function start() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    previousScroll = { x: window.scrollX, y: window.scrollY, sidebar: sidebar.scrollTop };
    sidebarWasCollapsed = document.body.classList.contains("sidebar-collapsed");
    document.body.classList.add("tour-active");
    if (sidebarWasCollapsed) sidebarToggle.click();
    step = 0;
    dialog.showModal();
    showStep();
    // Remember a visit even if the visitor navigates away partway through the tour.
    try { window.localStorage.setItem(storageKey, "1"); } catch (_) { /* Storage may be blocked. */ }
  }

  function finish() {
    dialog.close();
  }

  dialog.addEventListener("close", function () {
    document.body.classList.remove("tour-active");
    if (sidebarWasCollapsed) sidebarToggle.click();
    sidebar.scrollTop = previousScroll.sidebar;
    window.scrollTo(previousScroll.x, previousScroll.y);
    if (previousFocus && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
    else restart.focus({ preventScroll: true });
  });
  // Native modal-dialog handling provides Escape dismissal and keeps keyboard focus inside.
  document.getElementById("tourSkip").addEventListener("click", finish);
  back.addEventListener("click", function () { if (step > 0) { step--; showStep(); } });
  next.addEventListener("click", function () {
    if (step === steps.length - 1) finish();
    else { step++; showStep(); }
  });
  restart.addEventListener("click", start);
  window.addEventListener("resize", schedulePosition);
  document.addEventListener("scroll", schedulePosition, true);

  var seen = false;
  try { seen = window.localStorage.getItem(storageKey) === "1"; } catch (_) { /* Tour still works without storage. */ }
  if (!seen) start();
})();
