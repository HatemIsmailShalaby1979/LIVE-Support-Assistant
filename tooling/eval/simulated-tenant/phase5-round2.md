# phase5-round2 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.

Decision-path accuracy: **67.0%** (335/500). Failure rate: **33.0%** (165/500).
Latency per query decision: mean 19.06 ms; median 18.30 ms; p95 28.70 ms; max 40.80 ms.

- Chaos subset: 72.0% accurate (54/75).
- Baseline subset: 66.1% accurate (281/425).
- False escalations: 165; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 165

### Gate/runtime causes

- false_escalation:insufficient_margin: 165

### Failures by ticket type

- baseline: 144
- missing_fields: 5
- mixed_language_typos_sarcasm: 5
- off_hours_volume_spike: 4
- reopened_ticket: 2
- agent_handoff: 2
- wrong_category_tag: 1
- wrong_fields: 1
- near_duplicate: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00161 — false_escalation (40.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 2. SIM-TICKET-00010 — false_escalation (39.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 3. SIM-TICKET-00001 — false_escalation (34.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 4. SIM-TICKET-00096 — false_escalation (34.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 5. SIM-TICKET-00088 — false_escalation (34.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 6. SIM-TICKET-00263 — false_escalation (32.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 7. SIM-TICKET-00168 — false_escalation (32.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 8. SIM-TICKET-00298 — false_escalation (32.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 9. SIM-TICKET-00179 — false_escalation (31.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 10. SIM-TICKET-00260 — false_escalation (31.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
