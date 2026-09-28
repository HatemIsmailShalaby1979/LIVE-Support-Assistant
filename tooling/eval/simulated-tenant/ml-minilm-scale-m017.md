# ml-minilm-scale-m017 — simulated chaos-batch evaluation

**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**

Evaluated 414 synthetic tickets (14 flagged, 3.4000000000000004% chaos) using seed 20260928.
Query text: message.
Embedder: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` @ `2c4055b12046f11709e9df2c122e59ffbdc2f900` (q8); applied margin 0.17.

Decision-path accuracy against the batch's own labels: **48.6%** (201/414). Failure rate: **51.4%** (213/414).
Latency per query decision: mean 15.06 ms; median 15.00 ms; p95 21.00 ms; max 26.40 ms.

- Chaos subset: 50.0% accurate (7/14).
- Baseline subset: 48.5% accurate (194/400).
- False escalations: 211; unsafe/wrong-SOP answers: 2; runtime errors: 0.

## Label fix — expectedOutcome (before / after)

A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.
Rule, encoded in `expected-outcome.ts`: a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped.

Truncated queries detected: 5. Queries reclassified: 1 (SCALE-0081).

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 201/414 (48.6%) | 202/414 (48.8%) |
| False escalations | 211 | 210 |
| Unsafe answers | 2 | 2 |
| Runtime errors | 0 | 0 |

### Per technique (before / after)

| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 400 | 194/400 (48.5%) | 204 | 195/400 (48.8%) | 203 | 1 |
| contradicting_sops | 6 | 6/6 (100.0%) | 0 | 6/6 (100.0%) | 0 | 0 |
| mixed_language_typos_sarcasm | 2 | 1/2 (50.0%) | 1 | 1/2 (50.0%) | 1 | 0 |
| near_duplicate | 6 | 0/6 (0.0%) | 6 | 0/6 (0.0%) | 6 | 0 |

## Failure categories (ranked)

- false_escalation: 211
- wrong_sop_answer: 1
- unsafe_answer_on_escalation_case: 1

### Gate/runtime causes

- false_escalation:insufficient_margin: 210
- wrong_sop_answer:answered: 1
- unsafe_answer_on_escalation_case:answered: 1
- false_escalation:manual_review_required: 1

### Failures by ticket type

- baseline: 206
- near_duplicate: 6
- mixed_language_typos_sarcasm: 1

## Up to 10 worst failures

### 1. SCALE-0276 — unsafe_answer_on_escalation_case (17.50 ms)

**data_mode: "simulated"**
- Expected: escalate — no procedure covers this; specialist handling
- Actual: answer (sc-comm-comments)
- Subject: alguem me assedia nos comentarios, como
- Message: alguem me assedia nos comentarios, como denuncio

### 2. SCALE-0140 — wrong_sop_answer (17.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: answer (sc-live-disconnect)
- Subject: minha transmissao esta travando muito, espectadores
- Message: minha transmissao esta travando muito, espectadores reclamam

### 3. SCALE-0021 — false_escalation (23.10 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-method)
- Actual: escalate — insufficient_margin
- Subject: changed my bank, will this payout
- Message: changed my bank, will this payout go to the new one or the old one

### 4. SCALE-0137 — false_escalation (22.40 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-lag)
- Actual: escalate — insufficient_margin
- Subject: my stream is lagging very badly
- Message: my stream is lagging very badly for all my viewers

### 5. SCALE-0004 — false_escalation (22.00 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: mi pago figura como procesado pero
- Message: mi pago figura como procesado pero no llega al banco, cuanto tarda

### 6. SCALE-0035 — false_escalation (21.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-gift-refund)
- Actual: escalate — insufficient_margin
- Subject: me cobraron dos veces las monedas,
- Message: me cobraron dos veces las monedas, quiero un reembolso

### 7. SCALE-0408 — false_escalation (21.80 ms)

**data_mode: "simulated"**
- Expected: answer (sc-live-disconnect)
- Actual: escalate — insufficient_margin
- Subject: my live disconnects after a couple
- Message: my live disconnects after a couple of minutes every time

### 8. SCALE-0001 — false_escalation (21.60 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: my payout says processed three days
- Message: my payout says processed three days ago but nothing in my bank yet

### 9. SCALE-0011 — false_escalation (21.50 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-missing)
- Actual: escalate — insufficient_margin
- Subject: el pago figura como pagado pero
- Message: el pago figura como pagado pero nunca llego, pueden rastrearlo

### 10. SCALE-0003 — false_escalation (21.20 ms)

**data_mode: "simulated"**
- Expected: answer (sc-payout-timing)
- Actual: escalate — insufficient_margin
- Subject: payout marked completed tuesday, bank still
- Message: payout marked completed tuesday, bank still shows zero

The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.
