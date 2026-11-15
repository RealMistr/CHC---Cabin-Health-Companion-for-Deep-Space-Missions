# CHC (Cabin Health Companion) data format

This is the contract between the data team and the app. Produce JSON files in this shape and load them with the **Data** button (drag and drop, several files at once is fine). Each person can make their own file; the app merges them.

A full working example is in `data/sample-mission.json`. A minimal one is in `data/template.json`. The team's blood draw and finger-prick files, fitted to each astronaut, are in `data/team/` and show the reading layout with correct names and dates.

**Working in Python?** Use `python/halo.py` to build files (`halo.Dataset`), check them (`python halo.py yourfile.json`) and send live readings to the server (`halo.send`). With the server running (`python server.py`), anything you save into `data/` loads automatically. Details are in the README under "The Python part".

## The file

```json
{
  "format": "chc/1",
  "crew": {
    "name": "Aleš Svoboda",
    "role": "Pilot",
    "mission": "Mars transit",
    "mission_start": "2026-10-16",
    "age": 41,
    "baseline": { "body_mass": 74.2, "reaction_time": 280 }
  },
  "series": [
    { "metric": "heart_rate", "start": "2026-11-14T00:00:00Z", "interval_s": 60, "values": [62, 63, 61, null, 64] }
  ],
  "readings": [
    { "metric": "body_mass", "time": "2026-11-10T07:30:00Z", "value": 71.8 },
    { "metric": "glucose", "time": "2026-11-13T07:05:00Z", "value": 5.1, "unit": "mmol/L" }
  ],
  "ecg": { "start": "2026-11-14T10:20:00Z", "hz": 250, "lead": "II", "values": [0.01, 0.02, 0.05] }
}
```

All sample data covers 30 days (the whole mission so far). Every part is optional. A file with only `readings`, or only `series`, works.

### `series`: continuous Bio-Monitor data

Use this for anything the shirt records all the time. Two ways to write it:

- **Regular spacing (smallest file):** `start`, `interval_s` and `values`. Value number *i* is at `start + i × interval_s`. Use `null` for a gap (shirt off, battery swap).
- **Irregular spacing:** `samples`: `[["2026-11-14T06:00:00Z", 118], ["2026-11-14T06:45:00Z", 121]]`.

One sample per minute is plenty. The app works fine with a month of 1-minute data for every channel.

### `readings`: checks and lab results

One object per measurement: `metric`, `time`, `value`, and optionally `unit` if it is not the app's unit (see below).

A row may also hold several measurements as columns, with no `metric` key: `{"timestamp": "2026-11-14T07:00:00Z", "heart_rate_bpm": 62, "spo2_pct": 97, "body_temp_c": 36.6}`. Column names are metric names or aliases, optionally with the unit at the end (`_bpm`, `_pct`, `_c`, `_f`, `_kg`, `_usv_h`, `_ugy_h`, `_msv`, `_mmol_l`, `_mg_dl`…). The time can be called `time`, `timestamp`, `timestamp_utc`, `datetime`, `date` or `t`. A `unit` at the top of the file applies to every value without its own unit.

### `crew`

- `name`: **which astronaut the data belongs to.** Each crew member's data is kept apart; a file for "Petr Pavel" never mixes with "Aleš Svoboda". Names are matched without accents or capitals. You can also put `"crew": "Name"` on a single reading or series, so one file can hold several people. Data without a name goes to the crew member on screen. `"crew": "Aleš Svoboda"` (just the name) works too.
- `mission` and `mission_start`: shown in the header, e.g. "Mars transit · Day 30 of 30". If `mission_start` is missing, the first data point is used. The default mission name is in `js/config.js`.
- `baseline`: pre-flight values for indicators judged as a change from baseline (body mass, reaction time). If missing, the first measurement is used.
- `age` (or `hr_max`): used for the heart-rate limits during exercise (maximum heart rate = 220 minus age). If missing, age 40 is assumed.

### `ecg`

A short strip (10 seconds is enough) in millivolts, shown as a moving trace on the heart-rate card. Optional.

### Times

ISO 8601 with a time zone, for example `2026-11-14T06:30:00Z` (`Z` = UTC, which is station time). Unix seconds or milliseconds also work. The app shows everything in UTC.

**Any dates work.** If a file's data does not end around today, the app moves it forward in whole days so it ends today, and keeps only the last 30 days (the mission length in `js/config.js`). Files loaded together, or from the same period, are moved by the same amount, so teammates' files stay lined up. `mission_start` is moved with them. The import report says how far the dates were moved.

## Metric names

| metric | What | Unit | Kind | How often |
|---|---|---|---|---|
| `heart_rate` | Heart rate | bpm | continuous | Bio-Monitor |
| `spo2` | Blood oxygen | % | continuous | Bio-Monitor |
| `bp_sys` | Blood pressure, systolic | mmHg | continuous | Bio-Monitor |
| `bp_dia` | Blood pressure, diastolic | mmHg | continuous | Bio-Monitor |
| `resp_rate` | Breathing rate | breaths/min | continuous | Bio-Monitor |
| `ventilation` | Breathing volume (minute ventilation) | L/min | continuous | Bio-Monitor |
| `skin_temp` | Skin temperature | °C | continuous | Bio-Monitor |
| `activity` | Activity level | METs | continuous | Bio-Monitor |
| `radiation_dose_rate` | Active radiation dose rate (absorbed) | µGy/h | continuous | radiation monitor |
| `radiation_dose` | Radiation dose for one day, absorbed (only needed when there is no dose rate) | mGy | check | every day |
| `sleep_hours` | Sleep last night | h | check | every day |
| `mood` | Mood, 1 to 5 | score | check | every day |
| `crew_connection` | How connected you feel with the crew, 1 to 5 | score | check | every day |
| `exercise_min` | Exercise | min | check | every day |
| `body_mass` | Body mass | kg | check | every week |
| `glucose` | Fasting blood glucose (finger-prick, before breakfast, 8 hours without food) | mg/dL | blood | every 3 days |
| `lactate` | Lactate (finger-prick, at rest) | mmol/L | blood | every 3 days |
| `body_temp` | Oral body temperature | °C | check | every week |
| `reaction_time` | Reaction test average (from the app's test page, or sent in a file) | ms | check | every week |
| `vision` | Near vision, decimal acuity (1.0 = normal) | – | check | every month |
| `wbc` | White blood cells | ×10⁹/L | blood | every 14 days |
| `sodium` | Sodium | mmol/L | blood | every 14 days |
| `ferritin` | Ferritin (iron stores) | µg/L (ng/mL also accepted, same numbers) | blood | every 14 days |
| `hemoglobin` | Haemoglobin (finger-prick) | g/dL | blood | every 3 days |
| `urine_ph` | Urine pH (dipstick) | – | check | every week |
| `urine_sg` | Urine concentration, specific gravity (dipstick) | – | check | every week |
| `urine_volume` | Urine volume, 24 h | L/day | lab | every month |
| `urine_calcium` | Urine calcium, 24 h | mg/day | lab | every month |
| `urine_oxalate` | Urine oxalate, 24 h | mg/day | lab | every month |
| `urine_citrate` | Urine citrate, 24 h | mg/day | lab | every month |
| `kidney_stone_risk` | Kidney stone risk (0 to 5 risk factors) | – | **calculated by the app, do not send** | after each urine test |

Short names from the first prototype still work (`hr`, `sys`, `dia`, `glu`, `temp`, `temp_skin`, `sleep_h`, `ex_min`, and the `k` / `t` / `v` / `t0` / `dt_s` keys).

**Units the app converts for you:** glucose in `mmol/L`, temperatures in `F`, body mass in `lb`, urine volume in `mL`, and radiation in any unit below. Put the unit in `"unit"`; it can be written any common way ("uGy/hr", "microgray/hour", "mGy per day").

| Radiation unit | Goes to | Conversion |
|---|---|---|
| µGy/h (uGy/h), mGy/h, nGy/h, Gy/h, µGy/day | `radiation_dose_rate` (µGy/h) | scaled |
| mGy, µGy, Gy, mGy/day | `radiation_dose` (mGy for one day) | scaled |
| µSv/h, mSv/h, nSv/h, Sv/h, µSv/day (older files) | `radiation_dose_rate` | divided by 3.82 (quality factor) to get gray |
| mSv, µSv, Sv, mSv/day (older files) | `radiation_dose` | divided by 3.82 |

The unit decides where a value goes: `{"metric": "radiation", "value": 20, "unit": "µGy/h"}` becomes a dose rate, `{"metric": "radiation", "value": 0.5, "unit": "mGy"}` a daily dose. **The app works in gray (absorbed dose) only.** Sievert values from older files are divided by 3.82, the average quality factor Curiosity's RAD measured during the cruise to Mars (set in `radiation` in `js/config.js`).

**Always put the unit on radiation data.** A radiation series without `"unit"` is read as µGy/h. A file in µSv/h without a unit would therefore be read about 4 times too high. Example: `{"metric": "radiation_dose_rate", "unit": "µGy/h", "start": "...", "interval_s": 60, "values": [...]}` (see `data/radiation-30d-gray.json`).

**NASA Curiosity (MSL) RAD cruise files** (readings with `dose_rate_b_ugy_h` / `dose_rate_e_ugy_h`, e.g. `nasa_rad_observations.json`) are read directly: detector E (tissue-equivalent) is used, in µGy/h as measured. `node tools/convert-msl-rad.js input.json output.json "Name" 2026-11-15` writes the same data in the normal format; the result is in `data/radiation-msl-cruise.json`.

**Radiation:** send the active dose rate as a `series` (`radiation_dose_rate`, µGy/h; one sample a minute is plenty). On the way to Mars expect a steady background of about 18–20 µGy/h (about 0.48 mGy a day, as measured by Curiosity's RAD instrument in cruise); an ISS-style file with South Atlantic Anomaly peaks will load fine but reads as low-Earth orbit. The app adds it up into daily doses and the cumulative dose since launch. For days with no dose rate it uses `radiation_dose` readings (mGy per day) instead.

**Kidney stone risk** is worked out by the app from the urine results. It counts five risk factors: urine volume below 2.5 L/day, calcium above 250 mg/day, oxalate above 40 mg/day, citrate below 320 mg/day, and pH outside 5.5 to 7.0. Send the urine values from one 24-hour collection with times within 2 days of each other; pH is taken from the nearest dipstick within 5 days. At least two of the five must be present for a risk value to appear. A `kidney_stone_risk` value in a file is ignored, and the import report says so.

## What happens on import

The Data dialog shows a report for every file: how many values were added per metric, which crew member they went to, what was skipped and why (unreadable time, not a number, unknown unit, physically impossible value), any metric names it did not recognise, and whether dates were moved or sievert converted to gray. Loading the same file twice is safe: a value at the same time replaces the old one instead of being added twice.

The first upload replaces the generated sample data. Without the server, uploaded data is kept in the browser until you press **Remove loaded data**. With the server, uploads are saved into `data/`.

## Adding a new indicator

Add an entry to `js/config.js` (copy a similar one). Pick `kind` (`continuous` or `periodic`), `every` for periodic checks (`day`, `week`, `month`), the unit, the ranges, and the explanation texts. No other code changes are needed.
