# exp-rerank-holdout-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260929.
Query text: message.

Decision-path accuracy against the batch's own labels: **77.2%** (386/500). Failure rate: **22.8%** (114/500).
Latency per query decision: mean 871.92 ms; median 877.30 ms; p95 1124.90 ms; max 1265.00 ms.

- Chaos subset: 76.0% accurate (57/75).
- Baseline subset: 77.4% accurate (329/425).
- False escalations: 99; unsafe/wrong-SOP answers: 15; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 386/500 (77.2%) | 386/500 (77.2%) |
| False escalations | 99 | 99 |
| Unsafe answers | 15 | 15 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 8 | 5/8 (62.5%) | 2 | 5/8 (62.5%) | 2 | 0 |
| baseline | 425 | 329/425 (77.4%) | 83 | 329/425 (77.4%) | 83 | 0 |
| contradicting_sops | 7 | 6/7 (85.7%) | 0 | 6/7 (85.7%) | 0 | 0 |
| missing_fields | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| mixed_language_typos_sarcasm | 7 | 3/7 (42.9%) | 4 | 3/7 (42.9%) | 4 | 0 |
| near_duplicate | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |
| reopened_ticket | 7 | 4/7 (57.1%) | 3 | 4/7 (57.1%) | 3 | 0 |
| wrong_category_tag | 8 | 5/8 (62.5%) | 3 | 5/8 (62.5%) | 3 | 0 |
| wrong_fields | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |

## Failure categories (ranked)

- false_escalation: 99
- unsafe_answer_on_escalation_case: 15

### Gate/runtime causes

- false_escalation:insufficient_margin: 99
- unsafe_answer_on_escalation_case:answered: 15

### Failures by ticket type

- baseline: 96
- mixed_language_typos_sarcasm: 4
- reopened_ticket: 3
- wrong_category_tag: 3
- agent_handoff: 3
- missing_fields: 2
- near_duplicate: 1
- off_hours_volume_spike: 1
- contradicting_sops: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00276 — unsafe_answer_on_escalation_case (1175.30 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 2. SIM-TICKET-00488 — unsafe_answer_on_escalation_case (1155.90 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre contas
- Message: Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação.

### 3. SIM-TICKET-00497 — unsafe_answer_on_escalation_case (1145.30 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre contas
- Message: Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação.

### 4. SIM-TICKET-00491 — unsafe_answer_on_escalation_case (1138.00 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 5. SIM-TICKET-00288 — unsafe_answer_on_escalation_case (1135.30 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 6. SIM-TICKET-00474 — unsafe_answer_on_escalation_case (1130.60 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 7. SIM-TICKET-00279 — unsafe_answer_on_escalation_case (1114.80 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 8. SIM-TICKET-00271 — unsafe_answer_on_escalation_case (1108.50 ms)

**data_mode: "simulated"**
- Expected: escalate (wc-security) — specialist_review_required
- Actual: answer (wc-login)
- Subject: Posible acceso no autorizado
- Message: No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.

### 9. SIM-TICKET-00470 — unsafe_answer_on_escalation_case (1095.10 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

### 10. SIM-TICKET-00467 — unsafe_answer_on_escalation_case (1085.20 ms)

**data_mode: "simulated"**
- Expected: escalate — no_supported_procedure
- Actual: answer (wc-payout)
- Subject: Transferir saldo entre cuentas
- Message: ¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
