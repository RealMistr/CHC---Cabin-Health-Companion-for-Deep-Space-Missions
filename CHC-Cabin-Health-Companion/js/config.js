/* CHC (Cabin Health Companion): what is measured, how often, and what the numbers mean.
 *
 * This is the one file to edit when the team adds, removes or retunes an indicator.
 * The data files (JSON) only carry measurements; everything below is reference knowledge.
 *
 * kind: "continuous"  worn Bio-Monitor sensor, many samples per hour
 *       "periodic"    a check the astronaut does (or a lab result), every day / week / month
 * range.normal / range.watch: [low, high]. Inside normal = Normal, inside watch = Watch, outside both = Act now.
 * range.relative: true means the numbers are % change from the astronaut's own baseline (first value, or crew.baseline in the data).
 * exercise: limits used instead of range while the Bio-Monitor shows exercise (activity >= exerciseMets).
 *           { hrmax: true } means: from the maximum heart rate, 220 minus age (crew.age in the data, 40 if missing) or crew.hr_max.
 * every: "day", "3days", "week", "2weeks" or "month".  group: "blood" or "kidneys" puts a check in that category.
 * section: "radiation" shows the metric in the Radiation section instead of the Bio-Monitor or Checks.
 * recheck: { act_h, watch_h } hours until the suggested recheck (default 1 h for Act now, 24 h for Watch).
 * Ranges are general adult reference values for a prototype, NOT NASA flight limits.
 * "call" = when to get the Crew Medical Officer (the crewmate trained for medical care) straight away. "basis" says where each comes from.
 */
window.HALO_CONFIG = {
  /* The mission shown in the header. Data files can override it with crew.mission and crew.mission_start. */
  mission: { name: "Mars transit", days: 30, vehicle: "Mars transit vehicle" },
  /* the crew member data goes to when a file does not name one */
  crew: { name: "Aleš Svoboda", role: "Pilot", age: 40 },

  /* Crew profiles shown behind the "i" next to each name. The people and their careers are real (the crew named for the
     Vast-PAM-1 private mission to the ISS, planned for 2027) and every fact links to a public source. The 30-day Mars
     transit and all health numbers in the app are a simulation: real astronauts' medical data is not public.
     Ages are worked out from "born" (a full date, or just a year). */
  roster: [
    {
      name: "Aleš Svoboda", role: "Pilot", country: "Czech Republic", agency: "ESA", born: "1986-06-19", birthplace: "Brno",
      short: "Czech Air Force fighter pilot and ESA reserve astronaut. Named pilot of Vast-PAM-1.",
      bio: [
        "Fighter pilot in the Czech Air Force since 2008, mostly flying the Gripen (about 1,500 flight hours). Major at the 21st Tactical Air Force Base in Čáslav.",
        "Holds a PhD in aircraft and rocket technology from the University of Defence in Brno.",
        "Member of the ESA astronaut reserve since November 2022. Named pilot of Vast-PAM-1 (pending approval by the ISS partners); he would be the first Czech astronaut on the ISS."
      ],
      sources: [
        { label: "ESA profile", url: "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Astronauts/Ales_Svoboda" },
        { label: "Spacefacts biography", url: "https://spacefacts.de/bios/candidates/reserve/english/svoboda_ales.htm" },
        { label: "Vast and ESA announcement, 8 June 2026", url: "https://www.businesswire.com/news/home/20260608203652/en/" }
      ]
    },
    {
      name: "Thomas Pesquet", role: "Commander", country: "France", agency: "ESA / CNES", born: "1978-02-27", birthplace: "Rouen",
      short: "French aerospace engineer, airline pilot and ESA astronaut. Commander of Vast-PAM-1.",
      bio: [
        "Aerospace engineer (Thales Alenia Space, CNES) and former Air France airline pilot.",
        "ESA astronaut since 2009. Flew two six-month ISS missions: Proxima (2016–17) and Alpha (2021), about 396 days in space.",
        "Named commander of Vast-PAM-1."
      ],
      sources: [
        { label: "ESA biography", url: "https://blogs.esa.int/exploration/category/astronauts/thomas-pesquet/page/3" },
        { label: "Space.com biography", url: "https://www.space.com/astronaut-thomas-pesquet-biography" },
        { label: "Vast-PAM-1 crew (Futura)", url: "https://www.futura-sciences.com/en/?p=39690" }
      ]
    },
    {
      name: "Adrianos Golemis", role: "Mission specialist", country: "Greece", agency: "ESA", born: "1987", birthplace: "Larissa",
      short: "Greek medical doctor and former ESA Lead Flight Surgeon. Mission specialist on Vast-PAM-1.",
      bio: [
        "Medical doctor (Aristotle University of Thessaloniki, 2012) with a master's in space studies from the International Space University.",
        "Spent a year as ESA's research doctor at Concordia Station in Antarctica (2014). ESA flight surgeon from 2018, Lead Flight Surgeon 2024–2026.",
        "ESA project astronaut since 1 September 2026; the first Greek to start astronaut training. Named mission specialist on Vast-PAM-1.",
        "In this app's scenario he is also the crew's Crew Medical Officer."
      ],
      sources: [
        { label: "ESA profile", url: "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Astronauts/Adrianos_Golemis" },
        { label: "Greece picks its first astronaut (The Next Web)", url: "https://thenextweb.com/news/greece-first-astronaut-golemis-vast-iss-2027" }
      ]
    }
  ],
  /* The app works in gray (absorbed dose) only. Files that still give radiation in sievert (dose equivalent) are
     divided by this quality factor when loaded: the average Curiosity's RAD measured during the cruise to Mars
     (Zeitlin et al., Science 2013). It is also used to express NASA's career limit in gray. */
  radiation: { qualityFactor: 3.82 },

  /* AI summary (js/ai.js), runs in the browser. Chrome's on-device model is used when available (English);
     otherwise Ollama on this computer, otherwise offline rules. */
  ai: { chromeAI: true, ollama: true, ollamaUrl: "http://127.0.0.1:11434", ollamaModel: "llama3.2:3b" },

  ranges: [
    { id: "day",   label: "Day",     ms: 864e5,      bucket: 5 * 60e3 },
    { id: "week",  label: "1 week",  ms: 7 * 864e5,  bucket: 30 * 60e3 },
    { id: "2w",    label: "2 weeks", ms: 14 * 864e5, bucket: 60 * 60e3 },
    { id: "month", label: "Month",   ms: 30 * 864e5, bucket: 2 * 3600e3 }
  ],

  /* Activity above this (METs) counts as exercise: heart rate, breathing and blood pressure are not judged then. */
  exerciseMets: 3,

  regions: [
    { id: "brain", name: "Brain and mind", short: "Brain and mind" },
    { id: "eyes", name: "Eyes", short: "Eyes" },
    { id: "heart", name: "Heart and vessels", short: "Heart" },
    { id: "lungs", name: "Lungs and breathing", short: "Lungs" },
    { id: "blood", name: "Blood and immune system", short: "Blood & immunity" },
    { id: "bones", name: "Bones and muscle", short: "Bones & muscle" },
    { id: "kidneys", name: "Kidneys and urine", short: "Kidneys" },
    { id: "skin", name: "Skin", short: "Skin" }
  ],

  metrics: [
    /* ---------------- Continuous: Bio-Monitor ---------------- */
    {
      key: "heart_rate", aliases: ["hr", "heartrate", "pulse"], label: "Heart rate", label_cs: "Tepová frekvence", unit: "bpm", decimals: 0,
      kind: "continuous", region: "heart", device: "Bio-Monitor, ECG electrodes",
      valid: [20, 250], window_min: 5, stale_min: 30, skip_when_active: true,
      range: { normal: [50, 90], watch: [40, 105], axis: [40, 190] },
      exercise: { hrmax: true, normal: 0.9, watch: 1.0 },
      basis: "Resting: general adult values. Exercise: up to 90% of your maximum heart rate is Normal, up to 100% is Watch (maximum = 220 minus age). Not NASA flight limits.",
      about: "Beats per minute, worked out from the shirt's ECG. At rest it is judged against resting limits; during exercise against your exercise limits, because a working heart is supposed to beat faster.",
      why: "Heart rate is a quick sign of how hard your body is working. A resting rate that stays high can be an early warning of fever, dehydration, poor sleep or stress, and the heart slowly loses fitness on a long mission.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. To check by hand, rest for 5 minutes, find the pulse on your wrist or neck, count the beats for 30 seconds and double the number.",
      watch: "Rest for 10 minutes and look again. Drink water, skip caffeine, and think about how you slept. Note any palpitations or dizziness.",
      act: "Stop what you are doing, strap in or hold on, and breathe slowly for 5 minutes. Measure again by hand. If it is still out of range, check your temperature and blood oxygen and tell the Crew Medical Officer.",
      call: "Resting rate above 105 or below 40, or any rate together with chest pain, fainting or shortness of breath."
    },
    {
      key: "spo2", aliases: ["oxygen", "blood_oxygen", "sao2"], label: "Blood oxygen", label_cs: "Okysličení krve", unit: "%", decimals: 0,
      kind: "continuous", region: "lungs", device: "Bio-Monitor, headband oximeter",
      valid: [50, 100], window_min: 5, stale_min: 30,
      range: { normal: [95, 100], watch: [92, 100], axis: [86, 100] },
      basis: "General adult reference values. Not NASA flight limits.",
      about: "How much of your blood's haemoglobin is carrying oxygen.",
      why: "Blood oxygen shows whether your lungs and blood deliver enough oxygen to your body. A drop can come from a lung problem or from poor cabin air, and low oxygen affects thinking before other symptoms appear.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. To confirm the value, use the finger pulse oximeter from the medical kit. Warm your hands before taking the measurement, insert your finger in the device and keep your body still for 10 seconds or until the value stabilises.",
      watch: "Check the cabin CO2 readout, move to a ventilated area, rest, and look again in 10 minutes.",
      act: "Stop exertion and check the cabin CO2 readout. Recheck with the finger oximeter. If it stays below 92%, tell the crew and the Crew Medical Officer, and use oxygen from the medical kit as trained.",
      call: "Below 92%, or breathlessness while resting."
    },
    {
      key: "bp_sys", aliases: ["systolic", "sys"], label: "Blood pressure", label_cs: "Krevní tlak", unit: "mmHg", decimals: 0, pair: "bp_dia",
      kind: "continuous", region: "heart", device: "Bio-Monitor, continuous estimate (cuff to confirm)",
      valid: [50, 260], window_min: 15, stale_min: 60, skip_when_active: true,
      range: { normal: [90, 129], watch: [80, 139], axis: [60, 200] },
      exercise: { normal: [90, 200], watch: [80, 220] },
      basis: "Resting: general adult reference values. During exercise, systolic up to 200 is Normal. Not NASA flight limits.",
      about: "Systolic (top number) and diastolic (bottom number), in millimetres of mercury. Pressure rises during exercise, so exercise has its own limits.",
      why: "Blood pressure shows how hard your heart and blood vessels are working. High or low pressure can cause headaches, vision changes or fainting, and long missions change how blood vessels behave.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. To confirm the value, use the arm cuff from the medical kit. Place the cuff on your bare upper arm, about 1 inch (2.5 cm) above the bend of your elbow. Anchor your feet and keep your body still for the whole measurement.",
      watch: "Confirm with the arm cuff. Cut salty food, drink water and measure again this evening.",
      act: "Confirm with the arm cuff now. If it holds, rest quietly for 15 minutes, avoid salty food and caffeine, and measure again. Still out of range: tell the Crew Medical Officer.",
      call: "140 systolic or 90 diastolic or higher, below 80 systolic, or any high reading with a severe headache or changes in vision."
    },
    {
      key: "bp_dia", aliases: ["diastolic", "dia"], label: "Diastolic pressure", label_cs: "Diastolický tlak", unit: "mmHg", decimals: 0, partOf: "bp_sys",
      kind: "continuous", region: "heart", device: "Bio-Monitor",
      valid: [30, 160], window_min: 15, stale_min: 60, skip_when_active: true,
      range: { normal: [55, 84], watch: [50, 89], axis: [40, 110] },
      exercise: { normal: [50, 95], watch: [45, 100] },
      basis: "General adult reference values. Not NASA flight limits."
    },
    {
      key: "resp_rate", aliases: ["breathing_rate", "rr", "respiration"], label: "Breathing rate", label_cs: "Dechová frekvence", unit: "breaths/min", decimals: 0,
      kind: "continuous", region: "lungs", device: "Bio-Monitor, chest bands",
      valid: [4, 70], window_min: 5, stale_min: 30, skip_when_active: true,
      range: { normal: [12, 20], watch: [10, 24], axis: [6, 50] },
      exercise: { normal: [12, 45], watch: [10, 55] },
      basis: "General adult resting range. Not confirmed for flight.",
      about: "Breaths per minute, from the stretch sensors around your chest.",
      why: "Breathing rate often rises early with fever, infection, stress or stale cabin air, sometimes before you feel ill.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. To check by hand, sit still, count your breaths for 30 seconds and double the number.",
      watch: "Check cabin air, rest and look again in 30 minutes.",
      act: "Rest and check the cabin air. Take your temperature and blood oxygen. If it stays high with breathlessness or fever, tell the Crew Medical Officer.",
      call: "A resting rate outside 10 to 24 that lasts, together with chest tightness, breathlessness or fever."
    },
    {
      key: "ventilation", aliases: ["breathing_volume", "minute_ventilation", "ve"], label: "Breathing volume", label_cs: "Objem dýchání", unit: "L/min", decimals: 1,
      kind: "continuous", region: "lungs", device: "Bio-Monitor, chest bands",
      valid: [0, 200], window_min: 5, stale_min: 30, skip_when_active: true,
      range: { normal: [5, 10], watch: [4, 14], axis: [0, 40] },
      exercise: { normal: [5, 100], watch: [4, 130] },
      basis: "Approximate adult resting values. Not confirmed for flight.",
      about: "How many litres of air you move per minute (breaths per minute times the size of each breath).",
      why: "Breathing volume shows how much air you move. A rise while resting can mean your body is clearing extra CO2 from the cabin air or struggling to get enough oxygen.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. It is worked out from the chest bands: breaths per minute times the size of each breath. It rises a lot during exercise, which is normal.",
      watch: "If it is high while resting, check the cabin CO2 readout and how you feel.",
      act: "Rest and check the cabin CO2 readout. If it stays high at rest with breathlessness, tell the Crew Medical Officer.",
      call: "High resting values together with breathlessness, headache or confusion (possible CO2 build-up)."
    },
    {
      key: "skin_temp", aliases: ["temp_skin", "skin_temperature"], label: "Skin temperature", label_cs: "Teplota kůže", unit: "°C", decimals: 1,
      kind: "continuous", region: "skin", device: "Bio-Monitor, skin sensor",
      valid: [20, 42], window_min: 5, stale_min: 30, units: { "F": { add: -32, mul: 0.5556 } },
      range: { normal: [32, 35.5], watch: [31, 36.5], axis: [30, 38] },
      basis: "Approximate torso skin values, not calibrated. Skin reads lower than body (core) temperature.",
      about: "Temperature of the skin under the shirt sensor.",
      why: "Skin temperature reflects how well your body gets rid of heat. Changes can hint at a fever, overheating during exercise, or a cabin that is too warm or too cold.",
      how: "Estimated continuously by the Bio-Monitor T-shirt. To check your body temperature (for example to find out whether you have a fever), use the oral thermometer.",
      watch: "Check your oral temperature and the cabin temperature.",
      act: "Take your oral temperature now and follow its guidance.",
      call: "Only together with a fever on the oral thermometer."
    },
    {
      key: "activity", aliases: ["activity_level", "mets", "met"], label: "Activity level", label_cs: "Úroveň aktivity", unit: "METs", decimals: 1,
      kind: "continuous", region: "bones", device: "Bio-Monitor, motion sensor",
      valid: [0, 20], window_min: 5, stale_min: 30,
      range: null, axis: [0, 10],
      basis: "Context, not a health limit. 1 MET is resting quietly; 3 or more is exercise.",
      about: "How hard your body is working, in METs. 1 is resting, 3 to 6 is moderate exercise, above 6 is hard.",
      why: "Activity level puts the other numbers in context: a fast heart rate on the treadmill is expected, the same rate at your desk is not. It also shows whether you move enough during the day.",
      how: "Determined from the accelerometer in the Bio-Monitor T-shirt together with the other continuously measured values, such as heart rate and breathing.",
      watch: "", act: "", call: ""
    },

    /* ---------------- Periodic: daily ---------------- */
    {
      key: "sleep_hours", aliases: ["sleep_h", "sleep"], label: "Sleep", label_cs: "Spánek", unit: "h", decimals: 1,
      kind: "periodic", every: "day", region: "brain", device: "Actigraphy watch, or your own estimate",
      valid: [0, 24], input: { min: 0, max: 24, step: 0.1 },
      range: { normal: [7, 9], watch: [5.5, 10], axis: [3, 11] },
      basis: "General adult reference values. Not NASA flight limits.",
      about: "Hours of sleep last night.",
      why: "Lack of sleep is one of the main causes of lowered cognitive performance, which leads to an increased risk of error.",
      how: "Measured automatically by your wrist band. Alternatively, you can log an estimate manually each morning.",
      watch: "Keep a fixed sleep window, dim the lights two hours before bed, and stop caffeine 8 hours before sleep.",
      act: "Ask a crewmate to double-check critical tasks today, plan a recovery sleep tonight, and let the commander know so the schedule can be adjusted.",
      call: "Under 5.5 hours, or several short nights in a row."
    },
    {
      key: "mood", aliases: ["mood_score"], label: "Mood", label_cs: "Nálada", unit: "of 5", decimals: 0,
      page: "#wellbeing", kind: "periodic", every: "day", region: "brain", device: "Self-rating",
      valid: [1, 5], input: { scale: ["Very low", "Low", "Okay", "Good", "Very good"] },
      range: { normal: [3, 5], watch: [2, 5], axis: [1, 5] },
      basis: "Prototype scale. Cut points are an assumption.",
      about: "How you feel today, from 1 (very low) to 5 (very good).",
      why: "The overall mood of the crew is important, since a bad mood may lower cognitive performance, which leads to an increased risk of error.",
      how: "Self-rating on a 1 to 5 scale, taken before bedtime in the daily check-in on the Wellbeing page.",
      watch: "Talk to a crewmate, book a private call home, and protect time for something you enjoy.",
      act: "Talk to the Crew Medical Officer or a crewmate you trust today, and use your private call home.",
      call: "A score of 1, or 2 for several days. If you have thoughts of harming yourself, tell a crewmate straight away."
    },
    {
      key: "crew_connection", aliases: ["connection", "social"], label: "Crew connection", label_cs: "Propojení s posádkou", unit: "of 5", decimals: 0,
      page: "#wellbeing", kind: "periodic", every: "day", region: "brain", device: "Self-rating on the Wellbeing page",
      valid: [1, 5], input: { scale: ["Isolated", "Distant", "Okay", "Connected", "Very connected"] },
      range: { normal: [3, 5], watch: [2, 5], axis: [1, 5] },
      basis: "Prototype scale. Cut points are an assumption.",
      about: "How connected you feel with the rest of the crew today, from 1 (isolated) to 5 (very connected).",
      why: "Feeling cut off from the crew wears down mood and teamwork over a long mission. Good relationships help everyone cope with stress and isolation.",
      how: "Self-rating on a 1 to 5 scale, taken before bedtime in the daily check-in on the Wellbeing page, together with mood.",
      watch: "Share a meal or a film with the crew, or ask someone how their day went.",
      act: "Talk to the commander or a crewmate you trust today, and use your private call home.",
      call: "A score of 1, or 2 for several days in a row."
    },
    {
      key: "exercise_min", aliases: ["ex_min", "exercise"], label: "Exercise", label_cs: "Cvičení", unit: "min", decimals: 0,
      kind: "periodic", every: "day", region: "bones", device: "Exercise log (treadmill, bike, resistive device)",
      valid: [0, 600], input: { min: 0, max: 600, step: 5 },
      range: { normal: [110, 600], watch: [0, 600], axis: [0, 180] },
      basis: "ISS crews plan about two hours of exercise a day. The 110 minute cut point is an assumption.",
      about: "Minutes of exercise today.",
      why: "Without gravity, bones and muscles are barely loaded. Daily exercise is the main protection against bone and muscle loss, and it keeps the heart fit.",
      how: "Log the total working minutes of all your sessions each evening (treadmill, exercise bike and resistive device). Count only the time you were actually exercising.",
      watch: "Add a make-up session and put resistive work first.",
      act: "", call: "Bone, joint or chest pain during exercise."
    },
    {
      key: "radiation_dose_rate", aliases: ["dose_rate", "radiation_rate", "active_dose", "dose_equivalent_rate", "absorbed_dose_rate"], label: "Active dose rate", label_cs: "Aktuální dávkový příkon", unit: "µGy/h", decimals: 1,
      kind: "continuous", section: "radiation", region: null, device: "Active radiation monitor",
      valid: [0, 100000], window_min: 5, stale_min: 60, unit_sibling: "radiation_dose",
      /* sievert: older files in dose equivalent, divided by radiation.qualityFactor to get gray */
      units: { "µGy/h": { mul: 1 }, "uGy/h": { mul: 1 }, "mGy/h": { mul: 1000 }, "nGy/h": { mul: 0.001 }, "Gy/h": { mul: 1000000 }, "µGy/day": { mul: 0.041667 },
        "µSv/h": { mul: 1, sievert: true }, "mSv/h": { mul: 1000, sievert: true }, "nSv/h": { mul: 0.001, sievert: true }, "Sv/h": { mul: 1000000, sievert: true }, "µSv/day": { mul: 0.041667, sievert: true } },
      range: { normal: [0, 40], watch: [0, 260], axis: [0, 50] },
      basis: "On the way to Mars, Curiosity's radiation detector measured an absorbed dose of about 0.48 mGy a day from cosmic rays, roughly 20 µGy/h. Cut points above that are assumptions.",
      about: "How much radiation is reaching you right now, in micrograys per hour (absorbed dose).",
      why: "Radiation damages cells and adds up over a career, raising the long-term risk of cancer. A sudden rise usually means a solar particle event, when getting to the shelter quickly protects you.",
      how: "Measured continuously by the spacecraft's active radiation monitor. Your personal dosimeter records your own total, so keep it on you at all times.",
      watch: "Check the space weather alerts. Spend sleep and off-duty time in the better shielded areas.",
      act: "Go to the storm shelter and stay there until the rate is back near its usual level.",
      call: "Any solar particle event warning, or a rate that stays far above the usual level."
    },
    {
      key: "radiation_dose", aliases: ["radiation", "dose", "rad", "daily_dose", "dose_equivalent"], label: "Daily radiation dose", label_cs: "Denní dávka záření", unit: "mGy", decimals: 2,
      kind: "periodic", every: "day", section: "radiation", region: null, device: "Personal dosimeter, read out daily",
      valid: [0, 500], unit_sibling: "radiation_dose_rate",
      units: { "mGy": { mul: 1 }, "µGy": { mul: 0.001 }, "uGy": { mul: 0.001 }, "Gy": { mul: 1000 }, "mGy/day": { mul: 1 },
        "mSv": { mul: 1, sievert: true }, "µSv": { mul: 0.001, sievert: true }, "Sv": { mul: 1000, sievert: true }, "mSv/day": { mul: 1, sievert: true } },
      cumulative: { label: "Mission total", limit: 157, limitLabel: "NASA career limit" },
      range: { normal: [0, 0.65], watch: [0, 1.3], axis: [0, 0.8] },
      basis: "During the cruise to Mars, Curiosity's radiation detector measured an average absorbed dose of 0.48 mGy a day. Cut points above that are assumptions. NASA sets its career limit as 600 mSv of dose equivalent; for deep-space radiation (quality factor 3.82) that is about 157 mGy.",
      about: "Radiation dose received in one day. Used when there is no active dose rate for that day; otherwise the app adds up the dose rate itself.",
      why: "Every daily dose adds to your mission and career total, which has to stay under NASA's career limit (about 157 mGy of deep-space radiation).",
      how: "Read out from your personal dosimeter once a day. Wear the dosimeter at all times, including during sleep.",
      watch: "Spend sleep and off-duty time in the better shielded areas.",
      act: "Go to the storm shelter if the dose rate is high, and stay until it is back near its usual level.",
      call: "Any solar particle event warning, or a daily dose well above your usual."
    },

    /* ---------------- Periodic: weekly ---------------- */
    {
      key: "body_mass", aliases: ["mass", "weight", "body_weight"], label: "Body mass", label_cs: "Tělesná hmotnost", unit: "kg", decimals: 1,
      kind: "periodic", every: "week", region: "bones", device: "Body mass measurement device",
      valid: [30, 200], input: { min: 30, max: 200, step: 0.1 }, units: { "lb": { mul: 0.4536 } },
      range: { relative: true, normal: [-3, 3], watch: [-5, 5], axis: [-8, 8] },
      basis: "Change from your pre-flight baseline. Cut points are an assumption.",
      about: "Your mass, and how far it has moved from your pre-flight baseline.",
      why: "Losing mass usually means eating less than you burn, or losing muscle and bone. Both reduce strength and fitness for the rest of the mission.",
      how: "Once a week, before breakfast, with the body mass measurement device. It gently moves you on a spring and calculates your mass from the motion, because scales do not work without gravity. A crewmate operates the device and records the value.",
      watch: "Look at your food log: add a snack between meals and make sure you finish your planned portions.",
      act: "Add an extra meal or high-calorie snack every day this week and go through your food log with the Crew Medical Officer.",
      call: "More than 5% below your baseline."
    },
    {
      key: "glucose", aliases: ["glu", "blood_sugar", "blood_glucose", "fasting_glucose", "fasting_blood_glucose"], label: "Fasting blood glucose", label_cs: "Glykémie", unit: "mg/dL", decimals: 0,
      kind: "periodic", every: "3days", group: "blood", region: "blood", device: "Finger-prick test, glucose meter",
      recheck: { act_h: 0.25, watch_h: 24 },
      valid: [20, 600], input: { min: 20, max: 600, step: 1 }, units: { "mmol/L": { mul: 18.016 } },
      range: { normal: [70, 100], watch: [55, 125], axis: [50, 200] },
      basis: "Fasting test (before breakfast, at least 8 hours without food): 70 to 100 mg/dL is normal, 100 to 125 is the prediabetes range (Watch), above 125 is the diabetes range (Act now). American Diabetes Association values. Not NASA flight limits.",
      about: "Sugar in your blood, measured fasting: before breakfast, at least 8 hours after your last meal, so the readings can be compared.",
      why: "Blood sugar is your body's fuel. A low can cause confusion and shaking during critical tasks; highs over time show that the body is handling sugar less well.",
      how: "Every 3 days with the finger-prick test, before breakfast and at least 8 hours after eating (water is fine). Wash and dry your hands, prick the side of a fingertip with a fresh lancet, and put the drop of blood on the meter's test strip. The same drop can be used for lactate and haemoglobin.",
      watch: "Look at your meals for fast sugars, keep up exercise, and repeat tomorrow morning. Below 70: take about 15 g of fast carbohydrate and test again in 15 minutes.",
      act: "For a low: take about 15 g of fast carbohydrate now, tell a crewmate and test again in 15 minutes. For a high: drink water and test again in 2 hours. Tell the Crew Medical Officer either way.",
      call: "Above 180 or below 55, or a low with confusion or shaking."
    },
    {
      key: "lactate", aliases: ["blood_lactate", "lac"], label: "Lactate", label_cs: "Laktát", unit: "mmol/L", decimals: 1,
      kind: "periodic", every: "3days", group: "blood", region: "blood", device: "Finger-prick test, lactate meter",
      valid: [0, 30], input: { min: 0, max: 30, step: 0.1 },
      range: { normal: [0.5, 2.2], watch: [0.3, 4.0], axis: [0, 5] },
      basis: "General adult resting values. Not NASA flight limits.",
      about: "Lactic acid in your blood. Muscles make more of it during hard exercise; at rest it should be low.",
      why: "Lactate at rest shows whether your muscles get enough oxygen. A raised value can point to dehydration, illness or poor oxygen delivery.",
      how: "Every 3 days with the finger-prick test, at rest and at least 30 minutes after exercise. Put a drop of the same blood as for glucose on the lactate meter's test strip.",
      watch: "Rest, drink water and test again in an hour. Make sure you were not exercising just before.",
      act: "Rest, drink water and test again in an hour. If it is still high, or you feel short of breath or unwell, tell the Crew Medical Officer.",
      call: "Above 4 mmol/L at rest, or a raised value with breathlessness, confusion or fever."
    },
    {
      key: "body_temp", aliases: ["temp", "temperature", "core_temp", "oral_temp"], label: "Body temperature", label_cs: "Tělesná teplota", unit: "°C", decimals: 1,
      kind: "periodic", every: "week", region: "blood", device: "Oral thermometer, medical kit",
      valid: [30, 43], input: { min: 30, max: 43, step: 0.1 }, units: { "F": { add: -32, mul: 0.5556 } },
      range: { normal: [36.1, 37.4], watch: [35.5, 38.0], axis: [35, 39.5] },
      basis: "General adult oral values. Not NASA flight limits.",
      about: "Oral body temperature. Take it weekly, and any time you feel unwell.",
      why: "A fever is often the first sign of an infection, and in a closed cabin an infection can spread to the whole crew.",
      how: "Once a week, and any time you feel unwell, with the oral thermometer. Wait 30 minutes after exercise or a hot drink, place the tip under your tongue and keep your mouth closed until it beeps.",
      watch: "Measure again in an hour, drink water and watch for cough, sore throat or aches.",
      act: "Keep your distance from crewmates where you can, wear a mask, drink plenty and rest. Tell the Crew Medical Officer, who can start treatment from the medical kit.",
      call: "Above 38.0 °C or below 35.5 °C."
    },
    {
      key: "reaction_time", aliases: ["pvt", "reaction"], label: "Reaction time", label_cs: "Reakční doba", unit: "ms", decimals: 0,
      kind: "periodic", every: "week", region: "brain", device: "Reaction test page in this app (Take the test)", test: "reaction",
      valid: [100, 2000], input: { min: 100, max: 2000, step: 1 },
      range: { relative: true, normal: [-100, 10], watch: [-100, 20], axis: [-10, 30] },
      basis: "Change from your pre-flight baseline. Only slower is flagged. Cut points are an assumption.",
      about: "Average time to respond in the reaction test. Slower than your own baseline points to fatigue.",
      why: "Reaction time shows how alert you are. Slower reactions mean a higher risk of mistakes in critical tasks such as docking, robotics or repairs.",
      how: "Once a week with the reaction test in this app (3 minutes, or 1 minute for a quick check). Sit somewhere quiet and press the space bar or tap the screen as soon as the red counter appears. Do not press early: that counts as a false start.",
      watch: "Look at your sleep log. Avoid scheduling demanding tasks right after a short night.",
      act: "Ask a crewmate to double-check critical tasks, plan a recovery sleep, and take the test again tomorrow.",
      call: "More than 20% slower than your baseline."
    },

    /* ---------------- Periodic: monthly ---------------- */
    {
      key: "vision", aliases: ["visual_acuity", "acuity"], label: "Near vision", label_cs: "Zrak na blízko", unit: "", decimals: 2,
      kind: "periodic", every: "month", region: "eyes", device: "Eye chart on the tablet",
      valid: [0.05, 2.5], input: { min: 0.05, max: 2.5, step: 0.05 },
      range: { normal: [0.8, 2.5], watch: [0.6, 2.5], axis: [0.4, 1.4] },
      basis: "Decimal acuity, 1.0 is normal sight. Cut points are an assumption.",
      about: "How sharp your near vision is, as a decimal (1.0 is normal sight).",
      why: "Long missions can change the back of the eye and the optic nerve. Catching blurry near vision early means it can be checked before it affects your work.",
      how: "Once a month with the eye chart on the tablet. Hold the tablet at the marked distance in good light, cover one eye and read the smallest line you can, then repeat with the other eye. Log the result of the worse eye.",
      watch: "Repeat the eye chart in a week, same lighting and distance, and note any headaches.",
      act: "Tell the Crew Medical Officer, who can examine your eyes with the on-board eye imaging and ultrasound.",
      call: "Any sudden change in vision, or a drop from your last check."
    },
    {
      key: "wbc", aliases: ["white_blood_cells", "leukocytes"], label: "White blood cells", label_cs: "Bílé krvinky", unit: "×10⁹/L", decimals: 1,
      kind: "periodic", every: "2weeks", group: "blood", region: "blood", device: "Blood draw, analysed on board or on the ground",
      valid: [0.5, 50], input: { min: 0.5, max: 50, step: 0.1 },
      range: { normal: [4.0, 11.0], watch: [3.0, 12.0], axis: [2, 14] },
      basis: "General adult laboratory values. Not NASA flight limits.",
      about: "Number of white blood cells, the cells that fight infection.",
      why: "White blood cells fight infection. Low values mean a higher risk of getting ill; high values usually mean the body is already fighting something.",
      how: "Every 14 days from a blood draw from the arm, done with a crewmate's help and analysed with the handheld blood analyser.",
      watch: "Wash hands often and report any sign of infection.",
      act: "Repeat the test at the next opportunity, avoid contact with anyone who is ill, and tell the Crew Medical Officer.",
      call: "Below 3.0 or above 12.0, or any value with fever."
    },
    {
      key: "sodium", aliases: ["na", "serum_sodium"], label: "Sodium", label_cs: "Sodík", unit: "mmol/L", decimals: 0,
      kind: "periodic", every: "2weeks", group: "blood", region: "blood", device: "Blood draw, handheld blood analyser",
      valid: [100, 180], input: { min: 100, max: 180, step: 1 },
      range: { normal: [135, 145], watch: [130, 150], axis: [125, 155] },
      basis: "General adult laboratory values. Not NASA flight limits.",
      about: "Salt level in your blood. It shows whether your body's water and salt are in balance.",
      why: "Sodium shows whether water and salt in your body are in balance. An imbalance causes headaches, cramps and confusion, and it affects blood pressure.",
      how: "Every 14 days from the same blood draw as the white blood cells, analysed with the handheld blood analyser.",
      watch: "Look at how much you drink and how salty your food is. Test again at the next draw or sooner if asked.",
      act: "Repeat the test as soon as you can and tell the Crew Medical Officer.",
      call: "Below 130 or above 150, or with headache, confusion, muscle cramps or nausea."
    },
    {
      key: "ferritin", aliases: ["serum_ferritin", "feritin"], label: "Ferritin", label_cs: "Feritin", unit: "µg/L", decimals: 0,
      units: { "ng/mL": { mul: 1 }, "ng/ml": { mul: 1 }, "ug/L": { mul: 1 }, "ug/l": { mul: 1 }, "µg/l": { mul: 1 }, "mcg/L": { mul: 1 } },
      kind: "periodic", every: "2weeks", group: "blood", region: "blood", device: "Blood draw",
      valid: [1, 5000], input: { min: 1, max: 5000, step: 1 },
      range: { normal: [22, 355], watch: [10, 500], axis: [0, 600] },
      basis: "Normal range set by the team: 22 to 355 µg/L (the same numbers as ng/mL). Not NASA flight limits.",
      about: "How much iron your body has stored.",
      why: "Ferritin shows how much iron your body has stored. Too little leads to low haemoglobin and tiredness; too much has been linked to oxidative stress and bone loss.",
      how: "Every 14 days from the same blood draw as the white blood cells, analysed with the handheld blood analyser.",
      watch: "Go easy on iron-rich and iron-fortified foods, and check again at the next blood draw.",
      act: "Repeat the test as soon as you can and tell the Crew Medical Officer.",
      call: "Above 500 or below 15."
    },
    {
      key: "hemoglobin", aliases: ["hgb", "hb", "haemoglobin"], label: "Haemoglobin", label_cs: "Hemoglobin", unit: "g/dL", decimals: 1,
      kind: "periodic", every: "3days", group: "blood", region: "blood", device: "Finger-prick test, haemoglobin meter",
      valid: [3, 25], input: { min: 3, max: 25, step: 0.1 },
      range: { normal: [13.0, 18.0], watch: [12.0, 19.0], axis: [9, 20] },
      basis: "Normal range set by the team: 13 to 18 g/dL. Not NASA flight limits.",
      about: "The oxygen-carrying protein in red blood cells.",
      why: "Haemoglobin carries oxygen in your blood. When it drops, you tire faster and get out of breath more easily.",
      how: "Every 3 days with the finger-prick test, using the haemoglobin meter and the same drop of blood as for glucose and lactate.",
      watch: "Keep up iron-containing foods and your exercise plan. Note tiredness or breathlessness.",
      act: "Repeat the test as soon as you can and tell the Crew Medical Officer.",
      call: "Below 11.0, or with dizziness or breathlessness."
    },
    {
      key: "urine_calcium", aliases: ["ucalcium", "calcium_urine"], label: "Urine calcium", label_cs: "Vápník v moči", unit: "mg/day", decimals: 0,
      kind: "periodic", every: "month", group: "kidneys", region: "kidneys", device: "24-hour urine collection",
      valid: [0, 1500], input: { min: 0, max: 1500, step: 1 },
      range: { normal: [100, 250], watch: [50, 300], axis: [0, 400] },
      basis: "Common laboratory reference: under 250 mg a day for men, under 200 for women. Not NASA flight limits.",
      about: "Calcium leaving the body in urine over 24 hours.",
      why: "High urine calcium means bone is being broken down, and it raises the risk of kidney stones.",
      how: "Once a month from the 24-hour urine collection: collect all your urine for 24 hours in the provided bags, then analyse a sample of it.",
      watch: "Drink more water, keep up resistive exercise, and keep salt and animal protein moderate.",
      act: "Drink more, keep up resistive exercise every day, and tell the Crew Medical Officer.",
      call: "Above 300 mg a day, or together with pain in your side or back."
    },
    {
      key: "urine_volume", aliases: ["urine_output", "volume_24h"], label: "Urine volume", label_cs: "Objem moči", unit: "L/day", decimals: 1,
      kind: "periodic", every: "month", group: "kidneys", region: "kidneys", device: "24-hour urine collection",
      valid: [0.1, 10], input: { min: 0.1, max: 10, step: 0.1 }, units: { "mL": { mul: 0.001 }, "ml": { mul: 0.001 } },
      range: { normal: [2.5, 5.0], watch: [1.5, 6.0], axis: [1, 4] },
      basis: "Kidney stone prevention guidelines aim for at least 2.5 litres of urine a day.",
      about: "All the urine you pass in 24 hours. The most important single factor in preventing kidney stones: more urine means the salts that form stones stay dissolved.",
      why: "Too little urine concentrates the salts that form kidney stones. Drinking enough is the single best protection.",
      how: "Once a month during the 24-hour urine collection: the total volume of all urine collected in 24 hours.",
      watch: "Drink more through the day: keep a drink bag with you and refill it at every meal.",
      act: "Drink an extra litre today, spread over the day, and tell the Crew Medical Officer if it does not improve.",
      call: "Below 1.5 litres a day, or together with pain in your side or back."
    },
    {
      key: "urine_oxalate", aliases: ["oxalate", "uox"], label: "Urine oxalate", label_cs: "Oxaláty v moči", unit: "mg/day", decimals: 0,
      kind: "periodic", every: "month", group: "kidneys", region: "kidneys", device: "24-hour urine collection",
      valid: [0, 300], input: { min: 0, max: 300, step: 1 },
      range: { normal: [0, 40], watch: [0, 45], axis: [0, 60] },
      basis: "Common laboratory reference: about 10 to 40 mg a day.",
      about: "Oxalate in your urine over 24 hours. It joins with calcium to make calcium oxalate, the most common kind of kidney stone.",
      why: "Oxalate joins with calcium to form the most common kind of kidney stone.",
      how: "Once a month from a sample of the 24-hour urine collection.",
      watch: "Go easy on high-oxalate foods, and eat them together with something containing calcium. Drink more water.",
      act: "Cut high-oxalate foods for a week, drink more, and tell the Crew Medical Officer.",
      call: "Above 45 mg a day, or together with pain in your side or back."
    },
    {
      key: "urine_citrate", aliases: ["citrate", "ucit"], label: "Urine citrate", label_cs: "Citrát v moči", unit: "mg/day", decimals: 0,
      kind: "periodic", every: "month", group: "kidneys", region: "kidneys", device: "24-hour urine collection",
      valid: [0, 3000], input: { min: 0, max: 3000, step: 1 },
      range: { normal: [320, 1200], watch: [250, 1500], axis: [100, 900] },
      basis: "Low urine citrate is commonly defined as under 320 mg a day. Cut points are an assumption.",
      about: "Citrate in your urine over 24 hours. Citrate protects against stones: it binds calcium and stops crystals from growing and clumping.",
      why: "Citrate protects against kidney stones: it binds calcium and stops crystals from growing. Low citrate removes that protection.",
      how: "Once a month from a sample of the 24-hour urine collection.",
      watch: "Drink more water and eat more fruit and vegetables, especially citrus. Potassium citrate from the medical kit can help; agree it with the Crew Medical Officer first.",
      act: "Talk to the Crew Medical Officer about starting potassium citrate from the medical kit.",
      call: "Below 250 mg a day, or together with pain in your side or back."
    },
    {
      key: "urine_ph", aliases: ["ph", "ph_urine", "uph"], label: "Urine pH", label_cs: "pH moči", unit: "", decimals: 1,
      kind: "periodic", every: "week", group: "kidneys", region: "kidneys", device: "Urine dipstick from the medical kit",
      valid: [4, 9], input: { min: 4, max: 9, step: 0.1 },
      range: { normal: [5.5, 7.0], watch: [5.0, 7.5], axis: [4.5, 8] },
      basis: "Healthy urine is usually between 4.5 and 8. Staying roughly between 5.5 and 7 limits the types of stone that depend on pH. Cut points are an assumption.",
      about: "How acidic your urine is. 7 is neutral; lower numbers are more acidic.",
      why: "Urine that is too acidic or too alkaline lets certain kinds of kidney stones form.",
      how: "Once a week on the first urine of the morning, with a dipstick from the medical kit. Dip the strip briefly, wait the time printed on the pot, and compare the colour of the pH pad with the chart.",
      watch: "Drink more water and eat more fruit and vegetables if it is low. Test again in a few days.",
      act: "Test again tomorrow morning. If it is still out of range, tell the Crew Medical Officer.",
      call: "Below 5.0 or above 7.5 on repeated tests, or together with pain in your side or back."
    },
    {
      key: "urine_sg", aliases: ["specific_gravity", "usg", "sg"], label: "Urine concentration", label_cs: "Koncentrace moči", unit: "SG", decimals: 3,
      kind: "periodic", every: "week", group: "kidneys", region: "kidneys", device: "Urine dipstick (same strip as pH)",
      valid: [1.0, 1.04], input: { min: 1.0, max: 1.04, step: 0.001 },
      range: { normal: [1.005, 1.020], watch: [1.002, 1.030], axis: [1.0, 1.035] },
      basis: "General adult reference values (specific gravity). Not NASA flight limits.",
      about: "How concentrated your urine is, as specific gravity. Higher means you are drier; water is 1.000.",
      why: "Concentrated urine shows you are not drinking enough. That is the first step toward kidney stones, and it also causes headaches and tiredness.",
      how: "Once a week, read from the same dipstick as urine pH: compare the specific gravity pad with the chart on the pot.",
      watch: "Drink more water through the day and test again in a few days.",
      act: "Drink an extra litre today, spread over the day, and test again tomorrow.",
      call: "Above 1.030 on repeated tests, or together with pain in your side or back."
    },
    {
      key: "kidney_stone_risk", aliases: ["stone_risk"], label: "Kidney stone risk", label_cs: "Riziko ledvinových kamenů", unit: "of 5 risk factors", decimals: 0,
      kind: "periodic", every: "month", group: "kidneys", region: "kidneys", device: "Worked out by the app from your urine tests",
      valid: [0, 5],
      /* Derived: not logged by hand. One point per urine test; each factor counts when its metric is beyond the normal range in the given direction.
         window_days: how far from the 24-hour collection a value may be to count (weekly dipstick results get a wider window). */
      derive: {
        anchors: ["urine_volume", "urine_calcium", "urine_oxalate", "urine_citrate"],
        factors: [
          { metric: "urine_volume", when: "below", text: "risk if below 2.5 L a day", window_days: 2 },
          { metric: "urine_calcium", when: "above", text: "risk if above 250 mg a day", window_days: 2 },
          { metric: "urine_oxalate", when: "above", text: "risk if above 40 mg a day", window_days: 2 },
          { metric: "urine_citrate", when: "below", text: "risk if below 320 mg a day", window_days: 2 },
          { metric: "urine_ph", when: "outside", text: "risk if below 5.5 or above 7.0", window_days: 5 }
        ]
      },
      range: { normal: [0, 1], watch: [0, 2], axis: [0, 5] },
      basis: "A simple count of well-known risk factors from 24-hour urine testing. Ground teams use a full laboratory calculation (supersaturation); this is a simplification for a quick check.",
      about: "How many of five known risk factors showed up in your latest urine tests: low urine volume, high calcium, high oxalate, low citrate, and urine pH outside the safe band.",
      why: "A kidney stone is very painful and hard to treat during a mission, so preventing one matters. The risk builds up slowly, and only the urine results show it.",
      how: "Worked out by the app from the monthly 24-hour urine collection (volume, calcium, oxalate and citrate) and the nearest weekly dipstick (pH). There is nothing extra to measure.",
      watch: "Drink more water: aim for at least 2.5 litres of urine a day. Keep salt and animal protein moderate, keep up resistive exercise, and talk to the Crew Medical Officer about potassium citrate from the medical kit.",
      act: "Drink at least 3 litres a day, and ask the Crew Medical Officer to check your kidneys with the on-board ultrasound.",
      call: "Pain in your side or back, pain when passing urine, blood in your urine, or nausea or fever together with any of these."
    }
  ],

  /* Follow-up checks: when a value is out of its normal range, which other measurements help confirm or rule out the cause.
   * when: "high" (above normal), "low" (below normal) or "any". check: metric keys. also: extra steps that are not measurements in this app.
   * These are prompts to look further, not a diagnosis. */
  followups: {
    heart_rate: [
      { when: "high", check: ["body_temp", "spo2", "sleep_hours", "urine_sg"], why: "A fast resting heart rate is often caused by fever, low oxygen, poor sleep or dehydration." },
      { when: "low", check: ["bp_sys", "spo2"], why: "A slow heart rate matters most if blood pressure or oxygen are also low, or if you feel dizzy." }
    ],
    spo2: [{ when: "low", check: ["resp_rate", "heart_rate", "hemoglobin"], why: "Low oxygen with fast breathing points to the lungs or cabin air; low haemoglobin means less oxygen can be carried.", also: ["Check the cabin CO2 readout."] }],
    bp_sys: [
      { when: "high", check: ["sodium", "sleep_hours", "heart_rate"], why: "Salt, poor sleep and stress all raise blood pressure.", also: ["Confirm with the arm cuff."] },
      { when: "low", check: ["heart_rate", "urine_sg", "urine_volume"], why: "Low pressure is often caused by dehydration." }
    ],
    resp_rate: [{ when: "high", check: ["spo2", "body_temp", "heart_rate"], why: "Fast breathing at rest together with fever or low oxygen can mean an infection." }],
    ventilation: [{ when: "high", check: ["spo2", "resp_rate"], why: "Breathing more air at rest can mean extra CO2 in the cabin or trouble getting enough oxygen.", also: ["Check the cabin CO2 readout."] }],
    skin_temp: [{ when: "high", check: ["body_temp"], why: "Skin temperature is only a hint; the oral thermometer tells you whether you have a fever." }],
    body_temp: [{ when: "high", check: ["wbc", "heart_rate", "resp_rate"], why: "A fever with raised white blood cells or fast breathing suggests an infection." }],
    sleep_hours: [{ when: "low", check: ["reaction_time", "mood"], why: "Short sleep shows up as slower reactions and lower mood." }],
    mood: [{ when: "low", check: ["sleep_hours", "crew_connection", "reaction_time"], why: "Low mood often goes together with poor sleep or feeling cut off from the crew." }],
    crew_connection: [{ when: "low", check: ["mood", "sleep_hours"], why: "Feeling isolated often shows up in mood and sleep too.", also: ["Plan a shared meal or film night."] }],
    reaction_time: [{ when: "high", check: ["sleep_hours", "mood"], why: "Slower reactions are usually caused by fatigue." }],
    body_mass: [{ when: "low", check: ["exercise_min", "glucose", "urine_calcium"], why: "Losing mass can mean eating too little, or losing muscle and bone." }],
    vision: [{ when: "low", check: ["bp_sys"], why: "Vision changes in space are linked to fluid shifting toward the head.", also: ["Ask the Crew Medical Officer for an eye exam with the on-board imaging.", "Note any headaches."] }],
    glucose: [
      { when: "high", check: ["body_mass", "exercise_min", "lactate"], why: "Repeat the test before breakfast; less exercise and diet changes raise blood sugar." },
      { when: "low", check: ["body_mass", "exercise_min"], why: "A low can follow a hard workout or a missed meal." }
    ],
    lactate: [{ when: "high", check: ["spo2", "urine_sg", "hemoglobin", "body_temp"], why: "Raised lactate at rest can come from dehydration, low oxygen or illness.", also: ["Make sure you had not exercised in the last 30 minutes."] }],
    wbc: [
      { when: "high", check: ["body_temp", "resp_rate", "heart_rate"], why: "Raised white blood cells usually mean the body is fighting an infection." },
      { when: "low", check: ["body_temp", "hemoglobin"], why: "Low white blood cells make infections more likely; see whether red blood cells are affected too." }
    ],
    hemoglobin: [{ when: "low", check: ["ferritin", "spo2", "heart_rate"], why: "Low haemoglobin with low ferritin points to low iron; a fast heart rate can be the body compensating." }],
    ferritin: [
      { when: "high", check: ["hemoglobin", "urine_calcium"], why: "High iron stores are common in space; they have been linked to bone loss." },
      { when: "low", check: ["hemoglobin"], why: "Low iron stores can lead to low haemoglobin." }
    ],
    sodium: [{ when: "any", check: ["urine_sg", "urine_volume", "bp_sys"], why: "Sodium depends on how much you drink and how your kidneys handle water." }],
    urine_ph: [
      { when: "high", check: ["urine_calcium", "urine_citrate", "urine_volume", "kidney_stone_risk"], why: "Alkaline urine (high pH) favours calcium phosphate stones. These show whether stones are actually likely.", also: ["Tell the Crew Medical Officer about any pain in your side or back."] },
      { when: "low", check: ["urine_volume", "urine_sg", "kidney_stone_risk"], why: "Acidic urine (low pH) favours uric acid stones, especially when you are dehydrated." }
    ],
    urine_sg: [{ when: "high", check: ["urine_volume", "urine_ph", "kidney_stone_risk"], why: "Concentrated urine means you are low on fluid, the first step toward kidney stones." }],
    urine_volume: [{ when: "low", check: ["urine_sg", "sodium", "kidney_stone_risk"], why: "Too little urine concentrates everything that forms stones." }],
    urine_calcium: [{ when: "high", check: ["urine_citrate", "urine_volume", "exercise_min", "body_mass"], why: "High urine calcium often means bone loss; citrate and fluids decide whether it turns into stones." }],
    urine_oxalate: [{ when: "high", check: ["urine_calcium", "urine_volume"], why: "Oxalate forms stones together with calcium, especially in concentrated urine." }],
    urine_citrate: [{ when: "low", check: ["urine_ph", "kidney_stone_risk"], why: "Citrate protects against stones; low citrate and low pH often go together." }],
    kidney_stone_risk: [{ when: "high", check: ["urine_volume", "urine_sg", "urine_ph"], why: "Fluids are the quickest thing you can change; recheck concentration and pH within a week.", also: ["If you have pain in your side or back, or blood in your urine, ask the Crew Medical Officer for a kidney ultrasound."] }],
    radiation_dose_rate: [{ when: "high", check: [], why: "A rate well above the steady cosmic-ray background usually means a solar particle event.", also: ["Check the space weather alerts and go to the storm shelter if the rate keeps rising."] }]
  }
};
