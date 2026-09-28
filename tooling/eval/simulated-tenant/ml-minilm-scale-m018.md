# ml-minilm-scale-m018 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 414 synthetic tickets (14 flagged, 3.4000000000000004% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` @ `2c4055b12046f11709e9df2c122e59ffbdc2f900` (q8); applied margin 0.18.

Decision-path accuracy against the batch's own labels: **47.3%** (196/414). Failure rate: **52.7%** (218/414).
Latency per query decision: mean 15.37 ms; median 15.20 ms; p95 20.70 ms; max 32.70 ms.

- Chaos subset: 50.0% accurate (7/14).
- Baseline subset: 47.3% accurate (189/400).
- False escalations: 217; unsafe/wrong-SOP answers: 1; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 196/414 (47.3%) | 197/414 (47.6%) |
| False escalations | 217 | 216 |
| Unsafe answers | 1 | 1 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 189/400 (47.3%) | 210 | 190/400 (47.5%) | 209 | 1 |
| contradicting_sops | 6 | 6/6 (100.0%) | 0 | 6/6 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 2 | 1/2 (50.0%) | 1 | 1/2 (50.0%) | 1 | 0 |
| near_duplicate | 6 | 0/6 (0.0%) | 6 | 0/6 (0.0%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 217
- wrong_sop_answer: 1

### Gate/runtime causes

- false_escalation:insufficient_margin: 216
- wrong_sop_answer:answered: 1
- false_escalation:manual_review_required: 1

### Failures by ticket type

- baseline: 211
- near_duplicate: 6
- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SCALE-0140 — wrong_sop_answer (19.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: answer (sc-live-disconnect)
- Subject: minha transmissao esta travando muito, espectadores
- Message: minha transmissao esta travando muito, espectadores reclamam

### 2. SCALE-0096 — false_escalation (32.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-email)
- Actual: escalate — insufficient_margin
- Subject: cambiar el correo de acceso, se
- Message: cambiar el correo de acceso, se mi contrasena

### 3. SCALE-0001 — false_escalation (24.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: my payout says processed three days
- Message: my payout says processed three days ago but nothing in my bank yet

### 4. SCALE-0095 — false_escalation (23.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-login-email)
- Actual: escalate — insufficient_margin
- Subject: alterar e-mail de acesso, tenho a
- Message: alterar e-mail de acesso, tenho a senha

### 5. SCALE-0015 — false_escalation (22.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: saque processado mas banco nao tem
- Message: saque processado mas banco nao tem registro, preciso de rastreio

### 6. SCALE-0021 — false_escalation (22.70 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: changed my bank, will this payout
- Message: changed my bank, will this payout go to the new one or the old one

### 7. SCALE-0129 — false_escalation (21.30 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-disconnect)
- Actual: escalate — insufficient_margin
- Subject: every time i try to go
- Message: every time i try to go live it disconnects after a couple of minutes

### 8. SCALE-0002 — false_escalation (21.00 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: how long after processed until the
- Message: how long after processed until the money actually lands?

### 9. SCALE-0137 — false_escalation (20.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: escalate — insufficient_margin
- Subject: my stream is lagging very badly
- Message: my stream is lagging very badly for all my viewers

### 10. SCALE-0035 — false_escalation (20.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-gift-refund)
- Actual: escalate — insufficient_margin
- Subject: me cobraron dos veces las monedas,
- Message: me cobraron dos veces las monedas, quiero un reembolso

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
