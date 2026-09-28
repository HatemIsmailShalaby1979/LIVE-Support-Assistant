# Phase 4 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.

Decision-path accuracy: **53.8%** (269/500). Failure rate: **46.2%** (231/500).
Latency per query decision: mean 17.55 ms; median 16.90 ms; p95 24.40 ms; max 35.70 ms.

- Chaos subset: 58.7% accurate (44/75).
- Baseline subset: 52.9% accurate (225/425).
- False escalations: 231; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 231

### Gate/runtime causes

- false_escalation:insufficient_margin: 231

### Failures by ticket type

- baseline: 200
- off_hours_volume_spike: 5
- mixed_language_typos_sarcasm: 5
- wrong_category_tag: 4
- missing_fields: 4
- agent_handoff: 4
- wrong_fields: 3
- reopened_ticket: 3
- near_duplicate: 3

## Up to 10 worst failures

### 1. SIM-TICKET-00267 — false_escalation (35.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 2. SIM-TICKET-00428 — false_escalation (35.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: No aparece el acceso a LIVE
- Message: Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.

### 3. SIM-TICKET-00335 — false_escalation (32.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: La transmisión se desconecta
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 4. SIM-TICKET-00179 — false_escalation (31.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 5. SIM-TICKET-00249 — false_escalation (28.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Code de récupération absent
- Message: J’ai changé de téléphone et je ne reçois pas le code de récupération. J’ai déjà vérifié ma boîte mail.

### 6. SIM-TICKET-00108 — false_escalation (28.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 7. SIM-TICKET-00168 — false_escalation (27.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 8. SIM-TICKET-00265 — false_escalation (27.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 9. SIM-TICKET-00170 — false_escalation (27.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 10. SIM-TICKET-00161 — false_escalation (25.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
