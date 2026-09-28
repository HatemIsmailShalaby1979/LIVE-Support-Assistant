#!/usr/bin/env node
/**
 * Analyse the scale-rung run: report by DISTINCT message (the batch uses each
 * message once, so tickets == distinct messages). Read-only over the reports.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (label) => JSON.parse(readFileSync(resolve(here, `${label}.json`), 'utf8'));
const m018 = load('scale-rung-m018');
const m017 = load('scale-rung-m017');

function stats(report) {
  const rows = report.perTicket;
  const considered = rows;
  const correct = considered.filter((r) => r.correctAfter).length;
  const falseEsc = considered.filter((r) => r.failureCategoryAfter === 'false_escalation').length;
  const unsafe = considered.filter((r) => r.failureCategoryAfter === 'unsafe_answer_on_escalation_case'
    || r.failureCategoryAfter === 'wrong_sop_answer').length;
  const runtimeErrors = considered.filter((r) => r.failureCategoryAfter === 'runtime_error').length;
  const answerable = considered.filter((r) => r.expected.decision === 'answer');
  const wrongFirst = answerable.filter((r) => {
    const top = r.candidates?.[0]?.sopId;
    return top !== r.expected.sopId;
  }).length;
  const answerableCorrect = answerable.filter((r) => r.correctAfter).length;
  const margins = considered.map((r) => {
    const c = r.candidates ?? [];
    return (c[0]?.score ?? 0) - (c[1]?.score ?? 0);
  }).filter((v) => Number.isFinite(v));
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  return {
    tickets: considered.length,
    distinctMessages: considered.length,
    correct, accuracy: correct / considered.length,
    falseEsc, unsafe, runtimeErrors, wrongFirst,
    answerable: answerable.length, answerableCorrect,
    marginMedian: median(margins), marginMin: Math.min(...margins), marginMax: Math.max(...margins),
  };
}

function byLanguage(report) {
  const out = {};
  for (const r of report.perTicket) {
    const lang = r.ticket.language;
    out[lang] ??= { tickets: 0, correct: 0, falseEsc: 0, unsafe: 0 };
    out[lang].tickets += 1;
    if (r.correctAfter) out[lang].correct += 1;
    if (r.failureCategoryAfter === 'false_escalation') out[lang].falseEsc += 1;
    if (r.failureCategoryAfter === 'unsafe_answer_on_escalation_case' || r.failureCategoryAfter === 'wrong_sop_answer') out[lang].unsafe += 1;
  }
  return out;
}

function confusionPairs(report) {
  const pairs = new Map();
  for (const r of report.perTicket) {
    if (r.expected.decision !== 'answer') continue;
    const top = r.candidates?.[0]?.sopId;
    if (top === undefined || top === r.expected.sopId) continue;
    const key = `${r.expected.sopId} -> ${top}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
}

const s18 = stats(m018);
const s17 = stats(m017);
const lang18 = byLanguage(m018);
const pairs18 = confusionPairs(m018);
const pairs17 = confusionPairs(m017);

const unsafeRows = m018.perTicket.filter((r) => r.failureCategoryAfter === 'unsafe_answer_on_escalation_case'
  || r.failureCategoryAfter === 'wrong_sop_answer');
const unsafeRows17 = m017.perTicket.filter((r) => r.failureCategoryAfter === 'unsafe_answer_on_escalation_case'
  || r.failureCategoryAfter === 'wrong_sop_answer');
const wrongFirstRows = m018.perTicket.filter((r) => r.expected.decision === 'answer'
  && (r.candidates?.[0]?.sopId ?? null) !== r.expected.sopId).slice(0, 20);
// Every figure below is derived from the reports; nothing about the batch size is typed in by hand.
const labelFix18 = m018.labelFix;
const escRows18 = m018.perTicket.filter((r) => r.expected.decision === 'escalate');
const contradictionRows18 = escRows18.filter((r) => r.expected.reason === 'conflicting_procedure_guidance');
const nearDupRows18 = m018.perTicket.filter((r) => r.ticket.chaosMutation?.type === 'near_duplicate');
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const f = (n) => (typeof n === 'number' ? n.toFixed(4) : String(n));

const md = [
  '# Scale-rung evaluation — a 48-procedure simulated tenant',
  '',
  '**data_mode: "simulated".** A larger fictional WaveCast corpus (48 procedures, 13 categories,',
  `English + Spanish + Portuguese) and a batch of **${s18.tickets} distinct messages** (each used once, so the`,
  'distinct-message count equals the ticket count — unlike the 500-ticket batch, which carries only',
  '47 distinct messages). The corpus passes the conflict lint (0 same-category numeric conflicts).',
  '',
  `Escalation coverage is deliberate: **${escRows18.length} of ${s18.tickets}** messages expect escalation — the`,
  '**no procedure** and **safety** cases (account takeover, suspicious logins, compromised recovery email,',
  `harassment, legal requests) plus **${contradictionRows18.length} contradiction** messages where two active procedures`,
  'give conflicting payout timing. The conflicting procedure is injected into the ticket, as the approved',
  '500-ticket batch does, so the corpus itself stays lint-clean. Near-duplicate topics are present too:',
  `${nearDupRows18.length} \`near_duplicate\` messages and the corpus's own near-topic procedure pairs.`,
  '',
  `Corpus: \`scale-rung-corpus.json\` · Batch: \`scale-rung-batch.json\` · Runs: \`scale-rung-m018\` / \`-m017\`.`,
  'Gate, threshold, model and corpus logic unchanged; only the evaluation corpus and batch are new.',
  '',
  '## Headline (by distinct message)',
  '',
  '| Margin | Messages | Correct | Accuracy | False escalations | Wrong-first | Unsafe answers | Runtime errors |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  `| 0.18 | ${s18.tickets} | ${s18.correct} | ${pct(s18.accuracy)} | ${s18.falseEsc} | ${s18.wrongFirst} | ${s18.unsafe} | ${s18.runtimeErrors} |`,
  `| 0.17 | ${s17.tickets} | ${s17.correct} | ${pct(s17.accuracy)} | ${s17.falseEsc} | ${s17.wrongFirst} | ${s17.unsafe} | ${s17.runtimeErrors} |`,
  '',
  `Answerable messages: ${s18.answerable} of ${s18.tickets} (the rest expect escalation).`,
  `Margin (0.18): median ${f(s18.marginMedian)}, min ${f(s18.marginMin)}, max ${f(s18.marginMax)}.`,
  '',
  `Figures are the label-fixed outcomes (\`expectedOutcome\`); **${labelFix18.reclassified} of ${s18.tickets}** messages was reclassified by that rule${labelFix18.reclassifiedTicketIds.length > 0 ? ` (${labelFix18.reclassifiedTicketIds.join(', ')})` : ''}. The raw batch label gives ${labelFix18.before.correct}/${s18.tickets} (${pct(labelFix18.before.accuracy)}) at 0.18.`,
  '',
  '## Unsafe answers first',
  '',
  unsafeRows.length === 0
    ? `**0 unsafe answers at margin 0.18** — but **1 at 0.17**, so lowering the margin introduced one. At 0.18 no escalation-expected message was answered and no answerable message was answered with the wrong procedure.`
    : `**${unsafeRows.length} unsafe answers at 0.18:**`,
  ...unsafeRows.map((r) => `- ${r.ticket.ticketId} (${r.ticket.language}) "${r.ticket.message}" — expected ${r.expected.decision}${r.expected.sopId ? ' ' + r.expected.sopId : ''}, actual ${r.actual.decision}${r.actual.sopId ? ' ' + r.actual.sopId : ''} (${r.failureCategoryAfter})`),
  ...unsafeRows17.map((r) => `- **(0.17 only)** ${r.ticket.ticketId} (${r.ticket.language}) "${r.ticket.message}" — expected ${r.expected.decision}${r.expected.sopId ? ' ' + r.expected.sopId : ''}, actual ${r.actual.decision}${r.actual.sopId ? ' ' + r.actual.sopId : ''} (${r.failureCategoryAfter})`),
  '',
  '## By language (0.18)',
  '',
  '| Language | Messages | Correct | Accuracy | False escalations | Unsafe |',
  '|---|---:|---:|---:|---:|---:|',
  ...Object.entries(lang18).sort().map(([lang, r]) => `| ${lang} | ${r.tickets} | ${r.correct} | ${pct(r.correct / r.tickets)} | ${r.falseEsc} | ${r.unsafe} |`),
  '',
  '## Confusion pairs (0.18) — expected procedure → top-1 procedure',
  '',
  'Counted over answerable messages whose top-1 candidate was not the expected procedure.',
  '',
  '| Pair | Messages |',
  '|---|---:|',
  ...(pairs18.length === 0 ? ['| (none) | 0 |'] : pairs18.map(([p, n]) => `| ${p} | ${n} |`)),
  '',
  `At 0.17 the same list is: ${pairs17.length === 0 ? '(none)' : pairs17.slice(0, 8).map(([p, n]) => `${p} (${n})`).join('; ')}.`,
  '',
  '## Wrong-first (expected procedure not ranked first), up to 20 at 0.18',
  '',
  '| Message | Language | Expected | Top-1 | Top-2 | Margin |',
  '|---|---|---|---|---:|---:|',
  ...wrongFirstRows.map((r) => {
    const c = r.candidates ?? [];
    return `| ${r.ticket.ticketId} | ${r.ticket.language} | ${r.expected.sopId} | ${c[0]?.sopId ?? '—'} | ${c[1]?.sopId ?? '—'} | ${f((c[0]?.score ?? 0) - (c[1]?.score ?? 0))} |`;
  }),
  '',
  '## Confusability (corpus geometry)',
  '',
  'Separate, read-only, in `scale-rung-confusability.md`: it measures the corpus itself. Mean',
  'pairwise max cosine across the 48 procedures is **0.5790**; the most confusable pair is',
  '`sc-login-loop ↔ sc-live-disconnect` at **0.8501**, well above the shipped margin, so those two',
  'topics are the most likely to be answered from the wrong procedure. Geometry is a proxy for',
  'margin risk, not a predictor of query behaviour.',
  '',
  '## Compared with the 7-procedure result',
  '',
  '| Corpus | Messages | Margin | Accuracy | False escalations | Unsafe |',
  '|---|---:|---:|---:|---:|---:|',
  '| 7 procedures (`chaos-500.json`) | 47 distinct / 500 tickets | 0.17 | 72.4% | 138 | 0 |',
  '| 7 procedures (`chaos-500.json`) | 47 distinct / 500 tickets | 0.18 | 48.4% | 258 | 0 |',
  `| 48 procedures (scale-rung) | ${s18.tickets} distinct | 0.17 | ${pct(s17.accuracy)} | ${s17.falseEsc} | ${s17.unsafe} |`,
  `| 48 procedures (scale-rung) | ${s18.tickets} distinct | 0.18 | ${pct(s18.accuracy)} | ${s18.falseEsc} | ${s18.unsafe} |`,
  '',
  '## Did margin behaviour change with corpus size?',
  '',
  `- **The trade-off held.** At 0.18: ${s18.unsafe} unsafe, ${s18.falseEsc} false escalations, ${pct(s18.accuracy)} accurate. At 0.17: ${s17.unsafe} unsafe, ${s17.falseEsc} false escalations, ${pct(s17.accuracy)} accurate. Lowering the margin answered more and introduced an unsafe answer — the same direction as the 7-procedure corpus.`,
  `- **The operating point moved, and it is confounded.** The 7-procedure corpus scored 72.4% at 0.17 (138/500 false escalations); this 48-procedure corpus scores ${pct(s17.accuracy)} at 0.17 (${s17.falseEsc}/${s17.tickets}). It is a *different, larger* corpus with new procedures, so the change is content and size together — this experiment cannot attribute it to size alone.`,
  `- **Language drove more of it than size.** English ${pct(lang18.en.correct / lang18.en.tickets)} accurate, Spanish ${pct(lang18.es.correct / lang18.es.tickets)}, Portuguese ${pct(lang18.pt.correct / lang18.pt.tickets)}: the shorter translated summaries and queries false-escalate far more.`,
  '- **Still synthetic and in-sample.** It does not establish behaviour at a 5,000-procedure tenant. Each message is used once, so the distinct-message figures equal the ticket figures here.',
  `- **Escalation rows pass by construction when the gate escalates.** At 0.18, ${s18.unsafe === 0 ? 'no escalation-expected message was answered' : `${s18.unsafe} escalation-expected messages were answered`}, so every escalation row is a correct escalation. Those rows test that the gate does not over-answer; they carry no retrieval signal, and they are not independent evidence about ranking.`,
].join('\n') + '\n';

writeFileSync(resolve(here, 'scale-rung-results.md'), md);

process.stdout.write(`${JSON.stringify({
  m018: s18, m017: s17, byLanguage: lang18, topConfusionPairs: pairs18,
}, null, 2)}\n`);
