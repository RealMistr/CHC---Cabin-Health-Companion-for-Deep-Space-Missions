/* Writes the sample crew to data/ using the same generator the app uses:
 *   data/sample-mission.json                  the first crew member (Aleš Svoboda), kept for older instructions
 *   data/sample-crew-<name>.json              one full file per crew member in the roster (config.js)
 *   data/team/<name>-blood-draw.json          the team's blood draw data fitted to each astronaut
 *   data/team/<name>-finger-prick.json        the team's finger-prick data fitted to each astronaut
 * Dates follow the mission calendar: day 1 is 29 days before today. Radiation in the full files is the real
 * Curiosity cruise data. Run from the project folder: node tools/export-sample.js */
const fs = require("fs"), path = require("path");
globalThis.window = globalThis;
require(path.join(__dirname, "..", "js", "config.js"));
require(path.join(__dirname, "..", "js", "curiosity-rad.js"));
require(path.join(__dirname, "..", "js", "sample.js"));
const S = globalThis.Halo.sample, now = Date.now(), dir = path.join(__dirname, "..", "data");
function write(name, data) {
  const out = path.join(dir, name);
  fs.writeFileSync(out, JSON.stringify(data));
  console.log("Wrote " + out + " (" + Math.round(fs.statSync(out).size / 1024) + " KB)");
}
const crew = S.crew(now);
write("sample-mission.json", crew[0]);
crew.forEach(function (f) {
  const slug = f.crew.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-");
  write("sample-crew-" + slug + ".json", f);
});

/* the team's two files, one pair per astronaut, in the team's own layout with corrected names, dates and format */
const teamDir = path.join(dir, "team"), DAY = 864e5, start = (Math.floor(now / DAY) - 29) * DAY;
fs.mkdirSync(teamDir, { recursive: true });
const BLOOD = ["wbc", "ferritin", "sodium"], PRICK = ["glucose", "hemoglobin", "lactate"];
crew.forEach(function (f) {
  const c = f.crew, slug = c.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
  const head = { format: "chc/1", crew: { name: c.name, role: c.role, mission_start: c.mission_start, age: c.age } };
  const rows = S.team(c.name, start);
  [["blood-draw", BLOOD, "Blood draw every 14 days (mission days 1, 15, 29), from the team's data"], ["finger-prick", PRICK, "Finger-prick every 3 days (mission days 1 to 28), from the team's data"]].forEach(function (x) {
    const out = Object.assign({}, head, { note: x[2] + (c.name === crew[0].crew.name ? "." : ", fitted to this astronaut.") + " Not real medical data.", series: [], readings: rows.filter(function (r) { return x[1].indexOf(r.metric) >= 0; }) });
    const file = path.join(teamDir, slug + "-" + x[0] + ".json");
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log("Wrote " + file);
  });
});
