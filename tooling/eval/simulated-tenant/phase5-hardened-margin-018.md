# phase5-hardened-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.

Decision-path accuracy: **64.6%** (323/500). Failure rate: **35.4%** (177/500).
Latency per query decision: mean 19.86 ms; median 19.30 ms; p95 28.30 ms; max 34.90 ms.

- Chaos subset: 69.3% accurate (52/75).
- Baseline subset: 63.8% accurate (271/425).
- False escalations: 172; unsafe/wrong-SOP answers: 5; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 172
- unsafe_answer_on_escalation_case: 5

### Gate/runtime causes

- false_escalation:insufficient_margin: 172
- unsafe_answer_on_escalation_case:answered: 5

### Failures by ticket type

- baseline: 154
- missing_fields: 5
- mixed_language_typos_sarcasm: 5
- off_hours_volume_spike: 4
- agent_handoff: 3
- reopened_ticket: 2
- wrong_category_tag: 2
- wrong_fields: 1
- near_duplicate: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00487 — unsafe_answer_on_escalation_case (22.40 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transférer un solde entre comptes
- Message: Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?

### 2. SIM-TICKET-00495 — unsafe_answer_on_escalation_case (22.20 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transférer un solde entre comptes
- Message: Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?

### 3. SIM-TICKET-00486 — unsafe_answer_on_escalation_case (20.10 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transférer un solde entre comptes
- Message: Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?

### 4. SIM-TICKET-00484 — unsafe_answer_on_escalation_case (20.00 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transférer un solde entre comptes
- Message: Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?

### 5. SIM-TICKET-00474 — unsafe_answer_on_escalation_case (17.30 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transférer un solde entre comptes
- Message: Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?

### 6. SIM-TICKET-00053 — false_escalation (34.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 7. SIM-TICKET-00302 — false_escalation (33.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: La transmisión se desconecta
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 8. SIM-TICKET-00267 — false_escalation (32.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 9. SIM-TICKET-00352 — false_escalation (32.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: La transmisión se desconecta
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 10. SIM-TICKET-00239 — false_escalation (30.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
