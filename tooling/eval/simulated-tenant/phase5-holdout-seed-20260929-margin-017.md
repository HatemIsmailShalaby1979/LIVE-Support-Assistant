# phase5-holdout-seed-20260929-margin-017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260929.
Query text: message.

Decision-path accuracy: **75.8%** (379/500). Failure rate: **24.2%** (121/500).
Latency per query decision: mean 16.21 ms; median 15.40 ms; p95 21.90 ms; max 29.20 ms.

- Chaos subset: 80.0% accurate (60/75).
- Baseline subset: 75.1% accurate (319/425).
- False escalations: 121; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 121

### Gate/runtime causes

- false_escalation:insufficient_margin: 121

### Failures by ticket type

- baseline: 106
- mixed_language_typos_sarcasm: 4
- wrong_fields: 3
- near_duplicate: 3
- wrong_category_tag: 2
- agent_handoff: 1
- reopened_ticket: 1
- missing_fields: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00082 — false_escalation (28.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 2. SIM-TICKET-00239 — false_escalation (26.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 3. SIM-TICKET-00168 — false_escalation (26.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Achat de pièces non crédité
- Message: J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. Just following up on this — same issue.

### 4. SIM-TICKET-00137 — false_escalation (24.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 5. SIM-TICKET-00438 — false_escalation (23.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: A opção de live não aparece
- Message: Atendo aos requisitos de idade e seguidores, mas a opção de iniciar uma live não aparece.

### 6. SIM-TICKET-00321 — false_escalation (23.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 7. SIM-TICKET-00122 — false_escalation (22.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 8. SIM-TICKET-00322 — false_escalation (22.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 9. SIM-TICKET-00048 — false_escalation (21.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 10. SIM-TICKET-00144 — false_escalation (21.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
