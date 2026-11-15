/* Converts NASA's Curiosity (MSL) RAD cruise data (absorbed dose rate in µGy/h, detectors B and E) into the app's
 * format: active dose rate in µGy/h (detector E) plus one daily dose per day in mGy, moved in
 * time so the 30 days end on the given date. The app can also read the original file directly.
 * Run from the project folder:  node tools/convert-msl-rad.js <input.json> <output.json> [crew name] [end date YYYY-MM-DD] */
const fs = require("fs");
const [, , inp, out, crewName = "Aleš Svoboda", endDate] = process.argv;
if (!inp || !out) { console.log("usage: node tools/convert-msl-rad.js <input.json> <output.json> [crew name] [end date]"); process.exit(1); }
const DAY = 864e5, src = JSON.parse(fs.readFileSync(inp, "utf8"));
const rows = src.readings.map(r => [Date.parse(r.timestamp_utc), typeof r.dose_rate_e_ugy_h === "number" ? r.dose_rate_e_ugy_h : r.dose_rate_b_ugy_h])
  .filter(r => isFinite(r[0]) && typeof r[1] === "number").sort((a, b) => a[0] - b[0]);
const lastT = rows[rows.length - 1][0], end = endDate ? Date.parse(endDate + "T23:59:59Z") : Date.now();
const shift = Math.floor((end - lastT) / DAY) * DAY;
const samples = rows.map(([t, v]) => [new Date(t + shift).toISOString().replace(".000Z", "Z"), Math.round(v * 100) / 100]);
/* daily dose: mean rate of the day x 24 h */
const days = {};
rows.forEach(([t, v]) => { const d = new Date(t + shift).toISOString().slice(0, 10); (days[d] = days[d] || []).push(v); });
const readings = Object.keys(days).filter(d => days[d].length >= 100).map(d => ({ metric: "radiation_dose", time: d + "T23:59:00Z", value: Math.round(days[d].reduce((a, b) => a + b, 0) / days[d].length * 24 / 10) / 100, unit: "mGy" }));
const outObj = {
  format: "chc/1",
  source: "NASA PDS, Curiosity (MSL) RAD cruise data, " + (src.source || "MSL-M-RAD-3-RDR-V1.0") + ". Detector E absorbed dose rate in µGy/h. Dates moved by " + Math.round(shift / DAY) + " days.",
  crew: { name: crewName },
  series: [{ metric: "radiation_dose_rate", unit: "µGy/h", samples }],
  readings
};
fs.writeFileSync(out, JSON.stringify(outObj));
console.log("Wrote " + out + ": " + samples.length + " dose-rate samples, " + readings.length + " daily doses, " + samples[0][0].slice(0, 10) + " to " + samples[samples.length - 1][0].slice(0, 10));
