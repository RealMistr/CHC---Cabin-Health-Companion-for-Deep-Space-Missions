/* Possible causes, urgency and what to do. Pure code, no model: the AI summary (ai.js) only puts this into words.
 *
 * - urgency: "calm" (all normal) / "watch" / "act" (something is Act now) / "emergency"
 *   Emergency = a value past the EMERGENCY limits below, or 3 or more Act now items at once.
 * - causes: up to 3 possible explanations, ranked by how many of the flagged results fit each one.
 *   Each condition has trigger signals (at least one must be flagged) and supporting signals.
 *   A signal is "metric:high" or "metric:low"; it counts when that metric is Watch or Act now in that direction.
 * - steps: what to do now, from the leading cause. Emergency steps are written for survival, not comfort.
 * - SCENARIOS: situations for the simulation (Simulate in the header).
 * - TEST_PURPOSE: what each suggested follow-up test tells you, so the AI card can say why to do it.
 * These are prompts to think and act, not a diagnosis. The Crew Medical Officer decides treatment. */
(function (g) {
  var H = g.Halo, X = H.diagnose = {};

  /* values that need action within minutes. [below, above]; null = no limit on that side. Resting values only
     for the Bio-Monitor channels (during exercise the exercise limits in status.js apply instead). */
  var EMERGENCY = {
    spo2: [88, null], heart_rate: [40, 150], bp_sys: [75, 180], bp_dia: [null, 120], resp_rate: [8, 30],
    body_temp: [35, 39.5], glucose: [54, 300], lactate: [null, 5], sodium: [125, 155], hemoglobin: [8, null],
    wbc: [2, 20], radiation_dose_rate: [null, 1300]
  };
  X.EMERGENCY = EMERGENCY;

  /* id, name, trigger signals, supporting signals, background, how to check, everyday steps, emergency steps */
  function C(id, name, trig, sup, about, confirm, steps, urgent) {
    return { id: id, name: name, trig: trig, sup: sup, about: about, confirm: confirm, steps: steps, urgent: urgent || steps };
  }

  var CONDITIONS = [
    C("cabin_air", "Cabin air problem (CO2 build-up or low oxygen)",
      ["spo2:low","resp_rate:high","ventilation:high"], ["heart_rate:high","reaction_time:high","bp_sys:high"],
      "When CO2 builds up or the oxygen supply fails, you breathe faster and harder while blood oxygen drops.",
      "Check the cabin O2 and CO2 readout and ask a crewmate to measure their blood oxygen. If theirs is low too, it is the air.",
      ["Stop any exertion and check the cabin O2 and CO2 readout.","Move to the best-ventilated module and recheck your blood oxygen with the finger oximeter.","Tell the crew so they can check the air system and their own readings."],
      ["Put on an oxygen mask from the emergency kit now.","Check the cabin O2 and CO2 readout and warn the crew: if the air is the cause, everyone is in danger.","Move to the best-ventilated module and stay there until your blood oxygen is back above 92%."]),

    C("chest_infection", "Chest or airway infection",
      ["spo2:low"], ["resp_rate:high","body_temp:high","wbc:high","heart_rate:high","skin_temp:high"],
      "An infection in the lungs makes breathing faster and lowers blood oxygen, usually with a fever.",
      "Take your oral temperature and note any cough or chest pain.",
      ["Take your oral temperature and recheck your blood oxygen.","Wear a mask and keep your distance from the crew.","Tell the Crew Medical Officer, who can start treatment from the medical kit."],
      ["Use oxygen from the medical kit as trained to keep your blood oxygen above 92%.","Wear a mask and isolate in your quarters.","The Crew Medical Officer starts treatment from the medical kit now."]),

    C("infection", "Infection with fever",
      ["body_temp:high","wbc:high"], ["heart_rate:high","resp_rate:high","skin_temp:high","lactate:high"],
      "A fever with a fast pulse is the body's usual reaction to an infection. In a closed cabin it can spread to the whole crew.",
      "Measure your temperature again in an hour and watch for cough, sore throat, stomach upset or a red, painful wound.",
      ["Wear a mask, keep your distance from the crew and wash your hands often.","Drink plenty and rest.","Tell the Crew Medical Officer, who can start treatment from the medical kit."],
      ["Isolate in your quarters and wear a mask.","Drink a full water pouch now and keep drinking.","The Crew Medical Officer starts treatment from the medical kit now and checks your temperature every hour."]),

    C("dehydration", "Dehydration",
      ["urine_sg:high","urine_volume:low","sodium:high"], ["heart_rate:high","bp_sys:low","lactate:high","body_mass:low","kidney_stone_risk:high"],
      "In weightlessness you feel less thirsty, so it is easy to drink too little. Concentrated urine, a faster pulse and lower blood pressure are typical.",
      "Count how much you drank today and look at the colour of your urine.",
      ["Drink a full water pouch now, then one every hour.","Skip caffeine until your urine is pale again.","Recheck urine specific gravity tomorrow morning."],
      ["Drink a full water pouch with an electrolyte sachet now.","Stop exercise and rest anchored.","If you feel dizzy or confused, the Crew Medical Officer gives fluids from the medical kit."]),

    C("overheating", "Overheating (heat strain)",
      ["skin_temp:high"], ["heart_rate:high","resp_rate:high","body_temp:high","lactate:high","urine_sg:high"],
      "Without gravity, warm air does not rise and sweat does not drip off, so heat stays around the body, especially during exercise.",
      "Check the cabin temperature and whether you were exercising.",
      ["Stop exercise and move to a cooler spot near an air vent.","Drink water.","Recheck in 15 minutes."],
      ["Stop all activity now and get in front of an air vent.","Take off extra layers, drink water and put a damp towel on your neck.","Take your oral temperature. Above 39.5 °C, get the Crew Medical Officer immediately."]),

    C("low_sugar", "Low blood sugar",
      ["glucose:low"], ["heart_rate:high","reaction_time:high","mood:low"],
      "Long exercise or a skipped meal can drop blood sugar. It causes shaking, sweating and confusion, which is dangerous during critical tasks.",
      "Think about when you last ate and how long you exercised.",
      ["Eat about 15 g of fast carbohydrate, such as juice or sweets from the food stock.","Test again in 15 minutes and repeat if it is still below 70.","Eat a proper meal afterwards."],
      ["Take 15 g of fast sugar now: juice, or glucose gel from the medical kit.","Stop critical tasks and tell a crewmate, who stays with you.","Test again in 15 minutes. If you cannot swallow or become confused, the crew gives glucose from the medical kit."]),

    C("high_sugar", "High blood sugar",
      ["glucose:high"], ["exercise_min:low","urine_sg:high","sleep_hours:low"],
      "Less exercise, stress and poor sleep make the body handle sugar worse on a long mission.",
      "Test again before breakfast, at least 8 hours after your last meal.",
      ["Drink water and avoid sweet snacks today.","Do your full exercise session.","Test again tomorrow before breakfast."],
      ["Drink water now and keep drinking.","Test again in 2 hours.","Tell the Crew Medical Officer now, especially if you feel very thirsty, sick or drowsy."]),

    C("stress_bp", "High blood pressure (stress, poor sleep or salt)",
      ["bp_sys:high"], ["heart_rate:high","sleep_hours:low","mood:low","crew_connection:low","resp_rate:high"],
      "Stress, short sleep, caffeine and salty food all push blood pressure up.",
      "Rest quietly for 15 minutes and measure again with the arm cuff.",
      ["Rest quietly for 15 minutes, breathe slowly, then measure again with the arm cuff.","Skip caffeine and salty food today.","Go to bed on time tonight."],
      ["Stop what you are doing, anchor your feet and keep still.","Measure again with the arm cuff in 5 minutes.","Still above 180: the Crew Medical Officer starts treatment from the medical kit. Report headache, chest pain or blurred vision immediately."]),

    C("fluid_shift", "Fluid shift toward the head",
      ["vision:low"], ["bp_sys:high","sleep_hours:low"],
      "In weightlessness, fluid moves toward the head. It can press on the eyes and blur near vision.",
      "Repeat the eye chart for each eye and note any headache.",
      ["Repeat the eye chart for each eye.","Note any headaches, and cut salty food.","Ask the Crew Medical Officer for an eye exam with the on-board imaging."]),

    C("low_bp", "Low blood pressure",
      ["bp_sys:low"], ["heart_rate:high","urine_volume:low","urine_sg:high","sodium:low","hemoglobin:low"],
      "Less blood volume in weightlessness, dehydration or blood loss can drop blood pressure and cause dizziness.",
      "Measure again with the arm cuff and note any dizziness.",
      ["Drink a full water pouch with an electrolyte sachet.","Measure again with the arm cuff in 15 minutes.","Avoid hard exercise until it is back in range."],
      ["Lie back, anchor yourself and do not move around.","Drink a water pouch with electrolytes if you can swallow safely.","The Crew Medical Officer checks you for bleeding and gives fluids from the medical kit."]),

    C("heart_rhythm", "Heart rhythm problem",
      ["heart_rate:high","heart_rate:low"], ["spo2:low","bp_sys:low","lactate:high","sodium:low","sodium:high"],
      "A very fast or very slow pulse at rest can mean the heart's rhythm is off, especially with low blood pressure or low oxygen.",
      "Look at the ECG trace from the Bio-Monitor and count your pulse by hand for 30 seconds.",
      ["Stop, anchor yourself and breathe slowly for 5 minutes.","Count your pulse by hand and look at the Bio-Monitor ECG trace.","Tell the Crew Medical Officer if it stays out of range."],
      ["Stop all activity now and anchor yourself.","The Crew Medical Officer looks at the Bio-Monitor ECG now.","Have the defibrillator from the medical kit ready. If you pass out, the crew starts CPR and uses it."]),

    C("sleep_debt", "Sleep debt and fatigue",
      ["sleep_hours:low","reaction_time:high"], ["mood:low","heart_rate:high","bp_sys:high"],
      "Short sleep slows your reactions and lowers your mood, which raises the risk of mistakes.",
      "Compare your sleep over the last few nights with your reaction test.",
      ["Keep a fixed sleep window tonight and dim the lights two hours before.","Stop caffeine 8 hours before sleep.","Until your reaction time recovers, have a crewmate double-check critical tasks like docking or repairs."]),

    C("isolation", "Isolation stress",
      ["mood:low","crew_connection:low"], ["sleep_hours:low","reaction_time:high"],
      "Weeks in a small, closed space with the same people wear down mood and the sense of connection.",
      "Write a few lines in your journal on the Wellbeing page.",
      ["Plan a shared meal or film with the crew.","Record a message or call home in the next comms window.","Talk to the Crew Medical Officer if it keeps going."]),

    C("anaemia", "Low blood count (anaemia)",
      ["hemoglobin:low","ferritin:low"], ["heart_rate:high","lactate:high","reaction_time:high"],
      "In weightlessness the body makes fewer red blood cells. Low iron stores make it worse.",
      "Repeat haemoglobin at the next finger-prick and note tiredness or breathlessness.",
      ["Eat iron-containing foods from the food stock.","Keep your exercise plan, but go easier if you feel breathless.","Tell the Crew Medical Officer."],
      ["Stop exertion and rest.","The Crew Medical Officer checks you for any bleeding: stool, gums, wounds.","Recheck haemoglobin within 24 hours."]),

    C("solar_event", "Solar particle event",
      ["radiation_dose_rate:high","radiation_dose:high"], [],
      "A burst of particles from the Sun can raise the dose rate many times over within minutes.",
      "Check the space weather alerts and the second radiation monitor.",
      ["Check the space weather alerts.","Spend sleep and off-duty time in the best-shielded area.","Keep your personal dosimeter on."],
      ["Go to the storm shelter now. Do not finish your task.","Make sure the whole crew is in the shelter, with water and their dosimeters.","Stay until the dose rate is back near its usual level."]),

    C("radiation_blood", "Radiation damage to the blood",
      ["wbc:low"], ["radiation_dose:high","radiation_dose_rate:high","hemoglobin:low"],
      "A large radiation dose, for example a solar particle event caught outside the storm shelter, damages the bone marrow, which makes new blood cells. White blood cells drop first, within days; red blood cells drop more slowly. With fewer white blood cells, infections become more likely and more dangerous.",
      "Repeat the blood count within 24 hours, take your temperature, and compare the result with your radiation dose for the past days.",
      ["Tell the Crew Medical Officer now and send your dose and blood count to mission control (the answer can take up to 44 minutes).",
       "Protect yourself from infection: wash your hands often, wear a mask, eat only sealed or heated food and keep away from anyone who is ill.",
       "Take your temperature every morning and evening, and repeat the blood count every day until it recovers.",
       "Spend sleep and off-duty time in the best-shielded area to keep any further dose low."],
      ["Get the Crew Medical Officer to you now: low white blood cells with a fever can become life-threatening within hours.",
       "Put on a mask, wash your hands and keep away from anyone who is ill.",
       "Take your temperature now and every few hours.",
       "If the dose rate is still high, go to the storm shelter."]),

    C("kidney_stone", "Kidney stone forming",
      ["kidney_stone_risk:high","urine_calcium:high","urine_oxalate:high","urine_citrate:low"], ["urine_volume:low","urine_sg:high","urine_ph:low","urine_ph:high"],
      "Bone loss releases calcium into the urine. With too little fluid, crystals can grow into a stone.",
      "Repeat urine pH and specific gravity tomorrow morning.",
      ["Drink enough to pass at least 2.5 L of urine a day.","Cut salt and high-oxalate foods.","Ask the Crew Medical Officer about potassium citrate from the medical kit."]),

    C("bone_loss", "Bone loss",
      ["urine_calcium:high"], ["exercise_min:low","body_mass:low","ferritin:high"],
      "Without gravity, bones lose calcium. Exercise on the resistive device is the main protection.",
      "Look at your exercise minutes over the past week.",
      ["Do your full resistive exercise every day.","Eat enough calcium and take your vitamin D.","Recheck urine calcium at the next 24-hour collection."]),

    C("underfueling", "Not eating enough or losing muscle",
      ["body_mass:low"], ["exercise_min:low","glucose:low","mood:low","hemoglobin:low"],
      "Appetite often drops in space. Eating less than you burn takes away muscle and bone.",
      "Compare what you ate this week with your meal plan.",
      ["Eat all planned meals, plus a snack after exercise.","Keep up resistive exercise to protect your muscles.","Weigh again next week."]),

    C("low_sodium", "Too much water or too little salt",
      ["sodium:low"], ["urine_sg:low","reaction_time:high","mood:low","bp_sys:low"],
      "Drinking a lot without salt dilutes the sodium in your blood. It causes headache, nausea and confusion.",
      "Count how much you drank today.",
      ["Do not drink more than you need until it is rechecked.","Eat normally salted food.","Repeat the test and tell the Crew Medical Officer."],
      ["Stop drinking extra water now.","The Crew Medical Officer checks you for confusion or headache and gives salt from the medical kit if needed.","Repeat the sodium test as soon as you can."]),

    C("cold", "Getting cold",
      ["skin_temp:low","body_temp:low"], ["heart_rate:low"],
      "A cold cabin or too few layers lower skin temperature first.",
      "Check the cabin temperature.",
      ["Put on warm layers and raise the cabin temperature.","Drink something warm.","Recheck your temperature in 30 minutes."],
      ["Get into a sleeping bag or warm layers now and raise the cabin temperature.","Drink something warm if you can swallow safely.","The Crew Medical Officer checks your oral temperature every 15 minutes."]),

    C("lactate_rest", "Muscles short of oxygen",
      ["lactate:high"], ["spo2:low","hemoglobin:low","heart_rate:high","urine_sg:high"],
      "High lactate at rest means your muscles are working without enough oxygen, from recent exercise, dehydration or illness.",
      "Make sure you rested for 30 minutes before the test, then repeat it.",
      ["Rest and drink water.","Test again in an hour.","If it stays high or you feel unwell, tell the Crew Medical Officer."])
  ];
  X.CONDITIONS = CONDITIONS;

  /* situations for the simulation. reaction_time and body_mass take { pct } because their ranges are relative to
     the astronaut's own baseline. activity 1.1 = at rest, so heart rate and breathing are judged as resting values. */
  X.SCENARIOS = [
    { id: "high_hr", en: "High heart rate at rest", values: { heart_rate: 158, activity: 1.1 } },
    { id: "radiation", en: "High radiation (solar storm)", values: { radiation_dose_rate: 1780, radiation_dose: 1.6 } },
    { id: "low_o2", en: "Low blood oxygen", values: { spo2: 86, heart_rate: 104, activity: 1.1 } },
    { id: "cabin_air", en: "Cabin air problem (CO2)", values: { spo2: 85, resp_rate: 28, ventilation: 17, heart_rate: 114, activity: 1.1, reaction_time: { pct: 23 } } },
    { id: "fever", en: "Infection with high fever", values: { body_temp: 39.7, heart_rate: 118, resp_rate: 25, wbc: 15.2, skin_temp: 36.9, activity: 1.1 } },
    { id: "high_bp", en: "High blood pressure", values: { bp_sys: 186, bp_dia: 122, heart_rate: 96, activity: 1.1 } },
    { id: "low_sugar", en: "Low blood sugar", values: { glucose: 46, heart_rate: 108, activity: 1.1, reaction_time: { pct: 26 } } },
    { id: "dehydration", en: "Dehydration", values: { urine_sg: 1.034, urine_volume: 1.3, heart_rate: 101, sodium: 148, lactate: 2.8, activity: 1.1 } },
    { id: "kidney_stone", en: "Kidney stone forming", values: { urine_calcium: 290, urine_oxalate: 44, urine_citrate: 280, urine_volume: 1.6, urine_ph: 5.2, urine_sg: 1.026 },
      note: "24-hour urine test and dipstick: high calcium from bone loss, too little urine, low citrate, acidic and concentrated urine." },
    { id: "radiation_blood", en: "Radiation damage to the blood", values: { wbc: 2.6, hemoglobin: 12.4, radiation_dose: 420, body_temp: 36.9 },
      note: "Days after a big solar particle event caught outside the shelter (0.42 Gy): white blood cells have dropped, haemoglobin is slightly low, no fever yet." },
    { id: "tired", en: "Exhausted, little sleep", values: { sleep_hours: 4.1, reaction_time: { pct: 24 }, mood: 2 } },
    { id: "all_normal", en: "Normal vital signs", values: { heart_rate: 64, spo2: 98, bp_sys: 118, bp_dia: 76, resp_rate: 14, activity: 1.1 }, note: "Heart, breathing and blood pressure at normal resting values." }
  ];

  /* resting values for the Bio-Monitor channels, filled in for a simulation at rest so that only the chosen values are off */
  X.REST = { activity: 1.1, heart_rate: 66, spo2: 98, bp_sys: 118, bp_dia: 76, resp_rate: 15, ventilation: 7.5, skin_temp: 33.8 };

  /* what a suggested test tells you: "Suggested because your heart rate is high: it tells whether ..." */
  X.TEST_PURPOSE = {
    body_temp: "it tells whether you have a fever, the most common sign of an infection",
    spo2: "it shows whether your blood is carrying enough oxygen",
    sleep_hours: "it shows whether tiredness is behind it",
    urine_sg: "it shows whether you are drinking enough",
    urine_volume: "it shows whether you are drinking enough",
    urine_ph: "it shows whether your urine favours kidney stones",
    urine_calcium: "it shows whether bone is being broken down",
    urine_oxalate: "it shows one of the main kidney stone ingredients",
    urine_citrate: "it shows how well your urine is protected against stones",
    bp_sys: "it shows whether your circulation is keeping up",
    heart_rate: "it shows how hard your heart is working",
    resp_rate: "it shows whether your breathing is working harder than it should",
    hemoglobin: "it shows whether your blood can carry enough oxygen",
    ferritin: "it shows how much iron your body has stored",
    sodium: "it checks your salt and water balance",
    wbc: "it shows whether your body is fighting an infection",
    glucose: "it shows whether your body is getting enough fuel",
    lactate: "it shows whether your muscles are short of oxygen",
    exercise_min: "it shows whether you train enough to protect muscle and bone",
    body_mass: "it shows whether you are eating enough",
    reaction_time: "it shows whether your alertness is affected, which matters for critical tasks",
    mood: "it shows whether it is affecting how you feel",
    crew_connection: "it shows whether you feel cut off from the crew",
    vision: "it shows whether fluid shift is affecting your eyes",
    radiation_dose: "it shows how much dose you have taken"
  };

  /* ---------------- assessment ---------------- */
  function flaggedDir(byKey, key, dir) {
    var m = byKey[key]; if (!m || (m.status !== "Watch" && m.status !== "Act now")) return null;
    return m.direction === dir ? m : null;
  }
  function emergencyHits(p) {
    var hits = [];
    p.metrics.forEach(function (m) {
      [[m.key, m.value], m.key === "bp_sys" ? ["bp_dia", m.value2] : null].forEach(function (pair) {
        if (!pair || pair[1] == null) return;
        var lim = EMERGENCY[pair[0]]; if (!lim) return;
        if (m.during_exercise && (pair[0] === "heart_rate" || pair[0] === "resp_rate" || pair[0] === "bp_sys" || pair[0] === "bp_dia")) return;
        var v = pair[1];
        var dir = lim[0] != null && v < lim[0] ? "low" : lim[1] != null && v > lim[1] ? "high" : null;
        if (dir && !hits.some(function (h) { return h.key === m.key; })) hits.push({ key: m.key, dir: dir });
      });
    });
    return hits;
  }

  /* p: payload from app.js (metrics with key, status, direction, value, value2, display, unit, call) */
  X.assess = function (p) {
    var byKey = {}; p.metrics.forEach(function (m) { byKey[m.key] = m; });
    var flagged = p.metrics.filter(function (m) { return m.status === "Watch" || m.status === "Act now"; });
    var act = flagged.filter(function (m) { return m.status === "Act now"; });
    var hits = emergencyHits(p), hitKeys = {}; hits.forEach(function (h) { hitKeys[h.key] = h.dir; });
    /* the items the summary leads with (same order as the offline assistant): a cause that explains them ranks higher */
    var lead = flagged.filter(function (m) { return !m.covered_by; })
      .sort(function (a, b) { return (b.status === "Act now") - (a.status === "Act now") || (b.streak || 0) - (a.streak || 0); }).map(function (m) { return m.key; });
    var tier = hits.length || act.length >= 3 ? "emergency" : act.length ? "act" : flagged.length ? "watch" : "calm";

    var urgentTier = tier === "act" || tier === "emergency";
    var scored = CONDITIONS.map(function (c) {
      var score = 0, ev = [], seen = {}, trig = 0, urgentHit = false;
      /* w: 2 for a trigger, 1 for support. Act now counts 1.5x; in an urgent situation a Watch result counts half.
         A dangerous value adds 4 when it triggers the cause (then its steps are used), 1 when it only supports it. */
      function add(sig, w) {
        var kd = sig.split(":"), m = flaggedDir(byKey, kd[0], kd[1]); if (!m || seen[m.key]) return false;
        seen[m.key] = 1; score += (m.status === "Act now" ? 1.5 : urgentTier ? 0.5 : 1) * w; ev.push(m);
        if (hitKeys[m.key] === kd[1]) { if (w === 2) { score += 4; urgentHit = true; } else score += 1; }
        return true;
      }
      c.trig.forEach(function (s) { if (add(s, 2)) trig++; });
      if (!trig) return null;
      c.sup.forEach(function (s) { add(s, 1); });
      if (seen[lead[0]]) score += 2; else if (seen[lead[1]]) score += 1;
      return { c: c, score: score, evidence: ev, urgentHit: urgentHit };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || b.evidence.length - a.evidence.length; });
    /* when something is Act now, only causes that explain an Act now result: side issues would be noise */
    if (tier === "act" || tier === "emergency") {
      var urgentOnly = scored.filter(function (x) { return x.evidence.some(function (m) { return m.status === "Act now"; }); });
      if (urgentOnly.length) scored = urgentOnly;
    }

    var top = scored.slice(0, 3).map(function (x, i) {
      var fit = i === 0 ? (scored[1] && scored[1].score === x.score ? "possible" : "likely") : x.score >= scored[0].score / 2 ? "possible" : "less";
      return { id: x.c.id, keys: x.evidence.map(function (m) { return m.key; }), name: x.c.name, fit: fit, score: x.score, urgentHit: x.urgentHit,
        about: x.c.about, confirm: x.c.confirm, steps: x.c.steps, urgent: x.c.urgent,
        evidence: x.evidence.map(function (m) { return { key: m.key, label: m.label, display: m.display, unit: m.unit, dir: m.direction, status: m.status }; }) };
    });
    return { tier: tier, emergency: hits.map(function (h) { var m = byKey[h.key]; return { key: h.key, dir: h.dir, label: m.label, display: m.display, unit: m.unit }; }),
      act: act.length, flagged: flagged.length, causes: top, steps: steps(tier, top, act) };
  };

  /* what to do now, in order. calm: nothing. watch: the leading cause's steps. act: + Crew Medical Officer.
     emergency: stop, survival steps of the cause behind the emergency value, crew + CMO, mission control. */
  /* when to get the Crew Medical Officer straight away, for causes where the result's own "call" text does not fit */
  var CALL = {
    radiation_blood: "you get a fever (38 °C or more), chills, a sore throat, bleeding gums or bruises, or suddenly feel unwell"
  };
  function steps(tier, causes, act) {
    var out = [];
    function push(s) { if (out.indexOf(s) < 0) out.push(s); }
    if (tier === "calm" || !causes.length) {
      if (tier === "emergency" || tier === "act") { push("Stop what you are doing and recheck the value."); push("Get the Crew Medical Officer now."); }
      return out;
    }
    var lead = causes[0];
    if (tier === "emergency") {
      lead = causes.filter(function (c) { return c.urgentHit; })[0] || lead;
      push("Stop what you are doing and anchor yourself.");
      lead.urgent.forEach(push);
      push("Alert the whole crew and get the Crew Medical Officer to you now.");
      push("Message mission control, but do not wait for their answer: the signal delay means you act first.");
      return out.slice(0, 6);
    }
    lead.steps.forEach(push);
    if (tier === "act") {
      var call = act.filter(function (m) { return m.call; })[0];
      if (CALL[lead.id]) push("Get the Crew Medical Officer straight away if " + CALL[lead.id] + ".");
      else if (call) { var crit = call.call.replace(/\.$/, ""); push("Get the Crew Medical Officer straight away if: " + crit.charAt(0).toLowerCase() + crit.slice(1) + "."); }
      else push("If it does not improve after these steps, get the Crew Medical Officer.");
    }
    return out.slice(0, 5);
  }
})(window);
