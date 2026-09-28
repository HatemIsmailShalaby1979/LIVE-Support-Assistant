# Decision required: contradictory procedures can be answered

**Status:** accepted (a) / (b) deferred — decision taken 2026-09-28.
**Date:** 2026-09-28.
**Scope:** `tooling/conflicts/` (wired into the publish path), `packages/core` gate (unchanged).
**data_mode: "simulated"** — every ticket, procedure and measurement below is fictional evaluation data.

**Decision and reason.** Option (a) is accepted: a bundle whose corpus carries a
same-category numeric conflict is blocked at publish time, before signing. The
publisher runs the lint (`conflict-core.mjs` -> `lintCorpusForPublish`) and
refuses with a 422 naming the two procedures, the field, and both conflicting
values. Option (b) is deferred: it changes gate behaviour and would raise the
false-escalation rate, which is already the largest failure category, and it
needs a schema change across `packages/core`, the bundle format, the publisher
and the database. (a) removes the failure class at the source with no product
behaviour change, so it is the lower-risk first move. Doing both remains
defensible later; (b) is not precluded, only not taken now. The shipped 0.18
threshold and the gate logic are untouched.

## 1. The problem

The Confidence Gate decides *how decisive* a match is. It does not decide whether
the matched policy agrees with itself.

`packages/core/src/gate.ts` accepts when the best candidate clears the absolute
floor and holds a margin of at least `minMargin` over the runner-up. Both are
properties of the score distribution. Neither reads the content of the two
procedures being compared. A corpus that states two different payout deadlines
in the same category therefore produces a *large* margin for whichever wording
matches the query better — the exact condition the gate reads as confidence.

Escalation is the correct outcome for a contradictory question: a human must
resolve which rule is current before a creator is told anything about money.

## 2. The measured case

In the approved 500-ticket deployed-path run (`0aec9773442c4282`), one ticket was
answered that should have escalated.

| Field | Value |
| --- | --- |
| Ticket | `SIM-TICKET-00272` (synthetic, English) |
| Category | Creator payouts |
| Query | "My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago." |
| Injected procedure | `wc-payout-conflict` — "Creator Payout Timing — Conflicting Legacy Guide" |
| Standard procedure | `wc-payout` — payout arrives in **two to five** business days |
| Conflicting procedure | payout arrives in **one** business day |
| Measured score | 0.71535 |
| Measured top-one/top-two margin | **0.180757** |
| Applied margin (test-only) | 0.17 |
| Shipped default margin | 0.18 |
| Outcome | answered from `wc-payout` instead of escalated |

Because `gate.ts` accepts when `margin >= minMargin`, this measured margin also
clears the shipped 0.18 default. The gap is not a threshold-calibration problem:
at a margin of 0.16, two further contradictory payout cases were answered unsafely
in the same batch. There is no setting of this threshold that separates "one
clear winner" from "two policies disagree", because the two situations produce
the same statistic.

The local repeat of the same batch produced zero unsafe answers, so the local run
alone is not a sufficient safety claim; the deployed counterexample stands.

## 3. What was implemented in this pass

A report-only lint, `tooling/conflicts/lint-procedure-conflicts.mjs`. It scans a
tenant corpus, extracts the numeric policy facts each procedure asserts (payout
and processing windows, minimum age, minimum followers, fees, payout minimums),
and reports any same-category pair whose asserted values are disjoint. It exits
non-zero on a conflict and changes nothing.

Measured on the simulated corpus:

| Corpus | Procedures | Conflicts | Result |
| --- | ---: | ---: | --- |
| `corpus.json` (clean) | 7 | 0 | exit 0 |
| `corpus.json` + the injected `wc-payout-conflict` | 8 | 1 | exit 1 |

The flagged conflict is `Creator payouts / window_days`: `wc-payout` asserts
2–5 business days, `wc-payout-conflict` asserts 1 business day.

The regression test `tooling/conflicts/verify-conflict-lint.mjs` reproduces the
case from the pinned batch itself and asserts the lint catches it. No threshold
was tuned to make the case pass; the lint has no threshold, only disjointness.

**The lint now blocks publication (option (a), accepted).**
`supabase/functions/publish-bundle/index.ts` runs `lintCorpusForPublish` on the
tenant's decrypted corpus before signing and returns HTTP 422 on any conflict,
naming the two procedures, the field, and both conflicting values. The detection
logic is single-sourced in `tooling/conflicts/conflict-core.mjs`, imported by the
lint CLI, the publish gate, and the verification harness. The gate, thresholds
and scoring are unchanged.

## 4. Two proposed fixes — for decision

### Option (a) — Block publishing a bundle that fails the conflict lint

A bundle whose corpus contains a same-category numeric conflict cannot be
published to a tenant. The publisher runs the lint and refuses on exit 1.

| | |
| --- | --- |
| Strength | Removes the class of failure at the source. A tenant can never serve contradictory policy, so the gate is never asked the question it cannot answer. |
| Strength | Deterministic and auditable: the conflict report is the evidence, and it is produced before anyone can query the bundle. |
| Cost | The lint parses prose. It will produce false positives on legitimately different figures (for example a per-region payout window), and every false positive blocks a real publish. |
| Cost | It blocks at the wrong moment. An author correcting one procedure is stopped by a conflict between two *other* procedures they may not own. |
| Cost | It cannot see contradictions expressed in prose the extractor does not parse — the stated limitation of the current implementation is that only English number words are read. |
| Risk | Publishers work around a blocking lint by editing wording until the parser stops complaining, which is worse than the conflict it hides. |

### Option (b) — A per-procedure high-stakes flag that forces escalation

Each procedure carries a `highStakes` flag covering money, safety and minors.
When the winning candidate is high-stakes, the gate escalates regardless of
margin, unless a human has explicitly approved the answer.

| | |
| --- | --- |
| Strength | Catches the general case, not just numeric conflicts. It covers prose contradictions, superseded wording and any other high-stakes ambiguity the lint cannot parse. |
| Strength | Fails safe. The default direction is escalation, which is the behaviour the product already promises. |
| Cost | It moves the problem to labelling. Someone must decide which procedures are high-stakes, and an unflagged money procedure is silently unprotected. |
| Cost | It changes gate behaviour, which is a product decision with a measurable cost: the simulated batch's false-escalation rate would rise, and that rate is already the largest failure category. |
| Cost | It needs a schema change across `packages/core`, the bundle format, the publisher and the database, plus a migration. That is a product change, not a tooling change. |
| Open question | Should the flag live on the procedure, the category, or the query? A category flag is cheap and coarse; a per-procedure flag is precise and easy to leave unset. |

### Not proposed

Lowering `minMargin` is not a fix. It was measured: at 0.16 the batch answered
two further contradictory payout cases unsafely. The shipped default stays 0.18
and no threshold change is proposed in this document.

## 5. Recommendation

Neither option is implemented. The choice is the owner's because it trades a
product behaviour change (b) against a publishing-process change (a).

If the decision is (a), the lint already exists and only needs wiring into the
publish path plus a false-positive review of the existing corpus. If the decision
is (b), the lint remains useful as a pre-publish signal but is not the mechanism.

Doing both is defensible: (a) stops contradictory policy from shipping, (b) fails
safe when something the lint cannot parse gets through. Doing neither leaves the
measured `SIM-TICKET-00272` condition live.

## 6. Reproduction

```bash
node tooling/conflicts/lint-procedure-conflicts.mjs tooling/eval/simulated-tenant/corpus.json
node tooling/conflicts/verify-conflict-lint.mjs
```

The lint exits 0 on the clean corpus and 1 when the conflicting procedure is
present. The regression test prints `CONFLICT LINT VERIFICATION OK`.
