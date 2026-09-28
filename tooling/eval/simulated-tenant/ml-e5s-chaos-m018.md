# ml-e5s-chaos-m018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/multilingual-e5-small` @ `761b726dd34fb83930e26aab4e9ac3899aa1fa78` (q8); applied margin 0.18.

Decision-path accuracy against the batch's own labels: **24.8%** (124/500). Failure rate: **75.2%** (376/500).
Latency per query decision: mean 35.02 ms; median 34.00 ms; p95 45.90 ms; max 65.90 ms.

- Chaos subset: 34.7% accurate (26/75).
- Baseline subset: 23.1% accurate (98/425).
- False escalations: 376; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 124/500 (24.8%) | 124/500 (24.8%) |
| False escalations | 376 | 376 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 7 | 2/7 (28.6%) | 5 | 2/7 (28.6%) | 5 | 0 |
| baseline | 425 | 98/425 (23.1%) | 327 | 98/425 (23.1%) | 327 | 0 |
| contradicting_sops | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| missing_fields | 7 | 1/7 (14.3%) | 6 | 1/7 (14.3%) | 6 | 0 |
| mixed_language_typos_sarcasm | 8 | 3/8 (37.5%) | 5 | 3/8 (37.5%) | 5 | 0 |
| near_duplicate | 7 | 0/7 (0.0%) | 7 | 0/7 (0.0%) | 7 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 8 | 1/8 (12.5%) | 7 | 1/8 (12.5%) | 7 | 0 |
| reopened_ticket | 8 | 1/8 (12.5%) | 7 | 1/8 (12.5%) | 7 | 0 |
| wrong_category_tag | 8 | 2/8 (25.0%) | 6 | 2/8 (25.0%) | 6 | 0 |
| wrong_fields | 7 | 1/7 (14.3%) | 6 | 1/7 (14.3%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 376

### Gate/runtime causes

- false_escalation:insufficient_margin: 376

### Failures by ticket type

- baseline: 327
- reopened_ticket: 7
- off_hours_volume_spike: 7
- near_duplicate: 7
- wrong_category_tag: 6
- missing_fields: 6
- wrong_fields: 6
- agent_handoff: 5
- mixed_language_typos_sarcasm: 5

## Up to 10 worst failures

### 1. SIM-TICKET-00239 — false_escalation (65.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 2. SIM-TICKET-00013 — false_escalation (56.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 3. SIM-TICKET-00086 — false_escalation (56.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Coin purchase completed but balance not updated
- Message: I bought Coins last night to send a Gift. Receipt says completed, but my balance still looks the same.

### 4. SIM-TICKET-00087 — false_escalation (54.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Coin purchase completed but balance not updated
- Message: I bought Coins last night to send a Gift. Receipt says completed, but my balance still looks the same.

### 5. SIM-TICKET-00270 — false_escalation (53.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 6. SIM-TICKET-00176 — false_escalation (52.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 7. SIM-TICKET-00228 — false_escalation (51.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Password reset loop
- Message: The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step?

### 8. SIM-TICKET-00016 — false_escalation (47.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Password reset loop
- Message: The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step? Just following up on this — same issue.

### 9. SIM-TICKET-00128 — false_escalation (46.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 10. SIM-TICKET-00328 — false_escalation (46.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Password reset loop
- Message: The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step? Just following up on this — same issue.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
