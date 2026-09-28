# phase5-deployed-run-0aec9773442c4282 — SIMULATED DATA deployed-path evaluation

**data_mode: "simulated" throughout.** The 500 WaveCast Creator Care ticket(s), their expected decisions, and isolated policy tenant(s) are fictional evaluation data.

This ran through the public app at https://dist-omega-black-31.vercel.app, backed by Supabase project lxlokqtowvaesxjishqz, which is the development database. It is deployed-path evidence, not production customer or adoption evidence.

Batch: seed 20260928, 500 evaluated from the approved 500-ticket batch (75 flagged in this selection); SHA-256 `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96`.
Corpus SHA-256: `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`. Evaluation-only margin: 0.17; shipped default: 0.18.

Decision accuracy: **72.2%** (361/500); failure rate: **27.8%** (139/500).
False escalations: 138; unsafe/wrong-SOP answers: 1; runtime errors: 0.
The run-scoped tagged gate evidence for `SIM-TICKET-00272` records score
0.7153477174, top-one/top-two margin 0.1807574329, applied `minMargin` 0.17,
and the five retrieved candidates; full evidence is in the JSON report.
Browser click-to-render latency: mean 22.38 ms; median 21.70 ms; p95 32.70 ms; max 47.30 ms.

Hosted tag audit: 500/500 query events, 261/261 escalations, 15 SOP versions, 4 user profiles, and 2 enrolled web devices are scoped to SIMULATED DATA tenants; untagged rows: 0.

Local comparison at margin 0.17: batch input hash matches, corpus hash matches, selected per-ticket outcomes differ on 1 ticket(s).

Local same-batch baseline at margin 0.17: 72.4% (362/500), 138 failures, 0 unsafe answers. This deployed path is a separate environment comparison, not a paired app-code fix.

## Failure categories

- false_escalation: 138
- unsafe_answer_on_escalation_case: 1

## Worst failures (all text below is synthetic)

### 1. SIM-TICKET-00272 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-payout)
- Message: My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.

### 2. SIM-TICKET-00452 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas.

### 3. SIM-TICKET-00392 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue.

### 4. SIM-TICKET-00208 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

### 5. SIM-TICKET-00167 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 6. SIM-TICKET-00031 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 7. SIM-TICKET-00296 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Message: Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.

### 8. SIM-TICKET-00126 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 9. SIM-TICKET-00202 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 10. SIM-TICKET-00066 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

## Interpretation

**The low-failure criterion is not met.** This run measures the deployed UI, bundle, local model, gate, and tagged ingest path. It does not establish real-world correctness. There is no design partner, so no partner comparison was performed and none is claimed.

All generated records remain isolated to the clearly named SIMULATED DATA tenants. No real tenant was used.
