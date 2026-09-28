# Case study — LIVE Support Assistant

**data_mode: "simulated".** Every number below is a measurement on fictional data, with the repo
path it comes from. There is no design partner and no customer data.

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
paraphrases or guesses. The shipped default is `minMargin: 0.18`
(`packages/core/src/types.ts`).

The margin, not the absolute score, is the load-bearing signal. On the Phase 1 golden set an
absolute cosine threshold could not separate answerable from unanswerable queries at all, because
MiniLM's similarity scale is compressed and corpus-dependent (`packages/core/src/types.ts`). The
top-1 minus top-2 margin separated the same queries, so both signals are required.

## How I tested it

- A fixed batch of **500 synthetic tickets** carrying **47 distinct messages** across **7
  procedures** and four languages (`tooling/eval/simulated-tenant/chaos-500.json`). Two runs at the
  same settings produced identical decisions on all 500 tickets
  (`tooling/eval/simulated-tenant/phase5-label-fix-margin-017.md`).
- A **deployed-path** run against a development Supabase project with an isolated signed bundle:
  361/500 (72.2%), one unsafe answer, zero runtime errors
  (`tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md`).
- A read-only analysis of every false escalation
  (`tooling/eval/simulated-tenant/false-escalation-analysis.md`).
- Two owner-labelled real sets: 72 public-wording questions
  (`tooling/eval/simulated-tenant/real-phrased-label-results.md`) and 29 author-written floor
  messages (`tooling/eval/simulated-tenant/floor-queries-results.md`).

## What broke

- **A contradictory corpus was answered.** `SIM-TICKET-00272` states two different payout windows;
  the app answered from the ordinary procedure at a measured top-1/top-2 margin of **0.180757** —
  which also clears the shipped 0.18 default (`docs/decisions/conflicting-procedures.md`). This is
  the one unsafe answer the headline claim refers to. The gate measures how *decisive* a match is,
  not whether the matched policy agrees with itself.
- **Most failures were the opposite.** Of the 138 false escalations, all were blocked for
  insufficient margin, and they came from only **17 distinct messages**
  (`tooling/eval/simulated-tenant/false-escalation-analysis.md`). The failure mode was separation
  and corpus coverage, not the gate.
- **Real sets escalated heavily.** The floor set false-escalated 16 of 21 in-scope rows at 0.18
  (`tooling/eval/simulated-tenant/floor-queries-results.md`).

## What I decided, and why

- **Do not lower the margin.** At 0.16 the batch answered two further contradictory payout cases
  unsafely (`docs/decisions/conflicting-procedures.md`). No threshold setting separates "one clear
  winner" from "two policies disagree", because the two produce the same statistic. The shipped
  0.18 default is unchanged.
- **Block contradictory policy at publish.** A bundle whose corpus carries a same-category numeric
  conflict is refused before signing (`tooling/conflicts/conflict-core.mjs`, branch
  `feat/publish-conflict-block`). This removes the failure class at the source with no change to
  gate behaviour.
- **Reject the two tempting upgrades.** A procedure-wording edit and a cross-encoder reranker were
  both measured and rejected (`AGENTS.md`); the reranker added 14–15 unsafe answers for a doubled
  download.

## What is not proven

- No production readiness, accuracy, adoption or reliability. The batch is synthetic and the
  evaluation is in-sample; there is no independent holdout.
- Corpus size is untested at scale — every number here is on a 7-procedure corpus.
- One unsafe answer is measured and unfixed in shipped code; the publish block is on a branch, not
  merged.
- No real customer data and no partner evidence. The 0.17 margin used in the evaluations is a
  harness value, not a tenant setting.

The full statement is in [`proof-of-concept.md`](../proof-of-concept.md).
