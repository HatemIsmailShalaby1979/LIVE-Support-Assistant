# exp-distinctness-holdout-margin-018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260929.
Query text: message.

Decision-path accuracy against the batch's own labels: **74.4%** (372/500). Failure rate: **25.6%** (128/500).
Latency per query decision: mean 16.40 ms; median 15.80 ms; p95 21.60 ms; max 30.00 ms.

- Chaos subset: 80.0% accurate (60/75).
- Baseline subset: 73.4% accurate (312/425).
- False escalations: 128; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 372/500 (74.4%) | 372/500 (74.4%) |
| False escalations | 128 | 128 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| baseline | 425 | 312/425 (73.4%) | 113 | 312/425 (73.4%) | 113 | 0 |
| contradicting_sops | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| missing_fields | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| mixed_language_typos_sarcasm | 7 | 3/7 (42.9%) | 4 | 3/7 (42.9%) | 4 | 0 |
| near_duplicate | 8 | 5/8 (62.5%) | 3 | 5/8 (62.5%) | 3 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 7 | 7/7 (100.0%) | 0 | 7/7 (100.0%) | 0 | 0 |
| reopened_ticket | 7 | 6/7 (85.7%) | 1 | 6/7 (85.7%) | 1 | 0 |
| wrong_category_tag | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| wrong_fields | 7 | 4/7 (57.1%) | 3 | 4/7 (57.1%) | 3 | 0 |

## Failure categories (ranked)

- false_escalation: 128

### Gate/runtime causes

- false_escalation:insufficient_margin: 128

### Failures by ticket type

- baseline: 113
- mixed_language_typos_sarcasm: 4
- wrong_fields: 3
- near_duplicate: 3
- wrong_category_tag: 2
- agent_handoff: 1
- reopened_ticket: 1
- missing_fields: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00081 — false_escalation (30.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Achat de pièces non crédité
- Message: J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas.

### 2. SIM-TICKET-00168 — false_escalation (26.80 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Achat de pièces non crédité
- Message: J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. Just following up on this — same issue.

### 3. SIM-TICKET-00159 — false_escalation (24.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: No recibí el pago
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 4. SIM-TICKET-00341 — false_escalation (23.60 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: A live cai durante a transmissão
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 5. SIM-TICKET-00270 — false_escalation (23.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 6. SIM-TICKET-00228 — false_escalation (22.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 7. SIM-TICKET-00133 — false_escalation (22.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 8. SIM-TICKET-00020 — false_escalation (21.70 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Achat de pièces non crédité
- Message: J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas.

### 9. SIM-TICKET-00254 — false_escalation (21.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

### 10. SIM-TICKET-00261 — false_escalation (21.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: Código de recuperação não chega
- Message: Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
