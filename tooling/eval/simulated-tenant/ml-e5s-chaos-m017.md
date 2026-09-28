# ml-e5s-chaos-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/multilingual-e5-small` @ `761b726dd34fb83930e26aab4e9ac3899aa1fa78` (q8); applied margin 0.17.

Decision-path accuracy against the batch's own labels: **24.8%** (124/500). Failure rate: **75.2%** (376/500).
Latency per query decision: mean 32.62 ms; median 32.00 ms; p95 39.50 ms; max 50.20 ms.

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

### 1. SIM-TICKET-00373 — false_escalation (45.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: LIVE stream disconnects
- Message: My scheduled LIVE drops after about thirty seconds. The connection seems steady and the app is up to date. Just following up on this — same issue.

### 2. SIM-TICKET-00196 — false_escalation (43.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 3. SIM-TICKET-00108 — false_escalation (43.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 4. SIM-TICKET-00392 — false_escalation (42.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: Accès au LIVE non disponible
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue.

### 5. SIM-TICKET-00161 — false_escalation (42.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 6. SIM-TICKET-00123 — false_escalation (42.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

### 7. SIM-TICKET-00135 — false_escalation (42.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 8. SIM-TICKET-00328 — false_escalation (41.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Password reset loop
- Message: The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step? Just following up on this — same issue.

### 9. SIM-TICKET-00148 — false_escalation (41.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Password reset loop
- Message: The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step? Just following up on this — same issue.

### 10. SIM-TICKET-00239 — false_escalation (40.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
