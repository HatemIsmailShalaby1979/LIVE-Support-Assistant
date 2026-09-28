# scale-rung-m018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 414 synthetic tickets (14 flagged, 3.4000000000000004% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **47.1%** (195/414). Failure rate: **52.9%** (219/414).
Latency per query decision: mean 9.26 ms; median 8.60 ms; p95 14.40 ms; max 29.50 ms.

- Chaos subset: 50.0% accurate (7/14).
- Baseline subset: 47.0% accurate (188/400).
- False escalations: 219; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 195/414 (47.1%) | 196/414 (47.3%) |
| False escalations | 219 | 218 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 188/400 (47.0%) | 212 | 189/400 (47.3%) | 211 | 1 |
| contradicting_sops | 6 | 6/6 (100.0%) | 0 | 6/6 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 2 | 1/2 (50.0%) | 1 | 1/2 (50.0%) | 1 | 0 |
| near_duplicate | 6 | 0/6 (0.0%) | 6 | 0/6 (0.0%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 219

### Gate/runtime causes

- false_escalation:insufficient_margin: 218
- false_escalation:manual_review_required: 1

### Failures by ticket type

- baseline: 212
- near_duplicate: 6
- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SCALE-0004 — false_escalation (29.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 2. SCALE-0005 — false_escalation (28.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: el pago aparece completado y mi
- Message: el pago aparece completado y mi cuenta sigue en cero

### 3. SCALE-0006 — false_escalation (24.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: meu saque aparece como processado mas
- Message: meu saque aparece como processado mas nao caiu na conta

### 4. SCALE-0009 — false_escalation (24.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: payout says paid but it never
- Message: payout says paid but it never arrived, can you trace it?

### 5. SCALE-0010 — false_escalation (21.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: the payout reference shows processed but
- Message: the payout reference shows processed but no deposit, please investigate

### 6. SCALE-0002 — false_escalation (21.30 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: how long after processed until the
- Message: how long after processed until the money actually lands?

### 7. SCALE-0079 — false_escalation (21.00 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-code)
- Actual: escalate — insufficient_margin
- Subject: codigo de recuperacao nao chega apos
- Message: codigo de recuperacao nao chega apos trocar de celular

### 8. SCALE-0080 — false_escalation (18.30 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-code)
- Actual: escalate — insufficient_margin
- Subject: el codigo no llega despues de
- Message: el codigo no llega despues de cambiar de movil

### 9. SCALE-0007 — false_escalation (17.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: quanto tempo depois de processado o
- Message: quanto tempo depois de processado o dinheiro chega

### 10. SCALE-0011 — false_escalation (16.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: el pago figura como pagado pero
- Message: el pago figura como pagado pero nunca llego, pueden rastrearlo

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
