/* Turns raw data into statuses: Normal (0), Watch (1), Act now (2), plus non-judged states.
 * Non-judged states: "active" (exercising, not judged), "nosignal" (sensor silent), "old" (check too old to trust),
 * "tracked" (no range defined), "empty" (no data at all). No DOM code here. */
(function (g) {
  var H = g.Halo, S = H.status = {}, D = H.data;
  var DAY = 864e5, CAD = { day: 1, "3days": 3, week: 7, "2weeks": 14, month: 30 };

  S.WORDS = { 0: "Normal", 1: "Watch", 2: "Act now", active: "Exercising", nosignal: "No signal", old: "Out of date", tracked: "Tracked", empty: "No data" };
  S.cadenceDays = function (m) { return CAD[m.every] || 1; };

  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
  S.median = median;

  S.baseline = function (m) {
    var b = D.meta.crew && D.meta.crew.baseline && D.meta.crew.baseline[m.key];
    if (typeof b === "number") return b;
    var f = D.first(m.key); return f ? f.v : null;
  };
  S.pct = function (m, v) { var b = S.baseline(m); return b ? (v - b) / b * 100 : null; };

  /* limits during exercise: explicit ranges, or from the maximum heart rate (220 - age) */
  S.hrMax = function () {
    var c = D.meta.crew || {};
    if (typeof c.hr_max === "number") return c.hr_max;
    return 220 - (typeof c.age === "number" ? c.age : 40);
  };
  S.exerciseRange = function (m) {
    var e = m.exercise; if (!e) return null;
    if (e.hrmax) { var mx = S.hrMax(); return { normal: [m.range.normal[0] - 10, Math.round(mx * e.normal)], watch: [m.range.watch[0] - 10, Math.round(mx * e.watch)] }; }
    return e;
  };

  /* status of one value: 0, 1, 2, or null if the metric has no range. active = during exercise */
  S.judge = function (m, v, active) {
    var r = (active && S.exerciseRange(m)) || m.range; if (!r || v == null) return null;
    var x = r.relative ? S.pct(m, v) : v;
    if (x == null) return null;
    if (x >= r.normal[0] && x <= r.normal[1]) return 0;
    if (x >= r.watch[0] && x <= r.watch[1]) return 1;
    return 2;
  };

  function utcDay(t) { return Math.floor(t / DAY); }

  /* "high" or "low" relative to the normal range (exercise limits when active), or null if inside */
  S.direction = function (m, v, active) {
    var r = (active && S.exerciseRange(m)) || m.range; if (!r || v == null) return null;
    var x = r.relative ? S.pct(m, v) : v;
    if (x > r.normal[1]) return "high";
    if (x < r.normal[0]) return "low";
    return null;
  };

  /* follow-up checks for a current reading c (from S.current): [{ why, also, items: [{ m, cur }] }] */
  S.followups = function (cfg, c, at) {
    var rules = (cfg.followups || {})[c.m.key]; if (!rules || typeof c.state !== "number" || c.state === 0) return [];
    var dir = S.direction(c.m, c.v, c.active);
    if (!dir && c.m.pair && c.pv != null) dir = S.direction(D.metric(c.m.pair), c.pv, c.active);
    return rules.filter(function (r) { return r.when === "any" || r.when === dir; }).map(function (r) {
      return { why: r.why, also: r.also || [], items: r.check.map(function (k) { var m = D.metric(k); return { m: m, cur: S.current(m, at, cfg) }; }) };
    });
  };

  /* current reading of one metric at time `at` */
  S.current = function (m, at, cfg) {
    var o = { m: m, state: "empty", v: null, t: null };
    if (m.kind === "continuous") {
      var win = (m.window_min || 5) * 60e3, r = D.between(m.key, at - win, at);
      var last = D.latest(m.key, at);
      if (!last) return o;
      o.t = last.t;
      if (!r.v.length) {
        o.v = last.v;
        if (at - last.t > (m.stale_min || 30) * 60e3) { o.state = "nosignal"; return o; }
      } else { o.v = median(r.v); o.n = r.v.length; }
      if (m.pair) {
        var pr = D.between(m.pair, at - win, at), pl = D.latest(m.pair, at);
        o.pv = pr.v.length ? median(pr.v) : (pl ? pl.v : null);
      }
      if (m.skip_when_active) {
        var act = D.between("activity", at - win, at);
        if (act.v.length && median(act.v) >= cfg.exerciseMets) {
          o.active = true;
          if (!S.exerciseRange(m)) { o.state = "active"; return o; }
        }
      }
    } else {
      var l = D.latest(m.key, at);
      if (!l) { o.due = "overdue"; return o; }
      o.v = l.v; o.t = l.t;
      var prev = D.latest(m.key, at, 1); o.prev = prev;
      var cad = S.cadenceDays(m), age = at - l.t;
      o.done = m.every === "day" ? utcDay(l.t) === utcDay(at) : age < cad * DAY;
      o.due = o.done ? null : (age > cad * 1.5 * DAY ? "overdue" : "due");
      o.next = m.every === "day" ? (utcDay(at) + (o.done ? 1 : 0)) * DAY : l.t + cad * DAY;
      if (m.range && m.range.relative) o.pct = S.pct(m, l.v);
      if (age > cad * 2.5 * DAY) { o.state = "old"; return o; }
    }
    if (!m.range) { o.state = "tracked"; return o; }
    var s = S.judge(m, o.v, o.active);
    if (m.pair && o.pv != null) s = Math.max(s, S.judge(D.metric(m.pair), o.pv, o.active));
    o.state = s;
    return o;
  };

  /* everything the screen needs at time `at` */
  S.snapshot = function (cfg, at) {
    var cur = {}, attention = [], due = [], regions = {}, counts = [0, 0, 0];
    cfg.metrics.forEach(function (m) {
      if (m.partOf) return;
      var c = cur[m.key] = S.current(m, at, cfg);
      if (typeof c.state === "number") {
        counts[c.state]++;
        if (c.state > 0) attention.push(c);
        if (m.region) regions[m.region] = Math.max(regions[m.region] == null ? -1 : regions[m.region], c.state);
      } else if (m.region && regions[m.region] == null) regions[m.region] = -1;
      if (c.state === "nosignal" && m.key === "heart_rate") attention.push(c);
      if (m.kind === "periodic" && c.due) due.push(c);
    });
    /* if a derived indicator (kidney stone risk) is flagged, its contributing factors are shown inside it, not as separate items */
    var covered = {};
    attention.forEach(function (c) { if (c.m.derive && typeof c.state === "number" && c.state > 0) c.m.derive.factors.forEach(function (f) { covered[f.metric] = c.m.key; }); });
    attention = attention.filter(function (c) { return !covered[c.m.key]; });
    attention.sort(function (a, b) { return (typeof b.state === "number" ? b.state : 0.5) - (typeof a.state === "number" ? a.state : 0.5); });
    due.sort(function (a, b) { return (a.due === "overdue" ? 0 : 1) - (b.due === "overdue" ? 0 : 1) || S.cadenceDays(a.m) - S.cadenceDays(b.m); });

    /* suggested checks: follow-ups of flagged results that you log yourself and have not done in the last 2 days */
    var suggested = [], seen = {};
    var dueKeys = {}; due.forEach(function (c) { dueKeys[c.m.key] = 1; });
    attention.forEach(function (c) {
      S.followups(cfg, c, at).forEach(function (f) {
        f.items.forEach(function (it) {
          var m = it.m;
          if (seen[m.key] || dueKeys[m.key] || m.kind !== "periodic" || m.derive || !(m.input || m.test)) return;
          if (it.cur.t && at - it.cur.t < 2 * DAY) return;
          seen[m.key] = 1;
          suggested.push({ m: m, cur: it.cur, because: c.m, why: f.why });
        });
      });
    });

    suggested = suggested.slice(0, 5);

    /* routine score: daily checks logged on each of the last 7 UTC days */
    var dailies = cfg.metrics.filter(function (m) { return m.kind === "periodic" && m.every === "day" && m.input; });
    var today = utcDay(at), done = 0, total = 0, streak = 0;
    for (var d = 0; d < 7; d++) {
      var day = today - d, all = true;
      dailies.forEach(function (m) {
        var r = D.between(m.key, day * DAY, (day + 1) * DAY - 1);
        total++; if (r.t.length) done++; else all = false;
      });
      if (d === 0) continue;
      if (all && streak === d - 1) streak++;
    }
    return { cur: cur, attention: attention, due: due, suggested: suggested, regions: regions, counts: counts, routine: { done: done, total: total, streak: streak } };
  };

  /* Radiation: daily doses (mGy) from the active dose rate where there is one, otherwise from daily dosimeter readings.
   * Returns { days: [{t, dose, source}], total, last24, start } up to time `at`. */
  S.radiation = function (at) {
    var rate = D.store.radiation_dose_rate, daily = D.store.radiation_dose;
    var first = Infinity;
    if (rate && rate.t.length) first = Math.min(first, rate.t[0]);
    if (daily && daily.t.length) first = Math.min(first, daily.t[0]);
    if (first === Infinity) return null;
    var ms = D.meta.crew && D.meta.crew.mission_start ? D.parseTime(D.meta.crew.mission_start) : null;
    var start = Math.floor(Math.min(first, ms || first) / DAY) * DAY, days = [], total = 0;
    for (var d = start; d <= at; d += DAY) {
      var end = Math.min(d + DAY, at), hours = (end - d) / 3600e3, dose = null, src = null;
      var b = D.buckets("radiation_dose_rate", d, end, end - d || 1)[0];
      if (b && b.n) { dose = b.mean * hours / 1000; src = "rate"; }
      else {
        var r = D.between("radiation_dose", d, end - 1);
        if (r.v.length) { dose = r.v.reduce(function (x, y) { return x + y; }, 0); src = "dosimeter"; }
      }
      if (dose != null) total += dose;
      days.push({ t: d, dose: dose, total: total, source: src });
    }
    /* last 24 hours: from the rate if available, else the latest daily reading */
    var last24 = null, rb = D.buckets("radiation_dose_rate", at - DAY, at, DAY)[0];
    if (rb && rb.n) last24 = rb.mean * 24 / 1000;
    else { var l = D.latest("radiation_dose", at); if (l && at - l.t < 2 * DAY) last24 = l.v; }
    return { days: days, total: total, last24: last24, start: start };
  };
  S.total = function (m, at) { var r = S.radiation(at); return r ? r.total : 0; };
})(window);
