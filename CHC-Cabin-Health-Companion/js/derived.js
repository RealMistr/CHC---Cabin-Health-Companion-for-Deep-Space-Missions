/* Derived indicators: values the app works out from other measurements instead of reading them from data.
 * Today that is the kidney stone risk, a count of risk factors per urine test. Rules live in js/config.js (metric.derive). */
(function (g) {
  var H = g.Halo, D = H.data, DAY = 864e5;
  var details = {}; /* metric key -> { time: [ {metric, label, text, value, flagged} ] } */

  function nearest(key, t, windowDays) {
    var r = D.between(key, t - windowDays * DAY, t + windowDays * DAY), best = null;
    for (var i = 0; i < r.t.length; i++) if (!best || Math.abs(r.t[i] - t) < Math.abs(best.t - t)) best = { t: r.t[i], v: r.v[i] };
    return best;
  }
  function flagged(rule, m, v) {
    var n = m.range && m.range.normal; if (!n) return false;
    if (rule.when === "below") return v < n[0];
    if (rule.when === "above") return v > n[1];
    return v < n[0] || v > n[1];
  }

  function compute(m) {
    var rule = m.derive, times = [];
    rule.anchors.forEach(function (k) { var s = D.store[k]; if (s) times = times.concat(s.t); });
    times.sort(function (a, b) { return a - b; });
    /* one urine test = anchor values within 2 days of each other; use the latest time of the group */
    var groups = [];
    times.forEach(function (t) { var last = groups[groups.length - 1]; if (last && t - last.start <= 2 * DAY) last.end = t; else groups.push({ start: t, end: t }); });
    var out = { t: [], v: [] }; details[m.key] = {};
    groups.forEach(function (gr) {
      var list = [], known = 0, count = 0;
      rule.factors.forEach(function (f) {
        var fm = D.metric(f.metric), hit = fm && nearest(f.metric, gr.end, f.window_days || 2);
        var item = { metric: f.metric, label: fm ? fm.label : f.metric, text: f.text, value: hit ? hit.v : null, flagged: false };
        if (hit) { known++; item.flagged = flagged(f, fm, hit.v); if (item.flagged) count++; }
        list.push(item);
      });
      if (known >= 2) { out.t.push(gr.end); out.v.push(count); details[m.key][gr.end] = list; }
    });
    D.store[m.key] = out;
  }

  H.derive = function () {
    var cfg = g.HALO_CONFIG;
    cfg.metrics.forEach(function (m) { if (m.derive) compute(m); });
  };
  /* factor breakdown for the derived value at time t (exact time from the store) */
  H.derivedDetails = function (key, t) { return (details[key] || {})[t] || null; };
})(window);
