# scale-rung-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 414 synthetic tickets (14 flagged, 3.4000000000000004% chaos) using seed 20260928.
Query text: message.

Decision-path accuracy against the batch's own labels: **49.3%** (204/414). Failure rate: **50.7%** (210/414).
Latency per query decision: mean 8.73 ms; median 8.20 ms; p95 12.90 ms; max 16.00 ms.

- Chaos subset: 50.0% accurate (7/14).
- Baseline subset: 49.3% accurate (197/400).
- False escalations: 209; unsafe/wrong-SOP answers: 1; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 204/414 (49.3%) | 205/414 (49.5%) |
| False escalations | 209 | 208 |
| Unsafe answers | 1 | 1 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 197/400 (49.3%) | 202 | 198/400 (49.5%) | 201 | 1 |
| contradicting_sops | 6 | 6/6 (100.0%) | 0 | 6/6 (100.0%) | 0 | 0 |
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

### 1. SCALE-0328 — wrong_sop_answer (8.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-prem-cancel)
- Actual: answer (sc-live-key)
- Subject: desactivar la renovacion automatica
- Message: desactivar la renovacion automatica

### 2. SCALE-0011 — false_escalation (14.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: el pago figura como pagado pero
- Message: el pago figura como pagado pero nunca llego, pueden rastrearlo

### 3. SCALE-0004 — false_escalation (14.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 4. SCALE-0005 — false_escalation (14.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: el pago aparece completado y mi
- Message: el pago aparece completado y mi cuenta sigue en cero

### 5. SCALE-0015 — false_escalation (13.90 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: saque processado mas banco nao tem
- Message: saque processado mas banco nao tem registro, preciso de rastreio

### 6. SCALE-0139 — false_escalation (13.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: escalate — insufficient_margin
- Subject: mi transmision va con mucho retraso,
- Message: mi transmision va con mucho retraso, se quejan los espectadores

### 7. SCALE-0140 — false_escalation (13.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: escalate — insufficient_margin
- Subject: minha transmissao esta travando muito, espectadores
- Message: minha transmissao esta travando muito, espectadores reclamam

### 8. SCALE-0076 — false_escalation (13.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-code)
- Actual: escalate — insufficient_margin
- Subject: o codigo nao chega no meu
- Message: o codigo nao chega no meu telefone, nao consigo entrar

### 9. SCALE-0012 — false_escalation (13.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: o saque consta como pago mas
- Message: o saque consta como pago mas nunca chegou, podem rastrear

### 10. SCALE-0006 — false_escalation (13.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: meu saque aparece como processado mas
- Message: meu saque aparece como processado mas nao caiu na conta

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
