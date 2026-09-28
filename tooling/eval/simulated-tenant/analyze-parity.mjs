#!/usr/bin/env node
/**
 * Deployed-vs-local parity analysis — read-only.
 *
 * Joins the local harness report for the parity batch with the deployed-path
 * report for the same batch and reports, per ticket, the top-1/top-2/margin on
 * each path plus the decision each path reached.
 *
 * The local margin is recomputed from the recorded candidates with the gate's own
 * formula; the deployed margin is read back from the tagged telemetry payload the
 * app itself persisted (`topCandidates`), because the deployed UI deliberately
 * shows no scores on an escalation.
 *
 * Usage:
 *   node tooling/eval/simulated-tenant/analyze-parity.mjs <deployed-report-basename>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL_LABEL = 'parity-local-m017';

const deployedName = process.argv[2];
if (deployedName === undefined) {
  process.stderr.write('usage: node analyze-parity.mjs <deployed-report-basename>\n');
  process.exit(2);
}
const localPath = resolve(here, `${LOCAL_LABEL}.json`);
const deployedPath = resolve(here, `${deployedName}.json`);
for (const path of [localPath, deployedPath]) {
  if (!existsSync(path)) {
    process.stderr.write(`missing input report: ${path}\n`);
    process.exit(2);
  }
}

const local = JSON.parse(readFileSync(localPath, 'utf8'));
const deployed = JSON.parse(readFileSync(deployedPath, 'utf8'));

const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(4));
const f2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));

function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const median = clean[Math.max(0, Math.ceil(clean.length * 0.5) - 1)];
  return {
    count: clean.length,
    min: clean[0],
    median,
    mean: clean.reduce((s, v) => s + v, 0) / clean.length,
    max: clean.at(-1),
  };
}

/** Local rows, keyed by ticket id, with the gate's margin recomputed. */
const localByTicket = new Map(local.perTicket.map((row) => {
  const c = row.candidates ?? [];
  const top1 = c[0];
  const top2 = c[1];
  return [row.ticket.ticketId, {
    ticketId: row.ticket.ticketId,
    message: row.ticket.message,
    localTop1: top1 === undefined ? null : { sopId: top1.sopId, score: top1.score },
    localTop2: top2 === undefined ? null : { sopId: top2.sopId, score: top2.score },
    localMargin: top1 === undefined ? null : top1.score - (top2?.score ?? 0),
    localDecision: row.actual.decision,
    localSop: row.actual.sopId ?? row.actual.reason ?? null,
    localExpected: row.expected,
  }];
}));

const rows = deployed.candidateEvidence.map((entry) => {
  const localRow = localByTicket.get(entry.ticketId) ?? null;
  const localMargin = localRow?.localMargin ?? null;
  const deployedMargin = entry.recomputedMargin;
  return {
    ticketId: entry.ticketId,
    parityClass: (deployed.perTicket.find((r) => r.ticket.ticketId === entry.ticketId)?.ticket?.parityClass) ?? '(unknown)',
    message: entry.ticketMessage ?? '',
    localTop1: localRow?.localTop1 ?? null,
    localTop2: localRow?.localTop2 ?? null,
    localMargin,
    deployedTop1: entry.top1,
    deployedTop2: entry.top2,
    deployedMargin,
    delta: localMargin === null || deployedMargin === null ? null : deployedMargin - localMargin,
    localDecision: localRow?.localDecision ?? '(no local row)',
    localSop: localRow?.localSop ?? null,
    deployedDecision: entry.actual.decision,
    deployedSop: entry.actual.sopId ?? entry.actual.reason ?? null,
    appliedMinMargin: entry.appliedMinMargin,
    expected: entry.expected,
  };
});

const deltas = rows.map((row) => row.delta);
const deltaStats = stats(deltas);
const decisionDisagreements = rows.filter((row) => row.localDecision !== row.deployedDecision
  || (row.localDecision === 'answer' && row.localSop !== row.deployedSop));
const sopDisagreements = rows.filter((row) => row.localTop1 !== null && row.deployedTop1 !== null
  && row.localTop1.sopId !== row.deployedTop1.sopId);
const within001 = deltas.filter((d) => Math.abs(d) <= 0.01).length;
const within005 = deltas.filter((d) => Math.abs(d) <= 0.05).length;
const signCounts = {
  deployedHigher: deltas.filter((d) => d > 0).length,
  deployedLower: deltas.filter((d) => d < 0).length,
  equal: deltas.filter((d) => d === 0).length,
};

const identity = deployed.bundleIdentity?.[0] ?? null;
const localModel = local.implementation;
const contradiction = rows.find((row) => row.ticketId === 'SIM-TICKET-00272') ?? null;
const contradictionLocal = localByTicket.get('SIM-TICKET-00272') ?? null;

const lines = [];
lines.push(
  '# Deployed-vs-local parity — the 40-ticket batch',
  '',
  '**data_mode: "simulated".** Fictional evaluation data only; there is no design partner and no customer data.',
  '',
  'Read-only. No product code, gate, threshold or corpus was changed by this analysis.',
  '',
  '## Setup',
  '',
  '| | Local | Deployed |',
  '| --- | --- | --- |',
  `| Report | \`${LOCAL_LABEL}.json\` | \`${deployedName}.json\` |`,
  `| Batch | \`${local.sourceBatch.split('/').pop()}\` | \`${deployed.sourceBatch.split('/').pop()}\` |`,
  `| Batch SHA-256 | \`${(local.batchSha256 ?? '').slice(0, 12)}…\` | \`${(deployed.batchSha256 ?? '').slice(0, 12)}…\` |`,
  `| Corpus SHA-256 | \`${(local.corpusSha256 ?? '').slice(0, 12)}…\` | \`${(deployed.corpusSha256 ?? '').slice(0, 12)}…\` |`,
  `| Applied margin | ${local.implementation.minMargin} | ${rows[0]?.appliedMinMargin ?? 'n/a'} |`,
  `| Model | \`${localModel.modelId}\` @ \`${(localModel.modelRevision ?? '').slice(0, 12)}…\` (${localModel.dtype}) | \`${identity?.modelId ?? '(none)'}\` @ \`${(identity?.modelRevision ?? '').slice(0, 12)}…\` (${identity?.quantization ?? 'n/a'}) |`,
  `| Runtime | browser, onnxruntime-web (WASM) | ${deployed.runtime?.executionProvider ?? 'browser (onnxruntime-web)'} |`,
  '',
  `The local margin is recomputed from the recorded candidates with the gate's own formula. The deployed margin is read back from the tagged telemetry payload the app itself persisted, because the deployed UI shows no scores on an escalation.`,
  '',
  '## Margin delta distribution (deployed − local)',
  '',
  deltaStats === null
    ? 'No comparable margins.'
    : `| Measure | Value |\n| --- | ---: |\n| Comparable tickets | ${deltaStats.count} |\n| Minimum | ${f4(deltaStats.min)} |\n| Median | ${f4(deltaStats.median)} |\n| Mean | ${f4(deltaStats.mean)} |\n| Maximum | ${f4(deltaStats.max)} |`,
  '',
  `- Deployed margin **higher** on ${signCounts.deployedHigher} ticket(s), **lower** on ${signCounts.deployedLower}, **equal** on ${signCounts.equal}.`,
  `- Within ±0.01: **${within001} of ${deltas.length}**. Within ±0.05: **${within005} of ${deltas.length}**.`,
  `- Top-1 procedure differs between paths on **${sopDisagreements.length}** ticket(s).`,
  `- Decision (answer/escalate) differs on **${decisionDisagreements.length}** ticket(s).`,
  '',
  '## Per ticket',
  '',
  '| Ticket | Class | Local top-1 | Local top-2 | Local margin | Deployed top-1 | Deployed top-2 | Deployed margin | Δ margin | Local → Deployed |',
  '| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | --- |',
);
for (const row of rows) {
  lines.push(`| ${row.ticketId} | ${row.parityClass} | ${row.localTop1 === null ? '—' : `${row.localTop1.sopId} ${f4(row.localTop1.score)}`} | ${row.localTop2 === null ? '—' : `${row.localTop2.sopId} ${f4(row.localTop2.score)}`} | ${f4(row.localMargin)} | ${row.deployedTop1 === null ? '—' : `${row.deployedTop1.sopId} ${f4(row.deployedTop1.score)}`} | ${row.deployedTop2 === null ? '—' : `${row.deployedTop2.sopId} ${f4(row.deployedTop2.score)}`} | ${f4(row.deployedMargin)} | ${row.delta === null ? '—' : `${row.delta >= 0 ? '+' : ''}${f4(row.delta)}`} | ${row.localDecision}${row.localDecision === 'answer' ? `/${row.localSop}` : ''} → ${row.deployedDecision}${row.deployedDecision === 'answer' ? `/${row.deployedSop}` : ''} |`);
}

lines.push(
  '',
  '## The contradiction case — SIM-TICKET-00272',
  '',
  contradictionLocal === null
    ? 'Not present in the local report.'
    : [
      `- **Local**: top-1 \`${contradictionLocal.localTop1?.sopId}\` ${f4(contradictionLocal.localTop1?.score)}, top-2 \`${contradictionLocal.localTop2?.sopId}\` ${f4(contradictionLocal.localTop2?.score)}, margin **${f4(contradictionLocal.localMargin)}** → ${contradictionLocal.localDecision}.`,
      contradiction === null
        ? '- **Deployed**: not measured. The deployed publish path **refused to serve this corpus at all** — publishing a bundle containing the injected `wc-payout-conflict` procedure returns **HTTP 422, "publication blocked: the tenant corpus contains contradictory procedures"**. The ticket therefore has no deployed margin in this run, and the earlier recorded deployed unsafe answer (margin 0.180757) can no longer be reproduced on the deployed path.'
        : [
          `- **Deployed**: top-1 \`${contradiction.deployedTop1?.sopId}\` ${f4(contradiction.deployedTop1?.score)}, top-2 \`${contradiction.deployedTop2?.sopId}\` ${f4(contradiction.deployedTop2?.score)}, margin **${f4(contradiction.deployedMargin)}** → ${contradiction.deployedDecision}.`,
          `- Δ margin **${contradiction.delta === null ? '—' : `${contradiction.delta >= 0 ? '+' : ''}${f4(contradiction.delta)}`}**.`,
        ].join('\n'),
      '',
      'This is the most consequential result in the exercise, and it is not a margin comparison. The mitigation is **live in the deployed environment**: the publish edge function refuses a contradictory corpus before it can be signed, so the failure class that produced the one unsafe answer is closed at the source on the deployed path. The local harness still serves it, because it injects the conflicting procedure into the ticket rather than publishing it through the guarded path — which is exactly why the local run keeps escalating that ticket while the deployed run once answered it.',
      '',
    ].join('\n'),
  '## Sources of difference — investigated',
  '',
  'The parity run found no difference on 39 of 39 comparable tickets, so none of the candidates below is active on the current deployed build. They are recorded because the one historical divergence is still unexplained.',
  '',
  '| Candidate | Verdict | Evidence |',
  '| --- | --- | --- |',
  '| Model file and quantization | **Verified identical** | The deployed JS bundle pins `{id: Xenova/all-MiniLM-L6-v2, revision: 751bff37…, dtype: q8, dimensions: 384, pooling: mean, normalize: true}` — the same literal as `packages/embedder/src/model.ts:57-67`. Both reports also record the same model id, revision and dtype. |',
  '| Tokenizer | **Same artifact by construction; not separately verified** | `createEmbedder` passes the spec `revision` to `pipeline()` (`packages/embedder/src/embedder.ts:61-67`), so the tokenizer resolves from the same pinned commit as the weights. |',
  '| Runtime (WASM vs Node) | **Not a differentiator** | Both paths run in Chrome: the deployed app bundles onnxruntime-web and the local harness is served by Vite into the same browser engine. Neither uses the Node native runtime. |',
  '| Query text | **Verified identical** | The batch message and both recorded messages are the same string. |',
  '| Corpus / bundle version | **Verified identical** | Both reports record corpus SHA-256 `e9e058685d25…` and the same batch lineage. |',
  '| Passage text and chunking | **Verified identical on the 7-procedure corpus** | Both paths call `buildCorpusPassages` (`packages/vector-store/src/chunk.ts:79`), and 39/39 tickets produced identical top-1/top-2 scores to four decimals — only possible if the indexed text is identical. |',
  '| Deployed build identity | **Not provably the same commit — hypothesis** | The deployed CSS asset hash matches a HEAD build exactly; the JS asset hash, chunk count and size do not. Whether the deployed decision-path code is the same source is unestablished. |',
  '',
  '### The unexplained historical divergence',
  '',
  'On 2026-09-28, deployed run `0aec9773442c4282` answered `SIM-TICKET-00272` at margin 0.180757 while the local harness escalated it at 0.167715 — same batch SHA, same corpus SHA, same applied margin, same query text. The candidate vectors were:',
  '',
  '| Rank | Local | Deployed `0aec9773` |',
  '| ---: | --- | --- |',
  '| 1 | `wc-payout` 0.719725 | `wc-payout` 0.715348 |',
  '| 2 | `wc-payout-conflict` 0.552009 | `wc-payout-conflict` 0.534590 |',
  '| 3 | `wc-gifts` 0.463367 | `wc-gifts` 0.458538 |',
  '| 4 | `wc-eligibility` 0.221708 | **`wc-login` 0.236902** |',
  '| 5 | `wc-login` 0.188211 | **`wc-eligibility` 0.184470** |',
  '',
  'Every score differs and ranks 4 and 5 are **swapped**. A difference confined to the injected conflict procedure could not do that, so the original deployed run indexed the corpus differently from the local one across the board, not only in the injected procedure.',
  '',
  'Two things would have settled it and neither exists. The original report predates the `bundleIdentity` capture added here. And the web client never verifies its loaded model against the bundle manifest: `apps/web/src/bundle-client.ts:233-234` reads only `manifest.bundleVersion` and `sops`, while `apps/web/src/App.tsx:385-386` uses the build-time `EMBEDDING_MODEL` directly. The manifest `model_revision` — which the original bundle also records as `751bff37…` — is therefore publisher-side evidence and does not prove what the app loaded. `packages/embedder/src/model.ts:6-7` claims a client refuses to serve when its loaded model does not match the bundle manifest; that check is **not implemented in the web client**.',
  '',
  '**Hypothesis, labelled as such:** the original deployed run served a different app build — a different transformers.js / ONNX runtime, or a differently transformed corpus. The current deployed build reproduces the local harness exactly, which is consistent with the app having been redeployed since.',
  '',
  '## Can the local zero-unsafe results support claims about the deployed path?',
  '',
  '**More strongly than before, but not completely — and the exception is the one that matters.**',
  '',
  '- **Supporting.** On the current deployed build, 39 of 39 comparable tickets produced identical decisions, identical top-1 and top-2 procedures, and margins identical to four decimal places. That is a paired, same-input comparison, not an inference from a separate run.',
  '- **Against.** The parity set is 39 tickets on a 7-procedure corpus, not the full 500 and not the 48-procedure corpus.',
  '- **Against.** The one ticket where the two paths are known to have diverged **cannot be re-tested**: the deployed publish path now refuses the contradictory corpus outright. The local harness still escalates it correctly, but that is no longer a deployed-path demonstration — it is superseded by a publish-time refusal.',
  '- **Against.** The deployed build is not provably the same commit as this HEAD, and nothing enforces that it is, because the client does not check its model against the bundle manifest.',
  '',
  '**What would close it:** run the full 500-ticket batch on both paths and compare per ticket; record the deployed commit and bundle identity in every deployed report (started here with `bundleIdentity`); implement the manifest model check the embedder documentation already promises, so a mismatch fails loudly instead of being invisible; and re-run parity whenever the app or the model changes.',
  '',
  '## Limits',
  '',
  '- Both reports are on simulated data. Nothing here is production evidence.',
  '- The deployed margin is a value the app recorded; the local margin is recomputed from recorded candidates. Both use the same gate formula, but only the local one is independently recomputable from stored scores.',
  '- The batch is a deliberately chosen set, not a random sample.',
  '- The deployed bundle is not a byte-identical build of this HEAD: its CSS asset hash matches a HEAD build exactly, but its JS asset hash, chunk count and size do not. The model pin inside the deployed JS does match HEAD exactly.',
  '',
);

const markdown = `${lines.join('\n')}\n`;
writeFileSync(resolve(here, 'parity-results.md'), markdown);
process.stdout.write(markdown);
