(function () {
  "use strict";
  var svg = document.getElementById("desertAnimation");
  if (!svg) return;
  var ns = "http://www.w3.org/2000/svg";
  var observations = document.getElementById("observations");
  var inferredRecords = document.getElementById("inferredRecords");
  var lines = document.getElementById("networkLines");
  var desertZones = [{x:350,y:340,rx:38,ry:54},{x:605,y:285,rx:50,ry:62},{x:790,y:180,rx:70,ry:42}];
  var palette = ["#55c271","#e89b3c","#e45c5c","#5ec5ff"];
  var points = [];
  var landPoints = [
    [155,150],[180,132],[205,165],[235,125],[260,145],[290,160],[320,145],[215,195],[275,185],[330,170],
    [325,270],[345,285],[375,300],[382,325],[365,390],[350,425],[340,455],[380,365],
    [500,145],[525,130],[550,145],[570,160],[590,140],
    [545,230],[565,250],[645,245],[655,275],[630,340],[600,355],[575,320],
    [665,145],[700,125],[735,115],[875,145],[915,165],[950,175],[990,185],[1030,205],[900,220],[850,235],[720,225],
    [905,360],[935,345],[970,360],[1010,375],[1025,405],[980,420],[930,400]
  ];

  function random(seed) {
    var x = Math.sin(seed * 999.91) * 43758.5453;
    return x - Math.floor(x);
  }
  function insideDesert(point) {
    return desertZones.some(function (zone) {
      var dx = (point.x - zone.x) / zone.rx, dy = (point.y - zone.y) / zone.ry;
      return dx * dx + dy * dy < 1.12;
    });
  }
  landPoints.forEach(function (coordinates, index) {
      var point = {x: coordinates[0], y: coordinates[1]};
      if (insideDesert(point)) return;
      points.push(point);
      var circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", point.x); circle.setAttribute("cy", point.y);
      circle.setAttribute("r", 3.5 + random(index * 17) * 4);
      circle.setAttribute("fill", palette[index % palette.length]);
      circle.setAttribute("class", index % 3 === 0 ? "emerging-observation" : "existing-observation");
      if (index % 3 === 0) circle.style.animationDelay = ((index % 12) * .38) + "s";
      observations.appendChild(circle);
  });
  points.filter(function (_, index) { return index % 5 === 0; }).forEach(function (point, index) {
    var target = desertZones[index % desertZones.length];
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", point.x); line.setAttribute("y1", point.y);
    line.setAttribute("x2", target.x); line.setAttribute("y2", target.y);
    line.style.animationDelay = (-index * .17) + "s";
    lines.appendChild(line);
  });
  desertZones.forEach(function (zone, zoneIndex) {
    for (var i = 0; i < 11; i += 1) {
      var angle = random(700 + zoneIndex * 40 + i) * Math.PI * 2;
      var radius = Math.sqrt(random(900 + zoneIndex * 40 + i)) * .72;
      var estimate = document.createElementNS(ns, "circle");
      estimate.setAttribute("cx", zone.x + Math.cos(angle) * zone.rx * radius);
      estimate.setAttribute("cy", zone.y + Math.sin(angle) * zone.ry * radius);
      estimate.setAttribute("r", 3 + random(1100 + zoneIndex * 40 + i) * 3);
      estimate.style.setProperty("--observed-color", palette[(zoneIndex + i) % palette.length]);
      estimate.style.animationDelay = (zoneIndex * 1.3 + i * .16) + "s";
      inferredRecords.appendChild(estimate);
    }
  });
}());
