/* Wellbeing page (#wellbeing): daily check-in (mood, crew connection, feelings), a private journal,
 * and connection with the crew. Mood and crew connection are saved as normal measurements; the journal and
 * shared moments stay in this browser only (never in reports, exports or the AI summary). */
(function (g) {
  var H = g.Halo, W = H.wellbeing = {}, F = H.fmt, esc = F.esc, C = H.charts, DAY = 864e5;
  var o = null, el = null, journal = [], moments = [], loaded = false;
  var pick = { mood: null, conn: null, tags: {} };

  var FEELINGS = ["Calm", "Focused", "Motivated", "Grateful", "Tired", "Stressed", "Anxious", "Irritable", "Homesick", "Lonely"];
  var PROMPTS = ["What went well today?", "What is on your mind right now?", "What are you looking forward to?", "Who helped you today, or who did you help?", "What would make tomorrow a little better?"];
  var MOMENTS = [
    { id: "meal", label: "Shared a meal" }, { id: "game", label: "Game or film together" }, { id: "talk", label: "Good conversation" },
    { id: "workout", label: "Exercised together" }, { id: "help", label: "Helped someone" }, { id: "home", label: "Called home" }, { id: "conflict", label: "Had a conflict" }
  ];
  var IDEAS = ["Eat one meal a day together, away from screens.", "Plan a film or game night for the crew.", "Ask a crewmate how their day really went.", "Thank someone for something specific.", "Record a message for family or friends."];

  /* opts: { save(key, value), latest(key), between(key, a, b), anchor(), metric(key), judge(key, v), words, load(key), store(key, value) } */
  W.mount = function (target, opts) {
    o = opts; el = target;
    if (!loaded) {
      Promise.all([o.load("journal"), o.load("moments")]).then(function (r) { journal = r[0] || []; moments = r[1] || []; loaded = true; render(); });
    }
    render();
  };

  function scaleButtons(name, labels, current) {
    return '<div class="scale" role="radiogroup" data-scale="' + name + '">' + labels.map(function (l, i) {
      return '<button type="button" role="radio" aria-checked="' + (current === i + 1) + '" data-v="' + (i + 1) + '"><b>' + (i + 1) + "</b>" + esc(l) + "</button>";
    }).join("") + "</div>";
  }

  function render() {
    if (!el) return;
    var at = o.anchor(), mm = o.metric("mood"), cm = o.metric("crew_connection");
    var lastMood = o.latest("mood"), lastConn = o.latest("crew_connection");
    var doneToday = lastMood && Math.floor(lastMood.t / DAY) === Math.floor(at / DAY);
    var week = moments.filter(function (x) { return x.t > at - 7 * DAY; });
    var positive = week.filter(function (x) { return x.type !== "conflict"; }).length;

    var html = '<h1>Wellbeing</h1>' +
      '<p class="rt-lead">A long mission is hard on the mind as well as the body. Check in once a day, write things down when you want to, and keep an eye on how connected you feel with the crew.</p>';

    /* ---- daily check-in ---- */
    html += '<section class="wb-card"><div class="wb-head"><h2>Daily check-in</h2><span class="muted">' +
      (doneToday ? "Done today at " + F.time(lastMood.t) + " UTC" : lastMood ? "Last check-in " + esc(F.stamp(lastMood.t, at)) : "No check-in yet") + "</span></div>" +
      '<div class="wb-q"><h3>How is your mood today?</h3>' + scaleButtons("mood", mm.input.scale, pick.mood) + "</div>" +
      '<div class="wb-q"><h3>How connected do you feel with the crew?</h3>' + scaleButtons("conn", cm.input.scale, pick.conn) + "</div>" +
      '<div class="wb-q"><h3>Which words fit today? <span class="muted">Optional</span></h3><div class="chips">' +
      FEELINGS.map(function (f) { return '<button type="button" class="chip" aria-pressed="' + !!pick.tags[f] + '" data-tag="' + f + '">' + f + "</button>"; }).join("") + "</div></div>" +
      '<div class="wb-q"><h3>Anything to add? <span class="muted">Optional, goes into your private journal</span></h3><textarea id="wb-note" rows="2" placeholder="A line or two is enough."></textarea></div>' +
      '<div class="row"><button type="button" class="btn" id="wb-save">Save check-in</button><span class="msg" id="wb-msg" role="status"></span></div>' +
      '<div id="wb-advice"></div></section>';

    /* ---- journal ---- */
    html += '<section class="wb-card"><div class="wb-head"><h2>Journal</h2><span class="muted">Private: stays on this device. Not in reports, exports or the AI summary.</span></div>' +
      '<div class="chips prompts">' + PROMPTS.map(function (p) { return '<button type="button" class="chip ghost" data-prompt="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") + "</div>" +
      '<textarea id="wb-journal" rows="5" placeholder="Write anything. Nobody else reads this."></textarea>' +
      '<div class="row"><button type="button" class="btn" id="wb-jsave">Save entry</button><span class="msg" id="wb-jmsg" role="status"></span></div>' +
      '<ul class="wb-entries">' + (journal.length ? journal.slice().reverse().slice(0, 30).map(function (e) {
        return '<li><div class="wb-emeta"><strong>' + esc(F.stamp(e.t, at)) + " UTC</strong>" +
          (e.mood ? '<span class="tag">Mood ' + e.mood + "/5</span>" : "") + (e.conn ? '<span class="tag">Crew ' + e.conn + "/5</span>" : "") +
          (e.tags || []).map(function (t) { return '<span class="tag soft">' + esc(t) + "</span>"; }).join("") +
          '<button type="button" class="lnk del" data-del="' + e.t + '">Delete</button></div>' + (e.text ? "<p>" + esc(e.text) + "</p>" : "") + "</li>";
      }).join("") : '<li class="muted">No entries yet.</li>') + "</ul></section>";

    /* ---- connection with the crew ---- */
    var days = [];
    for (var d = 6; d >= 0; d--) {
      var ds = (Math.floor(at / DAY) - d) * DAY, n = moments.filter(function (x) { return x.t >= ds && x.t < ds + DAY && x.type !== "conflict"; }).length;
      days.push({ t: ds, n: n });
    }
    var maxN = Math.max(3, Math.max.apply(null, days.map(function (x) { return x.n; })));
    html += '<section class="wb-card"><div class="wb-head"><h2>Connection with the crew</h2><span class="muted">' + positive + " shared moment" + (positive === 1 ? "" : "s") + " in the last 7 days</span></div>" +
      '<p class="muted">Tap when something happens. Small moments count.</p>' +
      '<div class="chips">' + MOMENTS.map(function (m) { return '<button type="button" class="chip' + (m.id === "conflict" ? " warn" : "") + '" data-moment="' + m.id + '">+ ' + esc(m.label) + "</button>"; }).join("") + "</div>" +
      '<div class="wb-bars" aria-label="Shared moments per day, last 7 days">' + days.map(function (x) {
        return '<div class="wb-bar"><span style="height:' + Math.round(x.n / maxN * 100) + '%"></span><small>' + esc(F.wdate(x.t).split(" ")[0]) + "</small><b>" + x.n + "</b></div>";
      }).join("") + "</div>" +
      (positive < 3 ? '<div class="wb-ideas"><h3>Ideas for this week</h3><ul>' + IDEAS.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>" : "") +
      (week.length ? '<ul class="wb-moments">' + week.slice().reverse().slice(0, 8).map(function (x) {
        var m = MOMENTS.filter(function (y) { return y.id === x.type; })[0];
        return "<li>" + esc(m ? m.label : x.type) + ' <span class="muted">' + esc(F.stamp(x.t, at)) + '</span><button type="button" class="lnk del" data-undo="' + x.t + '">Remove</button></li>';
      }).join("") + "</ul>" : "") + "</section>";

    /* ---- trends ---- */
    html += '<section class="wb-card"><div class="wb-head"><h2>Last 30 days</h2></div><div class="wb-trends">' +
      ["mood", "crew_connection", "sleep_hours"].map(function (k) {
        var m = o.metric(k), l = o.latest(k);
        return '<div class="wb-trend"><div class="lhead"><span class="lname">' + esc(m.label) + '</span>' + (l ? '<span class="st ' + ["ok", "watch", "act"][o.judge(k, l.v)] + '">' + esc(o.words[o.judge(k, l.v)]) + "</span>" : "") + "</div>" +
          '<span class="lval"><span class="big">' + (l ? F.num(l.v, m.decimals) : "–") + '</span><span class="unit">' + esc(m.unit) + '</span></span><svg class="pchart" data-wbchart="' + k + '"></svg></div>';
      }).join("") + "</div></section>";

    el.innerHTML = html;
    el.querySelectorAll("svg[data-wbchart]").forEach(function (svg) {
      var k = svg.getAttribute("data-wbchart"), m = o.metric(k), r = o.between(k, at - 30 * DAY, at);
      if (!r.t.length) return;
      C.points(svg, { w: svg.parentNode.clientWidth - 32, h: 70, a: at - 30 * DAY, b: at, pts: r.t.map(function (t, i) { return { t: t, v: r.v[i], s: o.judge(k, r.v[i]) }; }), normal: m.range.normal, axis: m.range.axis, ticks: false, rangeId: "month", r: 2.5 });
    });
    wire();
  }

  function wire() {
    el.querySelectorAll("[data-scale]").forEach(function (grp) {
      grp.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var v = +b.getAttribute("data-v"); if (grp.getAttribute("data-scale") === "mood") pick.mood = v; else pick.conn = v;
          grp.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
        };
      });
    });
    el.querySelectorAll("[data-tag]").forEach(function (b) {
      b.onclick = function () { var t = b.getAttribute("data-tag"); pick.tags[t] = !pick.tags[t]; b.setAttribute("aria-pressed", String(!!pick.tags[t])); };
    });
    el.querySelector("#wb-save").onclick = function () {
      var msg = el.querySelector("#wb-msg");
      if (!pick.mood || !pick.conn) { msg.className = "msg err"; msg.textContent = "Pick a number for both questions."; return; }
      var note = el.querySelector("#wb-note").value.trim(), tags = Object.keys(pick.tags).filter(function (k) { return pick.tags[k]; });
      o.save("mood", pick.mood); o.save("crew_connection", pick.conn);
      if (note || tags.length) { journal.push({ t: Date.now(), text: note, mood: pick.mood, conn: pick.conn, tags: tags }); o.store("journal", journal); }
      var low = pick.mood <= 2 || pick.conn <= 2, adv = "";
      if (low) {
        var m = pick.mood <= 2 ? o.metric("mood") : o.metric("crew_connection");
        adv = '<div class="todo-now watch"><h4>Thank you for being honest</h4><p>' + esc(m.watch) + "</p>" + (m.call ? "<p><strong>Get the Crew Medical Officer straight away if:</strong> " + esc(m.call) + "</p>" : "") + "</div>";
      }
      pick = { mood: null, conn: null, tags: {} };
      render();
      var msg2 = el.querySelector("#wb-msg"); msg2.className = "msg good"; msg2.textContent = "Check-in saved.";
      el.querySelector("#wb-advice").innerHTML = adv;
    };
    el.querySelectorAll("[data-prompt]").forEach(function (b) {
      b.onclick = function () { var ta = el.querySelector("#wb-journal"); ta.value = (ta.value ? ta.value + "\n\n" : "") + b.getAttribute("data-prompt") + "\n"; ta.focus(); };
    });
    el.querySelector("#wb-jsave").onclick = function () {
      var ta = el.querySelector("#wb-journal"), text = ta.value.trim();
      if (!text) { var m0 = el.querySelector("#wb-jmsg"); m0.className = "msg err"; m0.textContent = "Write something first."; return; }
      journal.push({ t: Date.now(), text: text }); o.store("journal", journal); render();
      var m1 = el.querySelector("#wb-jmsg"); m1.className = "msg good"; m1.textContent = "Saved to your journal.";
    };
    el.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute("data-arm") !== "1") { b.setAttribute("data-arm", "1"); b.textContent = "Click again to delete"; return; }
        var t = +b.getAttribute("data-del"); journal = journal.filter(function (e) { return e.t !== t; }); o.store("journal", journal); render();
      };
    });
    el.querySelectorAll("[data-moment]").forEach(function (b) {
      b.onclick = function () { moments.push({ t: Date.now(), type: b.getAttribute("data-moment") }); o.store("moments", moments); render(); };
    });
    el.querySelectorAll("[data-undo]").forEach(function (b) {
      b.onclick = function () { var t = +b.getAttribute("data-undo"); moments = moments.filter(function (x) { return x.t !== t; }); o.store("moments", moments); render(); };
    });
  }
})(window);
