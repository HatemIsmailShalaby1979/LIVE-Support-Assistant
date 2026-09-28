# exp-rerank-chaos-500-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **80.6%** (403/500). Failure rate: **19.4%** (97/500).
Latency per query decision: mean 876.94 ms; median 880.80 ms; p95 1125.20 ms; max 1335.10 ms.

- Chaos subset: 73.3% accurate (55/75).
- Baseline subset: 81.9% accurate (348/425).
- False escalations: 83; unsafe/wrong-SOP answers: 14; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 403/500 (80.6%) | 403/500 (80.6%) |
| False escalations | 83 | 83 |
| Unsafe answers | 14 | 14 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| baseline | 425 | 348/425 (81.9%) | 67 | 348/425 (81.9%) | 67 | 0 |
| contradicting_sops | 7 | 3/7 (42.9%) | 0 | 3/7 (42.9%) | 0 | 0 |
| missing_fields | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 8 | 3/8 (37.5%) | 5 | 3/8 (37.5%) | 5 | 0 |
| near_duplicate | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| reopened_ticket | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| wrong_category_tag | 8 | 5/8 (62.5%) | 3 | 5/8 (62.5%) | 3 | 0 |
| wrong_fields | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |

## Failure categories (ranked)

- false_escalation: 83
- unsafe_answer_on_escalation_case: 14

### Gate/runtime causes

- false_escalation:insufficient_margin: 83
- unsafe_answer_on_escalation_case:answered: 14

### Failures by ticket type

- baseline: 77
- mixed_language_typos_sarcasm: 5
- contradicting_sops: 4
- wrong_category_tag: 3
- agent_handoff: 2
- near_duplicate: 2
- wrong_fields: 2
- reopened_ticket: 2

## Up to 10 worst failures

### 1. SIM-TICKET-00290 — unsafe_answer_on_escalation_case (1156.70 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 2. SIM-TICKET-00500 — unsafe_answer_on_escalation_case (1141.60 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre contas
- Message: Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação.

### 3. SIM-TICKET-00285 — unsafe_answer_on_escalation_case (1117.00 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 4. SIM-TICKET-00483 — unsafe_answer_on_escalation_case (1109.20 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 5. SIM-TICKET-00333 — unsafe_answer_on_escalation_case (1107.70 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 6. SIM-TICKET-00498 — unsafe_answer_on_escalation_case (1105.20 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre contas
- Message: Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação.

### 7. SIM-TICKET-00287 — unsafe_answer_on_escalation_case (1103.20 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 8. SIM-TICKET-00469 — unsafe_answer_on_escalation_case (1090.70 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 9. SIM-TICKET-00463 — unsafe_answer_on_escalation_case (1079.80 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 10. SIM-TICKET-00478 — unsafe_answer_on_escalation_case (1040.30 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
