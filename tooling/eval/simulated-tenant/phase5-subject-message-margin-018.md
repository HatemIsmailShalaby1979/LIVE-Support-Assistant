# phase5-subject-message-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: subject-message.

Decision-path accuracy: **70.4%** (352/500). Failure rate: **29.6%** (148/500).
Latency per query decision: mean 21.40 ms; median 20.00 ms; p95 30.30 ms; max 48.00 ms.

- Chaos subset: 76.0% accurate (57/75).
- Baseline subset: 69.4% accurate (295/425).
- False escalations: 146; unsafe/wrong-SOP answers: 2; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 146
- unsafe_answer_on_escalation_case: 2

### Gate/runtime causes

- false_escalation:insufficient_margin: 146
- unsafe_answer_on_escalation_case:answered: 2

### Failures by ticket type

- baseline: 130
- mixed_language_typos_sarcasm: 5
- off_hours_volume_spike: 3
- missing_fields: 2
- contradicting_sops: 2
- agent_handoff: 2
- wrong_category_tag: 1
- wrong_fields: 1
- reopened_ticket: 1
- near_duplicate: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00333 — unsafe_answer_on_escalation_case (26.70 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 2. SIM-TICKET-00272 — unsafe_answer_on_escalation_case (24.20 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 3. SIM-TICKET-00108 — false_escalation (40.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 4. SIM-TICKET-00267 — false_escalation (37.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 5. SIM-TICKET-00198 — false_escalation (34.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 6. SIM-TICKET-00150 — false_escalation (34.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 7. SIM-TICKET-00125 — false_escalation (33.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 8. SIM-TICKET-00239 — false_escalation (32.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 9. SIM-TICKET-00330 — false_escalation (30.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: La transmisión se desconecta
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 10. SIM-TICKET-00199 — false_escalation (30.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
