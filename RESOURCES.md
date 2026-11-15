# CHC resources

Everything the project is built from and relies on as the files, the tools, the data, sources, texts and features.


## 1. Project files

| Component | Files |
|---|---|
| Web application | `index.html`, `css/`, `js/`, `img/` |
| Configuration | `js/config.js` |
| Data processing | `js/data.js`, `js/derived.js` |
| Health assessment | `js/status.js`, `js/diagnose.js` |
| AI summaries | `js/ai.js` |
| Sample data | `data/`, `js/curiosity-rad.js` |
| Optional utilities | `python/`, `tools/`, `start-server.bat` |
| Documentation | `README.md`, `DATA.md`, `RESOURCES.md`, `SOURCES.md`, `LICENSE` |



## 2. Tools and technology

| Technology | Purpose |
|---|---|
| HTML, CSS, JavaScript | Web application and SVG visualizations |
| IndexedDB | Local storage of crew health data |
| Service Worker | Offline functionality |
| Python | Local server and data processing |
| Gemini Nano | On-device AI via Chrome Prompt API |
| Llama 3.2 (Ollama) | Local AI alternative |
| JavaScript rules | Health assessment and AI fallback |
| Node.js | Optional data conversion tools |

## 3. Data used

- **Real radiation data: Curiosity (Mars Science Laboratory) RAD, cruise to Mars, Dec 2011 – Jan 2012.** NASA Planetary Data System, PPI node, data set MSL-M-RAD-3-RDR-V1.0 (Reduced Data Records). 
  Data: https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/CRUISE/

- **Generated data:** everything else in the sample (Bio-Monitor, daily and weekly checks, urine tests) and `python/simulate.py` is built from averages. Not real astronaut data.

-  **The sample crew (real people, generated health data).** The three astronauts are the crew named for Vast-PAM-1. Their health numbers are not theirs (Curiosity radiation and generated values, see above)

## 4. Sources


## RADIATION

https://www.swri.org/press-release/swri-led-team-calculates-radiation-exposure-associated-trip-mars
- Curiosity mission, background on the way to Mars — Sieverts

https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/CRUISE/
- Curiosity mission, background on the way to Mars — Grays

https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/
- How to protect from radiation

https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf
- Career limit shown on the cumulative dose

https://scispace.com/pdf/mars-surface-radiation-environment-measured-with-the-mars-244eildtx0.pdf
- Radiation environment measured in Sieverts

## URINE TESTS

https://kidneystones.uchicago.edu/2016/01/07/how-to-read-your-kidney-stone-lab-report/
- Urine volume 24h, at least 2.5 L a day for stone prevention, 2.5–5 L

https://renal.testcatalog.org/show/CALU
- Urine calcium 24h, 100–250 mg/day

https://litholink.labcorp.com/sites/default/files/2023-06/Sample%20Report%20910235%20-%20FINAL.pdf
- Urine oxalate 24h, 0–40 mg/day

https://mobile.fpnotebook.com/Uro/Renal/ClcmNphrlths.htm
- Urine citrate 24h, 320 mg/day or more

https://www.cigna.com/knowledge-center/hw/medical-tests/urine-test-hw6580
- Urine pH dipstick, lab normal 4.6–8.0, CHC range 5.5–7.0

https://medlineplus.gov/ency/article/003587.htm
- Urine concentration, lab normal 1.005–1.020

## BLOOD TESTS

https://www.ucsfhealth.org/care/medical-tests/wbc-count
- White blood cell count, 4,500–11,000 cells/µL

https://www.sundhed.dk/sundhedsfaglig/laegehaandbogen/undersoegelser-og-proever/klinisk-biokemi/blodproever/ferritin/
- Ferritin, 22–355 µg/L

https://www.sciencedirect.com/topics/biochemistry-genetics-and-molecular-biology/sodium-blood-level
- Sodium, 135–145 mmol/L

https://www.ncbi.nlm.nih.gov/books/NBK604207/
- Hemoglobin, 13–18 g/dL

https://my.clevelandclinic.org/health/body/21871-white-blood-cells
- White blood cell count, 4,000–11,000 cells/µL

https://my.clevelandclinic.org/health/diagnostics/21952-fasting-blood-sugar
- Fasting blood glucose, 70–100 mg/dL

## MOOD

https://www.nasa.gov/hrp/human-factors-and-behavioral-performance/hfbp-risks/
- Isolation, crew connection, well-being

## BIO-MONITOR SENSOR

https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp
- Sensor of vital signs

https://www.aarp.org/health/healthy-living/what-is-a-healthy-heart-rate/
- Heart rate at rest 50–90 bpm, during exercise up to 90% of maximum

https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/
- Blood oxygen SpO2, 95–100%

https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings
- Blood pressure at rest, systolic 90–129 mmHg, diastolic 55–84 mmHg

https://pmc.ncbi.nlm.nih.gov/articles/PMC10743421/
- Blood pressure during exercise, systolic up to 200 mmHg

https://www.respiratorytherapyzone.com/minute-ventilation-calculator/
- Breathing rate at rest 12–20/min, minute ventilation 5–10 L/min

https://www.cdc.gov/physical-activity-basics/measuring/
- Activity counted as exercise, 3 METs or more

https://www.sciencedirect.com/science/article/abs/pii/S0378778825001550
- Skin temperature 32–35.5 °C

## DAILY AND WEEKLY CHECKS

https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/
- Sleep 7–9 h

https://pmc.ncbi.nlm.nih.gov/articles/PMC3418963/
- Oral body temperature 36.1–37.4 °C

https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Astronauts/Daily_life
- Exercise, approximately 2 hours daily, 110 min CHC-defined

https://pubmed.ncbi.nlm.nih.gov/25197887/
- Body mass change, ±3% from pre-flight, CHC-defined

[[https://pmc.ncbi.nlm.nih.gov/articles/PMC3208580/](https://www.nature.com/articles/s41526-016-0010-8)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/?utm_source)
- Reaction time, PVT-B assessment, 10% threshold CHC-defined

https://ntrs.nasa.gov/api/citations/20240004680/downloads/H3PO_EA2_AsMA2024_VisuaAcuity_Hew_v4.pdf
- Near vision, 0.8 or better, CHC-defined

https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/
- Astronaut vision changes, SANS

https://www.nasa.gov/hrp/human-factors-and-behavioral-performance/hfbp-risks/
- Crew connection, psychological wellbeing, 3–5 CHC-defined

## ADDITIONAL BLOOD TESTS

https://medlineplus.gov/lab-tests/lactate-dehydrogenase-ldh-test/
- Lactate dehydrogenase test, not blood lactate

https://medlineplus.gov/lab-tests/lactic-acid-test/
- Lactate, 0.5–2.2 mmol/L

## EMERGENCY LIMITS

https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/
- Respiratory rate, emergency assessment

https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/
- Heart rate, emergency assessment

https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/
- Body temperature, emergency assessment

https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/
- Blood oxygen, emergency assessment

https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings
- Blood pressure, hypertensive crisis

https://diabetesjournals.org/care/issue/48/Supplement_1
- Blood glucose, severe hypoglycemia

## POSSIBLE HEALTH CONDITIONS

https://www.nasa.gov/hrp/human-factors-and-behavioral-performance/hfbp-risks/
- Isolation, behavioral health risks

https://www.nasa.gov/humans-in-space/the-human-body-in-space/
- Spaceflight, physiological health effects

https://www.nasa.gov/hrp/
- Spaceflight, medical risk research

https://www.nasa.gov/humans-in-space/
- Spaceflight, astronaut health research

## MEASUREMENT PROCEDURES

https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings
- Blood pressure, measurement guidance

https://medlineplus.gov/lab-tests/pulse-oximetry/
- Pulse oximeter, measurement procedure

https://www.nasa.gov/
- Body mass, microgravity measurement



### Possible causes

https://www.nasa.gov/humans-in-space/the-human-body-in-space/
- Spaceflight effects on human health

https://www.nasa.gov/hrp/
- NASA human health research

https://pmc.ncbi.nlm.nih.gov/articles/PMC3863169
- Acute radiation syndrome management

https://www.cdc.gov/radiation-emergencies/hcp/clinical-guidance/ars.html
- Radiation exposure and health effects

https://sciencedaily.com/releases/2014/05/140501100922.htm
- Cabin CO₂ and headaches

https://ntrs.nasa.gov/citations/20100036637
- CO₂ exposure during spaceflight

https://ohri.ca/en/newsroom/being-space-destroys-more-red-blood-cells
- Red blood cell destruction

https://pmc.ncbi.nlm.nih.gov/articles/PMC7005826
- Spaceflight-associated vision changes

https://eyewiki.aao.org/Spaceflight-Associated_Neuro-Ocular_Syndrome_(SANS)
- Spaceflight-associated neuro-ocular syndrome

https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/
- NASA research on SANS

https://ntrs.nasa.gov/api/citations/20170004709/downloads/20170004709.pdf
- Kidney stone formation risk

https://ntrs.nasa.gov/citations/20070008213
- Kidney stone prevention research

https://pubmed.ncbi.nlm.nih.gov/25197887/
- Body mass loss during spaceflight

### How it is measured

https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home
- Blood pressure measurement procedure

https://magazine.medlineplus.gov/article/getting-an-accurate-read-on-pulse-oximeters
- Accurate pulse oximeter measurements

https://medlineplus.gov/lab-tests/pulse-oximetry/
- Blood oxygen measurement method

https://www.nasa.gov/?p=668373
- Measuring body mass in microgravity

https://www.space.com/space-exploration/human-spaceflight/how-do-astronauts-weigh-themselves-in-space
- Astronaut body mass measurement

### Mission communication

https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf
- Earth–Mars communication delays


## 5. How features work

| Feature | How | Where |
|---|---|---|
| Normal / Watch / Act now | Fixed ranges; exercise ≥3 METs; max HR = 220 − age | `js/config.js`, `js/status.js` |
| Urgency levels | Calm, watch, act now, emergency; emergency limits or 3+ Act now results | `js/diagnose.js` |
| Possible causes | 22 conditions ranked by matching flagged results; critical triggers prioritized | `js/diagnose.js` |
| AI summaries | Chrome on-device AI → Ollama → offline fallback; code-based assessment, output checked | `js/ai.js` |
| Suggested tests | Follow-up rules and `TEST_PURPOSE` explanations | `js/config.js`, `js/diagnose.js` |
| Crew management | Separate data per astronaut; normalized names; Aleš Svoboda first | `js/data.js`, `js/app.js` |
| Data import | Multiple JSON formats, unit conversion, NASA RAD adapter; Sv ÷ 3.82 for gray estimates | `js/data.js` |
| Date adjustment | Historical dates shifted to current mission; last 30 days retained | `js/data.js` |
| Simulation | Temporary changes on a data copy; resting defaults; never saved | `js/data.js`, `js/app.js`, `js/diagnose.js` |
| Kidney stone risk | 0–5 risk factors from urine measurements | `js/derived.js` |
| Reaction tests | PVT-B and Circles, 20 random targets | `js/reaction.js` |
| Crew scoreboard | PVT-B latest result vs. baseline; Circles best score; local storage | `js/reaction.js`, `js/app.js` |
| Crew profiles | Real astronaut career facts; synthetic health data | `js/config.js`, `js/app.js` |

## 6. What is an assumption
- **Reference ranges:** General adult values, not official NASA flight limits.
- **Fasting glucose:** Normal 70–100 mg/dL, Watch 101–125, Act now >125; [ADA](https://diabetes.org/about-diabetes/diagnosis), [Cleveland Clinic](https://my.clevelandclinic.org/health/diagnostics/21952-fasting-blood-sugar).
- **Ferritin:** Normal 22–355 µg/L, Watch 10–500; [reference](https://www.sundhed.dk/sundhedsfaglig/laegehaandbogen/undersoegelser-og-proever/klinisk-biokemi/blodproever/ferritin/).
- **Hemoglobin:** Normal 13–18 g/dL, Watch 12–19; [reference](https://www.ncbi.nlm.nih.gov/books/NBK604207/).
- **Team-defined thresholds:** Mood, crew connection, body mass, reaction time, vision, and radiation above 0.48 mGy/day.
- **Emergency limits:** Based on clinical references but adapted by the team. Conditions and suggested actions are not validated medical protocols; treatment decisions belong to the Crew Medical Officer.
- **Historical dates:** Shifted to the present for demonstration.
- **Sample data:** Curiosity radiation is measured; other health data is generated or adapted from team files. Real astronauts, fictional medical records and Mars mission. Golemis as Crew Medical Officer is fictional.
- **ECG:** Replayed waveform; no heart-rhythm analysis.
- **References:** Indicator details and `index.html#limits` display sources from `js/config.js`.

## 7. Mission framing

- **App:** CHC — Cabin Health Companion.
- **Crew:** Aleš Svoboda, Thomas Pesquet, Adrianos Golemis; Aleš shown first.
- **Visuals:** Body figure credited to Claude; Bio-Monitor values labeled "Measured by the Bio-Monitor".
- **Mission:** Fictional 30-day Mars transit; maximum 30 days of data.
- **Offline:** Entire application works offline; AI summaries in English only.
- **Scope:** Spaceflight measurements, excluding Moon and Mars surface.
- **Medical support:** No onboard flight surgeon; crew follows guidance and consults the Crew Medical Officer.
