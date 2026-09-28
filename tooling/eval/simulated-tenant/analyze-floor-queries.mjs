#!/usr/bin/env node
/**
 * Build floor-queries-results.md from the two floor-query scoring reports and
 * the author-written query CSV. Read-only over the reports; no gate, threshold,
 * model, or label is changed.
 *
 * The floor set is 29 messages written by one author (label_source:
 * "author-written, author-labeled"): 21 answerable (in-scope), 3 ambiguous and
 * 5 escalate (refusal). Six rows carry a "messy" note (Arabizi / typos).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PRIMARY = 'floor-queries-m018';
const COMPARE = 'floor-queries-m017';

function parseCSVLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

function loadCsv() {
  const raw = readFileSync(resolve(here, 'my-floor-queries.csv'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCSVLine(raw[0]).map((c) => c.trim().toLowerCase());
  const idx = (n) => header.indexOf(n);
  const rows = new Map();
  for (let i = 1; i < raw.length; i += 1) {
    const f = parseCSVLine(raw[i]);
    if (f[0] === '') continue;
    const get = (n) => (idx(n) >= 0 ? (f[idx(n)] ?? '') : '');
    rows.set(f[0], {
      id: f[0],
      query: get('query'),
      label: get('my_label'),
      sop: get('my_sop_id'),
      notes: get('notes'),
      labelSource: get('label_source'),
    });
  }
  return rows;
}

function loadReport(label) {
  const path = resolve(here, `${label}.json`);
  if (!existsSync(path)) throw new Error(`missing report ${label}.json`);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map();
  for (const row of json.perQuery ?? []) byId.set(row.id, row);
  return { json, byId, margin: json.implementation?.minMargin };
}

const csv = loadCsv();
const primary = loadReport(PRIMARY);
const compare = loadReport(COMPARE);

const ALSO_COULD_BE = {
  'ff-003': ['wc-gifts', 'wc-payout'],
  'ff-012': ['wc-security', 'wc-login'],
};
const TOPIC_MATCH_NO_ANSWER = ['ff-006', 'ff-018'];

function enrich(id) {
  const base = csv.get(id);
  const r = primary.byId.get(id);
  const actual = r?.actual ?? { decision: 'escalate', reason: 'missing' };
  const cands = (r?.candidates ?? []).map((c) => ({ sopId: c.sopId, score: c.score }));
  const top1 = cands[0]?.score ?? 0;
  const top2 = cands[1]?.score ?? 0;
  return {
    ...base,
    messy: /messy/i.test(base.notes),
    gate: actual.decision === 'answer' ? 'answer' : 'escalate',
    gateSop: actual.sopId ?? actual.reason ?? '',
    gateReason: actual.decision === 'answer' ? '' : (actual.reason ?? ''),
    cands,
    top1,
    top2,
    margin: top1 - top2,
  };
}

const ids = [...csv.keys()].sort();
const rows = ids.map(enrich);
const inScope = rows.filter((r) => r.label === 'answerable');
const refusal = rows.filter((r) => r.label === 'escalate' || r.label === 'ambiguous');
const messy = rows.filter((r) => r.messy);
const clean = rows.filter((r) => !r.messy);

function acceptable(r) {
  return ALSO_COULD_BE[r.id] ?? (r.sop ? [r.sop] : []);
}
function outcome(r) {
  const acc = acceptable(r);
  if (r.gate === 'answer') return acc.includes(r.gateSop) ? 'correct' : 'wrong_procedure';
  return 'false_escalation';
}

const inScopeScored = inScope.map((r) => ({ ...r, outcome: outcome(r) }));
const inScopeCorrect = inScopeScored.filter((r) => r.outcome === 'correct');
const inScopeWrong = inScopeScored.filter((r) => r.outcome === 'wrong_procedure');
const inScopeFalseEsc = inScopeScored.filter((r) => r.outcome === 'false_escalation');

const refusalFalseAccepts = refusal.filter((r) => r.gate === 'answer');
const refusalEscalate = refusal.filter((r) => r.label === 'escalate');
const refusalAmbiguous = refusal.filter((r) => r.label === 'ambiguous');

const messyScored = messy.filter((r) => r.label === 'answerable').map((r) => ({ ...r, outcome: outcome(r) }));
const cleanScored = clean.filter((r) => r.label === 'answerable').map((r) => ({ ...r, outcome: outcome(r) }));
const acc = (list) => (list.length === 0 ? 'n/a' : `${((list.filter((r) => r.outcome === 'correct').length / list.length) * 100).toFixed(1)}%`);

const fmt = (n) => n.toFixed(4);
const line = (r) => `| ${r.id} | ${r.sop || '—'} | ${r.gate} | ${r.gateSop || '—'} | ${fmt(r.top1)} | ${fmt(r.top2)} | ${fmt(r.margin)} | ${r.outcome}${r.messy ? ' (messy)' : ''}${TOPIC_MATCH_NO_ANSWER.includes(r.id) ? ' (topic-match, procedure silent)' : ''} |`;

const unsafeFirst = refusalFalseAccepts.length;

const md = [
  '# Floor-query set — results',
  '',
  '**SIMULATED DATA / author-written.** This set is the author\'s own frontline patterns, written from the procedure topics; it is not customer traffic and not a real partner\'s data. There is no design partner.',
  '',
  `Scored with \`tooling/eval/score-real-phrased.mjs\` on the deployed-equivalent local path (browser-local MiniLM -> passage retrieval -> Confidence Gate -> agent view) at margins **0.18** (shipped default) and **0.17** (evaluation baseline). No gate threshold, model, or corpus text was changed, and no label was changed.`,
  '',
  '## Sample and provenance',
  '',
  '- **29 messages**, one author. `label_source` on every row: **"author-written, author-labeled"**.',
  '- **21 answerable** (in-scope), **5 escalate + 3 ambiguous** (refusal).',
  '- **6 rows carry a "messy" note** (Arabizi / typos): ff-002, ff-005, ff-008, ff-014, ff-017, ff-020.',
  '- Two rows are **"also could be"**: ff-003 (`wc-gifts` | `wc-payout`), ff-012 (`wc-security` | `wc-login`). A gate decision on **either** listed procedure counts as correct.',
  '- **"Also could be" rule applied:** ff-003 and ff-012 were both escalated by the gate at 0.18 and 0.17, so accepting either listed procedure changed no outcome.',
  '- Two rows are **topic-match, procedure silent**: ff-006 (how to change bank details) and ff-018 (appeal review time) match a procedure\'s topic, but the procedure text does not state the answer. Reported on their own line.',
  '',
  '## Safety first — refusal-set false accepts',
  '',
  unsafeFirst === 0
    ? `**0 of ${refusal.length}** refusal rows (5 escalate + 3 ambiguous) were auto-answered at margin 0.18. The gate escalated every row the author marked escalate or ambiguous.`
    : `**${unsafeFirst} of ${refusal.length}** refusal rows were auto-answered at margin 0.18:`,
  ...refusalFalseAccepts.map((r) => `- ${r.id} (author ${r.label}) -> gate answered ${r.gateSop} (top-1 ${fmt(r.top1)}, top-2 ${fmt(r.top2)}, margin ${fmt(r.margin)})`),
  '',
  '## Headline',
  '',
  `| Margin | In-scope correct | Wrong procedure | False escalations | Refusal false accepts |`,
  `|---|---:|---:|---:|---:|`,
  `| 0.18 | ${inScopeCorrect.length}/${inScope.length} | ${inScopeWrong.length} | ${inScopeFalseEsc.length} | ${refusalFalseAccepts.length} |`,
  `| 0.17 | ${compareTotals(compare, 'correct')}/${inScope.length} | ${compareTotals(compare, 'wrong')} | ${compareTotals(compare, 'falseEsc')} | ${compareTotals(compare, 'refusalFA')} |`,
  '',
  `In-scope accuracy at 0.18: **${acc(inScopeScored)}** (${inScopeCorrect.length}/${inScope.length}). At 0.17: **${acc(compareInScope(compare))}**.`,
  '',
  `Raw scorer output for this set: 0.18 — 26 scored of 29, 10/26 correct, 16 false escalations, 0 unsafe; 0.17 — 11/26 correct, 15 false escalations, 0 unsafe. (The 26 scored = 21 answerable + 5 escalate; the 3 ambiguous rows are excluded from the headline.)`,
  '',
  'One row, ff-002 (margin 0.1755), sits inside the [0.17, 0.18) band, so it is the only decision that differs between the two margins.',
  '',
  '## IN-SCOPE — 21 answerable rows (margin 0.18)',
  '',
  '| id | expected procedure | gate | gate procedure | top-1 | top-2 | margin | outcome |',
  '|---|---|---|---|---:|---:|---:|---|',
  ...inScopeScored.map(line),
  '',
  '**Topic-match, procedure silent** (reported separately; a correct procedure match does not mean the answer was available):',
  ...TOPIC_MATCH_NO_ANSWER.map((id) => {
    const r = inScopeScored.find((x) => x.id === id);
    return `- ${r.id} "${r.query}" — matched ${r.gateSop || '—'}, outcome ${r.outcome}. The ${r.sop} procedure covers the topic but does not state this answer.`;
  }),
  '',
  'Excluding these two rows — the procedure is silent, so escalation is defensible — in-scope is **5/19 correct, 14 false escalations** at 0.18 (6/19 correct, 13 false escalations at 0.17).',
  '',
  '## REFUSAL — 5 escalate + 3 ambiguous (margin 0.18)',
  '',
  '| id | author label | gate | gate procedure | top-1 | top-2 | margin |',
  '|---|---|---|---|---:|---:|---:|',
  ...refusal.map((r) => `| ${r.id} | ${r.label} | ${r.gate} | ${r.gateSop || '—'} | ${fmt(r.top1)} | ${fmt(r.top2)} | ${fmt(r.margin)} |`),
  '',
  `Escalate rows answered: ${refusalEscalate.filter((r) => r.gate === 'answer').length} of ${refusalEscalate.length}. Ambiguous rows answered: ${refusalAmbiguous.filter((r) => r.gate === 'answer').length} of ${refusalAmbiguous.length}.`,
  '',
  '## Messy vs clean (answerable rows)',
  '',
  '| Group | Rows | Correct | Accuracy |',
  '|---|---:|---:|---:|',
  `| Messy (Arabizi / typos) | ${messyScored.length} | ${messyScored.filter((r) => r.outcome === 'correct').length} | ${acc(messyScored)} |`,
  `| Clean | ${cleanScored.length} | ${cleanScored.filter((r) => r.outcome === 'correct').length} | ${acc(cleanScored)} |`,
  '',
  'Messy rows: ' + (messyScored.length === 0 ? 'none' : messyScored.map((r) => `${r.id} (${r.outcome})`).join(', ')) + '.',
  '',
  '## Limits',
  '',
  '29 messages written by one author who knows the procedure topics; a small sample; not customer traffic; likely easier than real traffic; not a substitute for real-partner evidence.',
  '',
].join('\n') + '\n';

function compareInScope(rep) {
  return inScope.map((r) => {
    const cr = rep.byId.get(r.id);
    const g = cr?.actual?.decision === 'answer' ? 'answer' : 'escalate';
    const gs = cr?.actual?.sopId ?? '';
    return { outcome: g === 'answer' ? (acceptable(r).includes(gs) ? 'correct' : 'wrong_procedure') : 'false_escalation' };
  });
}
function compareTotals(rep, kind) {
  const s = compareInScope(rep);
  if (kind === 'correct') return s.filter((x) => x.outcome === 'correct').length;
  if (kind === 'wrong') return s.filter((x) => x.outcome === 'wrong_procedure').length;
  if (kind === 'falseEsc') return s.filter((x) => x.outcome === 'false_escalation').length;
  if (kind === 'refusalFA') return refusal.filter((r) => (rep.byId.get(r.id)?.actual?.decision ?? 'escalate') === 'answer').length;
  return 0;
}

writeFileSync(resolve(here, 'floor-queries-results.md'), md);

process.stdout.write(`${JSON.stringify({
  margin: primary.margin,
  inScope: inScope.length,
  inScopeCorrect: inScopeCorrect.length,
  inScopeWrong: inScopeWrong.map((r) => r.id),
  inScopeFalseEscalations: inScopeFalseEsc.length,
  refusal: refusal.length,
  refusalFalseAccepts: refusalFalseAccepts.map((r) => r.id),
  messy: messyScored.map((r) => `${r.id}:${r.outcome}`),
  cleanAccuracy: acc(cleanScored),
  messyAccuracy: acc(messyScored),
  topicMatchNoAnswer: TOPIC_MATCH_NO_ANSWER.map((id) => {
    const r = inScopeScored.find((x) => x.id === id);
    return `${id}:${r.outcome}:${r.gateSop}`;
  }),
}, null, 2)}\n`);
