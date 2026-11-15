# CHC · Cabin Health Companion

A health self-check for astronauts on a 30-day mission en route to Mars. The sample crew member is **Aleš Svoboda**. The app is plain HTML, CSS and JavaScript (no frameworks, no build step, works offline), with an optional Python server and Python tools for the data team.

## Run it

Two ways, same app:

- **Without Python:** double-click `index.html`. It opens with generated sample data and a live demo feed. Load real data with the **Data** button.
- **With Python (recommended for the demo):** double-click `start-server.bat` (Windows), or run `python server.py` inside the `python` folder, then open http://127.0.0.1:8000. Every JSON file in `data/` loads automatically, and Python scripts can send live readings into the open page.

Needs Python 3.8 or newer. Standard library only: nothing to `pip install`.

The data format is in **[DATA.md](DATA.md)**.

## Works offline

The whole app works without internet. It uses no web fonts, no libraries from the internet and no online services; nothing leaves the computer.

- **Opened as a file** (double-click `index.html`): offline from the start.
- **Opened from a web address** (the Python server, or a copy put on a website): the first visit stores a copy of the app (`sw.js`), so it keeps working when the server or the internet is gone. Data loaded before stays available.
- **AI summary:** the offline assistant always works without internet. Chrome's on-device AI and Ollama also run on the computer; each needs internet only once, to download its model.

## Crew members

Each astronaut's data is kept apart, by the name in the file: `"crew": {"name": "Aleš Svoboda"}` for the whole file, or `"crew": "Petr Pavel"` on a single reading or series. Names are matched without accents and capitals, so "Ales Svoboda" is the same person as "Aleš Svoboda". Data without a name goes to the crew member on screen (at the start, the one in `crew` in `js/config.js`).

**The sample crew.** Without your own data the app shows three astronauts: **Aleš Svoboda** (pilot, shown first), **Thomas Pesquet** (commander) and **Adrianos Golemis** (mission specialist). They are the real crew named for Vast-PAM-1, the private ISS mission planned for 2027. Their profiles live in `roster` in `js/config.js`, and each fact links to a public source (ESA, Spacefacts, the Vast/ESA announcement and others). Astronauts' medical data is not public, so the health numbers are not theirs:
- **Blood draws and finger-pricks** (white blood cells, ferritin, sodium, glucose, haemoglobin, lactate) come from the team's own data files. Aleš gets them exactly; Thomas and Adrianos get their own version of the same baseline, so nobody has identical results. Dates are moved to the mission calendar (day 1 = 29 days before today; blood on days 1, 15, 29; finger-prick every 3 days from day 1). The team's high white blood cell count (12.8) is why Aleš shows "Act now".
- **Radiation** is real: NASA's Curiosity rover measured it on its cruise to Mars (`js/curiosity-rad.js`, built from `data/radiation-msl-cruise.json`), moved in time to end now. All three share the cabin, so they get the same values.
- **Everything else** is generated inside the app's valid ranges, with a different story per person: Aleš has had short nights and slower reactions, Thomas is steady, Adrianos is drinking too little.

`node tools/export-sample.js` writes the full files to `data/sample-crew-*.json` and the team's files fitted to each astronaut to `data/team/` (`<name>-blood-draw.json`, `<name>-finger-prick.json`).

When more than one crew member is loaded, the name at the top becomes a menu to switch between them. The small **i** next to each name (in the menu, in the header and on the scoreboard) shows a short description; "Full profile and sources" opens the whole profile with links. Everything on screen (summary, body figure, charts, checks, AI summary, health report, export) is for the selected crew member, and **Log a measurement** saves to that person. The Data dialog lists everyone with how many values they have.

## Loading data in any shape

The **Data** dialog reads the team format from [DATA.md](DATA.md), and also:

- **Rows with several measurements as columns**, e.g. `{"timestamp": "...", "heart_rate_bpm": 62, "spo2_pct": 97, "body_temp_c": 36.6}`. A unit at the end of a column name is understood (`_bpm`, `_pct`, `_c`, `_usv_h`, `_ugy_h`, `_msv`, `_mmol_l`…).
- **Units written any common way**: "µGy/h", "uGy/hr", "microgray/hour", "mGy per day", "mmol/l".
- **Radiation in any unit**: the app works in gray (absorbed dose): dose rates in µGy/h, mGy/h, nGy/h, µGy/day, and doses in mGy, µGy, Gy. A value is sent to the right place by its unit: a rate (µGy/h) goes to the active dose rate, a dose (mGy) to the daily dose. Older files in sievert (µSv/h, mSv) are turned into gray by dividing by the quality factor 3.82 that Curiosity measured on the way to Mars.
- **NASA's Curiosity (MSL) RAD cruise files**, like `nasa_rad_observations.json` (absorbed dose rate in µGy/h from detectors B and E): read directly, detector E, which responds like human tissue. The same data, already converted, is in `data/radiation-msl-cruise.json`.

**Dates are fitted to the 30-day mission.** A file whose data does not end around today is moved forward in whole days (so times of day stay the same) to end today, and only the last 30 days are kept. Files loaded together, or from the same period, are moved by the same amount, so data from different teammates stays lined up. The import report says what was moved and by how much.

## Simulate a situation

**Simulate** (top right, or at the bottom of the AI summary) makes the whole dashboard and the AI summary react to a situation as if it were real: high heart rate at rest, high radiation (solar storm), low blood oxygen, cabin air problem, infection with high fever, high blood pressure, low blood sugar, dehydration, kidney stone forming (24-hour urine test: high calcium, oxalate, low citrate and urine volume, acidic and concentrated urine; all 5 kidney stone risk factors), radiation damage to the blood (days after a big solar particle event caught outside the shelter: white blood cells 2.6, haemoglobin slightly low, daily dose 420 mGy, no fever yet), exhaustion, or normal vital signs. Or set your own values (any measurement, as many as you like). Sensor values are simulated at rest; sensors you do not set get normal resting values, so only what you chose is off.

A blue bar at the top says a simulation is running and what is simulated. Nothing is saved: the simulated values live on a copy of the data, and stopping the simulation, logging a real value, importing a file or switching crew member brings the real data back. Good for demos and for practising the emergency steps.

## AI summary (runs in the browser)

The **AI summary** card sits across the page under the summary and the body figure. It is not a chatbot. It is English only. It reads all the numbers and gives:

- an **urgency level**, and a summary whose tone follows it:
  - **All normal**: relaxed, two sentences.
  - **Keep an eye on it** (something is Watch): calm and practical.
  - **Act now**: firm and direct, the problem and its number first.
  - **Emergency**: red card, starts with "Emergency.", says plainly that the value is dangerous and can become life-threatening, and tells you to act right now. Emergency means a value past the emergency limits in `js/diagnose.js` (for example blood oxygen below 88%, resting heart rate above 150 or below 40, temperature 39.5 °C or more, glucose below 54 mg/dL, dose rate above 1300 µGy/h), or 3 or more Act now results at once.
- **Left column, under the summary — What could be causing it**: up to 3 possible causes (for example cabin air problem, infection, dehydration, low blood sugar, solar particle event, kidney stone forming), ranked by how many flagged results fit each one, with those results shown as tags, a short explanation and how to check it.
- **Right column, under the body figure — Do this now** (or **What to do**): numbered steps from the leading cause. In an emergency these are survival steps: stop and anchor yourself, the specific action (oxygen mask, storm shelter, fast sugar…), alert the crew and the Crew Medical Officer, and message mission control without waiting for the answer.
- **Suggested tests** (right column): up to 3 next measurements, each with a short reason why, for example "Your heart rate is high: it tells whether you have a fever, the most common sign of an infection", and a Log button. The reasons come from `TEST_PURPOSE` in `js/diagnose.js`.

It runs by itself after every new measurement (debounced 400 ms; an older answer that arrives late is thrown away). Press **Re-run** to write it again. The card shows which AI wrote the text and how long it took, and "AI providers" lists what this computer has.

It is all in `js/ai.js`: plain JavaScript, no Python and no server. It works whether you double-click `index.html` or use the Python server. It tries, in order:

1. **Chrome's built-in AI** (Gemini Nano, on the device). Desktop Chrome 148 or newer on a computer with enough memory (a GPU with more than 4 GB, or 16 GB of RAM). The first time, the card shows **Turn on Chrome's on-device AI**; one click starts a one-time model download.
2. **Ollama** on this computer, called directly from the page.
3. **Offline assistant** in JavaScript: no model, no internet, always works. It writes the assessment from the app's own data in the tone of the urgency level: how long something has been out of range ("below its normal range for 7 days in a row"), how it compares with your baseline, which flagged items are linked, and the most likely cause.

The statuses, the urgency, the list of possible causes and the steps all come from the app's code (`js/status.js` and `js/diagnose.js`), so the safety steps are always the same, with or without a model. A model only puts them into words: it may explain each cause in its own sentence and re-order the causes, but its answer is checked in the browser. Causes the app did not find are dropped, suggestions that are not in the `followups` rules of `js/config.js` are dropped, numbers that are not in the data get a warning, an emergency summary always starts with "Emergency.", and an answer that does not mention the flagged items is rejected (the next option is used, and the card says what was skipped). The journal on the Wellbeing page is never used. The possible causes are prompts to think and act, not a diagnosis; the Crew Medical Officer decides on treatment.

To add or change a cause, edit `CONDITIONS` in `js/diagnose.js`: each one lists trigger results (at least one must be flagged), supporting results, a short explanation, how to check it, everyday steps and emergency steps.

**Optional: Ollama (works in any browser)**

1. Install Ollama from https://ollama.com/download.
2. Download the model (about 2 GB): `ollama pull llama3.2:3b`
3. Allow web pages to talk to it, then restart Ollama (quit it from the tray icon and open it again):
   - Windows: `setx OLLAMA_ORIGINS "*"`
   - macOS: `launchctl setenv OLLAMA_ORIGINS "*"`
   - Linux: `OLLAMA_ORIGINS="*" ollama serve`
4. Open the app and press **Re-run**. The card should say "Ollama · llama3.2:3b".

`OLLAMA_ORIGINS="*"` lets any web page you open reach your local Ollama; that is fine on a demo laptop, but undo it afterwards if you want (`setx OLLAMA_ORIGINS ""` on Windows). The model and address are set in `ai` at the top of `js/config.js`.

## The Python part

```
python/server.py     runs the app and connects it to Python
python/halo.py       helpers for the data team: build, check, save and send data
python/simulate.py   example Bio-Monitor simulation based on averages
start-server.bat     Windows shortcut: starts the server and opens the browser
```

**How data reaches the app:**

1. **Files:** a script writes a JSON file into `data/`, then you reload the page. The example files (`sample-mission.json`, `sample-crew-*.json`, `template.json`, `example-second-crew-member.json`, `radiation-msl-cruise.json`) are not loaded automatically; load them with the Data button.
2. **Live:** a script sends readings to the server (`halo.send(...)`), and the open page shows them within 3 seconds. They are also saved to `data/received.jsonl`, so they come back after a restart.
3. **From the app:** files dropped into the Data dialog, and measurements logged with "Log a measurement", are saved on the server too.

If `data/` is empty, the app shows sample data until real data arrives.

**Writing a file from Python:**

```python
import halo
ds = halo.Dataset(crew={"name": "Aleš Svoboda", "mission_start": "2026-08-01"})
ds.add_series("heart_rate", values=[62, 63, 61], start="2026-11-14T08:00:00Z", interval_s=60)
ds.add_reading("body_mass", 71.8, time="2026-11-10T07:30:00Z")
ds.add_reading("glucose", 5.1, unit="mmol/L")          # time defaults to now (UTC)
problems = ds.save("../data/my-data.json")             # [] means the app will accept everything
```

**Sending live readings:**

```python
halo.send({"readings": [{"metric": "heart_rate", "time": halo.now(), "value": 64}]})
```

**Checking files before you hand them over:** `python halo.py ../data/*.json` lists anything the app would skip (unknown metric names, unreadable times, impossible values). It reads the metric list from `js/config.js`, so Python and the app always agree.

**Simulation:** `python simulate.py` sends live samples every 5 seconds. `python simulate.py --days 30` writes a 30-day history file instead. Edit `AVERAGES` and `SCHEDULE` at the top, or swap in your own model.

## What is on the screen

1. **Summary**: one sentence on how things stand, then everything on Watch or Act now with the first thing to do about it. Each item opens its details.
2. **Body figure**: body systems with their worst current status. Pick one to list its indicators.
3. **Bio-Monitor**: the worn sensors (heart rate with ECG strip, blood oxygen, blood pressure, breathing rate, breathing volume, skin temperature, activity). Values are the median of the last few minutes. During exercise (activity of 3 METs or more), heart rate, blood pressure and breathing are judged against exercise limits; for heart rate that is up to 90% of the maximum (220 minus age) for Normal.
4. **Radiation**: the active dose rate now with the last 6 hours, the dose in the last 24 hours, and the cumulative dose since launch against NASA's career limit, shown in gray (about 157 mGy: NASA's 600 mSv divided by the deep-space quality factor 3.82). It has its own time scale and is not affected by the time range switch.
5. **Time range**: Day / 1 week / 2 weeks / Month, with arrows to step back through older data. It applies to everything below it and inside the detail panel.
6. **Trends**: all Bio-Monitor channels on one shared time axis. Hover one chart to read every channel at that moment. Exercise periods are shaded.
7. **Checks**: what is due today or overdue, a 7-day routine score, and cards for the daily, weekly and monthly checks. Every card has **Log a measurement**. Under "Every month" come two categories. **Blood tests** has a finger-prick test every 3 days (blood glucose, lactate), a blood draw every 14 days (white blood cells, sodium, ferritin) and haemoglobin monthly. **Kidneys and urine** has its own group: weekly urine dipstick (pH, concentration), monthly 24-hour urine test (volume, calcium, oxalate, citrate), and the **kidney stone risk**, which the app works out from those and breaks down factor by factor.
8. **Reaction test** (button at the top, or "Take the test" on the Reaction time card): a separate page with two modes. **Vigilance test**: the 1- or 3-minute test based on the psychomotor vigilance test. Press space or tap when the red counter appears. It reports average and median reaction time, lapses (over 0.5 s) and false starts, compares with the baseline, and saves the result as the weekly reaction time. **Circles**: 20 circles pop up one at a time at random places (each stays 1.5 s); click or tap them. Score = average time per circle, where a missed circle counts 1.5 s and a click beside a circle adds 0.1 s. Circle results go only to the scoreboard, not to the reaction time indicator. Below both is the **crew scoreboard**: the vigilance test ranked by each person's latest result (with the change from their own baseline), and circles ranked by best score. "Taking the test as" picks whose result it is. Circle runs are kept on this device (IndexedDB). The page has its own address (`index.html#reaction-test`).
9. **Detail panel** (click anything): current value, what to do now if it is out of range, when to get the Crew Medical Officer, a chart for the selected range, what the indicator is, why it matters, and how to measure it. For heart rate, blood pressure and breathing it also says whether resting or exercise limits apply right now, and why.
10. **Follow-up checks**: when something is out of range, the app suggests which other measurements help confirm or rule out the cause, for example high urine pH → urine calcium, citrate and volume, and the kidney stone risk. They appear as "Also check" in the summary, as "Check these next" in the detail panel (with latest values and a Log button), and as "Suggested by your results" in the checklist. The rules are in `followups` at the bottom of `js/config.js`. They are prompts, not a diagnosis.
11. **No doctor on board, so the app guides the crew:** every Watch and Act now comes with steps the astronaut can carry out on board, and a clear point at which to get the **Crew Medical Officer** (the crewmate trained for medical care). For checks you take yourself there is a **Remind me to recheck** button (1 hour for Act now, 15 minutes for a low blood glucose, the next day for Watch); the reminder sits on the checklist and clears itself when you log a new value. **Health report for the Crew Medical Officer** (under the summary) puts everything out of range, the follow-up results, the Bio-Monitor values, radiation and what is due into one text you can copy, save or send home with the next downlink.
12. **Wellbeing page** (`index.html#wellbeing`): a daily check-in (mood, how connected you feel with the crew, a few words that fit the day), a private journal with writing prompts, a "Connection with the crew" log of shared moments for the last 7 days with ideas when there are few, and 30-day charts of mood, crew connection and sleep. Mood and crew connection are saved as normal measurements; the journal and the shared moments stay in this browser only and are never part of reports, exports or the AI summary.
13. **Limits page** (button at the top, or `index.html#limits`): every indicator with its Normal / Watch / Act now values drawn as coloured bars, resting and exercise limits side by side, how exercise is detected, and where each limit comes from. It is built from `js/config.js`, so it always matches what the app does.

Status words: **Normal**, **Watch**, **Act now**, plus Exercising, No signal, Out of date and No data.

## Files

```
index.html        page structure
css/style.css     all styling; colours and fonts are at the top
img/              logo.png (header logo) and icon-32/180/192/512.png (tab and app icons), all made from
                  chc-logo.png / chc-logo.svg, the team logo
js/config.js      THE file to edit: indicators, units, ranges, guidance texts
js/data.js        import, merging, storage (IndexedDB), queries
js/derived.js     values the app calculates itself (kidney stone risk)
js/reaction.js    the reaction test page
js/diagnose.js    possible causes, urgency levels, emergency limits, steps, simulation situations, reasons for tests
js/ai.js          the AI summary card (Chrome AI -> Ollama -> offline assistant, all in the browser)
sw.js             offline copy of the app when opened from a web address
manifest.webmanifest  lets the app be installed like an app from a web address
js/wellbeing.js   the Wellbeing page
js/status.js      Normal / Watch / Act now logic, due checks
js/charts.js      SVG charts, ECG strip, date formatting
js/body.js        the body figure
js/app.js         rendering and interaction
js/sample.js      sample data generator (same format as real files)
data/             sample-mission.json (full example for Aleš Svoboda), sample-crew-*.json (the three sample
                  astronauts, generated), template.json (minimal),
                  radiation-msl-cruise.json (real Curiosity cruise radiation, converted),
                  example-second-crew-member.json (a second astronaut, to try switching)
python/           server, data helpers and simulation (see above)
start-server.bat  Windows shortcut for the Python server
tools/export-sample.js       optional: rewrites data/sample-mission.json, data/sample-crew-*.json and data/team/ (needs Node)
tools/build-curiosity-js.js  optional: rebuilds js/curiosity-rad.js from data/radiation-msl-cruise.json
tools/export-second-crew.js  optional: rewrites data/example-second-crew-member.json
tools/convert-msl-rad.js     optional: converts a NASA MSL RAD cruise file to the app format
DATA.md           data format for the team
RESOURCES.md      every tool and source the project uses
```

## Limits worth saying out loud

- Ranges are general adult reference values or our own assumptions, not NASA flight limits. Each indicator shows where its range comes from at the bottom of its detail panel.
- The sample data is generated. It is not real astronaut data.
- The ECG strip replays a recorded strip; the app does not analyse heart rhythm.
- The real Curiosity radiation data was measured inside an uncrewed spacecraft in 2011–2012; its dates are moved to fit the mission.
- The emergency limits and the possible causes are a hackathon prototype, not a medical device. The Crew Medical Officer decides on treatment.
