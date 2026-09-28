# SIMULATED DATA — WaveCast Creator Care proof of concept

**data_mode: "simulated" throughout.** WaveCast Creator Care is fictional.
Every ticket, policy, expected outcome, user, tenant, and measurement in this
document is evaluation data—not a real customer record, partner example, SLA, or
production-usage metric.

## Scenario

WaveCast is a fictional live-streaming and creator-commerce service. The
scenario models 120 frontline agents handling about 1,600 daily tickets across
four languages and in-app chat, email/web form, social messages, and callback
requests. Its test cases cover account access, payouts, gifts and purchases,
LIVE technical issues, eligibility, content restrictions, and ambiguous or
specialist-only questions. The full assumptions and non-contractual SLA targets
are in [`tooling/eval/simulated-tenant/client-brief.md`](tooling/eval/simulated-tenant/client-brief.md).

## What was evaluated

The fixed batch contains **500 synthetic tickets**, of which 75 (15%) carry one
of the configured chaos patterns. The assistant receives only the ticket's
message, matching the existing product interface. Expected labels and other
ticket fields remain in the test harness.

The Phase 5 local evaluation exercised the browser-local pinned MiniLM,
passage retrieval, Confidence Gate, and agent-view path. The deployed-path
evaluation used the public static Vercel app, an isolated signed policy bundle,
the browser model and gate, and Supabase ingest against the development
project—not a customer production backend. The deployed run used a test-only
0.17 confidence margin; the shipped default remains 0.18.

## Results

| SIMULATED DATA evaluation | Correct | Accuracy | Failures | Unsafe answers | Runtime errors |
|---|---:|---:|---:|---:|---:|
| Original local baseline, margin 0.18 | 242/500 | 48.4% | 258 (51.6%) | 0 | 0 |
| Local tuned test corpus, margin 0.17 | 362/500 | 72.4% | 138 (27.6%) | 0 | 0 |
| Repeat of the same local setup and batch | 362/500 | 72.4% | 138 (27.6%) | 0 | 0 |
| Deployed-path run `0aec9773442c4282`, margin 0.17 | 361/500 | 72.2% | 139 (27.8%) | 1 | 0 |

The local repeated run was deterministic across all 500 ticket decisions.
Its decision latency was 18.68 ms mean, 18.30 ms median, 25.50 ms p95, and
33.60 ms maximum. The deployed-path run measured browser click-to-render
latency of 22.38 ms mean, 21.70 ms median, 32.70 ms p95, and 47.30 ms maximum.
These are harness measurements on this environment, not service-level
guarantees.

The deployed-path run delivered 500/500 tagged query events and 261/261
expected escalation records. Its database audit found 15 tagged SOP versions,
four tagged user profiles, two enrolled web devices, two SIMULATED DATA
tenants, and zero untagged rows in the audited set. The test run and report
are [`phase5-deployed-run-0aec9773442c4282.md`](tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md)
and its accompanying JSON.

## Hardening outcome and safety limit

Local accuracy increased by 24.0 percentage points after iterating on the
fictional test corpus and using the evaluation-only 0.17 margin. **No
application code or shipped threshold was changed.** This measures improved
coverage of this synthetic corpus; it is not evidence that a product fix
improved customer outcomes.

The deployed path differed from the local run on one ticket:
`SIM-TICKET-00272`, a deliberately contradictory payout-policy case. The app
answered with the ordinary payout procedure instead of escalating. Its
tagged telemetry recorded a score of 0.71535 and a top-one/top-two margin of
0.18076 at a verified applied margin of 0.17. Since the gate accepts when the
margin is at least its configured value, that measured margin is also above
the shipped 0.18 default. **This is a concrete synthetic safety gap, not a
passing safety claim.**

A lower margin of 0.16 was rejected earlier: it answered two other
contradictory payout cases unsafely on the same local batch. The
test-corpus improvements reduced false escalations locally, but 138 remain;
the deployed run had 138 false escalations plus the one unsafe answer. The
requested “low and stable” failure criterion is **not met**, and this exercise
does not justify relaxing the gate or shipping a new default.

## Data and evidence boundaries

- **SIMULATED DATA only.** Run-specific tenants, users, SOP version notes,
  visible browser banners, synthetic suggested replies, query events,
  escalation evidence, and reports are tagged. The evaluator verifies the
  tenant, profile, SOP-version, device, event, and escalation boundaries.
- The public app is backed by the development Supabase project. This is
  **deployed-path validation**, not production-customer validation, adoption,
  or accuracy evidence.
- Expected decisions were generated with the same synthetic scenario and
  corpus. No independent human labelling or independently authored customer
  holdout was used.
- The invalidated run
  [`phase5-deployed-run-c1de47a173764e5f.md`](tooling/eval/simulated-tenant/phase5-deployed-run-c1de47a173764e5f.md)
  is retained only to document an evaluator bug: its confidence slider was not
  proven to update React state. Its threshold comparison and unsafe count must
  not be used as valid 0.17 results.
- No real design-partner examples were supplied or used. Phase 7 is pending;
  this document does not claim a partner cross-check.

## Reproduction and recording

Validate the pinned batch with:

```powershell
node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json
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
