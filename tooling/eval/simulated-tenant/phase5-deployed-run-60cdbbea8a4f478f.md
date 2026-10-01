# phase5-deployed-run-60cdbbea8a4f478f — SIMULATED DATA deployed-path evaluation

**data_mode: "simulated" throughout.** The 39 WaveCast Creator Care ticket(s), their expected decisions, and isolated policy tenant(s) are fictional evaluation data.

This ran through the public app at https://dist-omega-black-31.vercel.app, backed by Supabase project lxlokqtowvaesxjishqz, which is the development database. It is deployed-path evidence, not production customer or adoption evidence.

Batch: seed 20260928, 39 evaluated from the approved 500-ticket batch (21 flagged in this selection); SHA-256 `a37e0d995a54fb1b11f406195317995731f544242c78884cc60dc248953f3f2f`.
Corpus SHA-256: `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`. Evaluation-only margin: 0.17; shipped default: 0.18.

Decision accuracy: **66.7%** (26/39); failure rate: **33.3%** (13/39).
False escalations: 7; unsafe/wrong-SOP answers: 6; runtime errors: 0.
Unsafe-answer gate evidence: PARITY-RP-022 had margin 0.229320108 against applied minMargin 0.17. PARITY-RP-023 had margin 0.267428820 against applied minMargin 0.17. PARITY-RP-025 had margin 0.282066091 against applied minMargin 0.17. PARITY-RP-026 had margin 0.417503249 against applied minMargin 0.17. PARITY-RP-040 had margin 0.259816070 against applied minMargin 0.17. PARITY-RP-060 had margin 0.186866972 against applied minMargin 0.17.
Browser click-to-render latency: mean 20.64 ms; median 21.40 ms; p95 28.10 ms; max 30.80 ms.

Hosted tag audit: 39/39 query events, 16/16 escalations, 7 SOP versions, 2 user profiles, and 1 enrolled web devices are scoped to SIMULATED DATA tenants; untagged rows: 0.

This run used a parity batch rather than the approved 500-ticket batch, so the local stability baseline does not apply and is not reported. Per-ticket deployed gate evidence is in the `candidateEvidence` block.

## Deployed gate evidence — per candidate

Model identity from the published bundle manifest: `Xenova/all-MiniLM-L6-v2` @ `751bff37182d3f1213fa05d7196b954e230abad9`, quantization `q8`, bundle version 1. Runtime: browser (onnxruntime-web), not the Node native runtime.

Top-1 and top-2 are read back from the tagged telemetry payload the app itself persisted, not inferred from the UI, which deliberately shows no scores on an escalation.

| Ticket | Outcome | Top-1 (score) | Top-2 (score) | Margin | Applied |
| --- | --- | --- | --- | ---: | ---: |
| PARITY-RP-022 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.5087) | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.2794) | 0.2293 | 0.17 |
| PARITY-RP-023 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.5722) | ef49d27c-a115-4916-8226-8f8c84750b15 (0.3048) | 0.2674 | 0.17 |
| PARITY-RP-025 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.5512) | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.2692) | 0.2821 | 0.17 |
| PARITY-RP-026 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.7055) | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.2880) | 0.4175 | 0.17 |
| PARITY-RP-040 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.3741) | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.1143) | 0.2598 | 0.17 |
| PARITY-RP-060 | answered | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4981) | ef49d27c-a115-4916-8226-8f8c84750b15 (0.3112) | 0.1869 | 0.17 |
| SIM-TICKET-00002 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5968) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4029) | 0.1939 | 0.17 |
| SIM-TICKET-00016 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.6932) | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.4571) | 0.2361 | 0.17 |
| SIM-TICKET-00025 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.7138) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4085) | 0.3054 | 0.17 |
| SIM-TICKET-00059 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5968) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4029) | 0.1939 | 0.17 |
| SIM-TICKET-00100 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.7138) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4085) | 0.3054 | 0.17 |
| SIM-TICKET-00102 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.7138) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4085) | 0.3054 | 0.17 |
| SIM-TICKET-00108 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.6135) | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.5929) | 0.0206 | 0.17 |
| SIM-TICKET-00111 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00123 | escalated | bd7c516a-558c-4670-8c49-b20d36392f24 (0.5044) | ef49d27c-a115-4916-8226-8f8c84750b15 (0.3586) | 0.1458 | 0.17 |
| SIM-TICKET-00132 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00148 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.6932) | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.4571) | 0.2361 | 0.17 |
| SIM-TICKET-00161 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5163) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4979) | 0.0184 | 0.17 |
| SIM-TICKET-00164 | escalated | bd7c516a-558c-4670-8c49-b20d36392f24 (0.5761) | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.4887) | 0.0874 | 0.17 |
| SIM-TICKET-00196 | answered | bd7c516a-558c-4670-8c49-b20d36392f24 (0.7197) | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.4634) | 0.2564 | 0.17 |
| SIM-TICKET-00205 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00208 | escalated | bd7c516a-558c-4670-8c49-b20d36392f24 (0.5044) | ef49d27c-a115-4916-8226-8f8c84750b15 (0.3586) | 0.1458 | 0.17 |
| SIM-TICKET-00239 | escalated | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.6555) | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5177) | 0.1378 | 0.17 |
| SIM-TICKET-00251 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.6906) | dde14626-c6dc-43d2-8dff-9e61b05f528e (0.4660) | 0.2246 | 0.17 |
| SIM-TICKET-00264 | answered | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.6657) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4410) | 0.2247 | 0.17 |
| SIM-TICKET-00266 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.7113) | dde14626-c6dc-43d2-8dff-9e61b05f528e (0.5025) | 0.2088 | 0.17 |
| SIM-TICKET-00274 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00275 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00283 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.7237) | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5092) | 0.2145 | 0.17 |
| SIM-TICKET-00300 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00328 | answered | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.6932) | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.4571) | 0.2361 | 0.17 |
| SIM-TICKET-00359 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.5180) | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.1620) | 0.3560 | 0.17 |
| SIM-TICKET-00373 | answered | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.6984) | 27ca5d5f-874c-4dc3-8d1d-15b3cda5537c (0.3598) | 0.3386 | 0.17 |
| SIM-TICKET-00381 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.5288) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.4794) | 0.0495 | 0.17 |
| SIM-TICKET-00392 | escalated | ef49d27c-a115-4916-8226-8f8c84750b15 (0.6074) | bd7c516a-558c-4670-8c49-b20d36392f24 (0.5355) | 0.0719 | 0.17 |
| SIM-TICKET-00393 | escalated | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.5404) | a07aeb19-b940-4c99-9004-9aa2f1a7efe1 (0.4806) | 0.0598 | 0.17 |
| SIM-TICKET-00431 | answered | ef49d27c-a115-4916-8226-8f8c84750b15 (0.5379) | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.2959) | 0.2420 | 0.17 |
| SIM-TICKET-00443 | answered | ef49d27c-a115-4916-8226-8f8c84750b15 (0.5379) | e4d6a15d-7b07-45d5-989b-d195ac78c7a9 (0.2959) | 0.2420 | 0.17 |
| SIM-TICKET-00477 | escalated | e3d78771-ef7e-4c7c-a7b5-ac3a900034e6 (0.2903) | dde14626-c6dc-43d2-8dff-9e61b05f528e (0.2764) | 0.0139 | 0.17 |

## Failure categories

- false_escalation: 7
- unsafe_answer_on_escalation_case: 6

## Worst failures (all text below is synthetic)

### 1. PARITY-RP-040 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-live)
- Message: YouTube: We have detected multiple streams using the same stream key with auto-start enabled.

### 2. PARITY-RP-022 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-live)
- Message: Livestream on youtube by phone and microphone not enabling this just started happening

### 3. PARITY-RP-060 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-payout)
- Message: How can creators monetize on TikTok?

### 4. PARITY-RP-025 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-live)
- Message: Live stream on mobile

### 5. PARITY-RP-023 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-live)
- Message: How can i Enable Live Streaming?

### 6. PARITY-RP-026 — unsafe_answer_on_escalation_case

**data_mode: "simulated"**
- Expected: escalate
- Actual: answer (wc-live)
- Message: Live streaming issues

### 7. SIM-TICKET-00108 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-gifts)
- Actual: escalate — insufficient_margin
- Message: Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.

### 8. SIM-TICKET-00161 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-payout)
- Actual: escalate — insufficient_margin
- Message: Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.

### 9. SIM-TICKET-00239 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-login)
- Actual: escalate — insufficient_margin
- Message: I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.

### 10. SIM-TICKET-00392 — false_escalation

**data_mode: "simulated"**
- Expected: answer (wc-eligibility)
- Actual: escalate — insufficient_margin
- Message: Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue.

## Interpretation

**The low-failure criterion is not met.** This run measures the deployed UI, bundle, local model, gate, and tagged ingest path. It does not establish real-world correctness. There is no design partner, so no partner comparison was performed and none is claimed.

All generated records remain isolated to the clearly named SIMULATED DATA tenants. No real tenant was used.
