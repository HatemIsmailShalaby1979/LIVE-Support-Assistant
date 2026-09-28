# phase5-deployed-run-c1de47a173764e5f — SIMULATED DATA deployed-path evaluation

> **INVALIDATED threshold comparison.** The harness changed the range input's DOM value but did not verify that React applied it. The displayed/active margin for these 500 decisions is unknown; do not treat the stated 0.17 as the applied gate setting or compare this run against the 0.17 local baseline. Retained to document the evaluator defect and observed outcomes; superseded by a rerun with React-state verification.

**data_mode: "simulated" throughout.** The 500 WaveCast Creator Care ticket(s), their expected decisions, and isolated policy tenant(s) are fictional evaluation data.

This ran through the public app at https://dist-omega-black-31.vercel.app, backed by Supabase project lxlokqtowvaesxjishqz, which is the development database. It is deployed-path evidence, not production customer or adoption evidence.

Batch: seed 20260928, 500 evaluated from the approved 500-ticket batch (75 flagged in this selection); SHA-256 `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96`.
Corpus SHA-256: `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`. Evaluation-only margin: 0.17; shipped default: 0.18.

Decision accuracy: **72.2%** (361/500); failure rate: **27.8%** (139/500).
False escalations: 138; unsafe/wrong-SOP answers: 1; runtime errors: 0.
Browser click-to-render latency: mean 23.48 ms; median 22.50 ms; p95 35.40 ms; max 64.80 ms.

Hosted tag audit: 500/500 query events, 261/261 escalations, 15 SOP versions, and 4 user profiles are scoped to SIMULATED DATA tenants; untagged rows: 0.

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

### 2. SIM-TICKET-00108 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 3. SIM-TICKET-00452 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas.

### 4. SIM-TICKET-00176 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.

### 5. SIM-TICKET-00295 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-live)
- Actual: escalate — insufficient_margin
- Message: Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.

### 6. SIM-TICKET-00120 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 7. SIM-TICKET-00159 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.

### 8. SIM-TICKET-00444 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Message: Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.

### 9. SIM-TICKET-00096 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 10. SIM-TICKET-00208 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week.

## Interpretation

**The low-failure criterion is not met.** This run measures the deployed UI, bundle, local model, gate, and tagged ingest path. It does not establish real-world correctness. There is no design partner, so no partner comparison was performed and none is claimed.

All generated records remain isolated to the clearly named SIMULATED DATA tenants. No real tenant was used.
