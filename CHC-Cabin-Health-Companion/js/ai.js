/* AI summary card (not a chatbot). Runs entirely in the browser: no Python, no server. English only.
 *
 * Runs by itself after every new measurement (app.js calls Halo.ai.schedule() from saveReading), debounced 400 ms;
 * an older answer that arrives after a newer request is thrown away.
 *
 * Two columns. Left: urgency level, a summary whose tone follows it (relaxed when all is normal, matter-of-fact for
 * Watch, firm for Act now, blunt and urgent in an emergency) and up to 3 possible causes with the numbers behind them.
 * Right: numbered steps to take now (survival steps in an emergency) and up to 3 suggested tests, each with why.
 * Statuses, urgency, the ranked causes, the steps and the reasons for tests all come from code (status.js,
 * diagnose.js). A model only words the summary and explains the causes: it cannot add causes, steps or numbers.
 *
 * Providers, tried in order:
 *   1. Chrome's built-in on-device model (Prompt API, Gemini Nano) - no install on supported PCs
 *   2. Ollama on this computer (http://127.0.0.1:11434), called directly from the page
 *   3. Offline assistant written in JavaScript - always works
 * A model's answer is checked here: unknown causes and suggestions are dropped, numbers that are not in the data
 * get a warning, and an answer that ignores a flagged item is rejected (the offline assistant is used instead). */
(function (g) {
  var H = g.Halo, A = H.ai = {}, F = H.fmt, esc = F.esc, X = H.diagnose;
  var AI = Object.assign({ ollamaUrl: "http://127.0.0.1:11434", ollamaModel: "llama3.2:3b", chromeAI: true, ollama: true }, (g.HALO_CONFIG || {}).ai || {});
  var o = null, timer = null, reqId = 0, busy = false, last = null, lastPayload = null, caps = null, capsAt = 0, dl = null;

  var T = { title: "AI summary", rerun: "Re-run", writing: "Writing the summary…", next: "Suggested tests", log: "Log", test: "Take the test", checkin: "Daily check-in",
    foot: "Statuses, urgency, possible causes, steps and reasons for tests come from the app's own rules; the AI only puts them into words and cannot change them. Possible causes are not a diagnosis: the Crew Medical Officer decides on treatment.",
    rules: "Offline assistant (no model)", chrome: "Chrome on-device AI", none: "Waiting for data…", rejected: "Skipped: ", how: "AI providers",
    enable: "Turn on Chrome's on-device AI", enabling: "Downloading the on-device model… ",
    tier: { watch: "Keep an eye on it", act: "Act now", emergency: "Emergency: act immediately" },
    doNow: "Do this now", doWatch: "What to do", causes: "What could be causing it", toCheck: "To check: ",
    fit: { likely: "Most likely", possible: "Possible", less: "Less likely" },
    simOn: "Simulation: ", simNot: ". These are not real values.", simulate: "Simulate a situation", nothingToDo: "Nothing to do now. Keep up the usual routine and the planned checks." };

  /* opts: { el, collect() -> payload, metric(key) -> config entry } */
  A.init = function (opts) { o = opts; render(); };
  A.schedule = function () { clearTimeout(timer); timer = setTimeout(run, 400); };
  A.run = function () { clearTimeout(timer); run(); };

  /* ---------------- what is available on this computer ---------------- */
  function withTimeout(ms) { var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal; }
  function detect(force) {
    if (caps && !force && Date.now() - capsAt < 60e3) return Promise.resolve(caps);
    var chrome = Promise.resolve("none");
    if (AI.chromeAI && "LanguageModel" in g) {
      chrome = g.LanguageModel.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] })
        .catch(function () { return "unavailable"; });
    }
    var ollama = !AI.ollama ? Promise.resolve({ ok: false, why: "off" }) : fetch(AI.ollamaUrl + "/api/tags", { signal: withTimeout(900) })
      .then(function (r) { if (r.status === 403) return { ok: false, why: "blocked" }; return r.json().then(function (j) {
        var names = (j.models || []).map(function (m) { return m.name; }), want = AI.ollamaModel.indexOf(":") > 0 ? AI.ollamaModel : AI.ollamaModel + ":latest";
        return names.indexOf(want) >= 0 || names.indexOf(AI.ollamaModel) >= 0 ? { ok: true } : { ok: false, why: "model" };
      }); })
      .catch(function () { return { ok: false, why: "offline" }; });
    return Promise.all([chrome, ollama]).then(function (r) { caps = { chrome: r[0], ollama: r[1] }; capsAt = Date.now(); return caps; });
  }

  /* ---------------- prompt ---------------- */
  var SCHEMA = { type: "object", properties: {
    summary: { type: "string" },
    causes: { type: "array", maxItems: 3, items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] } },
    recommend: { type: "array", maxItems: 3, items: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } }
  }, required: ["summary", "causes", "recommend"] };
  var TONE = {
    calm: "Tone: relaxed and reassuring. 2 short sentences. Return no causes.",
    watch: "Tone: calm and practical, like a crewmate. 2 or 3 sentences. Name the possible cause that fits best and say it is worth keeping an eye on.",
    act: "Tone: firm and direct. Start with the problem and its number. Short sentences. Say this needs action now and point to the steps on screen. No reassurance.",
    emergency: "Tone: alarm. Begin with the word 'Emergency.'. Very short imperative sentences, at most 4. Say plainly that the value is dangerous and can become life-threatening, and that they must act right now: follow the numbered steps on screen and alert the crew. No hedging, no reassurance, no politeness."
  };
  function evidenceText(e) { return e.label + " " + e.display + (e.unit ? " " + e.unit : "") + " (" + e.dir + ")"; }
  function prompt(p, dx) {
    var system = "You write the AI summary card for an astronaut on a 30-day transit to Mars. You are not a doctor. " +
      "The app has already decided every status (Normal, Watch, Act now), the urgency, a ranked list of possible causes and the steps to take. Your job is to put this into words for the astronaut. " +
      "Use ONLY the data in the user message. Never change, soften or contradict a status or the urgency, and never call a Watch or Act now item normal. " +
      "Write in English. Mention every item with status Act now or Watch by name (items with 'covered_by' are part of that item and need not be named separately). " +
      TONE[dx.tier] + " " +
      "For 'causes', write one sentence per cause explaining which of the measured values point to it. Use only ids from 'possible_causes', at most 3; you may change their order if the data fits another one better. Never invent a cause, a treatment, a step or a number: only use numbers that appear in the data. " +
      "If anything is Watch or Act now, pick up to 3 tests from 'allowed'. If everything is Normal, pick none. " +
      'Answer with JSON only: {"summary": "...", "causes": [{"id": "...", "why": "..."}], "recommend": [{"key": "..."}]}';
    var user = JSON.stringify({
      mission_day: p.mission && p.mission.day,
      urgency: { calm: "all normal", watch: "watch", act: "act now", emergency: "EMERGENCY" }[dx.tier],
      dangerous_values: dx.emergency.map(evidenceText),
      indicators: p.metrics.map(function (m) {
        var x = { key: m.key, label: m.label, status: m.status, value: m.display, unit: m.unit };
        if (m.direction) x.direction = m.direction;
        if (m.pct_from_baseline != null) x.pct_from_baseline = m.pct_from_baseline;
        if (m.during_exercise) x.during_exercise = true;
        if (m.covered_by) x.covered_by = m.covered_by;
        if (m.call) x.call = m.call;
        return x;
      }),
      possible_causes: dx.causes.map(function (c) { return { id: c.id, name: c.name, fit: c.fit, evidence: c.evidence.map(evidenceText), background: c.about }; }),
      steps_on_screen: dx.steps,
      allowed: p.allowed.map(function (a) { return { key: a.key, label: a.label, because: a.because }; })
    });
    return { system: system, user: user };
  }

  /* ---------------- providers ---------------- */
  function askChrome(p, dx) {
    var pr = prompt(p, dx);
    return g.LanguageModel.create({ initialPrompts: [{ role: "system", content: pr.system }], expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] })
      .then(function (session) {
        return session.prompt(pr.user, { responseConstraint: SCHEMA }).then(function (text) { try { session.destroy(); } catch (e) { /* ignore */ } return text; });
      });
  }
  function askOllama(p, dx) {
    var pr = prompt(p, dx);
    return fetch(AI.ollamaUrl + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: withTimeout(120e3),
      body: JSON.stringify({ model: AI.ollamaModel, stream: false, format: "json", options: { temperature: 0.2 }, messages: [{ role: "system", content: pr.system }, { role: "user", content: pr.user }] })
    }).then(function (r) { if (!r.ok) throw new Error("Ollama answered " + r.status); return r.json(); })
      .then(function (j) { return (j.message && j.message.content) || ""; });
  }

  /* ---------------- checking a model's answer ---------------- */
  function lc(s) { return String(s).toLowerCase().replace(/\bph\b/g, "pH"); }
  /* split into sentences at . ! ? followed by a space and a capital letter, so "5.7 h" stays whole */
  function sentences(text, n) { return text.trim().split(/(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ„"])/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, n).join(" "); }
  function numbersIn(obj) {
    var set = []; (JSON.stringify(obj).match(/-?\d+(?:[.,]\d+)?/g) || []).forEach(function (t) { set.push(parseFloat(t.replace(",", "."))); }); return set;
  }
  function mentionsFlagged(summary, p) {
    var flagged = p.metrics.filter(function (m) { return (m.status === "Watch" || m.status === "Act now") && !m.covered_by; });
    if (!flagged.length) return true;
    var low = summary.toLowerCase();
    return flagged.some(function (m) {
      return [m.label].some(function (name) {
        var n = name.toLowerCase(), stems = [n].concat(n.split(/\s+/).filter(function (w) { return w.length >= 4; }).map(function (w) { return w.slice(0, Math.max(4, w.length - 2)); }));
        return stems.some(function (st) { return low.indexOf(st) >= 0; });
      });
    });
  }
  var MAX_SENT = { calm: 2, watch: 3, act: 3, emergency: 4 };
  function numberWarnings(text, known) {
    var w = [];
    (text.match(/(?:^|[^\w.])(-?\d+(?:[.,]\d+)?)/g) || []).forEach(function (tok) {
      var t = tok.replace(/^[^\d-]+/, ""), x = parseFloat(t.replace(",", "."));
      if (Math.abs(x) <= 10 && x === Math.round(x)) return;
      if (known.some(function (k) { return Math.abs(x - k) <= Math.max(0.051, Math.abs(k) * 0.01); })) return;
      w.push("The text mentions " + t + ", which is not in the measured data. Check it before relying on it.");
    });
    return w;
  }
  function validate(raw, p, dx) {
    var obj = raw;
    if (typeof raw === "string") { var m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON in the answer"); obj = JSON.parse(m[0]); }
    if (!obj || typeof obj.summary !== "string" || obj.summary.trim().length < 20) throw new Error("summary missing or too short");
    var summary = sentences(obj.summary, MAX_SENT[dx.tier]).slice(0, 700);
    if (!mentionsFlagged(summary, p)) throw new Error("the summary does not mention the items the app flagged");
    if (dx.tier === "emergency" && !/^emergency/i.test(summary)) summary = "Emergency. " + summary; /* the alarm word is not left to the model */
    var allowed = {}; p.allowed.forEach(function (a) { allowed[a.key] = a; });
    var flaggedAny = p.metrics.some(function (x) { return x.status === "Watch" || x.status === "Act now"; });
    var rec = [], seen = {}, warnings = [];
    (Array.isArray(obj.recommend) ? obj.recommend : []).forEach(function (it) {
      var key = typeof it === "string" ? it : it && it.key;
      if (typeof key !== "string") return;
      key = key.trim();
      if (!allowed[key]) { warnings.push("Dropped a suggestion that is not an allowed follow-up: " + key); return; }
      if (seen[key] || !flaggedAny || rec.length >= 3) return;
      seen[key] = 1; rec.push({ key: key });
    });
    /* causes: only the ones the app found; the model may explain and re-order them */
    var known = numbersIn(p), byId = {}, causes = [], cseen = {};
    dx.causes.forEach(function (c) { byId[c.id] = c; });
    (Array.isArray(obj.causes) ? obj.causes : []).forEach(function (it) {
      var id = it && typeof it.id === "string" ? it.id.trim() : "";
      if (!byId[id]) { if (id) warnings.push("Dropped a cause the app did not find: " + id); return; }
      if (cseen[id] || causes.length >= 3) return;
      cseen[id] = 1;
      var why = typeof it.why === "string" ? sentences(it.why, 2).slice(0, 260) : "";
      warnings = warnings.concat(numberWarnings(why, known));
      causes.push({ id: id, why: why });
    });
    dx.causes.forEach(function (c) { if (!cseen[c.id] && causes.length < 3) causes.push({ id: c.id, why: "" }); });
    warnings = warnings.concat(numberWarnings(summary, known));
    return { summary: summary, causes: causes, recommend: rec, warnings: warnings };
  }

  /* ---------------- offline assistant: a written assessment without any model ---------------- */
  function rules(p, dx) {
    var ms = p.metrics;
    var flagged = ms.filter(function (m) { return (m.status === "Act now" || m.status === "Watch") && !m.covered_by; })
      .sort(function (a, b) { return (b.status === "Act now") - (a.status === "Act now") || (b.streak || 0) - (a.streak || 0); });
    var judged = ms.filter(function (m) { return m.status === "Normal" || m.status === "Watch" || m.status === "Act now"; });
    var covered = ms.filter(function (m) { return m.covered_by && (m.status === "Watch" || m.status === "Act now"); });
    function val(m) { return !m.display || m.display === "–" ? "" : (String(m.display) + (m.unit ? " " + m.unit : "")).trim(); }
    function name(m) { return lc(m.label); }
    function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
    var UNIT_DAY = { day: ["day", "days"], "3days": ["check", "checks"], week: ["week", "weeks"], "2weeks": ["test", "tests"], month: ["month", "months"] };
    /* one item described in words: value, how long, compared with baseline */
    function describe(m) {
      var v = val(m), dir = m.direction === "low" ? "below" : "above";
      if (m.pct_from_baseline != null) {
        var pct = Math.abs(m.pct_from_baseline).toFixed(1), up = m.pct_from_baseline > 0, time = m.unit === "ms";
        return name(m) + be(m) + pct + "% " + (time ? (up ? "slower than" : "faster than") : (up ? "above" : "below")) + " your baseline (" + v + ")";
      }
      if (m.streak >= 2 && UNIT_DAY[m.every]) return name(m) + (/(cells|minutes|hours)$/i.test(m.label) ? " have been " : " has been ") + dir + (be(m) === " are " ? " their" : " its") + " normal range for " + m.streak + " " + UNIT_DAY[m.every][1] + " in a row (" + v + ")";
      return v ? name(m) + be(m) + dir + (be(m) === " are " ? " their" : " its") + " normal range (" + v + ")" : name(m);
    }
    function be(m) { return /(cells|minutes|hours)$/i.test(m.label || "") ? " are " : " is "; }
    function list(items) {
      var parts = items.map(function (x) { return typeof x === "string" ? x : name(x); });
      return parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
    }
    var lead = flagged[0];
    /* when action is needed, lead with the Act now result that triggers the most likely cause (e.g. the blood count, not the dose) */
    if (dx.tier === "act" && dx.causes[0]) {
      var lk = dx.causes[0].keys.filter(function (k) { return flagged.some(function (m) { return m.key === k && m.status === "Act now"; }); })[0];
      if (lk) lead = flagged.filter(function (m) { return m.key === lk; })[0];
    }
    /* the cause named in the summary: in an emergency the one behind the dangerous value, else the best one that explains the leading item */
    var cause = (dx.tier === "emergency" && dx.causes.filter(function (c) { return c.urgentHit; })[0]) ||
      (lead && dx.causes.filter(function (c) { return c.keys.indexOf(lead.key) >= 0; })[0]) || dx.causes[0];
    var causeName = cause ? cause.name.charAt(0).toLowerCase() + cause.name.slice(1) : "";
    var s = [];
    if (dx.tier === "emergency") {
      /* blunt: what is dangerous, that it can kill, and that the steps come first */
      s.push("Emergency.");
      if (dx.emergency.length) {
        var byKey = {}; ms.forEach(function (m) { byKey[m.key] = m; });
        s.push(cap(dx.emergency.slice(0, 2).map(function (e) { var m = byKey[e.key]; return name(m) + be(m) + val(m) + ", dangerously " + e.dir; }).join(" and ")) + ".");
      } else {
        var acts = flagged.filter(function (m) { return m.status === "Act now"; });
        s.push(acts.length + " results are in the Act now zone at the same time: " + list(acts) + ".");
      }
      s.push("This can become life-threatening. Stop what you are doing and follow the numbered steps now.");
      if (cause) s.push("Most likely cause: " + causeName + ".");
    } else if (dx.tier === "act") {
      s.push("This needs your attention now.");
      s.push(cap(describe(lead)) + ".");
      s.push(cause ? "The most likely cause is " + causeName + ", so follow the numbered steps now." : "Follow the numbered steps now.");
      var restA = flagged.filter(function (m) { return m !== lead; }), shown = restA.slice(0, 3).map(name), more = restA.length - shown.length;
      if (more > 0) shown.push(more + " more");
      if (restA.length) s.push("Also out of range: " + list(shown) + ".");
    } else if (dx.tier === "watch") {
      var normal = judged.length - flagged.length - covered.length;
      s.push("Mostly steady: " + normal + " of " + judged.length + " indicators are normal.");
      var rel = flagged.filter(function (m) { return m !== lead; }).filter(function (m) { return (lead.related || []).indexOf(m.key) >= 0 || (m.related || []).indexOf(lead.key) >= 0; })[0];
      s.push(cap(describe(lead)) + (rel ? ", and " + describe(rel) + ", which often goes with it." : "."));
      var rest = flagged.filter(function (m) { return m !== lead; }).filter(function (m) { return m !== rel; });
      var restTxt = rest.length ? " " + cap(list(rest)) + (rest.length > 1 ? " are" : " is") + " also worth watching." : "";
      if (cause) s.push("The likeliest reason is " + causeName + ": nothing urgent, but worth keeping an eye on." + restTxt);
      else if (restTxt) s.push(restTxt.trim());
    } else {
      s.push("All " + judged.length + " measured indicators are within their normal ranges.");
      if (p.due && p.due.length) s.push(p.due.length + (p.due.length === 1 ? " check is" : " checks are") + " still due, starting with " + lc(p.due[0].label) + ".");
      else s.push("Keep up the usual routine.");
    }
    var rec = flagged.length ? p.allowed.slice(0, 3).map(function (a) { return { key: a.key }; }) : [];
    return { summary: s.join(" "), causes: dx.causes.map(function (c) { return { id: c.id, why: "" }; }), recommend: rec, warnings: [] };
  }

  /* ---------------- run ---------------- */
  function run() {
    if (!o) return;
    var id = ++reqId, t0 = performance.now(), p = o.collect(), dx = X.assess(p);
    lastPayload = p; busy = true; render();
    detect().then(function (c) {
      var order = [], notes = [];
      if (c.chrome === "available") order.push("chrome");
      if (c.ollama.ok) order.push("ollama");
      order.push("rules");
      function attempt(i) {
        var name = order[i];
        var job = name === "chrome" ? askChrome(p, dx).then(function (t) { return validate(t, p, dx); })
          : name === "ollama" ? askOllama(p, dx).then(function (t) { return validate(t, p, dx); })
          : Promise.resolve(rules(p, dx));
        return job.then(function (res) { return Object.assign(res, { provider: name, notes: notes }); }, function (e) {
          notes.push((name === "chrome" ? "Chrome AI" : "Ollama") + ": " + (e && e.message || e));
          return attempt(i + 1);
        });
      }
      return attempt(0);
    }).then(function (res) {
      if (id !== reqId) return; /* a newer request is on its way: drop this one */
      res.ms = Math.round(performance.now() - t0); res.dx = dx; res.payload = p;
      busy = false; last = res; render();
    }).catch(function (e) { if (id !== reqId) return; busy = false; last = { error: String(e && e.message || e) }; render(); });
  }

  function providerName(r) {
    if (r.provider === "chrome") return T.chrome;
    if (r.provider === "ollama") return "Ollama · " + AI.ollamaModel;
    return T.rules;
  }

  function capsText() {
    if (!caps) return "";
    var ch = caps.chrome, ol = caps.ollama;
    var chTxt = ch === "available" ? "ready" : ch === "downloadable" ? "can be turned on (one-time download)" : ch === "downloading" ? "downloading"
      : ch === "none" ? "not in this browser (needs desktop Chrome 148 or newer)" : "not supported on this computer";
    var olTxt = ol.ok ? "found, " + AI.ollamaModel
      : ol.why === "model" ? "running, but the model is missing: run  ollama pull " + AI.ollamaModel
      : ol.why === "blocked" ? "running, but blocks this page: set OLLAMA_ORIGINS=* and restart Ollama"
      : "not reachable at " + AI.ollamaUrl + ". If it is running, set OLLAMA_ORIGINS=* and restart it so this page may use it.";
    return '<details class="ai-caps"><summary>' + T.how + "</summary><ul>" +
      "<li><strong>" + T.chrome + ":</strong> " + esc(chTxt) + "</li>" +
      "<li><strong>Ollama:</strong> " + esc(olTxt) + "</li>" +
      "<li><strong>" + T.rules + ":</strong> always available, also offline</li></ul>" +
      "<p>Everything runs on this computer. No data leaves the device, and the app needs no internet.</p></details>";
  }

  var WORDS = { sleep_hours: { low: "short" }, reaction_time: { high: "slower than usual" }, body_mass: { low: "dropping" }, urine_volume: { low: "low" }, exercise_min: { low: "short" } };
  /* suggested tests: allowed follow-ups only, max 3, none when everything is normal. Each with why, from code */
  function suggestions(r, p) {
    if (!r.recommend || !p.metrics.some(function (m) { return m.status === "Watch" || m.status === "Act now"; })) return [];
    var allowed = {}; p.allowed.forEach(function (a) { allowed[a.key] = a; });
    var seen = {};
    return r.recommend.filter(function (x) { if (!allowed[x.key] || seen[x.key]) return false; seen[x.key] = 1; return true; }).slice(0, 3).map(function (x) {
      var a = allowed[x.key], purpose = X.TEST_PURPOSE[x.key];
      var word = (WORDS[a.because_key] || {})[a.because_dir] || (a.because_dir === "low" ? "low" : a.because_dir === "high" ? "high" : "out of range");
      var because = "Your " + a.because.toLowerCase().replace(/\bph\b/g, "pH") + (/(cells|minutes|hours)$/i.test(a.because) ? " are " : " is ") + word;
      return { key: x.key, why: purpose ? because + ": " + purpose + "." : because + ". " + a.why };
    });
  }

  function stepsHtml(dx) {
    if (!dx.steps.length) return dx.tier === "calm" ? '<h4 class="ai-sub">' + T.doWatch + '</h4><p class="ai-calm">' + T.nothingToDo + "</p>" : "";
    var now = dx.tier === "act" || dx.tier === "emergency";
    return '<h4 class="ai-sub">' + (now ? T.doNow : T.doWatch) + '</h4><ol class="ai-steps">' + dx.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>";
  }
  function causesHtml(dx, r) {
    var byId = {}; dx.causes.forEach(function (c) { byId[c.id] = c; });
    var list = (r.causes || []).filter(function (x) { return byId[x.id]; });
    if (!list.length) return "";
    return '<h4 class="ai-sub">' + T.causes + '</h4><ol class="ai-causes">' + list.map(function (x, i) {
      var c = byId[x.id], fit = i === 0 ? c.fit : (c.fit === "likely" ? "possible" : c.fit);
      var ev = c.evidence.map(function (e) {
        return '<span class="ev ' + (e.status === "Act now" ? "act" : "watch") + '">' + esc(e.label + " " + e.display + (e.unit ? " " + e.unit : "")) + (e.dir === "low" ? " ↓" : " ↑") + "</span>";
      }).join("");
      return '<li><div class="c-head"><strong>' + esc(c.name) + '</strong><span class="fit fit-' + fit + '">' + T.fit[fit] + "</span></div>" +
        '<div class="c-ev">' + ev + "</div><p>" + esc(x.why || c.about) + '</p><p class="c-check">' + T.toCheck + esc(c.confirm) + "</p></li>";
    }).join("") + "</ol>";
  }
  function testsHtml(r, p) {
    var rec = r.dx.tier === "emergency" ? [] : suggestions(r, p); /* in an emergency only the steps matter */
    if (!rec.length) return "";
    return '<h4 class="ai-sub">' + T.next + '</h4><ul class="ai-rec">' + rec.map(function (x) {
      var m = o.metric(x.key);
      var btn = m.test === "reaction" ? '<a class="btn small" href="#reaction-test">' + T.test + "</a>"
        : m.page ? '<a class="btn small" href="' + m.page + '">' + T.checkin + "</a>"
        : '<button type="button" class="btn small" data-log="' + m.key + '">' + T.log + "</button>";
      return '<li><span class="n"><strong>' + esc(m.label) + '</strong><span class="why">' + esc(x.why) + "</span></span>" + btn + "</li>";
    }).join("") + "</ul>";
  }

  function render() {
    if (!o) return;
    var r = last, dx = r && r.dx, tier = dx ? dx.tier : "calm", p = r && r.payload;
    o.el.className = "aicard tier-" + tier + (p && p.simulation ? " sim" : "");
    var head = '<div class="ai-head">' + (dx && T.tier[tier] ? '<span class="ai-alert"' + (tier === "emergency" ? ' role="alert"' : "") + ">" + esc(T.tier[tier]) + "</span>" : "") +
      "<h3>" + T.title + "</h3>" + (r && r.provider ? '<span class="ai-meta">' + esc(providerName(r)) + " · " + F.num((r.ms || 0) / 1000, 1) + " s</span>" : "") +
      '<span class="ai-tools"><button type="button" class="btn ghost small" data-ai-rerun' + (busy ? " disabled" : "") + ">" + T.rerun + "</button></span></div>";
    var main = "", side = "";
    if (p && p.simulation) main += '<p class="ai-simnote">' + esc(T.simOn + p.simulation + T.simNot) + "</p>";
    if (!r && !busy) main += '<p class="ai-text muted">' + T.none + "</p>";
    else if (r && r.error) main += '<p class="ai-text err">' + esc(r.error) + "</p>";
    else if (r) {
      main += '<p class="ai-text' + (busy ? " busy" : "") + '">' + esc(r.summary) + "</p>" + causesHtml(dx, r);
      side += stepsHtml(dx) + testsHtml(r, p);
      if (r.notes && r.notes.length) main += '<p class="ai-note">' + esc(T.rejected + r.notes.join("; ")) + "</p>";
      if (r.warnings && r.warnings.length) main += '<ul class="ai-warn">' + r.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
    }
    if (busy) main += '<p class="ai-busy" role="status">' + T.writing + "</p>";
    if (caps && caps.chrome === "downloadable" && !dl) side += '<button type="button" class="btn small" data-ai-enable>' + T.enable + "</button>";
    if (dl) side += '<p class="ai-busy">' + T.enabling + dl + "</p>";
    var openSet = Array.prototype.map.call(o.el.querySelectorAll("details[open]"), function (d) { return d.className; });
    o.el.innerHTML = head + '<div class="ai-cols"><div class="ai-main">' + main + '</div><div class="ai-side">' + side + "</div></div>" +
      '<div class="ai-bottom">' + capsText() + '<button type="button" class="linkbtn" data-sim-open>' + T.simulate + "</button></div>" +
      '<p class="ai-foot">' + T.foot + "</p>";
    o.el.querySelectorAll("details").forEach(function (d) { if (openSet.indexOf(d.className) >= 0) d.open = true; });
    var rb = o.el.querySelector("[data-ai-rerun]"); if (rb) rb.onclick = function () { detect(true).then(A.run); };
    var eb = o.el.querySelector("[data-ai-enable]");
    if (eb) eb.onclick = function () {
      /* needs a click (user activation) to start Chrome's one-time model download */
      dl = "0%"; render();
      g.LanguageModel.create({ monitor: function (m) { m.addEventListener("downloadprogress", function (e) { dl = Math.round(e.loaded * 100) + "%"; render(); }); } })
        .then(function (s) { try { s.destroy(); } catch (e) { /* ignore */ } dl = null; return detect(true); })
        .catch(function () { dl = null; })
        .then(function () { A.run(); });
    };
  }

  /* first look at what is available, so the card can show it */
  detect().then(render);
})(window);
