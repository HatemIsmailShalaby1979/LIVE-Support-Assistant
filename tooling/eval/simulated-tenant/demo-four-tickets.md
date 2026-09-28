# demo-four-tickets — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 4 synthetic tickets (3 flagged, 75% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **75.0%** (3/4). Failure rate: **25.0%** (1/4).
Latency per query decision: mean 20.02 ms; median 19.50 ms; p95 25.70 ms; max 25.70 ms.

- Chaos subset: 66.7% accurate (2/3).
- Baseline subset: 100.0% accurate (1/1).
- False escalations: 1; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 3/4 (75.0%) | 3/4 (75.0%) |
| False escalations | 1 | 1 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 1 | 1/1 (100.0%) | 0 | 1/1 (100.0%) | 0 | 0 |
| contradicting_sops | 1 | 1/1 (100.0%) | 0 | 1/1 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 1 | 0/1 (0.0%) | 1 | 0/1 (0.0%) | 1 | 0 |
| no_correct_answer | 1 | 1/1 (100.0%) | 0 | 1/1 (100.0%) | 0 | 0 |

## Failure categories (ranked)

- false_escalation: 1

### Gate/runtime causes

- false_escalation:insufficient_margin: 1

### Failures by ticket type

- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00123 — false_escalation (20.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
