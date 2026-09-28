# Cross-encoder reranker measurement

**data_mode: "simulated".** Read-only. No product code, gate logic or threshold was changed.

## 1. Does the shipped app path use the reranker?

**No. The shipped path is the bi-encoder alone.**

The whole retrieval path in the app is four statements:

| Step | Location |
|---|---|
| Query embedding | `apps/web/src/App.tsx:337` — `index.embedQuery(queryText)` |
| Retrieval | `apps/web/src/App.tsx:342` — `searchTopK(vector, index.entries, 5)` |
| Gate | `apps/web/src/App.tsx:343` — `evaluateGate(candidates, { thresholdAccept, minMargin, topK })` |
| Agent view | `apps/web/src/App.tsx:351` — `buildAgentView(decision, activeCorpus, bundleVersion, escalationId)` |

The app imports `EMBEDDING_MODEL` (`apps/web/src/App.tsx:11`) and `buildCorpusPassages`, `searchTopK` (`:12`), and loads `createEmbedder` dynamically at `:178`. It never imports or calls `createReranker`. `searchTopK` (`packages/vector-store/src/cosine.ts:93`) also collapses passages to one candidate per procedure (`:103`–`:111`) before the gate sees them, so the gate only ever compares procedures.

`createReranker` exists and is complete (`packages/embedder/src/reranker.ts:49`), but its only callers are evaluation scripts: `tooling/eval/semantic-eval.mjs:298` and `tooling/eval/reranker-sanity.mjs:29`.

## 2. What adding it would take

**Model download.** The reranker is `Xenova/ms-marco-MiniLM-L-6-v2` at `q8` (`packages/embedder/src/model.ts:96`). On disk it is **23.1 MB** of ONNX plus a **0.71 MB** tokenizer, about **23.8 MB** — almost exactly the embedder's own 23.0 MB + 0.71 MB. Adding it roughly **doubles the model download**, from ~24 MB to ~48 MB, on a device that currently fetches one model.

**On-device latency.** Measured in this harness at `q8`:

| Path | Per-query decision latency (500 tickets) |
|---|---|
| Bi-encoder only | mean 17.87 ms, p95 25.00 ms |
| With reranker | mean 876.64 ms, p95 1131.00 ms |

The reranker stage alone, measured separately in the same runs:

| Run | Reranker load | Reranker per query (mean / median / p95 / max) |
|---|---|---|
| chaos-500 @ 0.17 | 8774 ms | 859.7 / 862.6 / 1109.6 / 1345.8 ms |
| chaos-500 @ 0.18 | 7583 ms | 859.9 / 866.0 / 1104.0 / 1306.3 ms |
| holdout @ 0.17 | 12902 ms | 855.2 / 858.4 / 1098.6 / 1242.1 ms |
| holdout @ 0.18 | 15013 ms | 854.9 / 861.6 / 1102.4 / 1243.3 ms |

`tooling/eval/semantic-eval.mjs` measures the same stage on the golden set and records p95 of **79.6–82.8 ms** (`docs/SYSTEM_DESIGN.md` §11A), against a bi-encoder p95 of **2.6 ms**. This harness, on this host, is roughly an order of magnitude slower again. Either way the reranker is the dominant cost by two orders of magnitude.

**Code touched.** Less than it looks:

- `packages/embedder/src/reranker.ts` — already written, no change needed.
- `packages/vector-store/src/cosine.ts:78` — `searchTopKPassages` already returns the uncollapsed shortlist the reranker needs.
- `apps/web/src/App.tsx:337`–`:351` — the four statements above; a rerank stage would sit between `:342` and `:343`, plus a second model load in the `:178`–`:221` block and progress reporting for it.
- Bundle and device state: the reranker is a second pinned model, so the bundle manifest's model revision check and the device's model cache both need a second entry.

The harness change used for this measurement is `tooling/eval/simulated-tenant/chaos-runner.ts` behind an opt-in `rerank=1` flag; the default path is untouched.

## 3. Measured on the two batches

Before = the shipped bi-encoder path. After = the same path with the cross-encoder over a 20-passage shortlist, both at the stated margin.

| Configuration | Correct | False escalations | Wrong-first (of FE) | Answered | Unsafe |
|---|---:|---:|---:|---:|---:|
| chaos-500 @ 0.17 — bi-encoder | 362/500 (72.4%) | 138 | 42 | 238 | 0 |
| chaos-500 @ 0.17 — with reranker | 403/500 (80.6%) | 83 | 0 | 307 | 14 |
| chaos-500 @ 0.18 — bi-encoder | 335/500 (67.0%) | 165 | 42 | 211 | 0 |
| chaos-500 @ 0.18 — with reranker | 403/500 (80.6%) | 83 | 0 | 307 | 14 |
| holdout @ 0.17 — bi-encoder | 379/500 (75.8%) | 121 | 40 | 246 | 0 |
| holdout @ 0.17 — with reranker | 386/500 (77.2%) | 99 | 1 | 283 | 15 |
| holdout @ 0.18 — bi-encoder | 359/500 (71.8%) | 141 | 40 | 226 | 0 |
| holdout @ 0.18 — with reranker | 386/500 (77.2%) | 99 | 1 | 283 | 15 |

### Accuracy change

| Configuration | Accuracy before | after | Δ | False escalations before | after | Unsafe before | after |
|---|---:|---:|---:|---:|---:|---:|---:|
| chaos-500 @ 0.17 | 72.4% | 80.6% | +8.2 | 138 | 83 | 0 | 14 |
| chaos-500 @ 0.18 | 67.0% | 80.6% | +13.6 | 165 | 83 | 0 | 14 |
| holdout @ 0.17 | 75.8% | 77.2% | +1.4 | 121 | 99 | 0 | 15 |
| holdout @ 0.18 | 71.8% | 77.2% | +5.4 | 141 | 99 | 0 | 15 |

### New failures introduced by the reranker

| Configuration | New unsafe answers | New wrong-first |
|---|---:|---:|
| chaos-500 @ 0.17 | 14 (SIM-TICKET-00482, SIM-TICKET-00290, SIM-TICKET-00483, SIM-TICKET-00478, SIM-TICKET-00472, SIM-TICKET-00285, SIM-TICKET-00463, SIM-TICKET-00469, SIM-TICKET-00464, SIM-TICKET-00465, SIM-TICKET-00498, SIM-TICKET-00333, SIM-TICKET-00500, SIM-TICKET-00287) | 11 |
| chaos-500 @ 0.18 | 14 (SIM-TICKET-00482, SIM-TICKET-00290, SIM-TICKET-00483, SIM-TICKET-00478, SIM-TICKET-00472, SIM-TICKET-00285, SIM-TICKET-00463, SIM-TICKET-00469, SIM-TICKET-00464, SIM-TICKET-00465, SIM-TICKET-00498, SIM-TICKET-00333, SIM-TICKET-00500, SIM-TICKET-00287) | 11 |
| holdout @ 0.17 | 15 (SIM-TICKET-00279, SIM-TICKET-00467, SIM-TICKET-00271, SIM-TICKET-00491, SIM-TICKET-00479, SIM-TICKET-00485, SIM-TICKET-00497, SIM-TICKET-00290, SIM-TICKET-00162, SIM-TICKET-00288, SIM-TICKET-00474, SIM-TICKET-00276, SIM-TICKET-00470, SIM-TICKET-00281, SIM-TICKET-00488) | 12 |
| holdout @ 0.18 | 15 (SIM-TICKET-00279, SIM-TICKET-00467, SIM-TICKET-00271, SIM-TICKET-00491, SIM-TICKET-00479, SIM-TICKET-00485, SIM-TICKET-00497, SIM-TICKET-00290, SIM-TICKET-00162, SIM-TICKET-00288, SIM-TICKET-00474, SIM-TICKET-00276, SIM-TICKET-00470, SIM-TICKET-00281, SIM-TICKET-00488) | 12 |

The reranker introduces **29 new unsafe answers** across the two batches (29 distinct tickets), from **9 distinct message-and-batch combinations**. Every one is a ticket whose expected handling is escalation and which the reranker answered.

| Batch | Language | Tickets | Answered from | Reranker score | Expected | Query text |
|---|---|---:|---|---:|---|---|
| chaos-500 | en | 3 | wc-payout | 0.6609 | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| chaos-500 | es | 3 | wc-login | 0.8109 | wc-security | No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta. |
| chaos-500 | es | 5 | wc-payout | 0.9512 | wc-gifts | ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción. |
| chaos-500 | pt-BR | 2 | wc-payout | 0.2710 | wc-live | Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação. |
| chaos-500 | fr | 1 | wc-payout | 0.9995 | wc-payout | Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés. |
| holdout-500-seed-20260929 | es | 6 | wc-login | 0.8109 | wc-security | No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta. |
| holdout-500-seed-20260929 | es | 6 | wc-payout | 0.9512 | wc-gifts | ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción. |
| holdout-500-seed-20260929 | pt-BR | 2 | wc-payout | 0.2710 | wc-live | Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação. |
| holdout-500-seed-20260929 | en | 1 | wc-payout | 0.6609 | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |

## 4. What the reranker's scores look like

The reranker returns a sigmoid over one logit (`packages/embedder/src/reranker.ts:90`), so its scores are probabilities, not cosine similarities. **A margin of 0.17 or 0.18 does not mean the same thing to the two paths**, which is why the table below matters more than the accuracy comparison above.

| Distribution | Bi-encoder margin (cosine) | Reranker margin (sigmoid) | Reranker top-1 score |
|---|---:|---:|---:|
| Minimum | 0.0054 | 0.0001 | 0.0002 |
| 25th percentile | 0.0844 | 0.1146 | 0.1881 |
| Median | 0.1750 | 0.6405 | 0.6751 |
| 75th percentile | 0.2420 | 0.9306 | 0.9956 |
| Maximum | 0.3560 | 0.9952 | 0.9995 |

On chaos-500 the reranker's median margin is 0.6405, against 0.1750 for the bi-encoder. A threshold of 0.18 sits far below the reranker's median, so at the shipped margin the reranker accepts almost everything.

### Sweep — how the reranker behaves across margins (chaos-500, seed 20260928)

A ticket is **answered** only when the gate accepts it *and* the matched procedure does not itself require manual review; an accepted match on a manual-review procedure still produces a content-free escalation (`buildAgentView`, `packages/core/src/agent-view.ts`). **Unsafe** counts answered tickets whose expected handling was escalation. **Correct** counts answered tickets that expected an answer from the procedure that was ranked first.

| Margin | Answered | Escalated | Unsafe | Correct |
|---:|---:|---:|---:|---:|
| 0.05 | 375 | 125 | 26 | 349 |
| 0.10 | 340 | 160 | 25 | 315 |
| 0.17 | 307 | 193 | 14 | 293 |
| 0.18 | 307 | 193 | 14 | 293 |
| 0.30 | 285 | 215 | 9 | 276 |
| 0.50 | 239 | 261 | 9 | 230 |
| 0.64 | 218 | 282 | 6 | 212 |
| 0.80 | 143 | 357 | 1 | 142 |
| 0.90 | 135 | 365 | 1 | 134 |
| 0.95 | 122 | 378 | 1 | 121 |
| 0.98 | 81 | 419 | 1 | 80 |
| 0.99 | 77 | 423 | 0 | 77 |

This sweep is **reporting only**. No threshold is proposed, and none should be adopted from it: it is calibrated on one synthetic batch with 47 distinct messages, and the hold-out requirement that applies to any margin (see `docs/SYSTEM_DESIGN.md` §11A) has not been met.

### The comparison that decides it

The lowest observed margin at which the reranker answers **nothing it should have escalated** is **0.9903**, where it answers **77** tickets (77 correct). The shipped bi-encoder at its own default margin of 0.18 answers **211** tickets with **0** unsafe answers and 335 correct. At its safest point the reranker therefore delivers roughly a third of the answers the bi-encoder already delivers safely.

## 5. Recommendation

**Do not add the reranker to the shipped path.**

1. **It does not improve separation.** Accuracy moves +8.2 on chaos-500 at 0.17 and +1.4 on the holdout; at 0.18, +13.6 and +5.4. This matches the earlier recorded result on the golden set, where reranking reduced recall@1 from 78% to 70% and the precision-qualified answer rate from 8/50 to 2/50.
2. **It costs two orders of magnitude in latency.** The reranker stage alone measured a mean of 860 ms per query here, against 17.87 ms for the whole bi-encoder decision. The recorded golden-set measurement puts it at 79.6–82.8 ms p95 against 2.6 ms, which already straddles the project's 80 ms retrieval budget.
3. **It doubles the model download** (~24 MB → ~48 MB) and adds a second pinned model to the bundle manifest and the device cache.
4. **Its scores are not on a comparable scale, so its margin would have to be re-calibrated from scratch** — and any margin calibrated on this batch would be calibrated on 47 distinct messages.
5. **It introduced 58 new unsafe answer(s)**, listed in section 3.

The earlier ledger entry already records cross-encoder reranking as measured and rejected (`AGENTS.md`, Phase 1 second pass: "Do not repeat these experiments"). This measurement re-confirms it on the two larger simulated batches and quantifies the cost. If reranking is revisited, it should be with a corpus in the reranker's trained regime — long, natural passages rather than short policy sentences — not with a different threshold.

## Method notes

- The reranker is enabled only in `tooling/eval/simulated-tenant/chaos-runner.ts`, behind `rerank=1`; the shipped `App.tsx` path is unchanged and was not touched.
- Shortlist size is 20 passages, matching `tooling/eval/semantic-eval.mjs:55`.
- The margin is recomputed with the gate's own formula from the recorded candidate scores.
- The two margins under test (0.17 and 0.18) are the recorded evaluation margin and the shipped default. They are applied to the reranker for comparability only, and are not its calibrated operating points.

