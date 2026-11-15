/* The body figure: a line drawing with labelled body systems. Click a label or marker to see its indicators. */
(function (g) {
  var H = g.Halo, B = H.body = {}, C = H.charts;
  var CX = 180;

  /* right half of the outline as [dx from centre, y]; mirrored for the left half */
  var HALF = [[9, 66], [10, 80], [24, 86], [42, 92], [53, 101], [57, 116], [59, 142], [62, 176], [66, 210], [69, 236],
    [73, 252], [72, 266], [66, 270], [61, 262], [59, 246], [55, 214], [50, 180], [46, 150], [43, 128],
    [41, 158], [37, 194], [40, 226], [43, 252], [42, 300], [37, 348], [34, 398], [34, 424], [40, 436], [36, 443], [20, 443], [16, 434],
    [17, 400], [15, 350], [11, 300], [4, 266], [0, 262]];

  function smooth(pts, closed) {
    /* Catmull-Rom to cubic Bezier */
    var d = "M" + pts[0][0] + " " + pts[0][1], n = pts.length;
    for (var i = 0; i < n - (closed ? 0 : 1); i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n], k = 0.18;
      d += "C" + (p1[0] + (p2[0] - p0[0]) * k).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) * k).toFixed(1) + " " +
        (p2[0] - (p3[0] - p1[0]) * k).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) * k).toFixed(1) + " " + p2[0] + " " + p2[1];
    }
    return d + (closed ? "Z" : "");
  }
  function outline() {
    var right = HALF.map(function (p) { return [CX + p[0], p[1]]; });
    var left = HALF.slice(0, -1).reverse().map(function (p) { return [CX - p[0], p[1]]; });
    return smooth(right.concat(left), true);
  }

  /* marker position on the figure, and label position at the side */
  var SPOTS = {
    brain: { m: [CX - 6, 34], l: [18, 40], side: "l" },
    eyes:  { m: [CX + 8, 49], l: [342, 52], side: "r" },
    lungs: { m: [CX - 20, 124], l: [18, 118], side: "l" },
    heart: { m: [CX + 12, 132], l: [342, 128], side: "r" },
    kidneys: { m: [CX - 19, 184], l: [18, 200], side: "l" },
    blood: { m: [CX - 53, 214], l: [18, 282], side: "l" },
    skin:  { m: [CX + 62, 222], l: [342, 214], side: "r" },
    bones: { m: [CX + 24, 318], l: [342, 316], side: "r" }
  };

  /* states: region id -> -1 (no judged data) | 0 | 1 | 2 */
  B.render = function (svg, cfg, states, selected, onPick) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 360 452");
    C.el("ellipse", { cx: CX, cy: 42, rx: 20, ry: 25, "class": "fig" }, svg);
    C.el("path", { d: outline(), "class": "fig" }, svg);
    /* a few quiet anatomical hints */
    C.el("path", { d: "M" + (CX - 22) + " 104 Q" + CX + " 112 " + (CX + 22) + " 104", "class": "fig-hint" }, svg);
    C.el("path", { d: "M" + CX + " 150 L" + CX + " 166", "class": "fig-hint" }, svg);
    /* kidneys: two small beans, drawn as if seen through the body */
    [-1, 1].forEach(function (sd) {
      var x = CX + sd * 19;
      C.el("path", { d: "M" + x + " 172 C" + (x + sd * 9) + " 171 " + (x + sd * 10) + " 197 " + x + " 197 C" + (x - sd * 7) + " 197 " + (x - sd * 5) + " 188 " + (x - sd * 2) + " 184.5 C" + (x - sd * 5) + " 181 " + (x - sd * 7) + " 172 " + x + " 172Z", "class": "fig-organ" }, svg);
    });

    /* small credit in the bottom-right corner */
    var cr = C.el("text", { x: 356, y: 449, "text-anchor": "end", "class": "credit" }, svg); cr.textContent = "Figure created by Claude";

    cfg.regions.forEach(function (r) {
      var sp = SPOTS[r.id]; if (!sp) return;
      var s = states[r.id], cls = s == null || s < 0 ? "n" : s, word = s == null || s < 0 ? "No data" : H.status.WORDS[s];
      var gEl = C.el("g", { "class": "region f" + cls + (selected === r.id ? " sel" : ""), tabindex: 0, role: "button", "aria-label": r.name + ": " + word, "data-r": r.id }, svg);
      var lx = sp.side === "l" ? 6 : 354, ly = sp.l[1], ex = sp.side === "l" ? 104 : 256;
      var bend = sp.side === "l" ? ex + 8 : ex - 8;
      C.el("path", { d: "M" + ex + " " + ly + " L" + bend + " " + ly + " L" + sp.m[0] + " " + sp.m[1], "class": "leader" }, gEl);
      C.el("circle", { cx: sp.m[0], cy: sp.m[1], r: 11, "class": "hit" }, gEl);
      C.el("rect", { x: sp.side === "l" ? 0 : 252, y: ly - 17, width: 108, height: 34, "class": "hit" }, gEl);
      C.el("circle", { cx: sp.m[0], cy: sp.m[1], r: 5, "class": "dot" }, gEl);
      var anchor = sp.side === "l" ? "start" : "end";
      var t1 = C.el("text", { x: lx, y: ly - 3, "text-anchor": anchor, "class": "rname" }, gEl); t1.textContent = r.short || r.name;
      var t2 = C.el("text", { x: lx, y: ly + 12, "text-anchor": anchor, "class": "rstate" }, gEl); t2.textContent = word;
      gEl.addEventListener("click", function () { onPick(r.id); });
      gEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.id); } });
    });
  };
})(window);
