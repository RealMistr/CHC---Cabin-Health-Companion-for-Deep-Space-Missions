/* Sample data generator. Produces files in the exact team format (see DATA.md) and feeds them through the
 * normal import, so they double as working examples. The three crew members are real people (see roster in
 * config.js); their health numbers are not real: astronauts' medical data is not public.
 * Where the numbers come from:
 *   - Blood draws (white blood cells, ferritin, sodium) and finger-pricks (glucose, haemoglobin, lactate):
 *     the team's own data files (TEAM below). Aleš gets them as they are; Thomas and Adrianos get their own
 *     version of the same baseline (scaled, shifted and with small differences), so nobody has identical results.
 *     Dates are moved to the mission calendar: day 1 is 29 days before today.
 *   - Radiation: real measurements by NASA's Curiosity rover (RAD) on its cruise to Mars (js/curiosity-rad.js),
 *     moved in time so they end now. All three share the cabin, so they get the same radiation.
 *   - Everything else is generated inside adult reference ranges, with a different story per person:
 *     Aleš Svoboda      short sleep in the last week, slower reactions, bone-loss signs in urine
 *     Thomas Pesquet    steady and well adapted, the calm baseline to compare against
 *     Adrianos Golemis  drinking too little in the last days: concentrated urine, low volume, sodium creeping up
 * tools/export-sample.js writes the files to data/ and the team files per astronaut to data/team/. */
(function (g) {
  var H = g.Halo = g.Halo || {}, SM = H.sample = {};
  var DAY = 864e5, MIN = 60e3;

  function rng(seed) {
    var a = seed | 0;
    return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r1(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

  /* The team's data (data files "wbc_ferritrin_sodium.json" and "template.json"), as mission days at 08:00 UTC.
     Blood draw every 14 days (days 1, 15, 29); finger-prick every 3 days (days 1, 4, ... 28). */
  var TEAM = {
    blood: { days: [1, 15, 29], wbc: [12.7, 7.4, 12.8], ferritin: [155.2, 78.7, 218.2], sodium: [138, 141, 141] },
    prick: {
      days: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28],
      glucose: [78.3, 83.1, 77.9, 87.7, 77.6, 75.9, 74.3, 84.7, 76.1, 75.4],
      hemoglobin: [15.4, 14.75, 14.78, 15.44, 14.12, 15.41, 15.31, 15.31, 14.38, 14.94],
      lactate: [1.449, 1.56, 1.367, 1.756, 2.08, 1.503, 1.485, 1.227, 1.311, 1.085]
    }
  };
  /* how each person's results relate to the team baseline: value * scale + add[i], then a small personal wobble */
  var TEAM_FIT = {
    "ales svoboda": null, /* the team's numbers exactly */
    "thomas pesquet": { wobble: 0.025, wbc: { scale: 0.72 }, ferritin: { scale: 0.85 }, sodium: { add: [-1, -1, -1] }, glucose: { add: 6 }, hemoglobin: { add: -0.4 }, lactate: { scale: 0.9 } },
    "adrianos golemis": { wobble: 0.025, wbc: { scale: 0.82 }, ferritin: { scale: 1.1 }, sodium: { add: [2, 3, 5] }, glucose: { add: 3 }, hemoglobin: { add: 0.5 }, lactate: { scale: 1.05 } }
  };
  var DEC = { wbc: 1, ferritin: 1, sodium: 0, glucose: 1, hemoglobin: 2, lactate: 3 };
  /* the team-based readings for one person, for a mission that starts on "start" (ms, 00:00 UTC of day 1) */
  SM.team = function (name, start) {
    var id = idOf(name), fit = TEAM_FIT[id], R = rng(id.length * 7919 + 17), out = [];
    function val(k, v, i) {
      if (!fit) return v;
      var f = fit[k] || {}, add = Array.isArray(f.add) ? f.add[i] : (f.add || 0);
      var x = v * (f.scale || 1) + add;
      if (k !== "sodium") x *= 1 + (R() * 2 - 1) * fit.wobble;
      return r1(x, DEC[k]);
    }
    ["blood", "prick"].forEach(function (grp) {
      var G = TEAM[grp];
      G.days.forEach(function (d, i) {
        var t = start + (d - 1) * DAY + 8 * 3600e3;
        Object.keys(G).forEach(function (k, q) { if (k !== "days") out.push({ metric: k, time: new Date(t + (q - 1) * MIN).toISOString(), value: val(k, G[k][i], i) }); });
      });
    });
    return out;
  };

  /* per-person numbers; "end" values are reached on the last day, "recent" effects build up over the last week */
  var PROFILES = {
    "ales svoboda": {
      seed: 0, role: "Pilot", baseline: { body_mass: 74.2, reaction_time: 280 },
      hr: [57, 61], hrGain: 13.5, fatigueHr: 6, bp: [113, 73], spo2: 97.2, skin: 33.6, rr: 13,
      mass: [74.0, -2.7], temp: 36.7, rt: function (w, n) { return w === 4 ? 318 : w === 3 ? 305 : Math.round(284 + n(8)); },
      sleep: function (back, n) { return back < 6 ? 5.9 + n(0.25) : 7.15 + n(0.45); },
      mood: function (back, n) { return back < 5 ? 3 : clamp(Math.round(4 + n(0.9)), 3, 5); },
      conn: function (back, n) { return back < 4 ? 3 : clamp(Math.round(4 + n(0.8)), 3, 5); },
      exercise: [125, 70], skip: 4,
      uph: function (w, f, n) { return w === 4 ? 5.7 : 6.3 - 0.4 * f + n(0.1); }, usg: [1.012, 0.007],
      monthly: { vision: [1.0, 0.9], urine_calcium: [165, 241], urine_volume: [2.7, 1.9], urine_oxalate: [31, 36], urine_citrate: [610, 300] },
      ecgBpm: 64
    },
    "thomas pesquet": {
      seed: 7919, role: "Commander", baseline: { body_mass: 77.8, reaction_time: 296 },
      hr: [53, 58], hrGain: 12.5, fatigueHr: 0, bp: [121, 78], spo2: 97.6, skin: 33.4, rr: 12,
      mass: [77.6, -1.3], temp: 36.6, rt: function (w, n) { return Math.round(296 + n(9)); },
      sleep: function (back, n) { return 7.45 + n(0.35); },
      mood: function (back, n) { return clamp(Math.round(4.3 + n(0.8)), 3, 5); },
      conn: function (back, n) { return clamp(Math.round(4.4 + n(0.7)), 3, 5); },
      exercise: [120, 75], skip: 2,
      uph: function (w, f, n) { return 6.2 - 0.1 * f + n(0.1); }, usg: [1.013, 0.003],
      monthly: { vision: [1.0, 1.0], urine_calcium: [150, 204], urine_volume: [2.8, 2.6], urine_oxalate: [28, 30], urine_citrate: [650, 560] },
      ecgBpm: 58
    },
    "adrianos golemis": {
      seed: 104729, role: "Mission specialist", baseline: { body_mass: 70.6, reaction_time: 268 },
      hr: [58, 62], hrGain: 13.0, fatigueHr: 5, bp: [116, 75], spo2: 97.4, skin: 33.7, rr: 13,
      mass: [70.4, -1.9], temp: 36.8, rt: function (w, n) { return w === 4 ? 279 : Math.round(270 + n(7)); },
      sleep: function (back, n) { return 7.5 + n(0.3); },
      mood: function (back, n) { return clamp(Math.round(4 + n(0.8)), 3, 5); },
      conn: function (back, n) { return clamp(Math.round(4.2 + n(0.8)), 3, 5); },
      exercise: [130, 80], skip: 7,
      uph: function (w, f, n) { return 6.0 - 0.3 * f + n(0.1); }, usg: [1.014, 0.0125],
      monthly: { vision: [1.0, 1.0], urine_calcium: [170, 226], urine_volume: [2.6, 1.6], urine_oxalate: [30, 38], urine_citrate: [590, 420] },
      ecgBpm: 66
    }
  };
  function cfgCrew() { return (g.HALO_CONFIG || {}).crew || {}; }
  function roster() { return ((g.HALO_CONFIG || {}).roster || []); }
  function idOf(name) { return String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function profileFor(name) { return PROFILES[idOf(name)] || PROFILES["ales svoboda"]; }
  /* age on a given day from "born" (YYYY-MM-DD or YYYY) */
  SM.age = function (born, atMs) {
    if (!born) return null;
    var at = new Date(atMs || Date.now()), p = String(born).split("-"), y = +p[0];
    if (p.length < 3) return at.getUTCFullYear() - y; /* only the year: age reached on this year's birthday */
    var a = at.getUTCFullYear() - y, m = at.getUTCMonth() + 1, d = at.getUTCDate();
    if (m < +p[1] || (m === +p[1] && d < +p[2])) a--;
    return a;
  };

  /* station day in UTC: sleep 21:30-06:00, resistive exercise 08:30-09:30, treadmill 15:00-15:45 */
  function activityAt(t, skipped) {
    var h = (t % DAY) / 3600e3;
    if (h >= 21.5 || h < 6) return 0.9;
    if (h < 7) return 1.4;
    if (h >= 8.5 && h < 9.5) return 4.4;
    if (!skipped && h >= 15 && h < 15.75) return 7.0;
    return 1.7;
  }
  function inGap(t) { var h = (t % DAY) / 3600e3; return h >= 12 && h < 12 + 1 / 3; } /* daily battery swap */

  function channels(P, t, R, recent, skipped) {
    function n(a) { return (R() * 2 - 1) * a; }
    var act = clamp(activityAt(t, skipped) + n(0.25), 0.8, 9), h = (t % DAY) / 3600e3;
    var sleeping = act < 1, ex = act >= 3, diurnal = Math.sin((h - 9) / 24 * 2 * Math.PI);
    return {
      activity: r1(act, 1),
      heart_rate: Math.round((sleeping ? P.hr[0] : P.hr[1]) + 3 * diurnal + (act - 1) * P.hrGain + P.fatigueHr * recent + n(2.2)),
      resp_rate: Math.round(P.rr + (act - 1) * 3.0 + 1.2 * recent * (P.fatigueHr ? 1 : 0) + n(1)),
      ventilation: r1(6.4 + (act - 1) * 2.7 + n(0.4), 1),
      spo2: Math.round(clamp(P.spo2 + n(1.1), 90, 100)),
      bp_sys: Math.round(P.bp[0] + (act - 1) * 6 + (P.fatigueHr ? 4 : 0) * recent + 2 * diurnal + n(3)),
      bp_dia: Math.round(P.bp[1] + (act - 1) * 1.4 + (P.fatigueHr ? 2 : 0) * recent + n(2)),
      skin_temp: r1(P.skin + (sleeping ? 0.6 : 0) + (ex ? 0.8 : 0) + n(0.12), 2),
      radiation_dose_rate: radiationAt(t, R)
    };
  }
  /* active dose rate (µGy/h, absorbed dose): the real Curiosity cruise measurements (about 18 µGy/h), moved so the last one is now.
     Without js/curiosity-rad.js it falls back to a steady 20 µGy/h background with a little noise. */
  function curiositySamples(now, start) {
    var C = H.curiosity; if (!C) return null;
    var shift = now - C.dt[C.dt.length - 1] * 1000, out = [];
    for (var i = 0; i < C.dt.length; i++) { var t = shift + C.dt[i] * 1000; if (t >= start) out.push([new Date(t).toISOString(), C.v[i]]); }
    return out;
  }
  function radiationAt(t, R) { return r1(19.6 + 1 * Math.sin(t / (5.3 * DAY) * 2 * Math.PI) + (R() * 2 - 1) * 1, 2); }
  var KEYS = ["heart_rate", "spo2", "bp_sys", "bp_dia", "resp_rate", "ventilation", "skin_temp", "activity", "radiation_dose_rate"];

  /* 30 days of everything for one crew member (default: the first in the roster).
     The mission started 29 days before today, so today is day 30. */
  SM.generate = function (nowMs, name) {
    var now = nowMs || Date.now();
    var who = name || cfgCrew().name || "Aleš Svoboda", P = profileFor(who);
    var prof = roster().filter(function (r) { return idOf(r.name) === idOf(who); })[0] || {};
    var R = rng(Math.floor(now / DAY) + P.seed);
    var today = Math.floor(now / DAY), start = (today - 29) * DAY;
    var rad = curiositySamples(now, start), keys = rad ? KEYS.filter(function (k) { return k !== "radiation_dose_rate"; }) : KEYS;
    var age = SM.age(prof.born, now) || cfgCrew().age || 40;
    var out = {
      format: "chc/1",
      note: "Sample data. The crew member is real; the health numbers are not. Blood and finger-prick values come from the team's data files" + (rad ? "; radiation is real data measured by NASA's Curiosity rover on its cruise to Mars." : "."),
      crew: { id: "crew-" + idOf(who).replace(/\s+/g, "-"), name: who, role: prof.role || P.role, mission: "Mars transit", mission_start: new Date(start).toISOString().slice(0, 10), age: age, baseline: P.baseline },
      series: [], readings: []
    };
    function recentAt(t) { return clamp((t - (now - 7 * DAY)) / (7 * DAY), 0, 1); }
    function skippedDay(d) { return d % 11 === P.skip; }

    /* continuous: 2-minute samples from launch until now */
    var dt = 120, t0 = start, cnt = Math.floor((now - t0) / (dt * 1000)) + 1;
    var cols = {}; keys.forEach(function (k) { cols[k] = new Array(cnt); });
    for (var i = 0; i < cnt; i++) {
      var t = t0 + i * dt * 1000;
      var c = channels(P, t, R, recentAt(t), skippedDay(Math.floor(t / DAY))), gap = inGap(t);
      keys.forEach(function (k) { cols[k][i] = gap && k !== "radiation_dose_rate" ? null : c[k]; }); /* the shirt is off during the battery swap; the radiation monitor is not */
    }
    keys.forEach(function (k) { out.series.push({ metric: k, start: new Date(t0).toISOString(), interval_s: dt, values: cols[k] }); });
    if (rad) out.series.push({ metric: "radiation_dose_rate", unit: "µGy/h", source: "NASA Curiosity (MSL) RAD, cruise to Mars", samples: rad });

    function add(k, t, v) { if (t <= now) out.readings.push({ metric: k, time: new Date(t).toISOString(), value: v }); }
    function n(a) { return (R() * 2 - 1) * a; }

    /* every day */
    for (var d = 0; d < 30; d++) {
      var dayT = start + d * DAY, back = 29 - d;
      add("sleep_hours", dayT + 6.25 * 3600e3, r1(P.sleep(back, n), 1));
      add("mood", dayT + 21 * 3600e3, P.mood(back, n));
      add("crew_connection", dayT + 21 * 3600e3 + MIN, P.conn(back, n));
      add("exercise_min", dayT + 20.5 * 3600e3, skippedDay(Math.floor(dayT / DAY)) ? Math.round(P.exercise[1] + n(8)) : Math.round(P.exercise[0] + n(10)));
    }
    /* every week: days 1, 8, 15, 22, 29 */
    for (var w = 0; w < 5; w++) {
      var wt = start + w * 7 * DAY + 7.5 * 3600e3, f = w / 4;
      add("body_mass", wt, r1(P.mass[0] + P.mass[1] * f + n(0.15), 1));
      add("body_temp", wt + 10 * MIN, r1(P.temp + n(0.2), 1));
      add("reaction_time", wt + 30 * MIN, P.rt(w, n));
      add("urine_ph", wt - 60 * MIN, r1(P.uph(w, f, n), 1));
      add("urine_sg", wt - 59 * MIN, r1(P.usg[0] + P.usg[1] * f + n(0.0012), 3));
    }
    /* blood draw every 14 days and finger-prick every 3 days: the team's data, fitted to this person */
    SM.team(who, start).forEach(function (r) { add(r.metric, Date.parse(r.time), r.value); });
    /* monthly: a baseline set on day 2, the month check on day 28 */
    [1, 27].forEach(function (off, j) {
      Object.keys(P.monthly).forEach(function (k, q) { add(k, start + off * DAY + (8 + q * 0.1) * 3600e3, P.monthly[k][j]); });
    });

    out.ecg = { start: new Date(now - 10e3).toISOString(), hz: 250, lead: "II", values: SM.ecgStrip(10, 250, P.ecgBpm, R) };
    return out;
  };

  /* one file per crew member in the roster, first one first */
  SM.crew = function (nowMs) {
    var names = roster().map(function (r) { return r.name; });
    if (!names.length) names = [cfgCrew().name || "Aleš Svoboda"];
    return names.map(function (nm) { return SM.generate(nowMs, nm); });
  };

  /* sample results of the circle reaction game for the scoreboard (clearly marked as sample data) */
  SM.circleScores = function (nowMs) {
    var now = nowMs || Date.now(), out = [];
    var base = { "ales svoboda": 402, "thomas pesquet": 431, "adrianos golemis": 389 };
    roster().forEach(function (r, i) {
      var R = rng(Math.floor(now / DAY) * 31 + i), b = base[idOf(r.name)] || 420;
      for (var k = 0; k < 3; k++) {
        var hits = 20 - Math.floor(R() * 2), avg = Math.round(b + (R() * 2 - 1) * 18 + (k === 2 && i === 0 ? 22 : 0));
        var strays = Math.floor(R() * 3), score = Math.round((avg * hits + 1500 * (20 - hits) + 100 * strays) / 20);
        out.push({ crew: r.name, mode: "circles", t: now - (3 - k) * 7 * DAY + i * 3600e3, avg: avg, hits: hits, total: 20, strays: strays, score: score, sample: true });
      }
    });
    return out;
  };

  /* synthetic ECG strip (mV): P, QRS, T waves as gaussians */
  SM.ecgStrip = function (seconds, hz, bpm, R) {
    R = R || Math.random; var N = seconds * hz, rr = 60 / bpm, v = new Array(N);
    var waves = [[-0.17, 0.12, 0.025], [-0.035, -0.12, 0.009], [0, 1.15, 0.011], [0.035, -0.28, 0.011], [0.27, 0.32, 0.045]];
    for (var i = 0; i < N; i++) {
      var t = i / hz, beat = Math.round(t / rr), x = t - beat * rr, y = 0.03 * Math.sin(2 * Math.PI * 0.25 * t);
      for (var w = 0; w < waves.length; w++) { var d = x - waves[w][0]; y += waves[w][1] * Math.exp(-d * d / (2 * waves[w][2] * waves[w][2])); }
      v[i] = Math.round((y + (R() * 2 - 1) * 0.015) * 1000) / 1000;
    }
    return v;
  };

  /* one new sample per continuous channel for one crew member, for the demo feed */
  SM.tick = function (t, name) {
    var who = name || cfgCrew().name, c = channels(profileFor(who), t, Math.random, 1, false), C = H.curiosity;
    if (C) c.radiation_dose_rate = C.v[Math.floor(t / 300e3) % C.v.length]; /* replays the Curiosity measurements, one every 5 minutes */
    return { crew: who, readings: KEYS.map(function (k) { return { metric: k, time: new Date(t).toISOString(), value: c[k] }; }) };
  };
})(typeof window !== "undefined" ? window : globalThis);
