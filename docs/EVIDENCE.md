# Evaluation evidence (moved from README)

> Source moved in full from `README.md` on 2026-10-01. Every claim, source path and tag is
> preserved verbatim. Nothing was deleted; the README keeps a short summary and links here.

### Evaluation evidence — claims, with sources

Every number below is a measurement on simulated or author-written data, with the file it comes
from. Nothing here is a production-customer measure. The three tiers are the honest reading: what
has been shown, what it costs, and what has not been shown at all.

#### Tier 1 — DEMONSTRATED ON SIMULATED DATA

| Claim | Measured | Source |
| --- | --- | --- |
| Safety behaviour, 500-ticket batch, margin 0.17 | 362/500 (72.4%), 138 false escalations, **0 unsafe**, 0 runtime errors | `tooling/eval/simulated-tenant/phase5-label-fix-margin-017.md` |
| Same batch, repeated at identical settings | identical decisions on all 500 tickets | same file |
| Safety behaviour, independent holdout seed, margin 0.17 | 379/500 (75.8%), 121 false escalations, **0 unsafe** | `tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-017.md` |
| Safety behaviour, independent holdout seed, margin 0.18 | 359/500 (71.8%), 141 false escalations, **0 unsafe** | `tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-018.md` |
| Safety behaviour at 48 procedures, margin 0.18 | 196/414 (47.3%), 218 false escalations, **0 unsafe** | tag `evidence/scale-rung (e5a7d9baf4f6)`, `tooling/eval/simulated-tenant/scale-rung-results.md` |
| Same corpus, margin 0.17 | 205/414 (49.5%), 208 false escalations, **1 unsafe** (`SCALE-0328`) | same file |
| Deployed path end to end (sign-in, bundle, model, gate, tagged ingest) | 361/500 (72.2%), 138 false escalations, 1 unsafe, 0 runtime errors | `tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md` |
| **Proven** — tenant isolation audit | 500/500 query events, 261/261 escalation records, 15 SOP versions, 4 profiles, 2 devices tagged; **0 untagged rows** | same file |
| Refusal behaviour, author-written floor set | **0 of 8** refusal rows auto-answered at 0.18 and 0.17 | `tooling/eval/simulated-tenant/floor-queries-results.md` |
| The gate never leaks procedure text on escalation | 10/10 gate checks, including blocked views echoing the query text | `tooling/gate/verify-gate.mjs` |

#### Tier 2 — MEASURED LIMITS

| Limit | Measured | Source |
| --- | --- | --- |
| In-scope recall at 48 procedures (escalation-by-construction rows excluded) | 84/302 (27.8%) at 0.18; 93/302 (30.8%) at 0.17 | tag `evidence/multilingual-embedder (65b76aef103f)`, `tooling/eval/simulated-tenant/multilingual-embedder-results.md` |
| Non-English gap on the same corpus | English 62.1% vs Spanish 32.0% and Portuguese 31.0% at 0.18 | tag `evidence/scale-rung (e5a7d9baf4f6)`, `tooling/eval/simulated-tenant/scale-rung-results.md` |
| Author-written floor set, in-scope | **5 of 21** clear in-scope floor queries answered correctly (23.8%) at 0.18; the rest false-escalated | `tooling/eval/simulated-tenant/floor-queries-results.md` |
| **Rejected — procedure wording** (tag `evidence/procedure-wording (bd6db511a0ca)`) | moved only two `wc-gifts` templates, emptied the [0.17, 0.18) margin band, made the riskiest procedure pair slightly worse | `tooling/eval/simulated-tenant/wording-experiment-report.md` on that branch |
| **Rejected — cross-encoder reranker** (tag `evidence/reranker (495b52f6399b)`) | +14 new unsafe answers on chaos-500, +15 on the holdout; **862 ms per query**; roughly double the model download | `tooling/eval/simulated-tenant/reranker-measurement-report.md` on that branch |
| **Rejected — multilingual embedders** (tag `evidence/multilingual-embedder (65b76aef103f)`) | overall **+0.3 pp** at **5.1× the download** (21.91 → 112.83 MB); a language trade (en −9.7 pp, es +9.6 pp, pt +12.2 pp), not a gain | `tooling/eval/simulated-tenant/multilingual-embedder-results.md` on that branch |

#### Tier 3 — NOT PROVEN

| Not proven | Why |
| --- | --- |
| Real customer traffic | None exists. There is no design partner, no pilot customer, and no production traffic. Every number is synthetic or author-written. |
| Recall at production corpus sizes | The largest corpus tested is **48 procedures** (`evidence/scale-rung (e5a7d9baf4f6)`). A 40–70-procedure tenant is a rung, not the 5,000-procedure scale the Phase 1 open question names. |
| Per-tenant calibration | No tenant has been calibrated. The shipped `minMargin: 0.18` (`packages/core/src/types.ts`) is a prototype default; 0.17 is a harness-only evaluation value. |

### Tried and rejected

Three changes were measured and **not** merged. Do not repeat them (see `AGENTS.md`).

- **Procedure-wording edit** — tag `evidence/procedure-wording (bd6db511a0ca)`. Renaming each procedure's
  topic and dropping a cross-reference moved only two `wc-gifts` templates, emptied the
  [0.17, 0.18) margin band, and made the riskiest procedure pair slightly worse. The benefit was
  threshold-dependent, so it was rejected.
- **Cross-encoder reranker** — tag `evidence/reranker (495b52f6399b)`. It raised headline accuracy only
  by answering more, adding 14 new unsafe answers on one batch and 15 on another, at 862 ms per
  query and roughly double the model download. Rejected.
- **Multilingual embedders** — tag `evidence/multilingual-embedder (65b76aef103f)`. A multilingual MiniLM moved
  in-scope accuracy by +0.3 pp overall at 5.1× the download, trading English (−9.7 pp) for Spanish
  (+9.6 pp) and Portuguese (+12.2 pp). A wash on the product metric, so not adopted.

Evidence: the branch commits and the matching `AGENTS.md` ledger records.
