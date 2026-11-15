/* SVG charts and formatting helpers. All times are shown in UTC (station time on the ISS). */
(function (g) {
  var H = g.Halo, C = H.charts = {}, F = H.fmt = {};
  var DAY = 864e5, NS = "http://www.w3.org/2000/svg";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* ---------- formatting ---------- */
  function p2(n) { return n < 10 ? "0" + n : "" + n; }
  F.num = function (v, d) { if (v == null || !isFinite(v)) return "–"; return (+v).toFixed(d || 0).replace("-", "−"); };
  F.time = function (t) { var d = new Date(t); return p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()); };
  F.date = function (t) { var d = new Date(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  F.wdate = function (t) { var d = new Date(t); return WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  F.long = function (t) { var d = new Date(t); return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] + " " + d.getUTCDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]; };
  F.stamp = function (t, now) {
    if (t == null) return "never";
    var sameDay = Math.floor(t / DAY) === Math.floor(now / DAY);
    return sameDay ? "today " + F.time(t) : (Math.floor(now / DAY) - Math.floor(t / DAY) === 1 ? "yesterday " + F.time(t) : F.date(t) + ", " + F.time(t));
  };
  F.ago = function (ms) {
    var m = Math.round(ms / 60e3);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 36) return h + " h ago";
    var d = Math.round(h / 24); return d + (d === 1 ? " day ago" : " days ago");
  };
  F.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- svg helpers ---------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  C.el = el;
  function clear(svg, w, h) { while (svg.firstChild) svg.removeChild(svg.firstChild); svg.setAttribute("viewBox", "0 0 " + w + " " + h); svg.setAttribute("width", w); svg.setAttribute("height", h); }

  /* x ticks in UTC for a window */
  C.ticks = function (a, b, rangeId) {
    var out = [], step, labelEvery = 1, fmt;
    if (rangeId === "6h") { step = 3600e3; fmt = F.time; }
    else if (rangeId === "mission") {
      var span = (b - a) / DAY; step = DAY * (span > 120 ? 30 : span > 60 ? 14 : span > 21 ? 7 : span > 7 ? 2 : 1); fmt = F.date;
      for (var tt = Math.ceil(a / step) * step; tt <= b; tt += step) out.push({ t: tt, label: fmt(tt), major: true });
      return out;
    }
    else if (rangeId === "day") { step = 3 * 3600e3; fmt = function (t) { return t % DAY === 0 ? F.date(t) : F.time(t); }; }
    else if (rangeId === "week") { step = DAY; fmt = function (t) { return F.wdate(t).replace(/ \w+$/, ""); }; }
    else if (rangeId === "2w") { step = DAY; labelEvery = 2; fmt = F.date; }
    else { step = DAY; labelEvery = 5; fmt = F.date; }
    var t = Math.ceil(a / step) * step, i = 0;
    for (; t <= b; t += step, i++) {
      var dayIndex = Math.round(t / DAY);
      var show = rangeId === "day" || rangeId === "6h" || rangeId === "week" || dayIndex % labelEvery === 0;
      out.push({ t: t, label: show ? fmt(t) : null, major: t % DAY === 0 });
    }
    return out;
  };

  function yScale(lo, hi, h, padT, padB) { return function (v) { return padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB); }; }

  function extent(axis, bks, extra) {
    var lo = axis[0], hi = axis[1];
    bks.forEach(function (bk) { if (!bk) return; bk.forEach(function (b) { if (b) { lo = Math.min(lo, b.min); hi = Math.max(hi, b.max); } }); });
    (extra || []).forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    var pad = (hi - lo) * 0.04; return [lo - (lo === axis[0] ? 0 : pad), hi + (hi === axis[1] ? 0 : pad)];
  }

  /* line path with gaps */
  function linePath(pts) {
    var d = "", pen = false;
    pts.forEach(function (p) { if (!p) { pen = false; return; } d += (pen ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); pen = true; });
    return d;
  }
  function bandPath(xs, los, his) {
    var d = "", seg = [];
    function flush() {
      if (seg.length) {
        d += "M" + seg.map(function (i) { return xs[i].toFixed(1) + " " + his[i].toFixed(1); }).join("L");
        d += "L" + seg.slice().reverse().map(function (i) { return xs[i].toFixed(1) + " " + los[i].toFixed(1); }).join("L") + "Z";
      }
      seg = [];
    }
    for (var i = 0; i < xs.length; i++) { if (los[i] == null) flush(); else seg.push(i); }
    flush();
    return d;
  }

  /* ---------- trend chart for continuous data ----------
   * o: { w, h, a, b, size, series: [{bk, normal}], axis, active (activity buckets), threshold, bars, ticks, rangeId, judge(v)->0/1/2 } */
  C.trend = function (svg, o) {
    var w = Math.max(60, o.w), h = o.h, padT = 6, padB = o.ticks ? 20 : 6, padR = 34;
    clear(svg, w, h);
    var dom = extent(o.axis, o.series.map(function (s) { return s.bk; }));
    var y = yScale(dom[0], dom[1], h, padT, padB), pw = w - padR;
    function x(t) { return (t - o.a) / (o.b - o.a) * pw; }

    var gGrid = el("g", { "class": "grid" }, svg);
    C.ticks(o.a, o.b, o.rangeId).forEach(function (tk) {
      var xx = x(tk.t);
      el("line", { x1: xx, x2: xx, y1: padT, y2: h - padB, "class": tk.major ? "tick major" : "tick" }, gGrid);
      if (o.ticks && tk.label) { var tx = el("text", { x: xx + 3, y: h - 6, "class": "tlabel" }, gGrid); tx.textContent = tk.label; }
    });
    el("line", { x1: 0, x2: pw, y1: h - padB, y2: h - padB, "class": "baseline" }, gGrid);

    /* exercise periods */
    if (o.active) {
      var gx = el("g", { "class": "exercise" }, svg), bw = o.size / (o.b - o.a) * pw;
      o.active.forEach(function (b, i) { if (b && b.max >= o.exerciseMets) el("rect", { x: x(o.a + i * o.size), y: padT, width: Math.max(1, bw), height: h - padT - padB }, gx); });
    }

    o.series.forEach(function (s, si) {
      var g2 = el("g", { "class": "series s" + si }, svg);
      if (s.normal) {
        var y1 = y(Math.min(dom[1], s.normal[1])), y0 = y(Math.max(dom[0], s.normal[0]));
        if (y0 > y1) el("rect", { x: 0, y: y1, width: pw, height: y0 - y1, "class": "normal" }, g2);
      }
      var xs = [], los = [], his = [], pts = [];
      s.bk.forEach(function (b, i) {
        var xx = x(o.a + (i + 0.5) * o.size); xs.push(xx);
        if (!b) { los.push(null); his.push(null); pts.push(null); return; }
        los.push(y(b.min)); his.push(y(b.max)); pts.push([xx, y(b.mean)]);
      });
      if (o.bars) {
        var bw2 = Math.max(1, o.size / (o.b - o.a) * pw - 0.5);
        s.bk.forEach(function (b, i) { if (b) el("rect", { x: x(o.a + i * o.size), y: y(b.mean), width: bw2, height: Math.max(0.5, h - padB - y(b.mean)), "class": "bar" }, g2); });
      } else {
        el("path", { d: bandPath(xs, los, his), "class": "band" }, g2);
        el("path", { d: linePath(pts), "class": "line" }, g2);
        if (s.judge) s.bk.forEach(function (b, i) {
          if (!b) return;
          var st = s.judge(b.mean, !!(o.active && o.active[i] && o.active[i].max >= o.exerciseMets));
          if (st > 0) el("circle", { cx: xs[i], cy: y(b.mean), r: 2.2, "class": "flag f" + st }, g2);
        });
      }
    });

    /* y labels: normal range edges, or axis ends */
    var gl = el("g", { "class": "ylabels" }, svg), labs = [];
    o.series.forEach(function (s) { if (s.normal) labs.push(s.normal[0], s.normal[1]); });
    if (!labs.length) labs = [dom[0], dom[1]];
    var placed = [];
    labs.filter(function (v, i, a) { return a.indexOf(v) === i && v >= dom[0] && v <= dom[1]; }).forEach(function (v) {
      var yy = y(v);
      if (placed.some(function (p) { return Math.abs(p - yy) < 10; })) return;
      placed.push(yy);
      var t = el("text", { x: pw + 5, y: yy + 3.5, "class": "ylabel" }, gl); t.textContent = F.num(v, v % 1 ? 1 : 0);
    });

    var hov = el("line", { x1: -10, x2: -10, y1: padT, y2: h - padB, "class": "hover" }, svg);
    return { x: x, t: function (px) { return o.a + px / pw * (o.b - o.a); }, plotW: pw, hover: function (t) { var xx = t == null ? -10 : x(t); hov.setAttribute("x1", xx); hov.setAttribute("x2", xx); } };
  };

  /* ---------- periodic measurements: dots joined by a line ----------
   * o: { w, h, a, b, pts: [{t, v, s}], normal: [lo, hi] absolute, axis, ticks, rangeId } */
  C.points = function (svg, o) {
    var w = o.w, h = o.h, padT = 8, padB = o.ticks ? 18 : 8, padX = 6;
    clear(svg, w, h);
    var vals = o.pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals.concat(o.axis ? [o.axis[0]] : [], o.normal ? [o.normal[0]] : []));
    var hi = Math.max.apply(null, vals.concat(o.axis ? [o.axis[1]] : [], o.normal ? [o.normal[1]] : []));
    if (hi === lo) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var y = yScale(lo, hi, h, padT, padB);
    function x(t) { return padX + (t - o.a) / (o.b - o.a) * (w - 2 * padX); }
    var gGrid = el("g", { "class": "grid" }, svg);
    if (o.ticks) C.ticks(o.a, o.b, o.rangeId).forEach(function (tk) {
      if (!tk.label) return;
      var t = el("text", { x: x(tk.t), y: h - 4, "class": "tlabel mid" }, gGrid); t.textContent = tk.label;
    });
    if (o.normal) { var y1 = y(o.normal[1]), y0 = y(o.normal[0]); el("rect", { x: 0, y: Math.max(0, y1), width: w, height: Math.max(0, Math.min(h - padB, y0) - Math.max(0, y1)), "class": "normal" }, svg); }
    var inner = o.pts.map(function (p) { return [x(Math.max(o.a, Math.min(o.b, p.t))), y(p.v), p]; });
    el("path", { d: linePath(inner.map(function (p) { return [p[0], p[1]]; })), "class": "pline" }, svg);
    inner.forEach(function (p) {
      if (p[2].t < o.a || p[2].t > o.b) return;
      el("circle", { cx: p[0], cy: p[1], r: o.r || 3, "class": "pt f" + (p[2].s == null ? "n" : p[2].s) }, svg);
    });
    return { x: x };
  };

  /* ---------- tiny sparkline for live cards ---------- */
  C.spark = function (svg, o) {
    var w = Math.max(10, o.w), h = o.h; clear(svg, w, h);
    var vals = o.vals.filter(function (v) { return v != null; });
    if (vals.length < 2) return;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (o.normal) { lo = Math.min(lo, o.normal[0]); hi = Math.max(hi, o.normal[1]); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    var y = yScale(lo, hi, h, 2, 2), n = o.vals.length;
    if (o.normal) { var y1 = y(o.normal[1]), y0 = y(o.normal[0]); el("rect", { x: 0, y: y1, width: w, height: y0 - y1, "class": "normal" }, svg); }
    el("path", { d: linePath(o.vals.map(function (v, i) { return v == null ? null : [i / (n - 1) * w, y(v)]; })), "class": "line" }, svg);
  };

  /* ---------- ECG strip: scrolling playback of a recorded strip ---------- */
  var ecgState = null;
  C.ecg = function (canvas, strip) {
    if (ecgState) cancelAnimationFrame(ecgState.raf);
    ecgState = null;
    if (!canvas || !strip) return;
    var ctx = canvas.getContext("2d"), dpr = g.devicePixelRatio || 1, secs = 4, t0 = performance.now();
    var reduce = g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var css = getComputedStyle(canvas), ink = css.getPropertyValue("--ecg-ink").trim() || "#222", grid = css.getPropertyValue("--ecg-grid").trim() || "#eee";
    function frame(now) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      for (var gx = 0; gx < w; gx += w / (secs * 5)) { ctx.beginPath(); ctx.moveTo(Math.round(gx) + 0.5, 0); ctx.lineTo(Math.round(gx) + 0.5, h); ctx.stroke(); }
      var N = strip.values.length, hz = strip.hz, span = secs * hz;
      var off = reduce ? 0 : Math.floor(((now - t0) / 1000) * hz) % N;
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineJoin = "round"; ctx.beginPath();
      for (var i = 0; i < span; i++) {
        var v = strip.values[(off + i) % N], xx = i / span * w, yy = h * 0.62 - v * h * 0.45;
        if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      if (!reduce) ecgState.raf = requestAnimationFrame(frame);
    }
    ecgState = { raf: 0 };
    ecgState.raf = requestAnimationFrame(frame);
  };
})(window);
