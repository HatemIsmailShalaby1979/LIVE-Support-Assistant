# scale-rung-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 408 synthetic tickets (8 flagged, 2% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **48.5%** (198/408). Failure rate: **51.5%** (210/408).
Latency per query decision: mean 9.36 ms; median 8.70 ms; p95 14.50 ms; max 27.10 ms.

- Chaos subset: 12.5% accurate (1/8).
- Baseline subset: 49.3% accurate (197/400).
- False escalations: 209; unsafe/wrong-SOP answers: 1; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 198/408 (48.5%) | 199/408 (48.8%) |
| False escalations | 209 | 208 |
| Unsafe answers | 1 | 1 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 197/400 (49.3%) | 202 | 198/400 (49.5%) | 201 | 1 |
| mixed_language_typos_sarcasm | 2 | 1/2 (50.0%) | 1 | 1/2 (50.0%) | 1 | 0 |
| near_duplicate | 6 | 0/6 (0.0%) | 6 | 0/6 (0.0%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 209
- wrong_sop_answer: 1

### Gate/runtime causes

- false_escalation:insufficient_margin: 208
- wrong_sop_answer:answered: 1
- false_escalation:manual_review_required: 1

### Failures by ticket type

- baseline: 203
- near_duplicate: 6
- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SCALE-0328 — wrong_sop_answer (8.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-prem-cancel)
- Actual: answer (sc-live-key)
- Subject: desactivar la renovacion automatica
- Message: desactivar la renovacion automatica

### 2. SCALE-0040 — false_escalation (27.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-gift-refund)
- Actual: escalate — insufficient_margin
- Subject: compra de monedas no autorizada, revisen
- Message: compra de monedas no autorizada, revisen por favor

### 3. SCALE-0023 — false_escalation (25.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: mudei de banco, o saque atual
- Message: mudei de banco, o saque atual vai para qual conta

### 4. SCALE-0021 — false_escalation (25.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: changed my bank, will this payout
- Message: changed my bank, will this payout go to the new one or the old one

### 5. SCALE-0020 — false_escalation (22.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: como altero a conta bancaria que
- Message: como altero a conta bancaria que recebe os saques

### 6. SCALE-0019 — false_escalation (20.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: como cambio la cuenta bancaria donde
- Message: como cambio la cuenta bancaria donde recibo los pagos

### 7. SCALE-0004 — false_escalation (20.00 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 8. SCALE-0024 — false_escalation (19.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: cambie de banco, el pago en
- Message: cambie de banco, el pago en curso a donde va

### 9. SCALE-0312 — false_escalation (16.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-up-thumbnail)
- Actual: escalate — insufficient_margin
- Subject: los cambios de metadatos no se
- Message: los cambios de metadatos no se guardan

### 10. SCALE-0011 — false_escalation (15.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: el pago figura como pagado pero
- Message: el pago figura como pagado pero nunca llego, pueden rastrearlo

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
