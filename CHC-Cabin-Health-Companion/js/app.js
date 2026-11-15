/* Screen rendering and wiring. Reads from Halo.data and Halo.status; holds no health logic of its own. */
(function (g) {
  var H = g.Halo, D = H.data, S = H.status, C = H.charts, F = H.fmt, esc = F.esc;
  var cfg = g.HALO_CONFIG, DAY = 864e5;
  var st = { rangeId: "day", offset: 0, region: null, open: null, sample: false, liveTimer: null, hovering: false, snap: null, server: null, seq: 0, lastLive: 0, scores: [] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var SC = { 0: "ok", 1: "watch", 2: "act" };
  function sclass(s) { return typeof s === "number" ? SC[s] : "none"; }

  function range() { return cfg.ranges.filter(function (r) { return r.id === st.rangeId; })[0]; }
  function anchor() {
    var now = Date.now(); if (st.sample) return now;
    var ext = D.extent(); if (!ext) return now;
    return ext.to >= now - 15 * 60e3 && ext.to <= now + 5 * 60e3 ? now : ext.to;
  }
  function isLive() { return st.sample || anchor() === Date.now(); }
  function win() { var r = range(), b = anchor() - st.offset * r.ms; return { a: b - r.ms, b: b, r: r }; }
  function visible() { return cfg.metrics.filter(function (m) { return !m.partOf; }).sort(function (a, b) { return (b.derive ? 1 : 0) - (a.derive ? 1 : 0); }); }
  function fmtVal(c) {
    var m = c.m; if (c.v == null) return "–";
    return m.pair && c.pv != null ? F.num(c.v, 0) + "/" + F.num(c.pv, 0) : F.num(c.v, m.decimals);
  }
  /* chart judge: uses exercise limits in exercise buckets; metrics without exercise limits are not judged then */
  function judgeFn(m) {
    if (!m.range) return null;
    return function (v, active) {
      if (active && m.skip_when_active && !S.exerciseRange(m)) return null;
      return S.judge(m, v, active && !!m.skip_when_active);
    };
  }
  function bodyMetric(m) { return !m.section; }
  /* the right action for a check: a test page, the wellbeing check-in, or the log form */
  function actBtn(m, cls, logLabel) {
    if (m.test === "reaction") return '<a class="' + cls + '" href="#reaction-test">Take the test</a>';
    if (m.page) return '<a class="' + cls + '" href="' + m.page + '">Daily check-in</a>';
    if (m.input) return '<button type="button" class="' + cls + '" data-log="' + m.key + '">' + (logLabel || "Log") + "</button>";
    return "";
  }
  function lc(label) { return label.toLowerCase().replace(/\bph\b/g, "pH"); }
  function listJoin(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function firstSentence(s) { var m = /^.*?[.!?](\s|$)/.exec(s || ""); return m ? m[0].trim() : (s || ""); }
  function missionDay(at) {
    var ms = D.meta.crew && D.meta.crew.mission_start ? D.parseTime(D.meta.crew.mission_start) : (D.extent() || {}).from;
    if (!ms) return null;
    var d = Math.floor((at - ms) / DAY) + 1, total = cfg.mission && cfg.mission.days;
    return total ? Math.max(1, Math.min(d, total)) : d;
  }

  /* ================= render ================= */
  function render() {
    var at = anchor();
    if (st.sim && D.sim && at - D.sim.at > 60e3) D.simulate(st.sim.values, at); /* simulated values stay "now" */
    st.snap = S.snapshot(cfg, at);
    st.rad = S.radiation(at);
    pruneRechecks();
    renderSimBar(); renderHeader(at); renderIntro(at); renderBody(at); renderLive(at); renderRadiation(at); renderRangebar(); renderTrends(); renderChecks(at); renderPeriodic(at);
    if (st.open) renderDrawer(st.open);
  }

  function renderHeader(at) {
    var c = D.meta.crew || {}, day = missionDay(at), bits = [];
    var crews = D.crewList();
    if (crews.length > 1) bits.push('<span class="crewpick"><button type="button" class="crewbtn" id="crewbtn" aria-haspopup="true" aria-expanded="false" aria-controls="crewmenu"><span class="vh">Crew member: </span>' + esc(c.name || "Crew member") + '<span class="caret" aria-hidden="true"></span></button>' + infoBtn(c.name) + crewMenu(crews) + "</span>");
    else if (c.name) bits.push("<strong>" + esc(c.name) + "</strong>" + infoBtn(c.name));
    if (c.role) bits.push(esc(c.role));
    var mname = c.mission || (cfg.mission && cfg.mission.name), total = cfg.mission && cfg.mission.days, mbits = [];
    if (mname) mbits.push(esc(mname));
    if (day) mbits.push("Day " + day + (total && day <= total ? " of " + total : ""));
    $("#who").innerHTML = '<span class="who1">' + (bits.join('<span class="sep">·</span>') || "No crew member loaded") + "</span>" +
      (mbits.length ? '<span class="who2">' + mbits.join('<span class="sep">·</span>') + "</span>" : "");
    wireCrewMenu();
    var ds = $("#datastate");
    if (st.server && st.sample) ds.innerHTML = '<span class="pulse"></span>Python server connected · sample data until real data arrives';
    else if (st.server) ds.innerHTML = (isLive() ? '<span class="pulse"></span>Live from Python server' : "Python server · recorded data up to " + F.date(at) + ", " + F.time(at) + " UTC");
    else if (st.sample) ds.innerHTML = '<span class="pulse"></span>Sample data, live demo feed';
    else if (!D.extent()) ds.textContent = "No data loaded";
    else if (isLive()) ds.innerHTML = '<span class="pulse"></span>Live';
    else ds.textContent = "Recorded data up to " + F.date(at) + ", " + F.time(at) + " UTC";
  }

  /* ---------- crew profiles and the crew menu ---------- */
  function profile(name) {
    var id = D.crewId(name || "");
    return (cfg.roster || []).filter(function (r) { return D.crewId(r.name) === id; })[0] || null;
  }
  function infoBtn(name) { return name ? '<button type="button" class="info-i" data-crew-info="' + esc(name) + '" aria-label="About ' + esc(name) + '">i</button>' : ""; }
  function crewLine(p, meta) {
    var bits = [];
    if ((p && p.role) || (meta && meta.role)) bits.push((meta && meta.role) || p.role);
    if (p) bits.push(p.country + (p.agency ? " (" + p.agency + ")" : ""));
    return bits.join(" · ");
  }
  function crewMenu(crews) {
    return '<div class="crewmenu" id="crewmenu" hidden><p class="cm-head">Whose data to show</p><ul>' + crews.map(function (x) {
      var p = profile(x.name), meta = (D.crews[x.id] || {}).meta || {};
      return '<li' + (x.id === D.current ? ' class="cur"' : "") + '><div class="cm-row"><button type="button" class="cm-pick" data-crew="' + esc(x.id) + '"' + (x.id === D.current ? ' aria-current="true"' : "") + '><span class="cm-name">' + esc(x.name) + '</span><span class="cm-role">' + esc(crewLine(p, meta.crew) || "No profile") + "</span></button>" +
        '<button type="button" class="info-i" data-crew-more="' + esc(x.id) + '" aria-expanded="false" aria-label="About ' + esc(x.name) + '">i</button></div>' +
        '<div class="cm-desc" hidden><p>' + esc(p ? p.short : "No public profile; the data comes from an uploaded file.") + '</p><button type="button" class="linkbtn" data-crew-info="' + esc(x.name) + '">Full profile and sources</button></div></li>';
    }).join("") + "</ul></div>";
  }
  function wireCrewMenu() {
    var btn = $("#crewbtn"), menu = $("#crewmenu"); if (!btn) return;
    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", onEsc); }
    function outside(e) { if (!e.target.closest(".crewpick")) close(); }
    function onEsc(e) { if (e.key === "Escape") { close(); btn.focus(); } }
    btn.onclick = function () {
      if (!menu.hidden) return close();
      menu.hidden = false; btn.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside); document.addEventListener("keydown", onEsc);
      var cur = menu.querySelector(".cm-pick[aria-current]"); if (cur) cur.focus();
    };
    menu.querySelectorAll(".cm-pick").forEach(function (b) { b.onclick = function () { close(); switchCrew(b.getAttribute("data-crew")); }; });
    menu.querySelectorAll("[data-crew-more]").forEach(function (b) {
      b.onclick = function () { var d = b.parentNode.nextElementSibling, open = d.hidden; d.hidden = !open; b.setAttribute("aria-expanded", String(open)); };
    });
  }
  /* the full profile in a dialog; works for any name, with or without a roster entry */
  function showCrewInfo(name) {
    var p = profile(name), id = D.crewId(name), meta = ((D.crews[id] || {}).meta || {}).crew || {}, dlg = $("#crewdlg");
    var age = p && H.sample.age(p.born, Date.now()), born = p && p.born ? (p.born.length > 4 ? new Date(p.born + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : p.born) : null;
    var facts = [];
    facts.push(["Role", (meta.role || (p && p.role) || "–") + (p ? " · Vast-PAM-1" : "")]);
    if (p) facts.push(["Country", p.country + " · " + p.agency]);
    if (born) facts.push(["Born", born + (p.birthplace ? ", " + p.birthplace : "") + (age ? " (age " + age + ")" : "")]);
    else if (meta.age) facts.push(["Age", meta.age]);
    $("#crewdlg-h").textContent = name;
    $("#crewdlg-body").innerHTML =
      '<dl class="cfacts">' + facts.map(function (f) { return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (p ? p.bio.map(function (b) { return "<p>" + esc(b) + "</p>"; }).join("") +
        '<h3>Sources</h3><ul class="csrc">' + p.sources.map(function (x) { return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.label) + "</a></li>"; }).join("") + "</ul>"
        : "<p>No public profile for this crew member. The name, role and age come from the uploaded data file.</p>") +
      '<p class="note">' + (p ? "The person and the career facts are real and checkable above. The 30-day Mars transit and every health number in this app are a simulation: astronauts' medical data is not public." : "Health numbers come from the loaded file.") + "</p>";
    if (!dlg.open) dlg.showModal();
  }

  function renderIntro(at) {
    var s = st.snap;
    $("#today").textContent = F.long(at) + ", " + F.time(at) + " UTC" + (isLive() ? "" : " (end of recorded data)");
    var act = s.attention.filter(function (c) { return c.state === 2; }), watch = s.attention.filter(function (c) { return c.state === 1; });
    var hr = s.cur.heart_rate, line;
    function names(a) {
      var n = a.map(function (c) { return lc(c.m.label); });
      return n.length > 4 ? n.slice(0, 3).join(", ") + " and " + (n.length - 3) + " more" : listJoin(n);
    }
    if (act.length) line = "Act now on " + names(act) + "." + (watch.length ? " Keep an eye on " + names(watch) + "." : "");
    else if (watch.length) line = "Mostly steady. Keep an eye on " + names(watch) + ".";
    else if (s.counts[0]) line = "Everything measured is in its normal range.";
    else line = "No current readings yet.";
    $("#summary").textContent = line;

    var items = s.attention.map(function (c) {
      var m = c.m, text = c.state === "nosignal" ? "The Bio-Monitor has not sent data since " + F.time(c.t) + ". Check that the shirt is on and charged." : firstSentence(c.state === 2 ? (m.act || m.watch) : m.watch);
      var val = c.state === "nosignal" ? "" : fmtVal(c) + " " + m.unit + (c.pct != null ? " (" + (c.pct > 0 ? "+" : "") + F.num(c.pct, 1) + "% from baseline)" : "");
      var fu = [], fuSeen = {};
      S.followups(cfg, c, anchor()).forEach(function (f) { f.items.forEach(function (it) { if (!fuSeen[it.m.key]) { fuSeen[it.m.key] = 1; fu.push(lc(it.m.label)); } }); });
      return '<li><button type="button" data-open="' + m.key + '"><span class="st ' + sclass(c.state) + '">' + esc(S.WORDS[c.state]) + "</span>" +
        '<span class="what"><strong>' + esc(m.label) + "</strong> " + esc(val) + "</span><span class=\"how\">" + esc(text) + "</span>" +
        (fu.length ? '<span class="also">Also check: ' + esc(listJoin(fu)) + "</span>" : "") + "</button></li>";
    });
    var dueNow = s.due.filter(function (c) { return c.m.input; });
    var rcNow = st.rechecks.filter(function (r) { return Date.now() >= r.due; });
    if (rcNow.length) items.push('<li><button type="button" data-jump="checks"><span class="st watch">Recheck</span><span class="what"><strong>' + esc(listJoin(rcNow.map(function (r) { return D.metric(r.key).label; }))) + '</strong></span><span class="how">You asked to measure ' + (rcNow.length > 1 ? "these" : "this") + " again now.</span></button></li>");
    if (dueNow.length) items.push('<li><button type="button" data-jump="checks"><span class="st none">To do</span><span class="what"><strong>' + dueNow.length + " check" + (dueNow.length > 1 ? "s" : "") + " to log</strong> " + esc(listJoin(dueNow.slice(0, 3).map(function (c) { return lc(c.m.label); })) + (dueNow.length > 3 ? " and more" : "")) + '</span><span class="how">See the checklist below.</span></button></li>');
    $("#attention").innerHTML = items.join("");
  }

  function renderBody(at) {
    var s = st.snap;
    if (!st.region) {
      var best = null, bs = -2;
      cfg.regions.forEach(function (r) { var v = s.regions[r.id]; if (v != null && v > bs) { bs = v; best = r.id; } });
      st.region = best || cfg.regions[0].id;
    }
    H.body.render($("#body"), cfg, s.regions, st.region, function (id) { st.region = id; renderBody(anchor()); });
    var reg = cfg.regions.filter(function (r) { return r.id === st.region; })[0];
    var ms = visible().filter(function (m) { return m.region === st.region; });
    $("#region").innerHTML = "<h3>" + esc(reg.name) + "</h3><ul>" + ms.map(function (m) {
      var c = s.cur[m.key];
      return '<li><button type="button" data-open="' + m.key + '"><span class="dot ' + sclass(c.state) + '"></span><span class="n">' + esc(m.label) +
        '</span><span class="v">' + esc(fmtVal(c)) + ' <small>' + esc(m.unit) + "</small></span></button></li>";
    }).join("") + "</ul>";
    var rad = st.rad, rc = s.cur.radiation_dose_rate, rs = rc && typeof rc.state === "number" ? rc.state : (s.cur.radiation_dose || {}).state;
    $("#env").innerHTML = rad
      ? '<button type="button" data-jump="radiation"><span class="dot ' + sclass(rs) + '"></span><span class="n">Radiation, whole body</span><span class="v">' +
        (rc && rc.v != null && rc.state !== "nosignal" ? F.num(rc.v, 1) + " µGy/h now · " : "") + F.num(rad.total, 1) + " mGy this mission</span></button>"
      : "";
  }

  /* ---------- Bio-Monitor live cards ---------- */
  function renderLive(at) {
    var s = st.snap, html = "";
    visible().filter(function (m) { return m.kind === "continuous" && bodyMetric(m); }).forEach(function (m) {
      var c = s.cur[m.key], ecg = m.key === "heart_rate" && D.meta.ecg;
      var sub = c.state === "nosignal" ? "Last data " + F.ago(at - c.t) : c.state === "active" ? "Not judged during exercise" : c.active ? "Exercising: judged against exercise limits" : c.t ? "Median of last " + m.window_min + " min" : "";
      sub = "Measured by the Bio-Monitor" + (sub ? " · " + sub : "");
      html += '<button type="button" class="lcard' + (ecg ? " wide" : "") + '" data-open="' + m.key + '">' +
        '<span class="lhead"><span class="lname">' + esc(m.label) + '</span><span class="st ' + sclass(c.state) + '">' + esc(S.WORDS[c.state]) + "</span></span>" +
        '<span class="lval"><span class="big">' + esc(fmtVal(c)) + '</span><span class="unit">' + esc(m.unit) + "</span></span>" +
        (ecg ? '<canvas class="ecg" aria-label="ECG strip, lead ' + esc(D.meta.ecg.lead) + '"></canvas>' : "") +
        '<svg class="spark" data-k="' + m.key + '" aria-hidden="true"></svg>' +
        '<span class="lsub">' + esc(sub) + "</span></button>";
    });
    var box = $("#live"); box.innerHTML = html;
    box.querySelectorAll("svg.spark").forEach(function (svg) {
      var m = D.metric(svg.getAttribute("data-k")), bk = D.buckets(m.key, at - 3600e3, at, 2 * 60e3);
      C.spark(svg, { w: svg.parentNode.clientWidth - 32, h: 30, vals: bk.map(function (b) { return b ? b.mean : null; }), normal: m.range && !m.range.relative ? m.range.normal : null });
    });
    C.ecg(box.querySelector("canvas.ecg"), D.meta.ecg);
    $("#ecgnote").textContent = D.meta.ecg ? "The ECG strip replays the most recent recording (" + F.stamp(D.meta.ecg.start, at) + " UTC, lead " + D.meta.ecg.lead + ")." : "";
  }

  /* ---------- radiation (not tied to the time range) ---------- */
  function renderRadiation(at) {
    var box = $("#radiation"), rad = st.rad;
    if (!rad) { box.hidden = true; return; }
    box.hidden = false;
    var rm = D.metric("radiation_dose_rate"), dm = D.metric("radiation_dose"), c = st.snap.cur.radiation_dose_rate;
    var hasRate = c && c.t && c.state !== "empty";
    var s24 = rad.last24 != null ? S.judge(dm, rad.last24) : null, lim = dm.cumulative.limit, pct = rad.total / lim * 100;
    var day = Math.floor((at - rad.start) / DAY) + 1;
    var html = '<div class="rad-grid">' +
      '<button type="button" class="rcard" data-open="radiation_dose_rate"><span class="lhead"><span class="lname">Active dose rate</span>' + (hasRate ? '<span class="st ' + sclass(c.state) + '">' + esc(S.WORDS[c.state]) + "</span>" : "") + "</span>" +
      (hasRate ? '<span class="lval"><span class="big">' + F.num(c.v, 1) + '</span><span class="unit">µGy/h</span></span><span class="lsub">' + (c.state === "nosignal" ? "Last data " + F.ago(at - c.t) : "Now, median of the last " + rm.window_min + " min") + '</span><svg id="radnow" aria-hidden="true"></svg><span class="lsub">Last 6 hours. Cosmic rays give a steady background; a sudden rise usually means a solar particle event.</span>'
        : '<span class="pnone">No active monitor data. Totals below come from the daily dosimeter readings.</span>') +
      "</button>" +
      '<div class="rcard"><div class="rstats">' +
        '<button type="button" data-open="' + (hasRate ? "radiation_dose_rate" : "radiation_dose") + '"><span class="lname">Last 24 hours</span><span class="lval"><span class="big">' + F.num(rad.last24, 2) + '</span><span class="unit">mGy</span></span>' + (s24 != null ? '<span class="st ' + sclass(s24) + '">' + S.WORDS[s24] + "</span>" : "") + "</button>" +
        '<div><span class="lname">Cumulative dose</span><span class="lval"><span class="big">' + F.num(rad.total, 1) + '</span><span class="unit">mGy</span></span><span class="lsub">since ' + esc(F.date(rad.start)) + ", " + day + " day" + (day === 1 ? "" : "s") + "</span></div>" +
      "</div>" +
      '<div class="pbar"><span style="width:' + Math.min(100, Math.max(0.5, pct)).toFixed(1) + '%"></span></div>' +
      '<p class="lsub">' + F.num(pct, pct < 10 ? 1 : 0) + "% of the " + lim + " mGy " + esc(dm.cumulative.limitLabel) + "</p>" +
      '<svg id="radtotal" aria-hidden="true"></svg><span class="lsub">Cumulative dose since launch</span></div></div>';
    var fromCuriosity = st.sample || (D.meta.files || []).some(function (f) { return /msl|curiosity|rad-?\d|radiation-msl/i.test(f); });
    if (fromCuriosity) html += '<p class="note radsrc">Radiation data: real measurements by NASA\'s Curiosity rover (RAD instrument) on its cruise to Mars, December 2011 to January 2012, moved in time to fit this mission. Same cabin, so the whole crew gets the same values.</p>';
    box.querySelector(".rad-body").innerHTML = html;
    var nowSvg = $("#radnow");
    if (nowSvg) {
      var a = at - 6 * 3600e3, size = 10 * 60e3; /* 10-minute steps: Curiosity measured about every 8.5 minutes */
      C.trend(nowSvg, { w: nowSvg.parentNode.clientWidth - 32, h: 110, a: a, b: at, size: size, series: [{ bk: D.buckets("radiation_dose_rate", a, at, size), normal: null, judge: judgeFn(rm) }], axis: rm.range.axis, ticks: true, rangeId: "6h" });
    }
    var tSvg = $("#radtotal");
    if (tSvg) {
      var bk = rad.days.map(function (d) { return { mean: d.total, min: d.total, max: d.total }; });
      C.trend(tSvg, { w: tSvg.parentNode.clientWidth - 32, h: 110, a: rad.start, b: rad.start + rad.days.length * DAY, size: DAY, series: [{ bk: bk, normal: null }], axis: [0, Math.max(1, rad.total * 1.1)], ticks: true, rangeId: "mission" });
    }
  }

  /* ---------- range switch ---------- */
  function renderRangebar() {
    var w = win(), r = w.r;
    $("#rangeseg").innerHTML = cfg.ranges.map(function (x) { return '<button type="button" role="radio" aria-checked="' + (x.id === st.rangeId) + '" data-range="' + x.id + '">' + esc(x.label) + "</button>"; }).join("");
    var label = r.id === "day" ? (st.offset ? F.date(w.a) + " " + F.time(w.a) + " – " + F.date(w.b) + " " + F.time(w.b) : "Last 24 hours") : F.date(w.a + 1) + " – " + F.date(w.b);
    $("#rangelabel").textContent = label;
    var ext = D.extent();
    $("#prev").disabled = !ext || w.a <= ext.from;
    $("#next").disabled = st.offset === 0;
    $("#latest").hidden = st.offset === 0;
  }

  /* ---------- trends (continuous) ---------- */
  var trendCharts = [];
  function renderTrends() {
    var w = win(), box = $("#trends"), ms = visible().filter(function (m) { return m.kind === "continuous" && bodyMetric(m); });
    var act = D.buckets("activity", w.a, w.b, w.r.bucket);
    box.innerHTML = ms.map(function (m, i) {
      return '<div class="trow' + (i === ms.length - 1 ? " last" : "") + '"><button type="button" class="tlabel-col" data-open="' + m.key + '"><span class="tname">' + esc(m.label) + '</span><span class="tread" data-read="' + m.key + '"></span></button><svg class="tchart" data-k="' + m.key + '"></svg></div>';
    }).join("");
    trendCharts = [];
    box.querySelectorAll("svg.tchart").forEach(function (svg, i) {
      var m = D.metric(svg.getAttribute("data-k")), last = i === ms.length - 1;
      var series = [{ bk: D.buckets(m.key, w.a, w.b, w.r.bucket), normal: m.range && m.range.normal, judge: judgeFn(m) }];
      var axis = m.range ? m.range.axis : m.axis;
      if (m.pair) { var pm = D.metric(m.pair); series.push({ bk: D.buckets(pm.key, w.a, w.b, w.r.bucket), normal: pm.range.normal, judge: judgeFn(pm) }); axis = [pm.range.axis[0], m.range.axis[1]]; }
      var lab = $(".tlabel-col", svg.parentNode), stacked = lab.offsetTop + lab.offsetHeight <= svg.parentNode.offsetTop + 1 || g.innerWidth <= 620;
      var width = Math.max(240, svg.parentNode.clientWidth - (stacked ? 0 : lab.offsetWidth + 4));
      var sc = C.trend(svg, { w: width, h: last ? 92 : 72, a: w.a, b: w.b, size: w.r.bucket, series: series, axis: axis, active: m.key === "activity" ? null : act, exerciseMets: cfg.exerciseMets, bars: m.key === "activity", ticks: last, rangeId: w.r.id });
      trendCharts.push({ m: m, sc: sc, series: series, svg: svg, read: $('[data-read="' + m.key + '"]', box) });
    });
    readouts(null);
  }
  function readouts(t) {
    var w = win();
    trendCharts.forEach(function (tc) {
      tc.sc.hover(t);
      var m = tc.m, d = m.decimals, html;
      if (t == null) {
        var vals = [], vals2 = [];
        tc.series[0].bk.forEach(function (b) { if (b) vals.push(b); });
        if (tc.series[1]) tc.series[1].bk.forEach(function (b) { if (b) vals2.push(b); });
        if (!vals.length) { html = '<span class="muted">No data in this period</span>'; }
        else {
          var avg = function (a) { var s = 0, n = 0; a.forEach(function (b) { s += b.sum; n += b.n; }); return s / n; };
          var lo = Math.min.apply(null, vals.map(function (b) { return b.min; })), hi = Math.max.apply(null, vals.map(function (b) { return b.max; }));
          html = "<b>" + (vals2.length ? F.num(avg(vals), 0) + "/" + F.num(avg(vals2), 0) : F.num(avg(vals), d)) + "</b> " + esc(m.unit) + ' <span class="muted">average</span><br><span class="muted">' + F.num(lo, d) + " to " + F.num(hi, d) + "</span>";
        }
      } else {
        var i = Math.floor((t - w.a) / w.r.bucket), b = tc.series[0].bk[i], b2 = tc.series[1] && tc.series[1].bk[i];
        html = b ? "<b>" + (b2 ? F.num(b.mean, 0) + "/" + F.num(b2.mean, 0) : F.num(b.mean, d)) + "</b> " + esc(m.unit) : '<span class="muted">no data</span>';
        html += '<br><span class="muted">' + (w.r.id === "day" ? "" : F.date(t) + " ") + F.time(t) + " UTC</span>";
      }
      tc.read.innerHTML = html;
    });
  }

  /* ---------- checklist ---------- */
  function renderChecks(at) {
    var s = st.snap, rt = s.routine;
    var due = s.due.filter(function (c) { return c.m.input && bodyMetric(c.m); });
    var pct = rt.total ? Math.round(rt.done / rt.total * 100) : 0;
    $("#routine").innerHTML =
      '<div class="progress"><div class="ptext"><strong>' + rt.done + " of " + rt.total + "</strong> daily checks logged in the last 7 days" + (rt.streak > 1 ? " · every check done " + rt.streak + " days running" : "") +
      '</div><div class="pbar"><span style="width:' + pct + '%"></span></div></div>' +
      (due.length ? '<ul class="todo">' + due.map(function (c) {
        var m = c.m, when = c.t ? "last " + F.stamp(c.t, at) : "never logged";
        var tag = c.due === "overdue" ? '<span class="st watch">Overdue</span>' : '<span class="st none">' + (m.every === "day" ? "Today" : "Due") + "</span>";
        var act = actBtn(m, "btn small");
        return '<li>' + tag + '<span class="n"><strong>' + esc(m.label) + '</strong> <span class="muted">' + esc(cadenceWord(m)) + ", " + esc(when) + '</span></span>' + act + "</li>";
      }).join("") + "</ul>" : '<p class="muted">Nothing due right now.</p>') +
      (s.suggested.length ? '<div class="suggest"><h4>Suggested by your results</h4><ul class="todo">' + s.suggested.map(function (x) {
        var m = x.m, act = actBtn(m, "btn small");
        return '<li><span class="st none">Suggested</span><span class="n"><strong>' + esc(m.label) + '</strong> <span class="muted">because ' + esc(lc(x.because.label)) + " is out of range" + (x.cur.t ? ", last " + esc(F.stamp(x.cur.t, at)) : ", never measured") + "</span></span>" + act + "</li>";
      }).join("") + "</ul></div>" : "");
    if (st.rechecks.length) {
      $("#routine").insertAdjacentHTML("beforeend", '<div class="suggest"><h4>Rechecks you asked for</h4><ul class="todo">' + st.rechecks.slice().sort(function (a, b) { return a.due - b.due; }).map(function (r) {
        var m = D.metric(r.key), now = Date.now(), dueNow = now >= r.due;
        var act = actBtn(m, "btn small");
        return '<li><span class="st ' + (dueNow ? "watch" : "none") + '">' + (dueNow ? "Recheck now" : "Recheck") + '</span><span class="n"><strong>' + esc(m.label) + '</strong> <span class="muted">' + (dueNow ? "was due " : "at ") + esc(F.stamp(r.due, now)) + ' UTC</span></span><span class="rowbtns">' + act + '<button type="button" class="btn small ghost" data-unrecheck="' + m.key + '" aria-label="Remove reminder">×</button></span></li>';
      }).join("") + "</ul></div>");
    }
    $("#routine").classList.toggle("has-suggest", !!(s.suggested.length || st.rechecks.length));
  }
  var CADW = { day: "every day", "3days": "every 3 days", week: "every week", "2weeks": "every 14 days", month: "every month" };
  function cadenceWord(m) { return CADW[m.every] || ""; }

  /* ---------- periodic cards ---------- */
  function renderPeriodic(at) {
    var w = win(), html = "";
    var plain = function (every) { return function (m) { return m.every === every && !m.group; }; };
    var groups = [
      { title: "Every day", f: plain("day") }, { title: "Every 3 days", f: plain("3days") }, { title: "Every week", f: plain("week") },
      { title: "Every 2 weeks", f: plain("2weeks") }, { title: "Every month", f: plain("month") },
      { title: "Blood tests", f: function (m) { return m.group === "blood"; },
        sub: { "3days": "Finger-prick test, every 3 days", "2weeks": "Blood draw, every 14 days", month: "Blood draw, every month" } },
      { title: "Kidneys and urine", note: "Kidney stone risk is worked out from the urine results.", f: function (m) { return m.group === "kidneys"; },
        sub: { week: "Urine dipstick, every week", month: "24-hour urine collection, every month" } }
    ];
    var order = ["day", "3days", "week", "2weeks", "month"];
    groups.forEach(function (gr) {
      var ms = visible().filter(function (m) { return m.kind === "periodic" && bodyMetric(m) && gr.f(m); });
      if (!ms.length) return;
      html += '<div class="pgroup' + (gr.sub ? " cat" : "") + '"><h3>' + gr.title + (gr.note ? ' <span class="muted">· ' + esc(gr.note) + "</span>" : "") + "</h3>";
      if (!gr.sub) html += '<div class="pgrid">' + ms.map(function (m) { return pcard(m, at); }).join("") + "</div>";
      else {
        var derived = ms.filter(function (m) { return m.derive; });
        if (derived.length) html += '<div class="pgrid">' + derived.map(function (m) { return pcard(m, at); }).join("") + "</div>";
        order.forEach(function (ev) {
          var sm = ms.filter(function (m) { return !m.derive && m.every === ev; });
          if (sm.length) html += '<h4 class="psub">' + esc(gr.sub[ev] || CADW[ev]) + '</h4><div class="pgrid">' + sm.map(function (m) { return pcard(m, at); }).join("") + "</div>";
        });
      }
      html += "</div>";
    });
    var box = $("#periodic"); box.innerHTML = html;
    box.querySelectorAll("svg.pchart").forEach(function (svg) {
      var m = D.metric(svg.getAttribute("data-k")), pts = periodicPoints(m, w);
      C.points(svg, { w: svg.parentNode.clientWidth - 32, h: 56, a: w.a, b: w.b, pts: pts, normal: absNormal(m), axis: m.range && !m.range.relative ? m.range.axis : null, ticks: false, rangeId: w.r.id });
    });
  }
  function absNormal(m) {
    if (!m.range) return null;
    if (!m.range.relative) return m.range.normal;
    var b = S.baseline(m); if (!b) return null;
    return [b * (1 + Math.max(-50, m.range.normal[0]) / 100), b * (1 + m.range.normal[1] / 100)];
  }
  function periodicPoints(m, w) {
    var r = D.between(m.key, w.a, w.b), pts = r.t.map(function (t, i) { return { t: t, v: r.v[i], s: S.judge(m, r.v[i]) }; });
    var before = D.latest(m.key, w.a - 1); if (before && pts.length) pts.unshift({ t: before.t, v: before.v, s: null });
    return pts;
  }
  function pcard(m, at) {
    var c = st.snap.cur[m.key], w = win(), inWin = D.between(m.key, w.a, w.b).t.length;
    var extra = "";
    if (c.pct != null) extra = (c.pct > 0 ? "+" : "") + F.num(c.pct, 1) + "% from baseline";
    else if (m.cumulative) extra = F.num(S.total(m, at), 1) + " mGy this mission";
    else if (m.derive && c.t) { var dd = (H.derivedDetails(m.key, c.t) || []).filter(function (f) { return f.flagged; }); extra = dd.length ? dd.map(function (f) { var l = D.metric(f.metric).label.replace("Urine ", ""); return /^[a-z][A-Z]/.test(l) ? l : l.toLowerCase(); }).join(", ") : "no factors flagged"; }
    else if (c.prev && c.v != null) { var dlt = c.v - c.prev.v; extra = (Math.abs(dlt) < Math.pow(10, -m.decimals) / 2 ? "Same as" : (dlt > 0 ? "+" : "") + F.num(dlt, m.decimals) + " vs") + " previous"; }
    var chart = inWin ? '<svg class="pchart" data-k="' + m.key + '" aria-hidden="true"></svg>'
      : '<p class="pnone">' + (c.t ? "No measurement in this period. Measured " + cadenceWord(m) + "." : "No measurements yet.") + "</p>";
    return '<div class="pcard"><button type="button" class="pmain" data-open="' + m.key + '">' +
      '<span class="lhead"><span class="lname">' + esc(m.label) + '</span><span class="st ' + sclass(c.state) + '">' + esc(S.WORDS[c.state]) + "</span></span>" +
      '<span class="lval"><span class="big">' + esc(fmtVal(c)) + '</span><span class="unit">' + esc(m.unit) + "</span></span>" +
      '<span class="lsub">' + (c.t ? esc(F.stamp(c.t, at)) : "") + (extra ? " · " + esc(extra) : "") + "</span>" + chart + "</button>" +
      actBtn(m, "logbtn", "Log a measurement") + "</div>";
  }

  /* ================= detail drawer ================= */
  function openDrawer(key, focusLog) {
    st.open = key;
    var d = $("#drawer"); d.hidden = false; document.body.classList.add("drawer-open");
    renderDrawer(key);
    setTimeout(function () { var f = focusLog && $("#logform input, #logform .scale button", d); (f || $(".close", d)).focus(); }, 30);
  }
  function closeDrawer() { st.open = null; $("#drawer").hidden = true; document.body.classList.remove("drawer-open"); }

  function renderDrawer(key) {
    var m = D.metric(key), at = anchor(), c = st.snap.cur[key] || S.current(m, at, cfg), w = win(), body = $("#dbody");
    var keepLog = $("#logform", body) && document.activeElement && $("#logform", body).contains(document.activeElement);
    if (keepLog) return; /* don't wipe a half-typed entry during live updates */
    $("#dtitle").textContent = m.label;
    var html = '<div class="dnow"><span class="big">' + esc(fmtVal(c)) + '</span><span class="unit">' + esc(m.unit) + '</span><span class="st ' + sclass(c.state) + '">' + esc(S.WORDS[c.state]) + "</span></div>";
    if (m.skip_when_active && m.kind === "continuous") {
      var actNow = D.between("activity", at - (m.window_min || 5) * 60e3, at), mets = actNow.v.length ? S.median(actNow.v) : null;
      if (mets != null) html += '<p class="mode">' + (c.active
        ? "Activity now " + F.num(mets, 1) + " METs: you are exercising, so <strong>exercise limits</strong> apply."
        : "Activity now " + F.num(mets, 1) + " METs: you are resting, so <strong>resting limits</strong> apply.") + ' <a href="#limits">How this works</a></p>';
    }
    html += '<p class="muted dwhen">' + (c.t ? (m.kind === "continuous" ? "Latest sample " : "Measured ") + esc(F.stamp(c.t, at)) + " UTC" : "No data yet") +
      (c.pct != null ? " · " + (c.pct > 0 ? "+" : "") + F.num(c.pct, 1) + "% from your baseline of " + F.num(S.baseline(m), m.decimals) + " " + esc(m.unit) : "") +
      (m.cumulative ? " · " + F.num(S.total(m, at), 1) + " mGy this mission, " + m.cumulative.limitLabel + " " + m.cumulative.limit + " mGy" : "") + "</p>";

    if (c.state === 1 || c.state === 2) {
      html += '<section class="todo-now ' + SC[c.state] + '"><h4>What to do now</h4><p>' + esc(c.state === 2 ? (m.act || m.watch) : m.watch) + "</p>" + (m.call ? "<p><strong>Get the Crew Medical Officer straight away if:</strong> " + esc(m.call) + "</p>" : "") + recheckButton(m, c) + "</section>";
    }
    if (m.derive && c.t) {
      var det = H.derivedDetails(key, c.t) || [];
      html += "<section><h4>In the urine test of " + esc(F.date(c.t)) + "</h4><ul class=\"factors\">" + det.map(function (f) {
        var fm = D.metric(f.metric), v = f.value == null ? "not measured" : F.num(f.value, fm.decimals) + (fm.unit ? " " + fm.unit : "");
        var word = f.value == null ? "Not measured" : f.flagged ? "Risk" : "OK";
        return '<li class="' + (f.value == null ? "unk" : f.flagged ? "hit" : "ok") + '"><span class="st ' + (f.value == null ? "none" : f.flagged ? "watch" : "ok") + '">' + word + '</span><button type="button" data-open="' + f.metric + '" class="lnk"><span>' + esc(fm.label) + '</span><small>' + esc(f.text) + '</small></button><span class="val">' + esc(f.value == null ? "" : v) + "</span></li>";
      }).join("") + "</ul></section>";
    }
    var fus = S.followups(cfg, c, at);
    if (fus.length) {
      html += '<section class="followups"><h4>Check these next</h4>' + fus.map(function (f) {
        return "<p>" + esc(f.why) + "</p>" + (f.items.length ? '<ul class="fulist">' + f.items.map(function (it) {
          var fm = it.m, fc = it.cur, has = fc.v != null;
          var act = actBtn(fm, "btn small ghost");
          return '<li><button type="button" class="lnk" data-open="' + fm.key + '"><span class="dot ' + sclass(fc.state) + '"></span><span>' + esc(fm.label) + "</span></button>" +
            '<span class="val">' + (has ? esc(fmtVal(fc)) + " " + esc(fm.unit) + ' <small>' + esc(F.stamp(fc.t, at)) + "</small>" : '<small>not measured yet</small>') + "</span>" + act + "</li>";
        }).join("") + "</ul>" : "") + (f.also.length ? '<ul class="fualso">' + f.also.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "");
      }).join("") + '<p class="muted small">These help confirm or rule out a cause. They are prompts, not a diagnosis.</p></section>';
    }
    html += '<div class="dchart"><div class="dchart-head"><div class="seg mini" role="radiogroup" aria-label="Time range">' + cfg.ranges.map(function (x) { return '<button type="button" role="radio" aria-checked="' + (x.id === st.rangeId) + '" data-range="' + x.id + '">' + esc(x.label) + "</button>"; }).join("") + '</div><span class="muted">' + esc($("#rangelabel").textContent) + '</span></div><svg id="dsvg"></svg></div>';

    /* stats in window */
    var r = D.between(key, w.a, w.b);
    if (r.v.length) {
      var sum = 0, lo = Infinity, hi = -Infinity; r.v.forEach(function (v) { sum += v; lo = Math.min(lo, v); hi = Math.max(hi, v); });
      html += '<dl class="dstats"><div><dt>Average</dt><dd>' + F.num(sum / r.v.length, m.decimals) + '</dd></div><div><dt>Lowest</dt><dd>' + F.num(lo, m.decimals) + '</dd></div><div><dt>Highest</dt><dd>' + F.num(hi, m.decimals) + "</dd></div><div><dt>" + (m.kind === "continuous" ? "Samples" : "Measurements") + "</dt><dd>" + r.v.length.toLocaleString("en") + "</dd></div></dl>";
    }
    if (m.range) {
      var rg = m.range, u = rg.relative ? "% from baseline" : " " + m.unit;
      var nr = rg.relative ? (rg.normal[0] <= -50 ? "up to +" + rg.normal[1] : rg.normal[0] + " to +" + rg.normal[1]) : F.num(rg.normal[0], m.decimals) + " to " + F.num(rg.normal[1], m.decimals);
      var wr = rg.relative ? (rg.watch[0] <= -50 ? "up to +" + rg.watch[1] : rg.watch[0] + " to +" + rg.watch[1]) : F.num(rg.watch[0], m.decimals) + " to " + F.num(rg.watch[1], m.decimals);
      html += '<div class="legend"><span><i class="ok"></i>Normal ' + esc(nr + u) + '</span><span><i class="watch"></i>Watch ' + esc(wr + u) + '</span><span><i class="act"></i>Act now outside that</span><a href="#limits">See all limits</a></div>';
      if (m.pair) { var pm = D.metric(m.pair); html += '<p class="muted small">Diastolic: normal ' + pm.range.normal.join(" to ") + ", watch " + pm.range.watch.join(" to ") + " mmHg.</p>"; }
      var ex = S.exerciseRange(m);
      if (ex) html += '<p class="muted small">During exercise: normal up to ' + ex.normal[1] + ", watch up to " + ex.watch[1] + " " + esc(m.unit) + (m.exercise.hrmax ? " (maximum heart rate " + S.hrMax() + " bpm" + (D.meta.crew && typeof D.meta.crew.age === "number" ? ", age " + D.meta.crew.age : ", age not given so 40 is assumed") + ")" : "") + (m.pair && D.metric(m.pair).exercise ? "; diastolic up to " + D.metric(m.pair).exercise.normal[1] + " normal" : "") + ".</p>";
    }
    html += sec("What it is", m.about) + sec("Why it matters", m.why) + sec("How it is measured", m.how);
    if (!(c.state === 1 || c.state === 2) && (m.watch || m.call)) {
      html += '<section><h4>If it moves out of range</h4>' + (m.watch ? "<p>" + esc(m.watch) + "</p>" : "") + (m.call ? "<p><strong>Get the Crew Medical Officer straight away if:</strong> " + esc(m.call) + "</p>" : "") + "</section>";
    }
    if (m.input) html += logForm(m);
    html += '<p class="basis">' + esc(m.basis || "") + "</p>";
    body.innerHTML = html;

    var svg = $("#dsvg", body), width = Math.max(280, body.clientWidth - 44);
    if (m.kind === "continuous") {
      var series = [{ bk: D.buckets(key, w.a, w.b, w.r.bucket), normal: m.range && m.range.normal, judge: judgeFn(m) }], axis = m.range ? m.range.axis : m.axis;
      if (m.pair) { var pm2 = D.metric(m.pair); series.push({ bk: D.buckets(pm2.key, w.a, w.b, w.r.bucket), normal: pm2.range.normal, judge: judgeFn(pm2) }); axis = [pm2.range.axis[0], m.range.axis[1]]; }
      C.trend(svg, { w: width, h: 170, a: w.a, b: w.b, size: w.r.bucket, series: series, axis: axis, active: key === "activity" ? null : D.buckets("activity", w.a, w.b, w.r.bucket), exerciseMets: cfg.exerciseMets, bars: key === "activity", ticks: true, rangeId: w.r.id });
    } else {
      var pts = periodicPoints(m, w);
      if (pts.length) C.points(svg, { w: width, h: 150, a: w.a, b: w.b, pts: pts, normal: absNormal(m), axis: m.range && !m.range.relative ? m.range.axis : null, ticks: true, rangeId: w.r.id, r: 4 });
      else svg.outerHTML = '<p class="pnone">No measurement in this period. Try a longer range.</p>';
    }
    wireLogForm(m);
  }
  function sec(h, p) { return p ? "<section><h4>" + esc(h) + "</h4><p>" + esc(p) + "</p></section>" : ""; }

  function utcInputValue(t) { var d = new Date(t); return d.toISOString().slice(0, 16); }
  function logForm(m) {
    var inp = m.input, field;
    if (inp.scale) field = '<div class="scale" role="radiogroup" aria-label="' + esc(m.label) + '">' + inp.scale.map(function (l, i) { return '<button type="button" role="radio" aria-checked="false" data-v="' + (i + 1) + '"><b>' + (i + 1) + "</b>" + esc(l) + "</button>"; }).join("") + '</div><input type="hidden" name="v">';
    else field = '<label class="f"><span>Value (' + esc(m.unit) + ')</span><input name="v" type="number" inputmode="decimal" min="' + inp.min + '" max="' + inp.max + '" step="' + inp.step + '" required></label>';
    return '<form id="logform" class="logform" novalidate><h4>Log a measurement</h4>' + field +
      '<label class="f"><span>Time (UTC)</span><input name="t" type="datetime-local" value="' + utcInputValue(Date.now()) + '"></label>' +
      '<div class="row"><button class="btn" type="submit">Save</button><span class="msg" role="status" aria-live="polite"></span></div></form>';
  }
  function wireLogForm(m) {
    var f = $("#logform"); if (!f) return;
    f.querySelectorAll(".scale button").forEach(function (b) {
      b.onclick = function () { f.querySelectorAll(".scale button").forEach(function (x) { x.setAttribute("aria-checked", "false"); }); b.setAttribute("aria-checked", "true"); f.v.value = b.getAttribute("data-v"); };
    });
    f.onsubmit = function (e) {
      e.preventDefault();
      var msg = $(".msg", f), v = parseFloat(String(f.v.value).replace(",", ".")), t = f.t.value && f.t.value !== f.t.defaultValue ? Date.parse(f.t.value + ":00Z") : Date.now();
      if (!isFinite(v)) { msg.className = "msg err"; msg.textContent = "Enter a value first."; return; }
      if (m.valid && (v < m.valid[0] || v > m.valid[1])) { msg.className = "msg err"; msg.textContent = "That is outside what the device can read (" + m.valid[0] + " to " + m.valid[1] + "). Check the number."; return; }
      saveReading(m, v, t, "manual");
      var s = S.judge(m, v);
      document.activeElement && document.activeElement.blur();
      render();
      var msg2 = $("#logform .msg");
      if (msg2) { msg2.className = "msg " + (s === 2 ? "err" : "good"); msg2.textContent = s === 2 ? "Saved. This is in the Act now range: repeat the measurement and see the steps above." : s === 1 ? "Saved. Worth keeping an eye on." : "Saved."; }
    };
  }

  /* ---------- recheck reminders (kept in this browser) ---------- */
  st.rechecks = [];
  function recheckHours(m, state) { var r = m.recheck || {}; return state === 2 ? (r.act_h || 1) : (r.watch_h || 24); }
  function recheckButton(m, c) {
    if (m.kind !== "periodic" || !(m.input || m.test)) return "";
    var ex = st.rechecks.filter(function (r) { return r.key === m.key; })[0];
    if (ex) return '<p class="recheck-set">Recheck reminder set for ' + esc(F.stamp(ex.due, Date.now())) + " UTC. It is on your checklist.</p>";
    var h = recheckHours(m, c.state), label = h < 1 ? Math.round(h * 60) + " minutes" : h === 1 ? "1 hour" : h < 24 ? h + " hours" : h === 24 ? "tomorrow" : Math.round(h / 24) + " days";
    return '<button type="button" class="btn small" data-recheck="' + m.key + '" data-h="' + h + '">Remind me to recheck ' + (h === 24 ? "" : "in ") + label + "</button>";
  }
  function saveRechecks() { D.save("rechecks", st.rechecks); }
  function addRecheck(key, hours) {
    st.rechecks = st.rechecks.filter(function (r) { return r.key !== key; });
    st.rechecks.push({ key: key, set: Date.now(), due: Date.now() + hours * 3600e3, n: D.store[key] ? D.store[key].t.length : 0 });
    saveRechecks(); render();
  }
  /* a new reading after the reminder was set completes it */
  function pruneRechecks() {
    var before = st.rechecks.length;
    st.rechecks = st.rechecks.filter(function (r) { var n = D.store[r.key] ? D.store[r.key].t.length : 0; return r.n == null ? true : n <= r.n; });
    if (st.rechecks.length !== before) saveRechecks();
  }

  /* ---------- health report ---------- */
  function buildReport() {
    var at = anchor(), s = st.snap, c = D.meta.crew || {}, L = [], day = missionDay(at);
    function val(cur) { return cur.v == null ? "no data" : fmtVal(cur) + (cur.m.unit ? " " + cur.m.unit : ""); }
    L.push("CHC (CABIN HEALTH COMPANION) HEALTH REPORT");
    if (st.sim) L.push("SIMULATION: these values are simulated, not real (" + st.sim.label + ").");
    L.push((c.name || "Crew member") + (c.role ? ", " + c.role : "") + (day ? " · mission day " + day : ""));
    L.push("Prepared " + F.long(at) + ", " + F.time(at) + " UTC" + (isLive() ? "" : " (end of recorded data)"));
    L.push("");
    L.push("SUMMARY: " + $("#summary").textContent);
    L.push("");
    var flagged = Object.keys(s.cur).map(function (k) { return s.cur[k]; }).filter(function (x) { return typeof x.state === "number" && x.state > 0; })
      .sort(function (a, b) { return b.state - a.state; });
    L.push("OUT OF RANGE (" + flagged.length + ")");
    if (!flagged.length) L.push("  Nothing.");
    flagged.forEach(function (x) {
      var m = x.m;
      L.push("- " + m.label + ": " + val(x) + "  [" + S.WORDS[x.state].toUpperCase() + "]" + (x.t ? ", " + F.stamp(x.t, at) + " UTC" : "") + (x.active ? ", during exercise" : ""));
      if (x.pct != null) L.push("    " + (x.pct > 0 ? "+" : "") + F.num(x.pct, 1) + "% from baseline " + F.num(S.baseline(m), m.decimals) + " " + m.unit);
      if (x.prev) L.push("    Previous: " + F.num(x.prev.v, m.decimals) + " " + m.unit + " on " + F.date(x.prev.t));
      if (m.derive) (H.derivedDetails(m.key, x.t) || []).forEach(function (f) { var fm = D.metric(f.metric); L.push("    " + (f.value == null ? "?" : f.flagged ? "!" : "ok") + " " + fm.label + ": " + (f.value == null ? "not measured" : F.num(f.value, fm.decimals) + " " + fm.unit) + " (" + f.text + ")"); });
      L.push("    Steps: " + (x.state === 2 ? (m.act || m.watch) : m.watch));
      S.followups(cfg, x, at).forEach(function (f) {
        L.push("    Follow-up: " + f.why);
        f.items.forEach(function (it) { L.push("      " + it.m.label + ": " + val(it.cur) + (it.cur.t ? " (" + F.stamp(it.cur.t, at) + ")" : "") + (typeof it.cur.state === "number" ? " " + S.WORDS[it.cur.state] : "")); });
        f.also.forEach(function (a) { L.push("      " + a); });
      });
      if (m.call) L.push("    Get the Crew Medical Officer straight away if: " + m.call);
    });
    L.push("");
    L.push("BIO-MONITOR NOW");
    cfg.metrics.filter(function (m) { return m.kind === "continuous" && !m.partOf && !m.section; }).forEach(function (m) {
      var x = s.cur[m.key]; L.push("  " + m.label + ": " + val(x) + " (" + S.WORDS[x.state] + (x.active ? ", exercising" : "") + ")");
    });
    if (st.rad) { var rc = s.cur.radiation_dose_rate; L.push(""); L.push("RADIATION"); if (rc && rc.v != null) L.push("  Dose rate: " + F.num(rc.v, 1) + " µGy/h"); L.push("  Last 24 hours: " + F.num(st.rad.last24, 2) + " mGy · since launch: " + F.num(st.rad.total, 1) + " mGy"); }
    var due = s.due.filter(function (x) { return x.m.input || x.m.test; });
    L.push(""); L.push("CHECKS DUE (" + due.length + ")");
    due.forEach(function (x) { L.push("  " + x.m.label + (x.due === "overdue" ? " (overdue)" : "") + ", last " + (x.t ? F.stamp(x.t, at) : "never")); });
    if (st.rechecks.length) { L.push(""); L.push("RECHECKS PLANNED"); st.rechecks.forEach(function (r) { L.push("  " + D.metric(r.key).label + " at " + F.stamp(r.due, at) + " UTC"); }); }
    L.push(""); L.push("Ranges are general reference values and team assumptions, not a diagnosis.");
    return L.join("\n");
  }

  /* ---------- AI summary input: a small JSON made from the app's own statuses ---------- */
  var STATUS_EN = ["Normal", "Watch", "Act now"];
  function aiCollect() {
    var at = anchor(), s = st.snap || S.snapshot(cfg, at), metrics = [], allowed = [], seen = {};
    var cur = s.cur, attention = s.attention;
    cfg.metrics.forEach(function (m) {
      if (m.partOf) return;
      var c = cur[m.key]; if (!c || c.v == null) return;
      var e = { key: m.key, label: m.label, unit: m.unit, display: fmtVal(c),
        status: typeof c.state === "number" ? STATUS_EN[c.state] : S.WORDS[c.state], time: new Date(c.t).toISOString() };
      if (c.pct != null) e.pct_from_baseline = Math.round(c.pct * 10) / 10;
      e.value = c.v; if (c.pv != null) e.value2 = c.pv;
      if (st.sim && st.sim.values[m.key] != null) e.simulated = true;
      if (c.active) e.during_exercise = true;
      if (typeof c.state === "number" && c.state > 0) {
        e.direction = S.direction(m, c.v, c.active) || (m.pair && c.pv != null ? S.direction(D.metric(m.pair), c.pv, c.active) : null);
        /* how many readings in a row have been out of range (checks only) */
        if (m.kind === "periodic" && !e.simulated) {
          var hist = D.between(m.key, at - 30 * DAY, at), n = 0;
          for (var i = hist.v.length - 1; i >= 0 && S.judge(m, hist.v[i]) > 0; i--) n++;
          e.streak = n; e.every = m.every;
        }
        var fl = (cfg.followups || {})[m.key] || [];
        e.related = fl.reduce(function (acc, f) { return acc.concat(f.check); }, []);
      }
      if (c.state === 2 && m.call) e.call = m.call;
      metrics.push(e);
    });
    /* results that are part of a flagged derived indicator (urine factors inside kidney stone risk) */
    metrics.forEach(function (e) {
      var dm = D.metric(e.key); if (!dm.derive || (e.status !== "Watch" && e.status !== "Act now")) return;
      dm.derive.factors.forEach(function (f) { metrics.forEach(function (x) { if (x.key === f.metric && x.status !== "Normal") x.covered_by = e.key; }); });
    });
    /* allowed recommendations: only follow-ups (config.followups) of flagged results that can be logged */
    var flaggedAll = Object.keys(cur).map(function (k) { return cur[k]; }).filter(function (c) { return typeof c.state === "number" && c.state > 0; });
    /* items shown in the summary first (most severe first), then the rest */
    attention.filter(function (c) { return typeof c.state === "number"; }).concat(flaggedAll.filter(function (c) { return attention.indexOf(c) < 0; }).sort(function (a, b) { return b.state - a.state; }))
      .forEach(function (c) {
        S.followups(cfg, c, at).forEach(function (f) {
          f.items.forEach(function (it) {
            var fm = it.m;
            if (seen[fm.key] || fm.kind !== "periodic" || fm.derive || !(fm.input || fm.test)) return;
            seen[fm.key] = 1;
            allowed.push({ key: fm.key, label: fm.label, why: f.why, because: c.m.label, because_key: c.m.key, because_dir: S.direction(c.m, c.v, c.active) || (c.m.pair && c.pv != null ? S.direction(D.metric(c.m.pair), c.pv, c.active) : null) });
          });
        });
      });
    var c0 = D.meta.crew || {};
    return {
      mission: { name: c0.mission || (cfg.mission && cfg.mission.name), day: missionDay(at) },
      simulation: st.sim ? st.sim.label : null,
      metrics: metrics, allowed: allowed.slice(0, 8),
      due: s.due.filter(function (x) { return x.m.input || x.m.test; }).map(function (x) { return { key: x.m.key, label: x.m.label }; })
    };
  }

  /* store one measurement locally or on the Python server */
  function saveReading(m, v, t, source) {
    if (st.sim) stopSim(true); /* real values are never mixed with simulated ones */
    var rd = { metric: m.key, time: new Date(t).toISOString(), value: v, source: source, crew: (D.meta.crew || {}).name };
    D.ingest({ readings: [rd] }, source, { switchTo: false });
    if (H.ai) H.ai.schedule(); /* new measurement: refresh the AI summary (debounced) */
    if (st.server) postJSON("api/readings", { readings: [rd] }).catch(function () {});
    else manualQueue = manualQueue.then(function () { return D.load("manual"); }) /* one write at a time, so quick saves don't overwrite each other */
      .then(function (list) { list = list || []; list.push(rd); return D.save("manual", list); })
      .then(function () { if (!st.sample) return D.save("uploads", D.snapshot()); });
  }
  var manualQueue = Promise.resolve();

  /* ================= reaction test page (#reaction-test) ================= */
  function route() {
    var test = location.hash === "#reaction-test", lim = location.hash === "#limits", wb = location.hash === "#wellbeing", page = test || lim || wb;
    document.querySelectorAll(".mastnav a").forEach(function (a) { var h = a.getAttribute("href"); if ((h === "#" && !page) || (h !== "#" && h === location.hash)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.body.classList.toggle("on-test", page);
    var cm = $("#crewmenu"); if (cm && !cm.hidden) $("#crewbtn").click(); /* close the crew menu when the page changes */
    $("#rtest").hidden = !test; $("#limits").hidden = !lim; $("#wellbeing").hidden = !wb; $("#main").hidden = page; $(".foot").hidden = page;
    if (wb) { closeDrawer(); mountWellbeing(); window.scrollTo(0, 0); }
    if (lim) { closeDrawer(); renderLimits(); window.scrollTo(0, 0); }
    if (!test && H.reaction) H.reaction.stop();
    if (test) {
      closeDrawer();
      var m = D.metric("reaction_time");
      H.reaction.mount($("#rtbody"), {
        baseline: S.baseline(m), last: D.latest(m.key, Date.now()),
        judge: function (v) { return S.judge(m, v); }, pct: function (v) { return S.pct(m, v); }, words: S.WORDS,
        save: function (v) { saveReading(m, Math.round(v), Date.now(), "reaction test"); location.hash = ""; render(); openDrawer(m.key); },
        crews: function () { return D.crewList(); }, current: function () { return D.current; },
        switchCrew: function (id) { switchCrew(id); route(); },
        board: scoreboard, rankCircles: rankCircles, saveCircles: saveCircles
      });
      window.scrollTo(0, 0);
    }
  }

  /* ================= crew scoreboard (reaction test only) =================
   * Vigilance test: each crew member's reaction_time values. Circles: saved runs (IndexedDB "reaction_scores"),
   * plus generated sample runs while the sample crew is shown. */
  function circleRuns() { return (st.sample ? H.sample.circleScores(Date.now()) : []).concat(st.scores); }
  function scoreboard() {
    var crews = D.crewList(), names = {};
    crews.forEach(function (c) { names[c.id] = c; });
    circleRuns().forEach(function (r) { var id = D.crewId(r.crew); if (!names[id]) names[id] = { id: id, name: r.crew }; });
    var ids = Object.keys(names);
    var pvt = ids.map(function (id) {
      var c = D.crews[id], s = c && c.store.reaction_time, meta = c ? c.meta.crew || {} : {};
      var r = { id: id, name: names[id].name, role: meta.role || (profile(names[id].name) || {}).role, has: !!(s && s.v.length) };
      if (r.has) { r.latest = s.v[s.v.length - 1]; r.best = Math.min.apply(null, s.v); r.n = s.v.length; r.baseline = (meta.baseline && meta.baseline.reaction_time) || s.v[0]; }
      return r;
    }).sort(function (a, b) { return (b.has - a.has) || (a.latest - b.latest) || a.name.localeCompare(b.name); });
    var runs = circleRuns(), sample = st.sample;
    var circles = ids.map(function (id) {
      var mine = runs.filter(function (x) { return D.crewId(x.crew) === id; }).sort(function (a, b) { return a.t - b.t; });
      var r = { id: id, name: names[id].name, role: ((D.crews[id] || {}).meta || {}).crew ? D.crews[id].meta.crew.role : (profile(names[id].name) || {}).role, has: mine.length > 0 };
      if (r.has) { var last = mine[mine.length - 1]; r.best = Math.min.apply(null, mine.map(function (x) { return x.score; })); r.last = last.score; r.hits = last.hits; r.total = last.total; r.runs = mine.length; }
      return r;
    }).sort(function (a, b) { return (b.has - a.has) || (a.best - b.best) || a.name.localeCompare(b.name); });
    return { pvt: pvt, circles: circles, sample: sample };
  }
  function rankCircles(score) {
    var b = scoreboard().circles, me = D.current, mine = b.filter(function (r) { return r.id === me; })[0];
    var bests = b.filter(function (r) { return r.has && r.id !== me; }).map(function (r) { return r.best; });
    var myBest = mine && mine.has ? Math.min(mine.best, score) : score;
    return { place: bests.filter(function (x) { return x < myBest; }).length + 1, of: bests.length + 1, best: !(mine && mine.has) || score < mine.best };
  }
  function saveCircles(res) {
    res.crew = (D.meta.crew || {}).name || "Crew member";
    st.scores.push(res);
    D.save("reaction_scores", st.scores); /* kept on this device, like the journal */
  }

  /* ================= wellbeing page (#wellbeing) ================= */
  function mountWellbeing() {
    H.wellbeing.mount($("#wbbody"), {
      anchor: anchor, metric: function (k) { return D.metric(k); }, words: S.WORDS,
      latest: function (k) { return D.latest(k, anchor()); }, between: function (k, a, b) { return D.between(k, a, b); },
      judge: function (k, v) { return S.judge(D.metric(k), v); },
      save: function (k, v) { saveReading(D.metric(k), v, Date.now(), "wellbeing"); st.snap = S.snapshot(cfg, anchor()); },
      load: function (k) { return D.load(k); }, store: function (k, v) { return D.save(k, v); }
    });
  }

  /* ================= limits page (#limits): what is safe and what is not ================= */
  function fmtN(v, d) { return F.num(v, d); }
  function limitBar(r, axis, valid, d, unitSuffix) {
    var lo = axis[0], hi = axis[1], span = hi - lo, v = valid || [-Infinity, Infinity];
    var lowAct = r.watch[0] > v[0], highAct = r.watch[1] < v[1];
    if (lowAct && r.watch[0] <= lo) lo = r.watch[0] - span * 0.12;
    if (highAct && r.watch[1] >= hi) hi = r.watch[1] + span * 0.12;
    lo = Math.max(lo, v[0]); hi = Math.min(hi, v[1]);
    var W = 600, x = function (val) { return Math.max(0, Math.min(W, (val - lo) / (hi - lo) * W)); };
    var zones = [[lo, r.watch[0], "act"], [r.watch[0], r.normal[0], "watch"], [r.normal[0], r.normal[1], "ok"], [r.normal[1], r.watch[1], "watch"], [r.watch[1], hi, "act"]];
    var svg = '<svg class="lbar" viewBox="0 0 ' + W + ' 40" preserveAspectRatio="none" aria-hidden="true">';
    zones.forEach(function (z) { var a = x(z[0]), b = x(z[1]); if (b - a > 0.3) svg += '<rect class="z ' + z[2] + '" x="' + a.toFixed(1) + '" y="4" width="' + (b - a).toFixed(1) + '" height="16"/>'; });
    var marks = [r.watch[0], r.normal[0], r.normal[1], r.watch[1]].filter(function (b, i, arr) { return arr.indexOf(b) === i && b > lo && b < hi; });
    svg += "</svg>";
    var labels = marks.map(function (b) { return '<span style="left:' + (x(b) / W * 100).toFixed(2) + '%">' + esc(fmtN(b, d) + (unitSuffix || "")) + "</span>"; }).join("");
    return '<div class="lbarwrap">' + svg + '<div class="lticks">' + labels + "</div></div>";
  }
  function limitText(r, valid, d, u) {
    var v = valid || [-Infinity, Infinity], f = function (n) { return fmtN(n, d) + u; }, g0 = function (n) { return fmtN(n, d) + (u === "%" ? "%" : ""); };
    var lowW = r.watch[0] < r.normal[0], highW = r.watch[1] > r.normal[1], lowA = r.watch[0] > v[0], highA = r.watch[1] < v[1];
    var normal = r.normal[0] <= v[0] || r.normal[0] <= -50 ? "up to " + f(r.normal[1]) : r.normal[1] >= v[1] || r.normal[1] >= 500 ? f(r.normal[0]) + " or more" : g0(r.normal[0]) + " to " + f(r.normal[1]);
    var watch = [];
    if (lowW && r.watch[0] > -50) watch.push(g0(r.watch[0]) + " to " + f(r.normal[0]));
    else if (lowW) watch.push("below " + f(r.normal[0]));
    if (highW) watch.push(g0(r.normal[1]) + " to " + f(r.watch[1]));
    var act = [];
    if (lowA && r.watch[0] > -50) act.push("below " + f(r.watch[0]));
    if (highA) act.push("above " + f(r.watch[1]));
    return '<span class="lt"><i class="ok"></i>Normal: ' + esc(normal) + "</span>" + (watch.length ? '<span class="lt"><i class="watch"></i>Watch: ' + esc(watch.join(", or ")) + "</span>" : "") + (act.length ? '<span class="lt"><i class="act"></i>Act now: ' + esc(act.join(" or ")) + "</span>" : "");
  }
  function limitRow(m) {
    var r = m.range, d = m.decimals, rel = r && r.relative, u = rel || m.unit === "%" ? "%" : (m.unit && m.unit.length < 7 && m.unit !== "SG" ? " " + m.unit : "");
    var html = '<div class="lrow"><div class="lname"><button type="button" class="lnk" data-limits-open="' + m.key + '"><strong>' + esc(m.label) + "</strong></button><small>" + esc([rel ? "% change from your baseline" : m.unit, m.every ? CADW[m.every] : m.kind === "continuous" ? "continuous" : ""].filter(Boolean).join(" · ")) + "</small></div><div class=\"lbody\">";
    if (m.key === "activity") {
      html += '<div class="lbarwrap"><svg class="lbar" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true"><rect class="z rest" x="0" y="4" width="90" height="16"/><rect class="z light" x="90" y="4" width="90" height="16"/><rect class="z ex" x="180" y="4" width="420" height="16"/></svg><div class="lticks"><span style="left:15%">1.5</span><span style="left:30%">3 METs</span><span style="left:60%">6</span></div></div>' +
        '<div class="ltext"><span class="lt"><i class="rest"></i>Resting: below 1.5</span><span class="lt"><i class="light"></i>Light activity: 1.5 to 3</span><span class="lt"><i class="ex"></i>Exercise: 3 or more (exercise limits apply)</span></div>';
    } else {
      var axis = r.axis || (rel ? [Math.max(-20, r.watch[0]) - 3, r.watch[1] + 5] : [r.watch[0], r.watch[1]]);
      var valid = rel ? [-50, 1000] : m.valid;
      if (m.pair) html += '<p class="lsubh">Systolic (top number)</p>';
      html += limitBar(r, axis, valid, rel ? 0 : d, rel ? "%" : "") + '<div class="ltext">' + limitText(r, valid, rel ? 0 : d, u) + "</div>";
      if (m.pair) { var pm = D.metric(m.pair); html += '<p class="lsubh">Diastolic (bottom number)</p>' + limitBar(pm.range, pm.range.axis, pm.valid, 0, "") + '<div class="ltext">' + limitText(pm.range, pm.valid, 0, u) + "</div>"; }
      var ex = S.exerciseRange(m);
      if (ex) {
        var exAxis = [axis[0], Math.max(axis[1], ex.watch[1] * 1.08)];
        html += '<p class="lsubh">During exercise' + (m.exercise.hrmax ? " (maximum heart rate " + S.hrMax() + " bpm)" : "") + "</p>" + limitBar(ex, exAxis, m.valid, 0, "") + '<div class="ltext">' + limitText(ex, m.valid, 0, u) + "</div>";
      }
    }
    return html + '<p class="lbasis">' + esc(m.basis || "") + "</p></div></div>";
  }
  function renderLimits() {
    var hr = D.metric("heart_rate"), ex = S.exerciseRange(hr), test = 120;
    var rest = S.judge(hr, test, false), exs = S.judge(hr, test, true);
    var groups = [
      ["Bio-Monitor", function (m) { return m.kind === "continuous" && !m.section; }],
      ["Radiation", function (m) { return m.section === "radiation"; }],
      ["Every day", function (m) { return m.kind === "periodic" && !m.group && !m.section && m.every === "day"; }],
      ["Every week", function (m) { return m.kind === "periodic" && !m.group && m.every === "week"; }],
      ["Every month", function (m) { return m.kind === "periodic" && !m.group && m.every === "month"; }],
      ["Blood tests", function (m) { return m.group === "blood"; }],
      ["Kidneys and urine", function (m) { return m.group === "kidneys"; }]
    ];
    var html = '<h1>What is safe, and what is not</h1>' +
      '<p class="rt-lead">Every indicator the app tracks, with the values it treats as Normal, Watch and Act now. These are general adult reference values or our own assumptions for a prototype, not NASA flight limits: each one says where it comes from. Personal limits should be agreed with the medical team before the mission.</p>' +
      '<div class="legendbar"><span class="lt"><i class="ok"></i><b>Normal</b> nothing to do</span><span class="lt"><i class="watch"></i><b>Watch</b> repeat the measurement, follow the tips</span><span class="lt"><i class="act"></i><b>Act now</b> follow the steps on board and tell the Crew Medical Officer</span></div>' +
      '<section class="howex"><h2>Exercise or rest?</h2>' +
      "<p>The Bio-Monitor shirt has a motion sensor (accelerometer) that measures how much your body is moving. The team's data turns that into an <strong>activity level in METs</strong>: 1 MET is sitting still, 3 or more is exercise. The app takes the median of the last 5 minutes, so a quick stretch or reaching for something does not count.</p>" +
      "<p>When activity is 3 METs or more, heart rate, blood pressure and breathing are judged against <strong>exercise limits</strong>; otherwise against <strong>resting limits</strong>. So the same heart rate can be fine or a problem:</p>" +
      '<table class="extable"><thead><tr><th></th><th>Activity</th><th>Limits used</th><th>Heart rate ' + test + " bpm</th></tr></thead><tbody>" +
      '<tr><td>Working at a laptop</td><td>1.5 METs</td><td>Resting: normal ' + hr.range.normal[0] + "–" + hr.range.normal[1] + '</td><td><span class="st ' + sclass(rest) + '">' + S.WORDS[rest] + "</span></td></tr>" +
      '<tr><td>On the treadmill</td><td>7 METs</td><td>Exercise: normal up to ' + ex.normal[1] + '</td><td><span class="st ' + sclass(exs) + '">' + S.WORDS[exs] + "</span></td></tr>" +
      "</tbody></table>" +
      '<p class="muted small">Exercise heart-rate limits come from the maximum heart rate, 220 minus age (' + S.hrMax() + " bpm here). Add \"age\" to the crew details in the data to personalise it. Blood oxygen is always judged the same way: it should not drop during exercise.</p></section>";
    groups.forEach(function (g2) {
      var ms = cfg.metrics.filter(function (m) { return !m.partOf && (m.range || m.key === "activity") && g2[1](m); });
      if (ms.length) html += '<section class="lgroup"><h2>' + esc(g2[0]) + "</h2>" + ms.map(limitRow).join("") + "</section>";
    });
    $("#limbody").innerHTML = html;
  }

  /* ================= data dialog ================= */
  function readFile(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { res({ name: file.name, text: fr.result }); };
      fr.onerror = function () { res({ name: file.name, error: "Could not read the file." }); };
      fr.readAsText(file);
    });
  }
  function importTexts(items) {
    if (st.sim) stopSim(true);
    if (st.sample) { stopFeed(); D.clear(); st.sample = false; }
    var reps = [], good = [];
    items.forEach(function (it) {
      if (it.error) { reps.push({ name: it.name, error: it.error }); return; }
      var obj; try { obj = JSON.parse(it.text); } catch (e) { reps.push({ name: it.name, error: "Not valid JSON: " + e.message }); return; }
      good.push({ obj: obj, name: it.name });
      if (st.server) postJSON("api/upload?name=" + encodeURIComponent(it.name), obj).catch(function () {});
    });
    /* all files at once, so files from the same period are moved in time together */
    reps = reps.concat(D.ingestMany(good, { align: true }));
    good.forEach(function (g2) { if (D.meta.files.indexOf(g2.name) < 0) D.meta.files.push(g2.name); });
    D.meta.source = "upload";
    if (st.server) { st.offset = 0; st.region = null; render(); showReports(reps); H.ai.schedule(); return Promise.resolve(); }
    return D.load("manual").then(function (list) { if (list && list.length) D.ingest({ readings: list }, "manual", { switchTo: false }); return D.save("uploads", D.snapshot()); }).then(function () {
      st.offset = 0; st.region = null; render(); showReports(reps); H.ai.schedule();
    });
  }
  function showReports(reps) {
    $("#report").innerHTML = reps.map(function (r) {
      if (r.error) return '<div class="rep bad"><strong>' + esc(r.name) + "</strong><p>" + esc(r.error) + "</p></div>";
      var keys = Object.keys(r.added).filter(function (k) { return r.added[k] > 0; }), total = keys.reduce(function (s, k) { return s + r.added[k]; }, 0);
      var sk = Object.keys(r.skipped), bad = !total && !(r.crew && r.crew.length) && !r.ecg;
      return '<div class="rep ' + (bad ? "bad" : "good") + '"><strong>' + esc(r.name) + "</strong>" +
        "<p>" + (total ? total.toLocaleString("en") + " new values: " + keys.map(function (k) { return esc(D.metric(k).label) + " " + r.added[k].toLocaleString("en"); }).join(", ") + "." : "No new values.") +
        (r.crew && r.crew.length ? " Crew member" + (r.crew.length > 1 ? "s: " : ": ") + r.crew.map(esc).join(", ") + "." : " Added to " + esc((D.meta.crew || {}).name || "the crew member on screen") + ".") +
        (r.ecg ? " ECG strip loaded." : "") + (st.server ? " Saved to the server's data folder." : "") + "</p>" +
        (r.notes && r.notes.length ? "<p>" + r.notes.map(esc).join(" ") + "</p>" : "") +
        (sk.length ? "<p>Skipped: " + sk.map(function (k) { return r.skipped[k] + " × " + esc(k); }).join("; ") + ".</p>" : "") +
        (r.unknown.length ? "<p>Unknown metric names (add them to js/config.js or fix the spelling): " + r.unknown.map(esc).join(", ") + ".</p>" : "") + "</div>";
    }).join("");
    updateDataStats();
  }
  function updateDataStats() {
    var c = D.counts(), ext = D.extent();
    $("#dstats").textContent = (st.server ? "Connected to the Python server: files in its data folder load automatically. " : "") + (st.sample ? "Showing generated sample data. " : D.meta.files.length ? "Files loaded: " + D.meta.files.join(", ") + ". " : "") +
      "For " + esc((D.meta.crew || {}).name || "this crew member") + ": " + c.continuous.toLocaleString("en") + " sensor samples and " + c.periodic.toLocaleString("en") + " check values" + (ext ? ", " + F.date(ext.from) + " to " + F.date(ext.to) + "." : ".") +
      (D.crewList().length > 1 ? " Crew members: " + D.crewList().map(function (x) { return x.name + " (" + x.values.toLocaleString("en") + " values)"; }).join(", ") + ". Switch between them at the top of the page." : "");
  }
  function download(name, obj) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ================= demo feed ================= */
  function startFeed() {
    if (st.liveTimer) return;
    st.liveTimer = setInterval(function () {
      if (st.sim) return; /* the simulation stays on screen until it is stopped */
      var now = Date.now();
      D.crewList().forEach(function (c) { D.ingest(H.sample.tick(now, c.name), "demo feed", { switchTo: false }); });
      if (!st.hovering && !document.body.classList.contains("on-test")) render();
    }, 5000);
  }
  function stopFeed() { clearInterval(st.liveTimer); st.liveTimer = null; }
  /* the sample crew: one generated file per crew member in the roster; the first one is shown */
  function loadSample() {
    D.clear(); st.sample = true;
    var files = H.sample.crew(Date.now()), first = D.crewId(files[0].crew.name);
    D.ingestMany(files.map(function (f) { return { obj: f, name: "sample" }; }), { switchTo: false });
    Object.keys(D.crews).forEach(function (id) { D.crews[id].meta.source = "sample"; });
    if (D.crews[first]) D.use(first);
  }

  /* ================= crew members ================= */
  function switchCrew(id) {
    if (st.sim) stopSim(true);
    if (!D.use(id)) return;
    st.offset = 0; st.region = null; closeDrawer();
    if (!st.sample && !st.server) D.save("uploads", D.snapshot());
    render(); H.ai.schedule();
  }

  /* ================= simulation =================
   * Replaces a few current values with simulated ones on a copy of the data, so the whole dashboard and the AI summary
   * react as if it were real. Nothing is saved; logging a real value, importing or switching crew member ends it. */
  var simCustom = {};
  /* a simulation is at rest: Bio-Monitor channels that are not chosen get normal resting values */
  function atRest(values) {
    var cont = Object.keys(values).some(function (k) { var m = D.metric(k); return m && m.kind === "continuous" && m.section !== "radiation"; });
    if (!cont) return values;
    var out = Object.assign({}, H.diagnose.REST);
    Object.keys(values).forEach(function (k) { out[k] = values[k]; });
    return out;
  }
  function simValues(preset) {
    preset = atRest(preset);
    var out = {};
    Object.keys(preset).forEach(function (k) {
      var m = D.metric(k), x = preset[k]; if (!m) return;
      var v = typeof x === "object" ? S.baseline(m) * (1 + x.pct / 100) : x;
      if (v != null && isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    });
    return out;
  }
  function shownValues(preset) {
    var out = {};
    Object.keys(preset).forEach(function (k) { if (k === "activity") return; var m = D.metric(k), x = preset[k]; var v = typeof x === "object" ? S.baseline(m) * (1 + x.pct / 100) : x; if (v != null && isFinite(v)) out[k] = v; });
    return out;
  }
  function startSim(label, values, shown) {
    if (!Object.keys(values).length) return;
    st.sim = { label: label, values: values, shown: shown };
    D.simulate(values, anchor());
    document.body.classList.add("simulating");
    st.offset = 0; render(); H.ai.schedule();
  }
  function stopSim(quiet) {
    if (!st.sim) return;
    D.endSimulation(); st.sim = null;
    document.body.classList.remove("simulating");
    if (!quiet) { render(); H.ai.schedule(); }
  }
  function simDescribe(values) {
    return Object.keys(values).filter(function (k) { return k !== "activity"; }).map(function (k) {
      var m = D.metric(k); return m.label + " " + F.num(values[k], m.decimals) + (m.unit ? " " + m.unit : "");
    }).join(", ");
  }
  function renderSimBar() {
    var bar = $("#simbar");
    if (!st.sim) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.hidden = false;
    bar.innerHTML = '<strong>Simulation: ' + esc(st.sim.label) + "</strong><span>" + esc(simDescribe(st.sim.shown || st.sim.values)) + (st.sim.shown && Object.keys(st.sim.shown).length < Object.keys(st.sim.values).length ? ", other sensors at resting values" : "") + ". Not real values, nothing is saved.</span>" +
      '<button type="button" class="btn small ghost" data-sim-open>Change</button><button type="button" class="btn small" data-sim-stop>Stop simulation</button>';
  }
  function simMetricOptions() {
    return cfg.metrics.filter(function (m) { return !m.derive && m.key !== "activity" && m.range; })
      .map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + (m.unit ? " (" + esc(m.unit) + ")" : "") + "</option>"; }).join("");
  }
  function renderSimDialog() {
    var html = '<p class="muted">Pick a situation, or set your own values. The whole dashboard and the AI summary react as if it were real, for ' +
      esc((D.meta.crew || {}).name || "this crew member") + ". Sensor values are simulated at rest; sensors you do not set get normal resting values. Nothing is saved.</p><h3>Situations</h3><div class=\"simgrid\">" +
      H.diagnose.SCENARIOS.map(function (sc) {
        return '<button type="button" class="simcard' + (st.sim && st.sim.id === sc.id ? " on" : "") + '" data-sim="' + sc.id + '"><strong>' + esc(sc.en) + "</strong><span>" + esc(sc.note || simDescribe(shownValues(sc.values))) + "</span></button>";
      }).join("") + "</div>";
    var keys = Object.keys(simCustom);
    html += '<h3>Your own values</h3><form class="simform" id="simform"><label class="f"><span>Measurement</span><select name="k">' + simMetricOptions() + '</select></label>' +
      '<label class="f"><span>Value</span><input name="v" type="number" step="any" inputmode="decimal" required></label><button class="btn ghost" type="submit">Add</button></form>' +
      (keys.length ? '<ul class="simlist">' + keys.map(function (k) { var m = D.metric(k); return "<li>" + esc(m.label) + " " + F.num(simCustom[k], m.decimals) + " " + esc(m.unit || "") + ' <button type="button" class="linkbtn" data-sim-del="' + k + '">remove</button></li>'; }).join("") + "</ul>" +
        '<button type="button" class="btn" data-sim-custom>Simulate these values</button>' : '<p class="muted small">Add one or more values, then start.</p>');
    if (st.sim) html += '<p><button type="button" class="btn ghost" data-sim-stop>Stop simulation</button></p>';
    $("#simbody").innerHTML = html;
    var f = $("#simform");
    f.onsubmit = function (e) {
      e.preventDefault();
      var k = f.k.value, m = D.metric(k), v = parseFloat(String(f.v.value).replace(",", "."));
      if (!isFinite(v) || (m.valid && (v < m.valid[0] || v > m.valid[1]))) { f.v.setCustomValidity(m.valid ? "Between " + m.valid[0] + " and " + m.valid[1] : "Enter a number"); f.v.reportValidity(); f.v.setCustomValidity(""); return; }
      simCustom[k] = v;
      if (m.pair) { var pm = D.metric(m.pair), cur = st.snap && st.snap.cur[k]; if (simCustom[m.pair] == null) simCustom[m.pair] = cur && cur.pv != null ? cur.pv : pm.range.normal[1] - 5; }
      renderSimDialog();
    };
  }

  /* ================= wiring ================= */
  function wire() {
    document.addEventListener("click", function (e) {
      var lo = e.target.closest("[data-limits-open]"); if (lo) { var k = lo.getAttribute("data-limits-open"); location.hash = ""; setTimeout(function () { render(); openDrawer(k); }, 0); return; }
      var o = e.target.closest("[data-open]"); if (o) { openDrawer(o.getAttribute("data-open")); return; }
      var l = e.target.closest("[data-log]"); if (l) { openDrawer(l.getAttribute("data-log"), true); return; }
      var rc = e.target.closest("[data-recheck]"); if (rc) { addRecheck(rc.getAttribute("data-recheck"), +rc.getAttribute("data-h")); return; }
      var urc = e.target.closest("[data-unrecheck]"); if (urc) { var k2 = urc.getAttribute("data-unrecheck"); st.rechecks = st.rechecks.filter(function (r) { return r.key !== k2; }); saveRechecks(); render(); return; }
      var j = e.target.closest("[data-jump]"); if (j) { $("#" + j.getAttribute("data-jump")).scrollIntoView({ behavior: "smooth" }); return; }
      var r = e.target.closest("[data-range]"); if (r) { st.rangeId = r.getAttribute("data-range"); st.offset = 0; render(); return; }
      if (e.target.closest("[data-sim-open]")) { renderSimDialog(); $("#simdlg").showModal(); return; }
      if (e.target.closest("[data-sim-stop]")) { stopSim(); if ($("#simdlg").open) $("#simdlg").close(); return; }
      var sc = e.target.closest("[data-sim]");
      if (sc) { var p = H.diagnose.SCENARIOS.filter(function (x) { return x.id === sc.getAttribute("data-sim"); })[0]; startSim(p.en, simValues(p.values), shownValues(p.values)); st.sim.id = p.id; $("#simdlg").close(); return; }
      var sd = e.target.closest("[data-sim-del]"); if (sd) { delete simCustom[sd.getAttribute("data-sim-del")]; renderSimDialog(); return; }
      if (e.target.closest("[data-sim-custom]")) { startSim("your own values", simValues(simCustom), shownValues(simCustom)); $("#simdlg").close(); return; }
    });
    $("#prev").onclick = function () { st.offset++; render(); };
    $("#next").onclick = function () { st.offset = Math.max(0, st.offset - 1); render(); };
    $("#latest").onclick = function () { st.offset = 0; render(); };
    $("#drawer .close").onclick = closeDrawer;
    $("#scrim").onclick = closeDrawer;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && st.open) closeDrawer(); });

    var tr = $("#trends");
    tr.addEventListener("pointermove", function (e) {
      var svg = e.target.closest("svg.tchart"); if (!svg || !trendCharts.length) return;
      var rect = svg.getBoundingClientRect(), sc = trendCharts[0].sc, px = (e.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
      if (px < 0 || px > sc.plotW) { readouts(null); return; }
      st.hovering = true; readouts(sc.t(px));
    });
    tr.addEventListener("pointerleave", function () { st.hovering = false; readouts(null); });

    var rdlg = $("#reportdlg");
    $("#b-report").onclick = function () { $("#reptext").value = buildReport(); $("#repmsg").textContent = ""; rdlg.showModal(); };
    $("#repclose").onclick = function () { rdlg.close(); };
    $("#repcopy").onclick = function () {
      var t = $("#reptext"); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(function () { document.execCommand("copy"); }).then(function () { $("#repmsg").textContent = "Copied."; });
    };
    $("#repsave").onclick = function () {
      var url = URL.createObjectURL(new Blob([$("#reptext").value], { type: "text/plain" })), a = document.createElement("a");
      a.href = url; a.download = "health-report-" + new Date(anchor()).toISOString().slice(0, 10) + ".txt"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    };
    var dlg = $("#datadlg");
    $("#b-data").onclick = function () { updateDataStats(); dlg.showModal(); };
    $("#dclose").onclick = function () { dlg.close(); };
    $("#simclose").onclick = function () { $("#simdlg").close(); };
    var drop = $("#drop"), file = $("#file");
    file.onchange = function () { Promise.all([].slice.call(file.files).map(readFile)).then(importTexts); file.value = ""; };
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { Promise.all([].slice.call(e.dataTransfer.files).map(readFile)).then(importTexts); });
    $("#b-paste").onclick = function () { var t = $("#paste").value.trim(); if (t) importTexts([{ name: "pasted text", text: t }]); };
    $("#b-export").onclick = function () { download("chc-" + D.crewId((D.meta.crew || {}).name || "crew").replace(/\s+/g, "-") + "-" + new Date().toISOString().slice(0, 10) + ".json", D.export()); };
    $("#b-sample").onclick = function () { download("chc-sample.json", H.sample.generate(Date.now())); };
    if (st.server) { $("#b-reset").textContent = "Reload from server"; }
    $("#b-reset").onclick = function () {
      var b = this;
      if (st.server) { location.reload(); return; }
      if (b.getAttribute("data-arm") !== "1") { b.setAttribute("data-arm", "1"); b.textContent = "Click again to confirm"; setTimeout(function () { b.removeAttribute("data-arm"); b.textContent = "Remove loaded data"; }, 4000); return; }
      b.removeAttribute("data-arm"); b.textContent = "Remove loaded data";
      st.scores = [];
      Promise.all([D.save("uploads", undefined), D.save("manual", undefined), D.save("reaction_scores", undefined)]).then(function () { loadSample(); startFeed(); st.offset = 0; st.region = null; render(); $("#report").innerHTML = ""; updateDataStats(); });
    };

    g.addEventListener("hashchange", route);
    var rt; g.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (!document.body.classList.contains("on-test")) render(); }, 150); });
    setInterval(function () { if (!st.liveTimer && !st.hovering) render(); }, 60e3);
  }

  /* ================= Python server ================= */
  function postJSON(path, obj) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }).then(function (r) { return r.json(); });
  }
  function detectServer() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
    return fetch("api/status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && (j.app === "chc" || j.app === "halo-vitals") ? j : null; }).catch(function () { return null; });
  }
  /* load every file the server has; returns true if there was real data */
  function loadFromServer() {
    return fetch("api/data", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      st.seq = j.seq || 0;
      var files = (j.files || []).filter(function (f) { return !f.error; });
      if (!files.length) return false;
      stopFeed(); D.clear(); st.sample = false;
      D.ingestMany(files.map(function (f) { return { obj: f.data, name: f.name }; }), { align: true });
      files.forEach(function (f) { if (D.meta.files.indexOf(f.name) < 0) D.meta.files.push(f.name); });
      D.meta.source = "server";
      return true;
    });
  }
  function pollServer() {
    fetch("api/live?since=" + st.seq, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.chunks || !j.chunks.length) { st.seq = Math.max(st.seq, j.seq || 0); return; }
      var OWN = { manual: 1, "reaction test": 1, wellbeing: 1 };
      var onlyOwn = j.chunks.every(function (c) { return !(c.series && c.series.length) && (c.readings || []).every(function (r) { return OWN[r.source]; }); });
      if (st.sample && onlyOwn) { st.seq = j.seq; return; } /* already shown: it was logged on this page */
      if (st.sample) return loadFromServer().then(function () { st.offset = 0; st.region = null; render(); H.ai.schedule(); });
      if (st.sim) return; /* picked up after the simulation (seq is not advanced) */
      j.chunks.forEach(function (c) { D.ingest(c, "live", { switchTo: false }); });
      st.seq = j.seq;
      if (!st.hovering && !document.body.classList.contains("on-test")) render();
    }).catch(function () { /* server stopped: keep showing what we have */ })
      .then(function () { setTimeout(pollServer, 3000); });
  }

  /* ================= boot ================= */
  function bootLocal() {
    return D.load("uploads").then(function (snap) {
      var has = snap && ((snap.crews && Object.keys(snap.crews).some(function (id) { return Object.keys(snap.crews[id].store || {}).length; })) || (snap.store && Object.keys(snap.store).length));
      if (has) { D.restore(snap); st.sample = false; }
      else loadSample();
      return D.load("manual");
    }).then(function (manual) {
      if (manual && manual.length && st.sample) D.ingest({ readings: manual }, "manual", { switchTo: false });
      wire(); render(); route(); initAI();
      if (st.sample) startFeed();
    });
  }
  function bootServer(info) {
    st.server = info;
    return loadFromServer().then(function (had) {
      if (!had) { loadSample(); startFeed(); }
      wire(); render(); route(); initAI(); pollServer();
    });
  }
  function initAI() {
    H.ai.init({ el: $("#aicard"), collect: aiCollect, metric: function (k) { return D.metric(k); } });
    H.ai.schedule();
  }
  function boot() {
    D.init(cfg);
    /* offline copy of the app when it is opened from a web address (file:// is offline already) */
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () { /* not essential */ });
    D.load("rechecks").then(function (r) { if (Array.isArray(r)) { st.rechecks = r; if (st.snap) render(); } });
    D.load("reaction_scores").then(function (r) { if (Array.isArray(r)) { st.scores = r; if (H.reaction.refresh) H.reaction.refresh(); } });
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-crew-info]");
      if (b) { e.preventDefault(); showCrewInfo(b.getAttribute("data-crew-info")); }
    });
    $("#crewdlg-close").onclick = function () { $("#crewdlg").close(); };
    detectServer().then(function (srv) { return srv ? bootServer(srv) : bootLocal(); }).catch(function (e) {
      console.error(e);
      document.body.insertAdjacentHTML("afterbegin", '<p style="padding:16px;color:#b83a2b">CHC could not start: ' + esc(e && e.message || e) + "</p>");
    });
  }
  H.app = { render: render, importTexts: importTexts, state: st };
  boot();
})(window);
