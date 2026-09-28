# phase5-holdout-seed-20260929-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260929.
Query text: message.

Decision-path accuracy: **71.8%** (359/500). Failure rate: **28.2%** (141/500).
Latency per query decision: mean 16.45 ms; median 15.50 ms; p95 22.20 ms; max 33.20 ms.

- Chaos subset: 77.3% accurate (58/75).
- Baseline subset: 70.8% accurate (301/425).
- False escalations: 141; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 141

### Gate/runtime causes

- false_escalation:insufficient_margin: 141

### Failures by ticket type

- baseline: 124
- mixed_language_typos_sarcasm: 4
- wrong_fields: 3
- near_duplicate: 3
- missing_fields: 3
- wrong_category_tag: 2
- agent_handoff: 1
- reopened_ticket: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00018 — false_escalation (33.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 2. SIM-TICKET-00143 — false_escalation (31.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 3. SIM-TICKET-00247 — false_escalation (30.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 4. SIM-TICKET-00099 — false_escalation (29.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 5. SIM-TICKET-00200 — false_escalation (29.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 6. SIM-TICKET-00040 — false_escalation (29.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 7. SIM-TICKET-00168 — false_escalation (25.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Achat de pièces non crédité
- Message: J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. Just following up on this — same issue.

### 8. SIM-TICKET-00254 — false_escalation (24.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 9. SIM-TICKET-00436 — false_escalation (22.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: No aparece el acceso a LIVE
- Message: Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.

### 10. SIM-TICKET-00003 — false_escalation (22.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
