# Case study — LIVE Support Assistant

**data_mode: "simulated".** Every number below is a measurement on fictional or author-written
data, with the repo path it comes from. There is no design partner and no customer data.

**Positioning.** Validated on a simulated tenant; safety-first by design; ready for a shadow-mode
pilot. Not production-proven: no real customer traffic.

## The problem

A support assistant that answers from a company's own procedures has one job that matters: never
tell someone the wrong policy. In frontline support a wrong procedure in a reply is a compliance
breach, not a drafting error — especially where money, safety or account access is involved. The
hard part is therefore not retrieving a plausible passage. It is knowing when *not* to answer.

## The design

No generative model sits in the answering path. A query is embedded on the device by a pinned
MiniLM model, scored by cosine similarity against the tenant's procedure passages, and passed to a
deterministic Confidence Gate (`packages/core/src/gate.ts`). The gate answers only if the best
candidate clears an absolute floor **and** holds a margin of at least `minMargin` over the
runner-up; otherwise it escalates to a human, exposing no procedure text. Nothing synthesises,
paraphrases or guesses. The shipped default is `minMargin: 0.18` (`packages/core/src/types.ts`).

The margin, not the absolute score, is the load-bearing signal. On the Phase 1 golden set an
absolute cosine threshold could not separate answerable from unanswerable queries at all, because
MiniLM's similarity scale is compressed and corpus-dependent (`packages/core/src/types.ts`). The
top-1 minus top-2 margin separated the same queries, so both signals are required.

## How I tested it

- A fixed batch of **500 synthetic tickets** carrying **47 distinct messages** across **7
  procedures** and four languages (`tooling/eval/simulated-tenant/chaos-500.json`). Two runs at the
  same settings produced identical decisions on all 500 tickets
  (`tooling/eval/simulated-tenant/phase5-label-fix-margin-017.md`).
- An **independent holdout seed** (`20260929`, a different 500-ticket draw): 0 unsafe answers at
  both margins, 379/500 (75.8%) at 0.17 and 359/500 (71.8%) at 0.18
  (`tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-017.md`).
- A **48-procedure corpus** to test whether the margin survives scale: 196/414 (47.3%) with 218
  false escalations and 0 unsafe at 0.18; 205/414 (49.5%) with 208 false escalations and **1
  unsafe** at 0.17 (`tooling/eval/simulated-tenant/scale-rung-results.md`, tag `evidence/scale-rung (e5a7d9baf4f6)`).
- A **deployed-path** run against a development Supabase project with an isolated signed bundle:
  361/500 (72.2%), one unsafe answer, zero runtime errors
  (`tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md`).
- A read-only analysis of every false escalation
  (`tooling/eval/simulated-tenant/false-escalation-analysis.md`).
- Two owner-labelled real sets: 72 public-wording questions
  (`tooling/eval/simulated-tenant/real-phrased-label-results.md`) and 29 author-written floor
  messages (`tooling/eval/simulated-tenant/floor-queries-results.md`).

## What broke

- **A contradictory corpus was answered — but only on the deployed path.** `SIM-TICKET-00272`
  states two different payout windows. The deployed app answered it from the ordinary procedure at
  a recorded top-1/top-2 margin of **0.180757**, which clears the applied 0.17 *and* the shipped
  0.18 (`docs/decisions/conflicting-procedures.md`). **The local harness does not reproduce this:**
  on the same ticket it records top-1 0.71972 and top-2 0.55201, margin **0.167715**, and
  escalates correctly — in the 500-ticket runs and in the four-ticket demo. The two paths disagree
  on this ticket and I am not smoothing that over. The deployed counterexample stands, and it is
  the only record of the unsafe answer. The gate measures how *decisive* a match is, not whether
  the matched policy agrees with itself.
- **Most failures were the opposite.** Of the 138 false escalations at 0.17, all were blocked for
  insufficient margin, and they came from only **17 distinct messages**
  (`tooling/eval/simulated-tenant/false-escalation-analysis.md`). The failure mode was separation
  and corpus coverage, not the gate.
- **Real sets escalated heavily.** The floor set false-escalated 16 of 21 in-scope rows at 0.18
  (`tooling/eval/simulated-tenant/floor-queries-results.md`).
- **Scale cost accuracy, and English carried the result.** At 48 procedures the same measure fell
  from 72.4% (7 procedures, 0.17) to 49.5% at 0.17, with English 62.1% against Spanish 32.0% and
  Portuguese 31.0% at 0.18. The change is confounded — a different corpus *and* a larger one — so
  size alone is not established as the cause.

## What I decided, and why

- **Do not lower the margin.** At 0.16 the batch answered two further contradictory payout cases
  unsafely (`docs/decisions/conflicting-procedures.md`). No threshold setting separates "one clear
  winner" from "two policies disagree", because the two produce the same statistic. The shipped
  0.18 default is unchanged, and 0.17 remains harness-only.
- **Block contradictory policy at publish.** A bundle whose corpus carries a same-category numeric
  conflict is refused before signing (`tooling/conflicts/conflict-core.mjs`, branch
  `feat/publish-conflict-block`). Dev smoke test passed: clean corpus → 200, conflict corpus → 422,
  three borderline corpora → 200 with no false positive. This removes the failure class at the
  source with no change to gate behaviour. **Merged 2026-09-28** (`feat/publish-conflict-block`,
  live in the development Supabase project).
- **Reject the three tempting upgrades.** A procedure-wording edit, a cross-encoder reranker
  (+14/+15 new unsafe answers, 862 ms per query) and multilingual embedders (+0.3 pp overall at
  5.1× the download) were all measured and rejected (`AGENTS.md`).

## What is not proven

- No production readiness, accuracy, adoption or reliability. The batches are synthetic and the
  evaluation is in-sample.
- No real customer traffic, and no tenant has been calibrated. The 0.18 default is a prototype
  starting point; 0.17 is a harness value.
- **Recall at production corpus sizes is not proven.** 48 procedures is the largest corpus measured,
  and the 5,000-procedure scale the Phase 1 question names is untested.
- **The local harness does not reproduce the one unsafe answer**, so that failure is documented
  from the deployed run alone and its margin is not recomputable from any recorded file that
  carries candidate scores.
- The conflict lint reads English number words only, and the publish block is on a branch, not
  merged — so the `SIM-TICKET-00272` condition is still live in shipped code.

The full statement is in [`proof-of-concept.md`](../proof-of-concept.md). The pilot prerequisites
are listed in [`README.md`](../README.md).
