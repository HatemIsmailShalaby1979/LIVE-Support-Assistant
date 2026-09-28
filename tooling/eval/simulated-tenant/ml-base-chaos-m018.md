# ml-base-chaos-m018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/all-MiniLM-L6-v2` @ `751bff37182d3f1213fa05d7196b954e230abad9` (q8); applied margin 0.18.

Decision-path accuracy against the batch's own labels: **67.0%** (335/500). Failure rate: **33.0%** (165/500).
Latency per query decision: mean 17.18 ms; median 17.00 ms; p95 22.70 ms; max 31.20 ms.

- Chaos subset: 72.0% accurate (54/75).
- Baseline subset: 66.1% accurate (281/425).
- False escalations: 165; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 335/500 (67.0%) | 335/500 (67.0%) |
| False escalations | 165 | 165 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| baseline | 425 | 281/425 (66.1%) | 144 | 281/425 (66.1%) | 144 | 0 |
| contradicting_sops | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| missing_fields | 7 | 2/7 (28.6%) | 5 | 2/7 (28.6%) | 5 | 0 |
| mixed_language_typos_sarcasm | 8 | 3/8 (37.5%) | 5 | 3/8 (37.5%) | 5 | 0 |
| near_duplicate | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 8 | 4/8 (50.0%) | 4 | 4/8 (50.0%) | 4 | 0 |
| reopened_ticket | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| wrong_category_tag | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| wrong_fields | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |

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

### 1. SIM-TICKET-00452 — false_escalation (30.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: Accès au LIVE non disponible
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas.

### 2. SIM-TICKET-00108 — false_escalation (29.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Saldo de moedas não atualizou
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 3. SIM-TICKET-00239 — false_escalation (27.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 4. SIM-TICKET-00051 — false_escalation (26.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 5. SIM-TICKET-00023 — false_escalation (25.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 6. SIM-TICKET-00161 — false_escalation (25.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 7. SIM-TICKET-00071 — false_escalation (24.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 8. SIM-TICKET-00022 — false_escalation (24.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 9. SIM-TICKET-00092 — false_escalation (23.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Compra de monedas pendiente
- Message: Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.

### 10. SIM-TICKET-00392 — false_escalation (23.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Subject: Accès au LIVE non disponible
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
