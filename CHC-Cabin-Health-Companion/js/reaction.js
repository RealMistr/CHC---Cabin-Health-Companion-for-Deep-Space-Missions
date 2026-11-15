/* Reaction test page, two modes:
 * - Vigilance test (PVT): a counter appears after a random wait; press space or tap as fast as possible.
 *   Result: average reaction time in ms (saved as reaction_time), plus lapses (> 500 ms) and false starts.
 * - Circles: 20 circles appear one by one at random places; click or tap each as fast as possible.
 *   Score = average time per circle, where a missed circle counts as the full 1.5 s and a click beside a circle adds 0.1 s.
 *   Circle results go to the crew scoreboard only; they are not mixed into the reaction_time indicator.
 * The crew scoreboard compares the latest results of every crew member for both modes. */
(function (g) {
  var H = g.Halo, R = H.reaction = {}, F = H.fmt, esc = F.esc;
  var LAPSE = 500, TIMEOUT = 3000, MIN_RT = 100, WAIT = [1500, 4500];
  var CIRCLES = 20, CIRCLE_LIFE = 1500, CIRCLE_GAP = [350, 1000], STRAY = 100, CIRCLE_D = 56;
  var st = null;

  function now() { return performance.now(); }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }

  R.stop = function () {
    if (!st) return;
    clearTimeout(st.timer); clearTimeout(st.ctimer); cancelAnimationFrame(st.raf);
    document.removeEventListener("keydown", st.onKey);
    st = null;
  };

  R.mount = function (el, opts) {
    R.stop();
    st = { el: el, opts: opts, phase: "intro", seconds: 180, mode: R.mode || "pvt" };
    st.onKey = function (e) {
      if (e.code === "Space" || e.key === " ") {
        if (st.phase === "wait" || st.phase === "go") { e.preventDefault(); if (!e.repeat) respond(); }
      } else if (e.key === "Escape" && (st.phase === "wait" || st.phase === "go" || st.phase === "feedback")) { finish(true); }
      else if (e.key === "Escape" && st.phase === "circles") { finishCircles(true); }
    };
    document.addEventListener("keydown", st.onKey);
    intro();
  };

  function intro(msg) {
    var o = st.opts, last = o.last, pvt = st.mode === "pvt";
    st.phase = "intro";
    var crews = o.crews ? o.crews() : [], cur = o.current ? o.current() : null;
    var who = crews.length > 1
      ? '<label class="rt-who">Taking the test as <select id="rt-crew">' + crews.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === cur ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></label>"
      : "";
    st.el.innerHTML =
      '<h1 id="rt-title">Reaction test</h1>' +
      (msg ? '<p class="rt-msg" role="status">' + esc(msg) + "</p>" : "") +
      '<div class="rt-modes" role="radiogroup" aria-label="Test type">' +
        '<button type="button" role="radio" data-m="pvt" aria-checked="' + pvt + '"><b>Vigilance test</b><span>The standard weekly check. Saved as your reaction time.</span></button>' +
        '<button type="button" role="radio" data-m="circles" aria-checked="' + !pvt + '"><b>Circles</b><span>Click circles that pop up at random. For the crew scoreboard.</span></button>' +
      "</div>" + who +
      (pvt
        ? '<p class="rt-lead">A short attention test, based on the psychomotor vigilance test used in sleep and spaceflight research. It shows how alert you are: tiredness and short sleep make reactions slower and less steady.</p>' +
          '<ol class="rt-steps"><li>Sit somewhere quiet and put the tablet or keyboard in a comfortable spot.</li><li>A red counter will appear at random moments.</li><li>As soon as it appears, press the <kbd>space bar</kbd> or tap the box.</li><li>Do not press before it appears; that counts as a false start.</li></ol>' +
          '<div class="rt-len" role="radiogroup" aria-label="Test length">' +
            '<button type="button" role="radio" data-s="180" aria-checked="' + (st.seconds === 180) + '"><b>3 minutes</b><span>Standard, use this for your weekly check</span></button>' +
            '<button type="button" role="radio" data-s="60" aria-checked="' + (st.seconds === 60) + '"><b>1 minute</b><span>Quick check</span></button>' +
          "</div>" +
          '<p class="muted">' + (o.baseline ? "Your baseline: " + Math.round(o.baseline) + " ms. " : "") + (last ? "Last result: " + Math.round(last.v) + " ms on " + esc(F.date(last.t)) + "." : "No results yet.") + "</p>"
        : '<p class="rt-lead">A quick game of speed and aim. ' + CIRCLES + ' circles appear one at a time at random places on the screen. Each one stays for ' + (CIRCLE_LIFE / 1000) + ' seconds.</p>' +
          '<ol class="rt-steps"><li>Use a mouse or a touch screen.</li><li>Click or tap each circle as fast as you can.</li><li>A missed circle counts as ' + (CIRCLE_LIFE / 1000) + ' s; a click beside a circle adds ' + (STRAY / 1000) + ' s.</li><li>Your score is the average time per circle: lower is better.</li></ol>' +
          '<p class="muted">Circle results are only for the crew scoreboard. They do not change your reaction time indicator, which uses the vigilance test.</p>') +
      '<button type="button" class="btn big-btn" id="rt-start">' + (pvt ? "Start the test" : "Start the circles") + "</button>" +
      board();
    st.el.querySelectorAll(".rt-len button").forEach(function (b) {
      b.onclick = function () { st.seconds = +b.getAttribute("data-s"); intro(); };
    });
    st.el.querySelectorAll(".rt-modes button").forEach(function (b) {
      b.onclick = function () { st.mode = R.mode = b.getAttribute("data-m"); intro(); };
    });
    var sel = st.el.querySelector("#rt-crew");
    if (sel) sel.onchange = function () { o.switchCrew(sel.value); };
    st.el.querySelector("#rt-start").onclick = pvt ? start : startCircles;
  }
  R.refresh = function (msg) { if (st && st.phase === "intro") intro(msg); };

  /* ---------- crew scoreboard ---------- */
  function info(name) { return '<button type="button" class="info-i" data-crew-info="' + esc(name) + '" aria-label="About ' + esc(name) + '">i</button>'; }
  function board() {
    var o = st.opts; if (!o.board) return "";
    var b = o.board(), cur = o.current ? o.current() : null;
    function row(r, i, cells) {
      return "<tr" + (r.id === cur ? ' class="me"' : "") + '><td class="rk">' + (r.has ? i + 1 : "–") + '</td><th scope="row"><span class="nmw"><span class="nm">' + esc(r.name) + "</span>" + info(r.name) + "</span>" + (r.role ? '<span class="rl">' + esc(r.role) + "</span>" : "") + "</th>" + cells + "</tr>";
    }
    var pvtRows = b.pvt.map(function (r, i) {
      var d = r.latest != null && r.baseline ? (r.latest - r.baseline) / r.baseline * 100 : null;
      return row(r, i, r.has
        ? '<td class="n">' + Math.round(r.latest) + ' <small>ms</small></td><td class="n opt">' + Math.round(r.best) + ' <small>ms</small></td><td class="n ' + (d == null ? "" : d > 20 ? "act" : d > 10 ? "watch" : "ok") + '">' + (d == null ? "–" : (d > 0 ? "+" : "") + F.num(d, 0) + "%") + '</td><td class="n opt">' + r.n + "</td>"
        : '<td colspan="4" class="muted">No results yet</td>');
    }).join("");
    var cRows = b.circles.map(function (r, i) {
      return row(r, i, r.has
        ? '<td class="n">' + r.best + ' <small>ms</small></td><td class="n opt">' + r.last + ' <small>ms</small></td><td class="n">' + r.hits + "/" + r.total + '</td><td class="n opt">' + r.runs + "</td>"
        : '<td colspan="4" class="muted">No runs yet</td>');
    }).join("");
    return '<section class="rt-board" aria-labelledby="rt-board-h"><h2 id="rt-board-h">Crew scoreboard</h2>' +
      '<p class="muted">How the crew compares on the reaction test. Lower times are faster. Select <span class="info-i static" aria-hidden="true">i</span> to read about each astronaut.' + (b.sample ? " The results shown come from the sample data." : "") + "</p>" +
      '<div class="rt-boards"><div class="tblwrap"><table class="rtb"><caption>Vigilance test <span>ranked by latest result</span></caption>' +
        '<thead><tr><th scope="col" class="rk">#</th><th scope="col">Astronaut</th><th scope="col" class="n">Latest</th><th scope="col" class="n opt">Best</th><th scope="col" class="n" title="Latest result compared with their own baseline">vs own<br>baseline</th><th scope="col" class="n opt">Tests</th></tr></thead><tbody>' + pvtRows + "</tbody></table></div>" +
      '<div class="tblwrap"><table class="rtb"><caption>Circles <span>ranked by best score</span></caption>' +
        '<thead><tr><th scope="col" class="rk">#</th><th scope="col">Astronaut</th><th scope="col" class="n">Best</th><th scope="col" class="n opt">Last</th><th scope="col" class="n">Hits (last)</th><th scope="col" class="n opt">Runs</th></tr></thead><tbody>' + cRows + "</tbody></table></div></div>" +
      '<p class="muted small">People differ in raw speed, so for health the vigilance test compares each astronaut with their own baseline; the scoreboard is for friendly comparison.</p></section>';
  }

  /* ---------- circles ---------- */
  function startCircles() {
    st.phase = "circles"; st.hits = []; st.cmiss = 0; st.strays = 0; st.shown = 0;
    st.el.innerHTML =
      '<div class="rt-run"><div class="rt-meta"><span id="rt-left"></span><span id="rt-count"></span><span class="muted">Esc to stop</span></div>' +
      '<div class="rt-bar"><span id="rt-prog"></span></div>' +
      '<div class="rt-arena" id="rt-arena" aria-label="Circle game area"></div></div>';
    var ar = st.el.querySelector("#rt-arena");
    ar.addEventListener("pointerdown", function (e) {
      if (!st || st.phase !== "circles") return;
      e.preventDefault();
      var c = e.target.closest ? e.target.closest(".rt-dot") : null;
      if (c && st.onset != null) hitCircle(c, e); else { st.strays++; flash(ar, e.offsetX, e.offsetY, "+0.1 s", "stray"); meta(); }
    });
    meta(); nextCircle();
  }
  function meta() {
    var l = st.el.querySelector("#rt-left"), c = st.el.querySelector("#rt-count"), p = st.el.querySelector("#rt-prog");
    if (l) l.textContent = "Circle " + Math.min(st.shown, CIRCLES) + " of " + CIRCLES;
    if (c) c.textContent = st.hits.length + " hit" + (st.hits.length === 1 ? "" : "s") + (st.cmiss ? " · " + st.cmiss + " missed" : "") + (st.strays ? " · " + st.strays + " beside" : "");
    if (p) p.style.width = (st.shown / CIRCLES * 100).toFixed(1) + "%";
  }
  function nextCircle() {
    if (!st) return;
    if (st.shown >= CIRCLES) return finishCircles(false);
    st.onset = null;
    st.ctimer = setTimeout(function () {
      if (!st || st.phase !== "circles") return;
      var ar = st.el.querySelector("#rt-arena"), w = ar.clientWidth, h = ar.clientHeight, pad = 8;
      var x = pad + Math.random() * Math.max(1, w - CIRCLE_D - 2 * pad), y = pad + Math.random() * Math.max(1, h - CIRCLE_D - 2 * pad);
      var d = document.createElement("span");
      d.className = "rt-dot"; d.style.left = x + "px"; d.style.top = y + "px"; d.style.width = d.style.height = CIRCLE_D + "px";
      ar.appendChild(d);
      st.shown++; st.onset = now(); st.dot = d; meta();
      st.ctimer = setTimeout(function () {
        if (!st || st.dot !== d) return;
        st.cmiss++; d.remove(); st.dot = null; flash(ar, x + CIRCLE_D / 2, y + CIRCLE_D / 2, "Missed", "miss"); meta(); nextCircle();
      }, CIRCLE_LIFE);
    }, CIRCLE_GAP[0] + Math.random() * (CIRCLE_GAP[1] - CIRCLE_GAP[0]));
  }
  function hitCircle(c, e) {
    var rt = now() - st.onset, ar = st.el.querySelector("#rt-arena");
    clearTimeout(st.ctimer); st.hits.push(rt); st.onset = null; st.dot = null;
    var x = c.offsetLeft + CIRCLE_D / 2, y = c.offsetTop + CIRCLE_D / 2;
    c.remove(); flash(ar, x, y, Math.round(rt) + " ms", "ok"); meta(); nextCircle();
  }
  function flash(ar, x, y, text, kind) {
    var f = document.createElement("span");
    f.className = "rt-flash " + kind; f.textContent = text; f.style.left = x + "px"; f.style.top = y + "px";
    ar.appendChild(f); setTimeout(function () { f.remove(); }, 650);
  }
  function finishCircles(stopped) {
    clearTimeout(st.ctimer); st.dot = null;
    if (stopped) return intro();
    st.phase = "done";
    var o = st.opts, h = st.hits, sum = h.reduce(function (a, b) { return a + b; }, 0);
    var score = Math.round((sum + CIRCLE_LIFE * st.cmiss + STRAY * st.strays) / CIRCLES);
    var avg = h.length ? Math.round(sum / h.length) : null, fastest = h.length ? Math.round(Math.min.apply(null, h)) : null;
    var res = { mode: "circles", t: Date.now(), score: score, avg: avg, hits: h.length, total: CIRCLES, strays: st.strays };
    var rank = o.rankCircles ? o.rankCircles(score) : null;
    st.el.innerHTML =
      '<h1 id="rt-title">Circles result</h1>' +
      '<div class="rt-result"><span class="big">' + score + '</span><span class="unit">ms per circle</span></div>' +
      (rank ? '<p class="muted">That would be place ' + rank.place + " of " + rank.of + " on the crew scoreboard" + (rank.best ? ", a new personal best." : ".") + "</p>" : "") +
      '<dl class="dstats"><div><dt>Hits</dt><dd>' + h.length + " of " + CIRCLES + '</dd></div><div><dt>Average hit</dt><dd>' + (avg != null ? avg + " ms" : "–") + '</dd></div><div><dt>Fastest</dt><dd>' + (fastest != null ? fastest + " ms" : "–") + '</dd></div><div><dt>Clicks beside</dt><dd>' + st.strays + "</dd></div></dl>" +
      '<p class="muted small">Score = (time of all hits + ' + (CIRCLE_LIFE / 1000) + " s for each missed circle + " + (STRAY / 1000) + " s for each click beside a circle) ÷ " + CIRCLES + ".</p>" +
      '<div class="rt-actions"><button type="button" class="btn" id="rt-save">Save to the scoreboard</button>' +
      '<button type="button" class="btn ghost" id="rt-again">Play again</button><button type="button" class="btn ghost" id="rt-back">Back without saving</button></div>';
    st.el.querySelector("#rt-save").onclick = function () { o.saveCircles(res); intro("Saved to the crew scoreboard."); };
    st.el.querySelector("#rt-again").onclick = startCircles;
    st.el.querySelector("#rt-back").onclick = function () { intro(); };
  }

  function start() {
    st.trials = []; st.falseStarts = 0; st.misses = 0; st.t0 = now(); st.end = st.t0 + st.seconds * 1000;
    st.el.innerHTML =
      '<div class="rt-run"><div class="rt-meta"><span id="rt-left"></span><span id="rt-count"></span><span class="muted">Esc to stop</span></div>' +
      '<div class="rt-bar"><span id="rt-prog"></span></div>' +
      '<div class="rt-box" id="rt-box" role="button" tabindex="0" aria-live="off"><span id="rt-show"></span></div></div>';
    var box = st.el.querySelector("#rt-box");
    box.addEventListener("pointerdown", function (e) { e.preventDefault(); respond(); });
    box.focus();
    tick(); nextTrial();
  }

  function tick() {
    if (!st || !st.end) return;
    var left = Math.max(0, st.end - now());
    var l = st.el.querySelector("#rt-left"), p = st.el.querySelector("#rt-prog"), c = st.el.querySelector("#rt-count");
    if (l) l.textContent = Math.ceil(left / 1000) + " s left";
    if (p) p.style.width = (100 - left / (st.seconds * 10)).toFixed(1) + "%";
    if (c) c.textContent = st.trials.length + " responses";
    if (st.phase === "go") {
      var ms = now() - st.onset;
      st.el.querySelector("#rt-show").textContent = Math.floor(ms);
      if (ms > TIMEOUT) { st.misses++; feedback("Missed", "miss"); return schedule(); }
    }
    st.raf = requestAnimationFrame(tick);
  }
  function schedule() { st.raf = requestAnimationFrame(tick); }

  function nextTrial() {
    if (now() >= st.end) return finish(false);
    st.phase = "wait";
    var box = st.el.querySelector("#rt-box"); box.className = "rt-box wait";
    st.el.querySelector("#rt-show").textContent = "";
    var delay = WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]);
    st.timer = setTimeout(function () {
      if (!st || st.phase !== "wait") return;
      st.phase = "go"; st.onset = now();
      box.className = "rt-box go";
    }, delay);
  }

  function respond() {
    if (!st) return;
    if (st.phase === "wait") { clearTimeout(st.timer); st.falseStarts++; feedback("Too early", "early"); return; }
    if (st.phase !== "go") return;
    var rt = now() - st.onset;
    if (rt < MIN_RT) { st.falseStarts++; feedback("Too early", "early"); return; }
    st.trials.push(rt);
    feedback(Math.round(rt) + " ms", rt > LAPSE ? "slow" : "ok");
  }

  function feedback(text, kind) {
    st.phase = "feedback";
    var box = st.el.querySelector("#rt-box"); box.className = "rt-box fb " + kind;
    st.el.querySelector("#rt-show").textContent = text;
    st.timer = setTimeout(function () { if (st) nextTrial(); }, kind === "early" ? 1000 : 700);
  }

  function finish(stopped) {
    clearTimeout(st.timer); cancelAnimationFrame(st.raf); st.end = 0;
    if (stopped) return intro();
    st.phase = "done";
    var o = st.opts, t = st.trials, enough = t.length >= 5;
    var mean = enough ? t.reduce(function (a, b) { return a + b; }, 0) / t.length : null;
    var lapses = t.filter(function (x) { return x > LAPSE; }).length + st.misses;
    var sorted = t.slice().sort(function (a, b) { return a - b; }), fast = sorted.slice(0, Math.max(1, Math.round(sorted.length / 10)));
    var s = enough ? o.judge(mean) : null, pct = enough ? o.pct(mean) : null;
    var verdict = !enough ? "Not enough responses to give a result. Try again and respond to each counter."
      : s === 0 ? "Within your normal range." : s === 1 ? "Slower than your baseline. Look at how you slept, and avoid demanding tasks after a short night." : "Much slower than your baseline. Ask a crewmate to double-check critical tasks today, plan a recovery sleep, and take the test again tomorrow.";
    var cls = s === 0 ? "ok" : s === 1 ? "watch" : s === 2 ? "act" : "none";
    st.el.innerHTML =
      '<h1 id="rt-title">Your result</h1>' +
      (enough ? '<div class="rt-result"><span class="big">' + Math.round(mean) + '</span><span class="unit">ms average</span><span class="st ' + cls + '">' + esc(o.words[s]) + "</span></div>" +
        (pct != null ? '<p class="muted">' + (pct > 0 ? "+" : "") + F.num(pct, 1) + "% compared with your baseline of " + Math.round(o.baseline) + " ms</p>" : "") : "") +
      '<p class="rt-lead">' + esc(verdict) + "</p>" +
      (enough ? '<dl class="dstats"><div><dt>Median</dt><dd>' + Math.round(median(t)) + ' ms</dd></div><div><dt>Fastest 10%</dt><dd>' + Math.round(fast.reduce(function (a, b) { return a + b; }, 0) / fast.length) + ' ms</dd></div><div><dt>Lapses (over 0.5 s)</dt><dd>' + lapses + '</dd></div><div><dt>False starts</dt><dd>' + st.falseStarts + "</dd></div></dl>" +
        '<p class="muted small">' + t.length + " responses in " + (st.seconds / 60) + " minute" + (st.seconds > 60 ? "s" : "") + ". Lapses and false starts both go up with fatigue.</p>" : "") +
      '<div class="rt-actions">' + (enough ? '<button type="button" class="btn" id="rt-save">Save result</button>' : "") +
      '<button type="button" class="btn ghost" id="rt-again">Run again</button><a class="btn ghost" href="#">Back without saving</a></div>';
    var sv = st.el.querySelector("#rt-save");
    if (sv) sv.onclick = function () { var v = mean; R.stop(); o.save(v); };
    st.el.querySelector("#rt-again").onclick = start;
  }
})(window);
