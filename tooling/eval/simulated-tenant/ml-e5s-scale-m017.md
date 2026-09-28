# ml-e5s-scale-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 414 synthetic tickets (14 flagged, 3.4000000000000004% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/multilingual-e5-small` @ `761b726dd34fb83930e26aab4e9ac3899aa1fa78` (q8); applied margin 0.17.

Decision-path accuracy against the batch's own labels: **27.1%** (112/414). Failure rate: **72.9%** (302/414).
Latency per query decision: mean 17.92 ms; median 17.60 ms; p95 23.40 ms; max 28.70 ms.

- Chaos subset: 50.0% accurate (7/14).
- Baseline subset: 26.3% accurate (105/400).
- False escalations: 302; unsafe/wrong-SOP answers: 0; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 112/414 (27.1%) | 113/414 (27.3%) |
| False escalations | 302 | 301 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 105/400 (26.3%) | 295 | 106/400 (26.5%) | 294 | 1 |
| contradicting_sops | 6 | 6/6 (100.0%) | 0 | 6/6 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 2 | 1/2 (50.0%) | 1 | 1/2 (50.0%) | 1 | 0 |
| near_duplicate | 6 | 0/6 (0.0%) | 6 | 0/6 (0.0%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 302

### Gate/runtime causes

- false_escalation:insufficient_margin: 302

### Failures by ticket type

- baseline: 295
- near_duplicate: 6
- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SCALE-0021 — false_escalation (25.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: changed my bank, will this payout
- Message: changed my bank, will this payout go to the new one or the old one

### 2. SCALE-0049 — false_escalation (24.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-gift-send-error)
- Actual: escalate — insufficient_margin
- Subject: i tried sending a gift but
- Message: i tried sending a gift but it said error, did it take my money?

### 3. SCALE-0076 — false_escalation (24.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-code)
- Actual: escalate — insufficient_margin
- Subject: o codigo nao chega no meu
- Message: o codigo nao chega no meu telefone, nao consigo entrar

### 4. SCALE-0025 — false_escalation (24.00 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-tax)
- Actual: escalate — insufficient_margin
- Subject: my payout is on hold asking
- Message: my payout is on hold asking for a tax form, what do i do

### 5. SCALE-0001 — false_escalation (23.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: my payout says processed three days
- Message: my payout says processed three days ago but nothing in my bank yet

### 6. SCALE-0042 — false_escalation (23.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-gift-missing)
- Actual: escalate — insufficient_margin
- Subject: receipt confirms my coin purchase but
- Message: receipt confirms my coin purchase but the coins are missing

### 7. SCALE-0015 — false_escalation (23.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: saque processado mas banco nao tem
- Message: saque processado mas banco nao tem registro, preciso de rastreio

### 8. SCALE-0017 — false_escalation (23.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: how do i change the bank
- Message: how do i change the bank account my payouts go to?

### 9. SCALE-0004 — false_escalation (23.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 10. SCALE-0009 — false_escalation (23.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: payout says paid but it never
- Message: payout says paid but it never arrived, can you trace it?

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
