# phase5-stability-margin-017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.

Decision-path accuracy: **72.4%** (362/500). Failure rate: **27.6%** (138/500).
Latency per query decision: mean 18.68 ms; median 18.30 ms; p95 25.50 ms; max 33.60 ms.

- Chaos subset: 76.0% accurate (57/75).
- Baseline subset: 71.8% accurate (305/425).
- False escalations: 138; unsafe/wrong-SOP answers: 0; runtime errors: 0.

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

### 1. SIM-TICKET-00161 — false_escalation (29.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 2. SIM-TICKET-00239 — false_escalation (28.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 3. SIM-TICKET-00242 — false_escalation (27.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 4. SIM-TICKET-00108 — false_escalation (27.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 5. SIM-TICKET-00179 — false_escalation (27.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 6. SIM-TICKET-00159 — false_escalation (26.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 7. SIM-TICKET-00332 — false_escalation (26.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 8. SIM-TICKET-00267 — false_escalation (26.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 9. SIM-TICKET-00452 — false_escalation (25.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: Accès au LIVE non disponible
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas.

### 10. SIM-TICKET-00245 — false_escalation (25.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
