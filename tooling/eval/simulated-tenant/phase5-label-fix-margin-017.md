# phase5-label-fix-margin-017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **72.4%** (362/500). Failure rate: **27.6%** (138/500).
Latency per query decision: mean 17.87 ms; median 17.30 ms; p95 25.00 ms; max 34.90 ms.

- Chaos subset: 76.0% accurate (57/75).
- Baseline subset: 71.8% accurate (305/425).
- False escalations: 138; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 362/500 (72.4%) | 362/500 (72.4%) |
| False escalations | 138 | 138 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| baseline | 425 | 305/425 (71.8%) | 120 | 305/425 (71.8%) | 120 | 0 |
| contradicting_sops | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| missing_fields | 7 | 4/7 (57.1%) | 3 | 4/7 (57.1%) | 3 | 0 |
| mixed_language_typos_sarcasm | 8 | 3/8 (37.5%) | 5 | 3/8 (37.5%) | 5 | 0 |
| near_duplicate | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 8 | 5/8 (62.5%) | 3 | 5/8 (62.5%) | 3 | 0 |
| reopened_ticket | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| wrong_category_tag | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| wrong_fields | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |

## Failure categories (ranked)

- false_escalation: 138

### Gate/runtime causes

- false_escalation:insufficient_margin: 138

### Failures by ticket type

- baseline: 120
- mixed_language_typos_sarcasm: 5
- missing_fields: 3
- off_hours_volume_spike: 3
- reopened_ticket: 2
- agent_handoff: 2
- wrong_category_tag: 1
- wrong_fields: 1
- near_duplicate: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00313 — false_escalation (34.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: La transmisión se desconecta
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 2. SIM-TICKET-00428 — false_escalation (31.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: No aparece el acceso a LIVE
- Message: Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.

### 3. SIM-TICKET-00108 — false_escalation (29.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 4. SIM-TICKET-00326 — false_escalation (27.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 5. SIM-TICKET-00239 — false_escalation (26.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 6. SIM-TICKET-00163 — false_escalation (26.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 7. SIM-TICKET-00199 — false_escalation (26.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 8. SIM-TICKET-00153 — false_escalation (25.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 9. SIM-TICKET-00045 — false_escalation (25.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 10. SIM-TICKET-00445 — false_escalation (24.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: No aparece el acceso a LIVE
- Message: Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
