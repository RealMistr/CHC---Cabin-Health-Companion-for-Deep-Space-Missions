/* Data layer: reads JSON files, keeps one sorted time series per metric for each crew member, answers queries.
 * No DOM code here. See DATA.md for the file format.
 *
 * Crew members: every reading belongs to one astronaut, found by name (file "crew", or "crew"/"astronaut" on a
 * reading or series). Data without a name goes to the crew member on screen. D.store and D.meta always point at
 * the crew member on screen; D.use(id) switches.
 * Old dates: a file whose data does not end around today is moved forward (whole days, so times of day stay) to
 * end today, and only the last mission.days (30) days are kept. Files from the same period are moved by the same
 * amount, so data from teammates stays lined up. */
(function (g) {
  var H = g.Halo = g.Halo || {};
  var D = H.data = {};
  var CFG, byKey = {}, alias = {}, DAY = 864e5, Q = 3.82;

  D.crews = {};          /* id -> { store, meta } */
  D.current = null;
  D.store = {};          /* key -> { t: [ms...], v: [num...] } sorted by t, for the crew member on screen */
  D.meta = { crew: null, ecg: null, source: "none", files: [] };

  D.init = function (cfg) {
    CFG = cfg; byKey = {}; alias = {};
    Q = (cfg.radiation && cfg.radiation.qualityFactor) || 3.82;
    cfg.metrics.forEach(function (m) {
      byKey[m.key] = m; alias[m.key] = m.key;
      (m.aliases || []).forEach(function (a) { alias[a.toLowerCase()] = m.key; });
    });
    D.clear();
  };
  D.metric = function (k) { return byKey[k]; };
  D.resolve = function (name) { if (name == null) return null; var s = String(name).trim(); return alias[s] || alias[s.toLowerCase()] || alias[s.toLowerCase().replace(/[\s-]+/g, "_")] || null; };

  /* ---------- crew members ---------- */
  D.crewId = function (name) {
    return String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  };
  function defaultCrew() { return Object.assign({}, (CFG && CFG.crew) || { name: "Crew member" }); }
  function ensureCrew(id, crewObj) {
    if (!D.crews[id]) D.crews[id] = { store: {}, meta: { crew: crewObj ? Object.assign({}, crewObj) : { name: id }, ecg: null, source: "none", files: [] } };
    else if (crewObj) D.crews[id].meta.crew = Object.assign({}, D.crews[id].meta.crew || {}, crewObj);
    return D.crews[id];
  }
  D.use = function (id) {
    if (!D.crews[id]) return false;
    D.current = id; D.store = D.crews[id].store; D.meta = D.crews[id].meta;
    return true;
  };
  D.crewList = function () {
    return Object.keys(D.crews).map(function (id) {
      var c = D.crews[id], n = 0;
      Object.keys(c.store).forEach(function (k) { n += c.store[k].t.length; });
      return { id: id, name: (c.meta.crew && c.meta.crew.name) || id, role: c.meta.crew && c.meta.crew.role, values: n };
    }).sort(function (a, b) { return order(a.name) - order(b.name) || a.name.localeCompare(b.name); });
  };
  /* crew in the roster (config.js) come first, in roster order */
  function order(name) {
    var r = (CFG && CFG.roster) || [], id = D.crewId(name);
    for (var i = 0; i < r.length; i++) if (D.crewId(r[i].name) === id) return i;
    return r.length;
  }
  D.removeCrew = function (id) {
    delete D.crews[id];
    if (D.current === id) { var ids = Object.keys(D.crews); if (ids.length) D.use(ids[0]); else D.clear(); }
  };
  D.clear = function () {
    D.crews = {};
    var c = defaultCrew(), id = D.crewId(c.name);
    ensureCrew(id, c); D.use(id);
  };

  /* ---------- time ---------- */
  D.parseTime = function (x) {
    if (typeof x === "number" && isFinite(x)) return x < 1e11 ? x * 1000 : x;
    if (typeof x === "string" && x.trim()) {
      var s = x.trim();
      if (/^\d+(\.\d+)?$/.test(s)) return D.parseTime(+s);
      var t = Date.parse(s);
      return isNaN(t) ? null : t;
    }
    return null;
  };

  function pick(o, names) { for (var i = 0; i < names.length; i++) if (o[names[i]] !== undefined) return o[names[i]]; return undefined; }
  var TIME_KEYS = ["time", "t", "timestamp", "ts", "timestamp_utc", "time_utc", "datetime", "date_time", "date", "utc"];
  var META_KEYS = { crew: 1, astronaut: 1, crew_member: 1, source: 1, source_file: 1, note: 1, notes: 1, id: 1, observation: 1, sol: 1, unit: 1, u: 1, quality: 1, flag: 1 };

  /* ---------- units ----------
   * Written any common way: "microgray/hour", "uGy/h", "μSv/hr", "mSv per day", "mmol/l"... */
  var UNIT_FORMS = { "µsv/h": "µSv/h", "msv/h": "mSv/h", "nsv/h": "nSv/h", "sv/h": "Sv/h", "gy/h": "Gy/h", "µgy/h": "µGy/h", "mgy/h": "mGy/h", "ngy/h": "nGy/h",
    "µsv/day": "µSv/day", "msv/day": "mSv/day", "µgy/day": "µGy/day", "mgy/day": "mGy/day",
    "msv": "mSv", "µsv": "µSv", "sv": "Sv", "mgy": "mGy", "µgy": "µGy", "gy": "Gy",
    "mmol/l": "mmol/L", "mg/dl": "mg/dL", "ml": "mL", "l": "L", "°c": "°C", "c": "°C", "°f": "F", "f": "F", "lb": "lb", "lbs": "lb", "kg": "kg" };
  D.normUnit = function (u) {
    if (u == null || u === "") return null;
    var s = String(u).trim().replace(/μ/g, "µ").toLowerCase();
    s = s.replace(/\s*per\s*/g, "/").replace(/\s+/g, "")
      .replace(/micro/g, "µ").replace(/milli/g, "m").replace(/nano/g, "n")
      .replace(/grays?/g, "gy").replace(/sieverts?/g, "sv")
      .replace(/\/(hours?|hrs?)$/, "/h").replace(/\/(days?|d)$/, "/day")
      .replace(/^u(sv|gy)/, "µ$1").replace(/degrees?c(elsius)?|deg\.?c/, "°c");
    return UNIT_FORMS[s] || String(u).trim();
  };
  /* column names with the unit at the end: heart_rate_bpm, dose_rate_ugy_h, temp_c */
  var UNIT_TOKENS = { ugy_h: "µGy/h", ugy_hr: "µGy/h", usv_h: "µSv/h", usv_hr: "µSv/h", msv_h: "mSv/h", nsv_h: "nSv/h", mgy_h: "mGy/h",
    msv_day: "mSv/day", msv_d: "mSv/day", usv_day: "µSv/day", ugy_day: "µGy/day", mgy_day: "mGy/day",
    usv: "µSv", msv: "mSv", mgy: "mGy", ugy: "µGy", bpm: "bpm", pct: "%", percent: "%", c: "°C", degc: "°C", f: "F", degf: "F",
    mmhg: "mmHg", kg: "kg", lb: "lb", lbs: "lb", ms: "ms", mg_dl: "mg/dL", mgdl: "mg/dL", mmol_l: "mmol/L", mmol: "mmol/L", l: "L", ml: "mL", min: "min", h: "h", hours: "h" };
  function resolveColumn(col) {
    var k = D.resolve(col); if (k) return { key: k, unit: null };
    var tok = String(col).toLowerCase().split(/[\s_\-]+/);
    for (var n = 1; n <= 3 && n < tok.length; n++) {
      var base = tok.slice(0, -n).join("_"), u = UNIT_TOKENS[tok.slice(-n).join("_")];
      if (!u) continue;
      k = D.resolve(base); if (k) return { key: k, unit: u };
    }
    return null;
  }
  function unitEntry(m, unit) {
    if (!m.units) return null;
    return m.units[unit] || m.units[D.normUnit(unit)] || m.units[String(unit).replace("°", "")] || null;
  }
  /* which metric a value belongs to, given its unit: µGy/h is a dose rate, mGy a dose. Returns { key, mul, add, sievert } or null */
  function routeUnit(key, unit) {
    var m = byKey[key];
    if (unit == null || unit === "" || unit === m.unit || D.normUnit(unit) === m.unit) return { key: key, mul: 1, add: 0 };
    var u = unitEntry(m, unit);
    if (u) return { key: key, mul: u.mul || 1, add: u.add || 0, sievert: !!u.sievert };
    if (m.unit_sibling) { var s = byKey[m.unit_sibling], su = unitEntry(s, unit) || (D.normUnit(unit) === s.unit ? {} : null); if (su) return { key: s.key, mul: su.mul || 1, add: su.add || 0, sievert: !!su.sievert }; }
    return null;
  }

  /* ---------- special file formats, turned into the normal one ---------- */
  var ADAPTERS = [
    { /* NASA PDS, Curiosity (MSL) RAD cruise data: absorbed dose rate in µGy/h from detectors B (silicon) and E (plastic,
         close to human tissue). Detector E is used, B when E is missing. */
      test: function (o) { var r = o.readings && o.readings[0]; return r && typeof r === "object" && ("dose_rate_e_ugy_h" in r || "dose_rate_b_ugy_h" in r); },
      convert: function (o) {
        var samples = o.readings.map(function (r) {
          var v = typeof r.dose_rate_e_ugy_h === "number" ? r.dose_rate_e_ugy_h : r.dose_rate_b_ugy_h;
          return [r.timestamp_utc || r.time || r.timestamp, typeof v === "number" ? v : null];
        });
        return { obj: { crew: o.crew, series: [{ metric: "radiation_dose_rate", unit: "µGy/h", samples: samples }] },
          note: "Read as Curiosity RAD data from the cruise to Mars (" + (o.source || "NASA PDS") + "): detector E, which responds like human tissue." };
      } }
  ];

  /* ---------- import ----------
   * D.ingestMany([{ obj, name }], opts) reads several parsed JSON files at once and returns one report per file:
   * { name, added: {key: n}, skipped: {reason: n}, unknown: [names], crew: [names], ecg, notes: [], error }
   * opts.align: move old dates to today and keep the last 30 days (files from people). Off for the app's own
   * data (manual entries, live feed). opts.now: "today" for alignment, default Date.now(). */
  D.ingestMany = function (items, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), reps = [], pend = [], crewsTouched = {}, ecgs = [], lastFileCrew = null;
    items.forEach(function (it, idx) {
      var rep = { name: it.name || "data", added: {}, skipped: {}, unknown: {}, crew: [], ecg: false, error: null, notes: [] };
      reps.push(rep); pend.push({});
      function skip(why) { rep.skipped[why] = (rep.skipped[why] || 0) + 1; }
      var obj = it.obj;
      if (obj == null || typeof obj !== "object") { rep.error = "The file is not a JSON object."; return; }
      if (Array.isArray(obj)) obj = { readings: obj };
      ADAPTERS.forEach(function (ad) { if (ad.test(obj)) { var c = ad.convert(obj); obj = c.obj; rep.notes.push(c.note); } });

      var crewRaw = obj.crew || obj.astronaut || obj.crew_member, fileCrew = null;
      if (crewRaw) {
        var co = typeof crewRaw === "string" ? { name: crewRaw } : typeof crewRaw === "object" ? crewRaw : null;
        if (co && co.name) { fileCrew = D.crewId(co.name); ensureCrew(fileCrew, co); rep.crew.push(co.name); lastFileCrew = fileCrew; }
        else if (co) { ensureCrew(D.current, co); rep.crew.push((D.meta.crew || {}).name || ""); }
      }
      function target(rowCrew) {
        if (typeof rowCrew === "string" && rowCrew.trim()) {
          var id = D.crewId(rowCrew); ensureCrew(id, D.crews[id] ? null : { name: rowCrew.trim() });
          if (rep.crew.indexOf(rowCrew.trim()) < 0) rep.crew.push(rowCrew.trim());
          return id;
        }
        return fileCrew || D.current;
      }
      function push(crewId, key, t, v, unit) {
        if (t === null) return skip("time could not be read");
        if (v === null || v === undefined || v === "") return;
        v = typeof v === "string" ? +v : v;
        if (typeof v !== "number" || !isFinite(v)) return skip("value is not a number");
        var r = routeUnit(key, unit);
        if (!r) return skip("unit \"" + unit + "\" not recognised for " + byKey[key].label.toLowerCase());
        var m = byKey[r.key];
        v = (v + r.add) * r.mul / (r.sievert ? Q : 1);
        if (r.sievert) rep.sievert = true;
        if (m.valid && (v < m.valid[0] || v > m.valid[1])) return skip("value outside the possible range for " + m.label.toLowerCase());
        var p = pend[idx][crewId] = pend[idx][crewId] || {};
        (p[r.key] = p[r.key] || []).push([t, v]);
        crewsTouched[crewId] = 1;
      }

      var readings = pick(obj, ["readings", "measurements", "checks", "observations", "data"]) || [];
      if (!Array.isArray(readings)) { rep.error = "\"readings\" must be a list."; return; }
      readings.forEach(function (r) {
        if (!r || typeof r !== "object") return skip("entry is not an object");
        var t = D.parseTime(pick(r, TIME_KEYS)), who = target(pick(r, ["crew", "astronaut", "crew_member"]));
        var rawKey = pick(r, ["metric", "k", "key", "type"]);
        if (rawKey === undefined && obj.metric) rawKey = obj.metric;
        if (rawKey !== undefined) {
          var key = D.resolve(rawKey);
          if (!key) { rep.unknown[String(rawKey)] = 1; return; }
          var u = pick(r, ["unit", "u"]); if (u === undefined) u = obj.unit;
          return push(who, key, t, pick(r, ["value", "v", "val"]), u);
        }
        /* one row with several measurements as columns: { "time": ..., "heart_rate_bpm": 62, "spo2": 98 } */
        Object.keys(r).forEach(function (col) {
          if (TIME_KEYS.indexOf(col) >= 0 || META_KEYS[col]) return;
          var val = r[col]; if (val === null || typeof val === "object" || typeof val === "boolean") return;
          if (typeof val === "string" && (val.trim() === "" || isNaN(+val))) return;
          var rc = resolveColumn(col);
          if (!rc) { rep.unknown[col] = 1; return; }
          push(who, rc.key, t, val, rc.unit || pick(r, ["unit", "u"]) || obj.unit);
        });
      });

      var series = pick(obj, ["series", "continuous", "streams"]) || [];
      if (!Array.isArray(series)) { rep.error = "\"series\" must be a list."; return; }
      series.forEach(function (s) {
        if (!s || typeof s !== "object") return skip("series is not an object");
        var rawKey = pick(s, ["metric", "k", "key", "type"]), key = D.resolve(rawKey);
        if (!key) { rep.unknown[String(rawKey)] = 1; return; }
        var unit = pick(s, ["unit", "u"]), who = target(pick(s, ["crew", "astronaut", "crew_member"]));
        var samples = pick(s, ["samples", "points"]);
        if (Array.isArray(samples)) {
          samples.forEach(function (p) {
            if (!Array.isArray(p)) return skip("sample is not [time, value]");
            push(who, key, D.parseTime(p[0]), p[1], unit);
          });
          return;
        }
        var t0 = D.parseTime(pick(s, ["start", "t0", "from"])), dt = +pick(s, ["interval_s", "dt_s", "interval", "step_s"]);
        var vals = pick(s, ["values", "v"]);
        if (t0 === null || !(dt > 0) || !Array.isArray(vals)) return skip("series needs start, interval_s and values");
        for (var i = 0; i < vals.length; i++) push(who, key, t0 + i * dt * 1000, vals[i], unit);
      });

      var ecg = obj.ecg;
      if (ecg && typeof ecg === "object") {
        var e = Array.isArray(ecg) ? ecg[ecg.length - 1] : ecg;
        var es = D.parseTime(pick(e, ["start", "t0", "time"])), hz = +pick(e, ["hz", "rate", "sample_rate"]), ev = pick(e, ["values", "values_mv", "v"]);
        if (es !== null && hz > 0 && Array.isArray(ev) && ev.length > hz) { ecgs.push({ idx: idx, crew: fileCrew || D.current, start: es, hz: hz, values: ev.map(Number), lead: e.lead || "II" }); rep.ecg = true; crewsTouched[fileCrew || D.current] = 1; }
        else skip("ecg needs start, hz and at least one second of values");
      }
      if (rep.sievert) rep.notes.push("Radiation given in sievert (dose equivalent) was turned into gray (absorbed dose) by dividing by the quality factor " + Q + " that Curiosity measured on the way to Mars.");
    });

    /* old dates: move each crew member's data to end today, by whole days */
    if (opts.align) Object.keys(crewsTouched).forEach(function (id) {
      var from = Infinity, to = -Infinity;
      pend.forEach(function (p) { var c = p[id]; if (c) Object.keys(c).forEach(function (k) { c[k].forEach(function (x) { if (x[0] < from) from = x[0]; if (x[0] > to) to = x[0]; }); }); });
      ecgs.forEach(function (e) { if (e.crew === id) { from = Math.min(from, e.start); to = Math.max(to, e.start); } });
      if (to === -Infinity || (to >= now - 2 * DAY && to <= now + DAY)) return;
      var meta = D.crews[id].meta, prev = meta.shift, want = Math.floor((now - to) / DAY) * DAY, ms = want;
      if (prev && from <= prev.origTo + 31 * DAY && to >= prev.origFrom - 31 * DAY) {
        ms = prev.ms;
        if (to + ms > now + 5 * 60e3) { /* this file runs later than the earlier ones: move the stored data back to match */
          var delta = ms - want, st = D.crews[id].store;
          Object.keys(st).forEach(function (k) { st[k].t = st[k].t.map(function (t) { return t - delta; }); });
          if (meta.ecg) meta.ecg.start -= delta;
          ms = want;
        }
        meta.shift = { ms: ms, origFrom: Math.min(prev.origFrom, from), origTo: Math.max(prev.origTo, to) };
      } else meta.shift = { ms: ms, origFrom: from, origTo: to };
      pend.forEach(function (p, i) {
        var c = p[id]; if (!c) return;
        Object.keys(c).forEach(function (k) { c[k].forEach(function (x) { x[0] += ms; }); });
        reps[i].notes.push("Dates moved " + (ms >= 0 ? "forward" : "back") + " by " + Math.abs(Math.round(ms / DAY)).toLocaleString("en") + " days so the data ends today (the file covers " + fmtDay(from) + " to " + fmtDay(to) + ").");
      });
      ecgs.forEach(function (e) { if (e.crew === id) e.start += ms; });
      if (meta.crew && meta.crew.mission_start) { var msT = D.parseTime(meta.crew.mission_start); if (msT !== null) meta.crew.mission_start = new Date(msT + ms).toISOString().slice(0, 10); }
    });

    /* into the stores */
    pend.forEach(function (p, i) {
      Object.keys(p).forEach(function (id) {
        var store = D.crews[id].store;
        Object.keys(p[id]).forEach(function (k) {
          if (byKey[k].derive) { var why = "calculated by the app, value in file ignored (" + byKey[k].label.toLowerCase() + ")"; reps[i].skipped[why] = (reps[i].skipped[why] || 0) + p[id][k].length; return; }
          reps[i].added[k] = (reps[i].added[k] || 0) + merge(store, k, p[id][k]);
        });
      });
    });
    ecgs.forEach(function (e) {
      var meta = D.crews[e.crew].meta;
      if (!meta.ecg || e.start >= meta.ecg.start) meta.ecg = { start: e.start, hz: e.hz, values: e.values, lead: e.lead };
    });

    /* keep the last mission.days days */
    if (opts.align) {
      var days = (CFG.mission && CFG.mission.days) || 30;
      Object.keys(crewsTouched).forEach(function (id) {
        var st = D.crews[id].store, hi = -Infinity, cut, removed = 0;
        Object.keys(st).forEach(function (k) { var s = st[k]; if (s.t.length) hi = Math.max(hi, s.t[s.t.length - 1]); });
        if (hi === -Infinity) return;
        cut = hi - days * DAY;
        Object.keys(st).forEach(function (k) {
          var s = st[k], j = lowerBound(s.t, cut);
          if (j > 0) { removed += j; s.t = s.t.slice(j); s.v = s.v.slice(j); }
        });
        if (removed) reps.forEach(function (r, i) { if (pend[i][id]) r.notes.push("Kept the last " + days + " days of the mission; " + removed.toLocaleString("en") + " older " + (removed === 1 ? "value was" : "values were") + " left out."); });
      });
    }

    var prevCur = D.current;
    Object.keys(crewsTouched).forEach(function (id) { if (H.derive) { D.use(id); H.derive(); } });
    D.use(opts.switchTo === false || !lastFileCrew ? prevCur : lastFileCrew);
    reps.forEach(function (r) { r.unknown = Object.keys(r.unknown); });
    return reps;
  };
  D.ingest = function (obj, name, opts) { return D.ingestMany([{ obj: obj, name: name }], opts)[0]; };
  function fmtDay(t) { return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }

  /* merge pairs into a store; same timestamp: newest import wins. Returns count added. */
  function merge(store, key, pairs) {
    var s = store[key] || { t: [], v: [] }, all = [], i;
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    /* fast path: new samples are all later than what is stored (live feeds) */
    var inOrder = true;
    for (i = 0; i < pairs.length; i++) if ((i ? pairs[i - 1][0] : (s.t.length ? s.t[s.t.length - 1] : -Infinity)) >= pairs[i][0]) { inOrder = false; break; }
    if (inOrder) { for (i = 0; i < pairs.length; i++) { s.t.push(pairs[i][0]); s.v.push(pairs[i][1]); } store[key] = s; return pairs.length; }
    for (i = 0; i < s.t.length; i++) all.push([s.t[i], s.v[i], 0]);
    for (i = 0; i < pairs.length; i++) all.push([pairs[i][0], pairs[i][1], 1]);
    all.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; });
    var t = [], v = [];
    for (i = 0; i < all.length; i++) {
      if (t.length && t[t.length - 1] === all[i][0]) { v[v.length - 1] = all[i][1]; continue; }
      t.push(all[i][0]); v.push(all[i][1]);
    }
    var before = s.t.length;
    store[key] = { t: t, v: v };
    return t.length - before;
  }

  /* ---------- simulation: a few values replaced at time `at`, on a copy, never saved ---------- */
  D.sim = null;
  D.simulate = function (values, at) {
    D.endSimulation();
    var real = D.store, copy = Object.assign({}, real);
    Object.keys(values).forEach(function (k) {
      var m = byKey[k], v = values[k]; if (!m || typeof v !== "number" || !isFinite(v)) return;
      var s = real[k] || { t: [], v: [] }, t = [], vv = [], i, from = at - 30 * 60e3;
      for (i = 0; i < s.t.length && s.t[i] < from; i++) { t.push(s.t[i]); vv.push(s.v[i]); }
      if (m.kind === "continuous") for (var x = at - 20 * 60e3; x <= at; x += 60e3) { t.push(x); vv.push(v); }
      else { t.push(at); vv.push(v); }
      for (i = upperBound(s.t, at); i < s.t.length; i++) { t.push(s.t[i]); vv.push(s.v[i]); }
      copy[k] = { t: t, v: vv };
    });
    D.sim = { id: D.current, real: real, values: values, at: at };
    D.store = copy;
    if (H.derive) H.derive();
  };
  D.endSimulation = function () {
    if (!D.sim) return;
    if (D.current === D.sim.id) D.store = D.sim.real;
    D.sim = null;
  };

  /* ---------- queries ---------- */
  function lowerBound(arr, x) { var lo = 0, hi = arr.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; }
  function upperBound(arr, x) { var lo = 0, hi = arr.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; } return lo; }

  D.has = function (k) { return !!(D.store[k] && D.store[k].t.length); };

  /* values with a <= t <= b */
  D.between = function (k, a, b) {
    var s = D.store[k]; if (!s) return { t: [], v: [] };
    var i = lowerBound(s.t, a), j = upperBound(s.t, b);
    return { t: s.t.slice(i, j), v: s.v.slice(i, j) };
  };
  /* last sample at or before t (and optionally the one before it) */
  D.latest = function (k, at, back) {
    var s = D.store[k]; if (!s) return null;
    var j = upperBound(s.t, at) - 1 - (back || 0);
    return j >= 0 ? { t: s.t[j], v: s.v[j] } : null;
  };
  D.first = function (k) { var s = D.store[k]; return s && s.t.length ? { t: s.t[0], v: s.v[0] } : null; };

  /* fixed-width buckets over [a, b): mean/min/max per bucket, null where there is no data */
  D.buckets = function (k, a, b, size) {
    var n = Math.ceil((b - a) / size), out = new Array(n), s = D.store[k];
    for (var q = 0; q < n; q++) out[q] = null;
    if (!s) return out;
    var i = lowerBound(s.t, a), j = lowerBound(s.t, b);
    for (; i < j; i++) {
      var q2 = Math.floor((s.t[i] - a) / size), v = s.v[i], o = out[q2];
      if (!o) out[q2] = { sum: v, n: 1, min: v, max: v };
      else { o.sum += v; o.n++; if (v < o.min) o.min = v; if (v > o.max) o.max = v; }
    }
    for (q = 0; q < n; q++) if (out[q]) { out[q].mean = out[q].sum / out[q].n; out[q].t = a + (q + 0.5) * size; }
    return out;
  };

  D.extent = function () {
    var lo = Infinity, hi = -Infinity;
    Object.keys(D.store).forEach(function (k) { var s = D.store[k]; if (s.t.length) { lo = Math.min(lo, s.t[0]); hi = Math.max(hi, s.t[s.t.length - 1]); } });
    return lo === Infinity ? null : { from: lo, to: hi };
  };

  D.counts = function () {
    var c = { continuous: 0, periodic: 0 };
    Object.keys(D.store).forEach(function (k) { var m = byKey[k]; if (m) c[m.kind] += D.store[k].t.length; });
    return c;
  };

  /* export the crew member on screen in the same format the app imports */
  D.export = function () {
    var store = D.sim && D.sim.id === D.current ? D.sim.real : D.store;
    var out = { format: "chc/1", exported: new Date().toISOString(), crew: D.meta.crew || undefined, readings: [], series: [] };
    Object.keys(store).forEach(function (k) {
      var m = byKey[k], s = store[k];
      if (m.kind === "periodic") s.t.forEach(function (t, i) { out.readings.push({ metric: k, time: new Date(t).toISOString(), value: s.v[i] }); });
      else out.series.push({ metric: k, samples: s.t.map(function (t, i) { return [new Date(t).toISOString(), s.v[i]]; }) });
    });
    if (D.meta.ecg) { var e = D.meta.ecg; out.ecg = { start: new Date(e.start).toISOString(), hz: e.hz, lead: e.lead, values: e.values }; }
    return out;
  };

  /* ---------- persistence (IndexedDB, falls back to memory only) ---------- */
  var DBN = "halo-vitals-v2", ST = "kv", dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        var rq = indexedDB.open(DBN, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(ST); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  D.save = function (key, val) {
    return db().then(function (d) {
      if (!d) return false;
      return new Promise(function (res) {
        var tx = d.transaction(ST, "readwrite");
        if (val === undefined) tx.objectStore(ST).delete(key); else tx.objectStore(ST).put(val, key);
        tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); };
      });
    });
  };
  D.load = function (key) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res) {
        var rq = d.transaction(ST).objectStore(ST).get(key);
        rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); };
      });
    });
  };
  /* everything that is saved: all crew members (never simulated values) */
  D.snapshot = function () {
    var out = { v: 2, current: D.current, crews: {} };
    Object.keys(D.crews).forEach(function (id) {
      var c = D.crews[id], store = D.sim && D.sim.id === id ? D.sim.real : c.store;
      out.crews[id] = { store: store, meta: { crew: c.meta.crew, ecg: c.meta.ecg, files: c.meta.files, shift: c.meta.shift } };
    });
    return out;
  };
  D.restore = function (snap) {
    D.crews = {};
    if (snap.crews) Object.keys(snap.crews).forEach(function (id) {
      var c = snap.crews[id];
      D.crews[id] = { store: c.store || {}, meta: Object.assign({ ecg: null, files: [] }, c.meta || {}, { source: "upload" }) };
    });
    else if (snap.store) { /* saved by an older version: one crew member */
      var crew = (snap.meta && snap.meta.crew) || defaultCrew(), id = D.crewId(crew.name || "");
      D.crews[id] = { store: snap.store, meta: Object.assign({ ecg: null, files: [] }, snap.meta || {}, { crew: crew, source: "upload" }) };
    }
    if (!Object.keys(D.crews).length) return D.clear();
    D.use(D.crews[snap.current] ? snap.current : Object.keys(D.crews)[0]);
  };
})(window);
