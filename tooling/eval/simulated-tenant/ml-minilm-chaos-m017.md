# ml-minilm-chaos-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 500 synthetic tickets (75 flagged, 15% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` @ `2c4055b12046f11709e9df2c122e59ffbdc2f900` (q8); applied margin 0.17.

Decision-path accuracy against the batch's own labels: **71.4%** (357/500). Failure rate: **28.6%** (143/500).
Latency per query decision: mean 30.08 ms; median 29.60 ms; p95 37.30 ms; max 56.00 ms.

- Chaos subset: 72.0% accurate (54/75).
- Baseline subset: 71.3% accurate (303/425).
- False escalations: 141; unsafe/wrong-SOP answers: 2; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 0. Queries reclassified: 0.

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 357/500 (71.4%) | 357/500 (71.4%) |
| False escalations | 141 | 141 |
| Unsafe answers | 2 | 2 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| agent_handoff | 7 | 3/7 (42.9%) | 4 | 3/7 (42.9%) | 4 | 0 |
| baseline | 425 | 303/425 (71.3%) | 122 | 303/425 (71.3%) | 122 | 0 |
| contradicting_sops | 7 | 5/7 (71.4%) | 0 | 5/7 (71.4%) | 0 | 0 |
| missing_fields | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| mixed_language_typos_sarcasm | 8 | 5/8 (62.5%) | 3 | 5/8 (62.5%) | 3 | 0 |
| near_duplicate | 7 | 5/7 (71.4%) | 2 | 5/7 (71.4%) | 2 | 0 |
| no_correct_answer | 8 | 8/8 (100.0%) | 0 | 8/8 (100.0%) | 0 | 0 |
| off_hours_volume_spike | 8 | 6/8 (75.0%) | 2 | 6/8 (75.0%) | 2 | 0 |
| reopened_ticket | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| wrong_category_tag | 8 | 7/8 (87.5%) | 1 | 7/8 (87.5%) | 1 | 0 |
| wrong_fields | 7 | 3/7 (42.9%) | 4 | 3/7 (42.9%) | 4 | 0 |

## Failure categories (ranked)

- false_escalation: 141
- unsafe_answer_on_escalation_case: 2

### Gate/runtime causes

- false_escalation:insufficient_margin: 141
- unsafe_answer_on_escalation_case:answered: 2

### Failures by ticket type

- baseline: 122
- wrong_fields: 4
- agent_handoff: 4
- mixed_language_typos_sarcasm: 3
- near_duplicate: 2
- missing_fields: 2
- off_hours_volume_spike: 2
- contradicting_sops: 2
- wrong_category_tag: 1
- reopened_ticket: 1

## Up to 10 worst failures

### 1. SIM-TICKET-00333 — unsafe_answer_on_escalation_case (34.00 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Virement indiqué comme traité
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 2. SIM-TICKET-00097 — unsafe_answer_on_escalation_case (30.10 ms)

**data_mode: "simulated"**
- Expected: escalate — conflicting_procedure_guidance
- Actual: answer (wc-payout)
- Subject: Pagamento processado não chegou
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 3. SIM-TICKET-00373 — false_escalation (44.50 ms)

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Subject: LIVE stream disconnects
- Message: My scheduled LIVE drops after about thirty seconds. The connection seems steady and the app is up to date. Just following up on this — same issue.

### 4. SIM-TICKET-00123 — false_escalation (38.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

### 5. SIM-TICKET-00264 — false_escalation (37.30 ms)

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Subject: Question about a Coin charge
- Message: There are two charges for one Coin purchase on my statement. I can provide the receipt reference if needed. Just following up on this — same issue.

### 6. SIM-TICKET-00208 — false_escalation (37.20 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: When should the payout arrive?
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

### 7. SIM-TICKET-00239 — false_escalation (37.10 ms)

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Subject: No llega el código de recuperación
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 8. SIM-TICKET-00124 — false_escalation (35.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 9. SIM-TICKET-00131 — false_escalation (35.00 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 10. SIM-TICKET-00145 — false_escalation (34.40 ms)

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Subject: Processed payout not received
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
