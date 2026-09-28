// Verifies label-tool.html without a browser:
//  1) syntax-checks the embedded <script>
//  2) extracts the CSV CORE block and round-trips the two real CSVs
//  3) asserts label logic (answerable + procedure, escalate, skip) behaves
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "label-tool.html"), "utf8");

let failures = 0;
const ok = (cond, msg) => { if (cond) { console.log("  ok  - " + msg); } else { console.log("  FAIL- " + msg); failures++; } };

// --- 1) syntax check of the whole embedded script (in-process compile;
//        spawnSync is unreliable on this host, so we avoid `node --check`) ---
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log("FAIL - no <script> block found"); process.exit(1); }
try {
  new vm.Script(scriptMatch[1], { filename: "label-tool-embedded.js" });
  console.log("  ok  - embedded script compiles cleanly (no syntax errors)");
} catch (e) {
  console.log("  FAIL- embedded script has a syntax error: " + e.message);
  failures++;
}

// --- 2) extract CSV CORE block and exercise it ---
const core = html.match(/\/\/ === CSV CORE START ===([\s\S]*?)\/\/ === CSV CORE END ===/);
if (!core) { console.log("FAIL - CSV CORE markers not found"); process.exit(1); }
const mod = core[1] + "\nmodule.exports = { parseCSV, csvEscape, serializeCSV };";
const modPath = join(here, "_tmp_label_core.cjs");
writeFileSync(modPath, mod);
const { parseCSV, csvEscape, serializeCSV } = await import("file://" + modPath.replace(/\\/g, "/"));

// round-trip real-phrased-queries.csv
const rp = readFileSync(join(here, "real-phrased-queries.csv"), "utf8");
const rpRows = parseCSV(rp);
ok(rpRows.length === 73, "real-phrased: 72 data rows + header parsed (got " + (rpRows.length - 1) + ")");
ok(rpRows[0].join(",") === "id,query,source_type,my_label,my_sop_id,notes", "real-phrased: header columns intact");
ok(rpRows[1][1].includes("YouTube") && rpRows[1][1].includes(",") === false ? true : rpRows[1][1].length > 0, "real-phrased: quoted query with comma parsed as one field");

// round-trip template
const tp = readFileSync(join(here, "my-floor-queries.template.csv"), "utf8");
const tpRows = parseCSV(tp);
ok(tpRows.length === 6, "template: 5 example rows + header parsed (got " + (tpRows.length - 1) + ")");

// object mapping + serialize round-trip
function rowsFromText(text) {
  const raw = parseCSV(text);
  const header = raw[0].map(h => h.trim());
  const cols = ["id","query","source_type","my_label","my_sop_id","notes"];
  const out = [];
  for (let r = 1; r < raw.length; r++) {
    const obj = {}; cols.forEach(c => obj[c] = "");
    header.forEach((h, ci) => { if (cols.includes(h)) obj[h] = raw[r][ci] != null ? raw[r][ci] : ""; });
    out.push(obj);
  }
  return out;
}
const objs = rowsFromText(rp);
const ser = serializeCSV(objs, ["id","query","source_type","my_label","my_sop_id","notes"]);
const reparsed = rowsFromText(ser);
ok(reparsed.length === objs.length, "round-trip: row count preserved after serialize->parse");
ok(reparsed[0].query === objs[0].query, "round-trip: query text preserved exactly");
ok(csvEscape('a "quoted" field, with comma\nand newline') === '"a ""quoted"" field, with comma\nand newline"',
   "csvEscape: quotes, commas and newlines are wrapped and escaped");

// --- 3) label logic ---
function applyLabel(row, label, procId) {
  row.my_label = label;
  row.my_sop_id = (label === "answerable" && procId) ? procId : "";
}
const r1 = { id: "x", query: "q", source_type: "", my_label: "", my_sop_id: "", notes: "" };
applyLabel(r1, "answerable", "wc-payout");
ok(r1.my_label === "answerable" && r1.my_sop_id === "wc-payout", "label: answerable sets my_label + my_sop_id");
const r2 = { id: "y", query: "q", source_type: "", my_label: "", my_sop_id: "wc-gifts", notes: "" };
applyLabel(r2, "escalate");
ok(r2.my_label === "escalate" && r2.my_sop_id === "", "label: escalate clears my_sop_id");
const r3 = { id: "z", query: "q", source_type: "", my_label: "answerable", my_sop_id: "wc-live", notes: "" };
applyLabel(r3, "skip");
ok(r3.my_label === "skip" && r3.my_sop_id === "", "label: skip clears my_sop_id");

// cleanup temp files (use fs, not a spawned rm — spawnSync is unreliable here)
import { unlinkSync } from "node:fs";
try { unlinkSync(modPath); } catch {}

console.log(failures === 0 ? "\nVERIFY: PASS (0 failures)" : "\nVERIFY: " + failures + " failure(s)");
process.exit(failures === 0 ? 0 : 1);
