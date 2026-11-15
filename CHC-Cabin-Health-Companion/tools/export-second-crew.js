/* Writes an example file for a second crew member (data/example-second-crew-member.json), to try crew switching.
 * Run from the project folder: node tools/export-second-crew.js ["Name"] */
const fs = require("fs"), path = require("path");
globalThis.window = globalThis;
require(path.join(__dirname, "..", "js", "config.js"));
window.HALO_CONFIG.crew = { name: process.argv[2] || "Jana Králová" };
require(path.join(__dirname, "..", "js", "sample.js"));
const data = globalThis.Halo.sample.generate(Date.now());
data.crew = Object.assign({}, data.crew, { name: window.HALO_CONFIG.crew.name, role: "Commander", age: 38 });
delete data.ecg;
const out = path.join(__dirname, "..", "data", "example-second-crew-member.json");
fs.writeFileSync(out, JSON.stringify(data));
console.log("Wrote " + out + " (" + Math.round(fs.statSync(out).size / 1024) + " KB)");
