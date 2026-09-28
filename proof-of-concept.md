# SIMULATED DATA — WaveCast Creator Care proof of concept

**data_mode: "simulated" throughout.** WaveCast Creator Care is fictional. Every
ticket, policy, expected outcome, user, tenant, and measurement in this document
is evaluation data — not a real customer record, SLA, or production-usage metric.

**There is no design partner.** No partner, customer, or external organisation
supplied examples, reviewed results, or is referenced anywhere in this work. The
Phase 7 comparison was defined as a cross-check against a partner's anonymised
examples; with no partner, that comparison does not exist and is not claimed.

## Scenario

WaveCast is a fictional live-streaming and creator-commerce service. The scenario
models 120 frontline agents handling about 1,600 daily tickets across four
languages and in-app chat, email/web form, social messages, and callback
requests. Its test cases cover account access, payouts, gifts and purchases,
LIVE technical issues, eligibility, content restrictions, and ambiguous or
specialist-only questions. The full assumptions and non-contractual SLA targets
are in [`tooling/eval/simulated-tenant/client-brief.md`](tooling/eval/simulated-tenant/client-brief.md).

## What was evaluated

The fixed batch contains **500 synthetic tickets**, of which 75 (15%) carry one
of the configured chaos patterns. The assistant receives only the ticket's
message, matching the existing product interface. Expected labels and other
ticket fields remain in the test harness.

Those 500 tickets carry **47 distinct messages** — en 17, es 13, pt-BR 8, fr 10,
plus one ticket whose language column a chaos mutation removed — across **7
procedures** and four languages. Ticket counts are therefore weighted by how often
each template repeats, and are not independent observations. The distinct-message
table in the analysis below is the unit of evidence.

Two paths were exercised:

- **Local decision path** — the browser-local pinned MiniLM, passage retrieval,
  the Confidence Gate, and the agent view. No network, no database, no telemetry.
- **Deployed path** — the public static Vercel app against the **development
  Supabase project**, with an isolated signed policy bundle, the browser model and
  gate, and tagged ingest. This is a development backend, not a customer
  production backend.

Both used the evaluation-only 0.17 confidence margin. The shipped default remains
**0.18** and no threshold or gate logic was changed by any part of this work.

## Results

| SIMULATED DATA evaluation | Correct | Accuracy | Failures | Unsafe answers | Runtime errors |
|---|---:|---:|---:|---:|---:|
| Original local baseline, margin 0.18 | 242/500 | 48.4% | 258 (51.6%) | 0 | 0 |
| Local tuned test corpus, margin 0.17 | 362/500 | 72.4% | 138 (27.6%) | 0 | 0 |
| Repeat of the same local setup and batch | 362/500 | 72.4% | 138 (27.6%) | 0 | 0 |
| Deployed-path run `0aec9773442c4282`, margin 0.17 | 361/500 | 72.2% | 139 (27.8%) | 1 | 0 |

The local repeated run was deterministic across all 500 ticket decisions. Its
decision latency was 18.68 ms mean, 18.30 ms median, 25.50 ms p95, and 33.60 ms
maximum. The deployed-path run measured browser click-to-render latency of
22.38 ms mean, 21.70 ms median, 32.70 ms p95, and 47.30 ms maximum. These are
harness measurements on this environment, not service-level guarantees.

### Label fix — before and after

A labelling correction was applied and rescored: an unanswerable query (one cut
before any procedure keyword or meaning survived) is now expected to escalate
rather than being counted as a false escalation. The rule lives in code
(`tooling/eval/simulated-tenant/expected-outcome.ts`), not in a hand-edited list,
and the keyword test is scoped to the query's own language because the corpus's
trigger keywords are English while the corpus is four-language.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct, local, margin 0.17 | 362/500 (72.4%) | 362/500 (72.4%) |
| False escalations | 138 | 138 |
| Unsafe answers | 0 | 0 |
| Queries reclassified | — | **0** |

The correction changed nothing on this batch, because the batch contains no
truncated query: the shortest message is 14 words and no message is cut before
its meaning survives. The deployed path was therefore not re-run — the expected
decision counts did not move. The rule is retained so that a truncated query, if
one is ever added, is labelled correctly rather than counted as a failure. The
full before/after and per-technique tables are in
[`phase5-label-fix-margin-017.md`](tooling/eval/simulated-tenant/phase5-label-fix-margin-017.md).

The 138 false escalations are analysed separately, read-only, in
[`false-escalation-analysis.md`](tooling/eval/simulated-tenant/false-escalation-analysis.md):
one row per distinct message, split by language, chaos type and expected
procedure, with the gate margin and the runner-up behind each one. Three measured
findings bear on any reading of the numbers above. Every false escalation was
blocked for insufficient margin, so retrieval always returned a candidate. The
expected procedure was ranked first in 96 of the 138 and not first in 42 — mostly
a separation problem, but roughly a third are also misranked. And the 138 false
escalations come from only **17 distinct messages**, so those counts are not
independent observations.

## The one unsafe answer, and its measured margin

The deployed path differed from the local run on exactly one ticket:
`SIM-TICKET-00272`, a deliberately contradictory payout-policy case. The app
answered with the ordinary payout procedure instead of escalating.

| Field | Measured value |
|---|---|
| Score | 0.71535 |
| Top-one/top-two margin | **0.180757** |
| Applied margin (test-only) | 0.17 |
| Shipped default margin | 0.18 |

Because the gate accepts when the margin is at least its configured value, that
measured margin also clears the shipped 0.18 default. **This is a concrete
synthetic safety gap, not a passing safety claim.** A lower margin of 0.16 was
rejected earlier: it answered two further contradictory payout cases unsafely.

A report-only conflict lint was added to catch this class of problem before
publication: `tooling/conflicts/lint-procedure-conflicts.mjs` scans a corpus for
same-category procedure pairs whose numeric policy values are disjoint. On the
clean simulated corpus it reports 0 conflicts; with the injected conflicting
procedure it reports 1 (`Creator payouts / window_days`: 2–5 business days versus
1 business day) and exits non-zero. **Nothing in shipped code uses it yet** — the
two possible fixes and their trade-offs are in
[`docs/decisions/conflicting-procedures.md`](docs/decisions/conflicting-procedures.md),
awaiting a decision.

## What this proves

- The browser-local decision path is deterministic and repeatable on this fixed
  synthetic batch: two runs at identical settings produced identical decisions on
  all 500 tickets.
- The deployed path works end to end: sign-in, bundle delivery, browser model and
  gate, and tagged ingest against a real hosted database, with tenant isolation
  audited (500/500 tagged query events, 261/261 escalation records, and zero
  untagged rows in the audited set).
- The gate refuses to answer when its margin is not met, and escalations carry no
  procedure text.
- Corpus changes moved measured accuracy on this batch from 48.4% to 72.4% with
  no application code change — the failure mode was retrieval and corpus coverage,
  not the gate.

## What this does not prove

- **Production readiness is not proven.** Nothing here is a production-customer
  accuracy, adoption, or reliability measure.
- The batch is synthetic. Expected decisions were generated from the same
  scenario and corpus, so the evaluation is in-sample. There is no independent
  human labelling and no independently authored holdout.
- The 27.6% local and 27.8% deployed failure rates are **not low**. The
  "low and stable" stopping criterion is unmet.
- No design partner exists, so no partner comparison was performed and none is
  claimed.
- One unsafe answer remains measured and unfixed in shipped code.
- The 0.17 margin is an evaluation-harness value, not a tenant setting.
- The backend is the development Supabase project, with demo and probe accounts;
  the live URL requires sign-in and has no guest account.

## Data and evidence boundaries

- **SIMULATED DATA only.** Run-specific tenants, users, SOP version notes,
  visible browser banners, synthetic suggested replies, query events, escalation
  evidence, and reports are tagged. The evaluator verifies the tenant, profile,
  SOP-version, device, event, and escalation boundaries.
- The invalidated run
  [`phase5-deployed-run-c1de47a173764e5f.md`](tooling/eval/simulated-tenant/phase5-deployed-run-c1de47a173764e5f.md)
  is retained only to document an evaluator bug: its confidence slider was not
  proven to update React state. Its threshold comparison and unsafe count must
  not be used as valid 0.17 results.
- The real-phrased query set in
  [`real-phrased-queries.csv`](tooling/eval/simulated-tenant/real-phrased-queries.csv)
  quotes public help-centre and public-forum question wording only. No usernames
  or personal details are recorded, and the operator's labels for those rows are
  pending.

## Reproduction and recording

Validate the pinned batch with:

```powershell
node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json
```

Reproduce the label-fix rescore with:

```powershell
$env:SIMULATION_RUN_LABEL='phase5-label-fix-margin-017'; $env:SIMULATION_MIN_MARGIN='0.17'
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs
```

The complete deployed evaluation requires the approved development Supabase
credentials in `.env.local` and creates additional clearly tagged test records:

```powershell
pnpm run eval:simulated:deployed
```

One-ticket visible-browser recording steps, including notification and
credential precautions, are in
[`tooling/eval/simulated-tenant/screen-recording-instructions.md`](tooling/eval/simulated-tenant/screen-recording-instructions.md).
The two recording checkpoints were exercised successfully with one tagged
synthetic near-duplicate ticket; that smoke result is not a batch score
([report](tooling/eval/simulated-tenant/phase5-deployed-run-5c77413c866f4b10.md)).
