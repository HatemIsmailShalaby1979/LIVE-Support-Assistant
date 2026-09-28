# parity-local-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 40 synthetic tickets (22 flagged, 55.00000000000001% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **67.5%** (27/40). Failure rate: **32.5%** (13/40).
Latency per query decision: mean 22.92 ms; median 21.30 ms; p95 39.70 ms; max 51.60 ms.

- Chaos subset: 72.7% accurate (16/22).
- Baseline subset: 61.1% accurate (11/18).
- False escalations: 7; unsafe/wrong-SOP answers: 6; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 27/40 (67.5%) | 27/40 (67.5%) |
| False escalations | 7 | 7 |
| Unsafe answers | 6 | 6 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 18 | 11/18 (61.1%) | 1 | 11/18 (61.1%) | 1 | 0 |
| contradicting_sops | 1 | 1/1 (100.0%) | 0 | 1/1 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 7 | 2/7 (28.6%) | 5 | 2/7 (28.6%) | 5 | 0 |
| near_duplicate | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |
| no_correct_answer | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |

## Failure categories (ranked)

- false_escalation: 7
- unsafe_answer_on_escalation_case: 6

### Gate/runtime causes

- false_escalation:insufficient_margin: 7
- unsafe_answer_on_escalation_case:answered: 6

### Failures by ticket type

- baseline: 7
- mixed_language_typos_sarcasm: 5
- near_duplicate: 1

## Up to 10 worst failures

### 1. PARITY-RP-040 — unsafe_answer_on_escalation_case (12.70 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_ambiguous
- Actual: answer (wc-live)
- Subject: YouTube: We have detected multiple streams using the same st
- Message: YouTube: We have detected multiple streams using the same stream key with auto-start enabled.

### 2. PARITY-RP-022 — unsafe_answer_on_escalation_case (12.00 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_escalate
- Actual: answer (wc-live)
- Subject: Livestream on youtube by phone and microphone not enabling t
- Message: Livestream on youtube by phone and microphone not enabling this just started happening

### 3. PARITY-RP-060 — unsafe_answer_on_escalation_case (10.00 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_escalate
- Actual: answer (wc-payout)
- Subject: How can creators monetize on TikTok?
- Message: How can creators monetize on TikTok?

### 4. PARITY-RP-023 — unsafe_answer_on_escalation_case (9.40 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_escalate
- Actual: answer (wc-live)
- Subject: How can i Enable Live Streaming?
- Message: How can i Enable Live Streaming?

### 5. PARITY-RP-025 — unsafe_answer_on_escalation_case (6.60 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_ambiguous
- Actual: answer (wc-live)
- Subject: Live stream on mobile
- Message: Live stream on mobile

### 6. PARITY-RP-026 — unsafe_answer_on_escalation_case (6.10 ms)

**data_mode: "simulated"**
- Expected: escalate — owner_label_ambiguous
- Actual: answer (wc-live)
- Subject: Live streaming issues
- Message: Live streaming issues

### 7. SIM-TICKET-00161 — false_escalation (36.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 8. SIM-TICKET-00123 — false_escalation (27.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

### 9. SIM-TICKET-00108 — false_escalation (27.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 10. SIM-TICKET-00164 — false_escalation (26.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: Could you check the normal payout timing? The status changed to processed earlier this week.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
