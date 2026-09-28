# phase5-original-margin-016 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy: **72.6%** (363/500). Failure rate: **27.4%** (137/500).
Latency per query decision: mean 16.41 ms; median 16.30 ms; p95 22.00 ms; max 31.90 ms.

- Chaos subset: 73.3% accurate (55/75).
- Baseline subset: 72.5% accurate (308/425).
- False escalations: 135; unsafe/wrong-SOP answers: 2; runtime errors: 0.

## Failure categories (ranked)

- false_escalation: 135
- unsafe_answer_on_escalation_case: 2

### Gate/runtime causes

- false_escalation:insufficient_margin: 135
- unsafe_answer_on_escalation_case:answered: 2

### Failures by ticket type

- baseline: 117
- mixed_language_typos_sarcasm: 5
- missing_fields: 3
- off_hours_volume_spike: 3
- contradicting_sops: 2
- reopened_ticket: 2
- agent_handoff: 2
- wrong_category_tag: 1
- wrong_fields: 1
- near_duplicate: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00333 — unsafe_answer_on_escalation_case (20.10 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 2. SIM-TICKET-00272 — unsafe_answer_on_escalation_case (16.20 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 3. SIM-TICKET-00108 — false_escalation (26.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 4. SIM-TICKET-00161 — false_escalation (25.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 5. SIM-TICKET-00186 — false_escalation (24.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 6. SIM-TICKET-00239 — false_escalation (23.90 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 7. SIM-TICKET-00298 — false_escalation (22.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 8. SIM-TICKET-00392 — false_escalation (21.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: Accès au LIVE non disponible
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue.

### 9. SIM-TICKET-00267 — false_escalation (21.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 10. SIM-TICKET-00303 — false_escalation (21.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
