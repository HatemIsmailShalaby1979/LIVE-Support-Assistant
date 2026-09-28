# scale-rung-m018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 408 synthetic tickets (8 flagged, 2% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **46.3%** (189/408). Failure rate: **53.7%** (219/408).
Latency per query decision: mean 8.71 ms; median 8.30 ms; p95 12.70 ms; max 23.30 ms.

- Chaos subset: 12.5% accurate (1/8).
- Baseline subset: 47.0% accurate (188/400).
- False escalations: 219; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 189/408 (46.3%) | 190/408 (46.6%) |
| False escalations | 219 | 218 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 188/400 (47.0%) | 212 | 189/400 (47.3%) | 211 | 1 |
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

### 1. SCALE-0006 — false_escalation (23.30 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: meu saque aparece como processado mas
- Message: meu saque aparece como processado mas nao caiu na conta

### 2. SCALE-0001 — false_escalation (19.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: my payout says processed three days
- Message: my payout says processed three days ago but nothing in my bank yet

### 3. SCALE-0004 — false_escalation (17.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 4. SCALE-0005 — false_escalation (15.30 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: el pago aparece completado y mi
- Message: el pago aparece completado y mi cuenta sigue en cero

### 5. SCALE-0011 — false_escalation (14.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: el pago figura como pagado pero
- Message: el pago figura como pagado pero nunca llego, pueden rastrearlo

### 6. SCALE-0002 — false_escalation (14.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: how long after processed until the
- Message: how long after processed until the money actually lands?

### 7. SCALE-0012 — false_escalation (14.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: o saque consta como pago mas
- Message: o saque consta como pago mas nunca chegou, podem rastrear

### 8. SCALE-0139 — false_escalation (13.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: escalate — insufficient_margin
- Subject: mi transmision va con mucho retraso,
- Message: mi transmision va con mucho retraso, se quejan los espectadores

### 9. SCALE-0015 — false_escalation (13.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: saque processado mas banco nao tem
- Message: saque processado mas banco nao tem registro, preciso de rastreio

### 10. SCALE-0076 — false_escalation (13.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-code)
- Actual: escalate — insufficient_margin
- Subject: o codigo nao chega no meu
- Message: o codigo nao chega no meu telefone, nao consigo entrar

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
