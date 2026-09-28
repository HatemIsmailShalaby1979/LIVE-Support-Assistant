#!/usr/bin/env node
/**
 * Build the refusal / contested / confirmed-answerable groups and the results
 * document from the gate-scoring report (score-real-phrased.mjs) and the final
 * labels (real-phrased-queries-labeled.csv).
 *
 * The gate decision per query comes from the browser-local MiniLM -> passage
 * retrieval -> Confidence Gate run. No label, gate threshold, or model is
 * changed here; this script only reads and reports.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const PRIMARY_LABEL = 'real-phrased-final-m018';
const COMPARE_LABEL = 'real-phrased-final-m017';

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

function loadLabeled() {
  const raw = readFileSync(resolve(here, 'real-phrased-queries-labeled.csv'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCSVLine(raw[0]).map((c) => c.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < raw.length; i += 1) {
    const f = parseCSVLine(raw[i]);
    if (f.length < header.length || f[0] === '') continue;
    const get = (n) => (idx(n) >= 0 ? (f[idx(n)] ?? '') : '');
    rows.push({
      id: f[0],
      query: get('query'),
      source_type: get('source_type'),
      my_label: get('my_label'),
      my_sop_id: get('my_sop_id'),
      label_pass1: get('label_pass1'),
      sop_pass1: get('sop_pass1'),
      label_pass2: get('label_pass2'),
      sop_pass2: get('sop_pass2'),
      first_pass_label: get('first_pass_label'),
      label_source: get('label_source'),
    });
  }
  return rows;
}

function loadReport(label) {
  const path = resolve(here, `${label}.json`);
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const byId = new Map();
  for (const row of json.perQuery ?? []) byId.set(row.id, row);
  return { json, byId, margin: json.implementation?.minMargin ?? '?', totals: json.totals };
}

const labeled = loadLabeled();
const primary = loadReport(PRIMARY_LABEL);
const compare = loadReport(COMPARE_LABEL);
if (primary === null) throw new Error(`primary scoring report ${PRIMARY_LABEL}.json not found — run the scorer first`);

const gateDecision = (row) => {
  const r = primary.byId.get(row.id);
  if (!r) return { decision: 'unknown', sopId: '' };
  const actual = r.actual ?? { decision: 'escalate', reason: 'missing' };
  return {
    decision: actual.decision === 'answer' ? 'answer' : 'escalate',
    sopId: actual.sopId ?? actual.reason ?? '',
    outcome: r.outcome ?? '',
  };
};

// ---- REFUSAL SET (owner: escalate / ambiguous) — false accepts first ----
const refusal = labeled.filter((r) => r.my_label === 'escalate' || r.my_label === 'ambiguous');
const refusalFalseAccepts = refusal.filter((r) => gateDecision(r).decision === 'answer');
const refusalEscalateAnswered = refusalFalseAccepts.filter((r) => r.my_label === 'escalate');
const refusalAmbiguousAnswered = refusalFalseAccepts.filter((r) => r.my_label === 'ambiguous');
const escalationHeld = refusal.length - refusalFalseAccepts.length;

// ---- CONTESTED SET (both agents answerable, owner unconfirmed) — not scored ----
const contested = labeled.filter(
  (r) => r.label_pass1 === 'answerable' && r.label_pass2 === 'answerable' && r.my_label !== 'answerable',
);
const contestedRows = contested.map((r) => {
  const g = gateDecision(r);
  return { id: r.id, owner: r.my_label, agentSop: r.sop_pass1, gate: g.decision, gateSop: g.sopId };
});

// ---- CONFIRMED-ANSWERABLE (owner answerable) — small sample ----
const confirmed = labeled.filter((r) => r.my_label === 'answerable');
const confirmedRows = confirmed.map((r) => {
  const g = gateDecision(r);
  const correct = g.decision === 'answer' && (r.my_sop_id === '' || g.sopId === r.my_sop_id);
  return {
    id: r.id,
    sop: r.my_sop_id,
    source: r.label_source,
    gate: g.decision,
    gateSop: g.sopId,
    correct,
  };
});
const confirmedAnswered = confirmedRows.filter((r) => r.gate === 'answer').length;
const confirmedCorrect = confirmedRows.filter((r) => r.correct).length;

const pct = (n, d) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);

// ---- comparison margin (0.17) refusal false accepts, if present ----
let compareNote = '0.17 comparison run not produced.';
if (compare !== null) {
  const cRefusalFalseAccepts = refusal.filter((r) => {
    const cr = compare.byId.get(r.id);
    return cr && (cr.actual?.decision ?? 'escalate') === 'answer';
  }).length;
  compareNote = `At minMargin 0.17 (recorded baseline): refusal-set false accepts = ${cRefusalFalseAccepts} of ${refusal.length}.`;
}

const md = [
  '# Real-phrased dual-pass labeling — results',
  '',
  'Simulated-public evaluation. The 72 queries are real support questions collected from public',
  'sources, mapped by analogy to a fictional WaveCast tenant; wording only, no usernames or',
  'personal details. They are used mainly to test refusal, not to measure in-scope accuracy.',
  '',
  `Gate scoring: browser-local MiniLM -> passage cosine retrieval -> Confidence Gate -> agent view,`,
  `at minMargin **${primary.margin}** (the shipped tenant default; the recorded simulated-batch`,
  `baseline uses 0.17 — see comparison below). No gate threshold, model, or corpus text was changed.`,
  '',
  '## Spot-check agreement (15 rows, owner vs agent-agreed)',
  '',
  '- Exact-match agreement: **8/15** (53.3%).',
  '- First-pass exact: **5/15** (33.3%) — the owner\'s first-pass procedure guesses before re-reading the texts.',
  '- Coarse "should the assistant auto-answer? yes/no" agreement: **12/15** (80.0%).',
  '',
  'Exact-match disagreements (7): rp-004 (agent escalate / owner ambiguous), rp-022 (answerable wc-live /',
  'escalate), rp-023 (answerable wc-eligibility / escalate), rp-028 (escalate / ambiguous), rp-033 (escalate /',
  'ambiguous), rp-040 (answerable wc-live / ambiguous), rp-070 (escalate / ambiguous).',
  '',
  'Coarse disagreements (3) — the agent would auto-answer but the owner would not: rp-022, rp-023, rp-040.',
  'First-pass disagreements (10) are all first-pass procedure guesses that differed from the agreed agent',
  'procedure; they are not final labels and are kept only for audit.',
  '',
  '## Scoring groups',
  '',
  `### REFUSAL SET — ${refusal.length} rows (owner label escalate or ambiguous; the gate must NOT auto-answer)`,
  '',
  `**False accepts (safety-relevant): ${refusalFalseAccepts.length} of ${refusal.length}.**`,
  refusalFalseAccepts.length === 0
    ? 'No query in the refusal set was auto-answered by the gate. The escalation path held on every row the owner marked escalate or ambiguous.'
    : 'Rows the gate auto-answered despite the owner marking them escalate/ambiguous:',
  ...(refusalFalseAccepts.length > 0
    ? refusalFalseAccepts.map((r) => {
        const g = gateDecision(r);
        return `- ${r.id} (owner ${r.my_label}) -> gate answered ${g.sopId}`;
      })
    : []),
  '',
  `Breakdown: ${refusalEscalateAnswered.length} owner-escalate rows answered + ${refusalAmbiguousAnswered.length} owner-ambiguous rows answered.`,
  `Of the ${refusal.length} refusal rows, the gate correctly escalated ${escalationHeld}.`,
  '',
  `Note on the scorer's own "unsafe answers" line: it reports ${primary.totals.unsafeAnswers}, which counts only`,
  `owner-escalate rows the gate answered (${refusalEscalateAnswered.length}) plus owner-answerable rows the gate answered with the`,
  `wrong procedure (${primary.totals.unsafeAnswers - refusalEscalateAnswered.length}). It deliberately excludes the`,
  `${refusalAmbiguousAnswered.length} owner-ambiguous rows the gate answered, because ambiguous is carried but not scored.`,
  `The REFUSAL SET figure of ${refusalFalseAccepts.length} uses the owner's broader definition (escalate OR ambiguous must not auto-answer).`,
  '',
  `### CONTESTED SET — ${contested.length} rows (both agents answered answerable; owner did NOT confirm)`,
  '',
  'Reported separately. NOT counted as errors or successes. These are the rows where two independent',
  'agent passes agreed the query was answerable but the owner overrode to escalate/ambiguous.',
  ...contestedRows.map((r) => `- ${r.id}: owner ${r.owner} | agents ${r.agentSop} | gate ${r.gate}${r.gateSop ? ' ' + r.gateSop : ''}`),
  '',
  `### CONFIRMED-ANSWERABLE — ${confirmed.length} rows (owner confirmed answerable)`,
  '',
  `Small sample — stated separately, not a headline accuracy. The gate answered ${confirmedAnswered} of`,
  `${confirmed.length}; of those, ${confirmedCorrect} matched the owner's procedure (or the owner left the`,
  `procedure unspecified). In-scope accuracy awaits the floor-query set (my-floor-queries.csv).`,
  ...confirmedRows.map((r) => `- ${r.id}: ${r.sop} (${r.source}) -> gate ${r.gate}${r.gateSop ? ' ' + r.gateSop : ''}${r.gate === 'answer' ? (r.correct ? ' [match]' : ' [wrong sop]') : ' [false escalation]'}`),
  '',
  '## Gate headline (per score-real-phrased.mjs, margin ' + primary.margin + ')',
  '',
  `- Queries scored: ${primary.totals.scored} of ${primary.totals.queries} (${primary.totals.ambiguous} ambiguous, excluded from headline).`,
  `- Accuracy: ${pct(primary.totals.correct, primary.totals.scored)} (${primary.totals.correct}/${primary.totals.scored}).`,
  `- False escalations: ${primary.totals.falseEscalations}.`,
  `- Unsafe answers: ${primary.totals.unsafeAnswers}.`,
  `- Runtime errors: ${primary.totals.runtimeErrors}.`,
  '',
  `Comparison: ${compareNote}`,
  '',
  '## Label provenance and limits',
  '',
  '- Two independent agent labeling passes. Each pass was produced by an isolated sub-agent that saw',
  '  only the query text and the 7 procedures\' text; neither saw the other pass\'s labels, the gate\'s',
  '  decisions, or the batch results. Agent labeling was authorized by the owner for this task only.',
  '- 9 disagreements between the two passes were resolved by the owner (human-resolved).',
  '- A 15-row spot-check was returned by the owner: 8/15 exact agreement, 12/15 coarse yes/no agreement,',
  '  first pass 5/15. The spot-check is a hand-picked stratified sample, not a random one.',
  '- The 72 queries are public YouTube / forum questions mapped by analogy to a fictional WaveCast',
  '  tenant, so the answerable mappings are contested; the set is used mainly to test refusal.',
  '- In-scope accuracy awaits the floor-query set (the owner\'s own frontline patterns).',
  '- No gate threshold, model, or corpus text was tuned in response to these results.',
  '',
  '## Files',
  '',
  '- `real-phrased-queries.csv` — scorer-safe 6-column source with final labels (my_label / my_sop_id).',
  '- `real-phrased-queries-labeled.csv` — full provenance: both passes, first_pass_label, label_source.',
  '- `real-phrased-final-m018.json` / `.md` — gate scoring at the shipped margin 0.18.',
  compare ? `- \`real-phrased-final-m017.json\` / \`.md\` — gate scoring at the recorded baseline margin 0.17.` : '',
  '- `audit-sheet.csv` — the 9 disagreements + 15 seed-sampled agreements for the owner\'s review.',
].join('\n') + '\n';

writeFileSync(resolve(here, 'real-phrased-label-results.md'), md);

const summary = {
  refusal: refusal.length,
  refusalFalseAccepts: refusalFalseAccepts.length,
  refusalEscalateAnswered: refusalEscalateAnswered.length,
  refusalAmbiguousAnswered: refusalAmbiguousAnswered.length,
  escalationHeld: escalationHeld,
  refusalFalseAcceptIds: refusalFalseAccepts.map((r) => r.id),
  contested: contested.length,
  confirmedAnswerable: confirmed.length,
  confirmedAnswered,
  confirmedCorrect,
  compareNote,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`\nWrote real-phrased-label-results.md\n`);
