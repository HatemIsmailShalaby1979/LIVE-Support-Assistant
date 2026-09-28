# phase5-deployed-run-f2c81013086d4327 — SIMULATED DATA deployed-path evaluation

**data_mode: "simulated" throughout.** The 1 WaveCast Creator Care ticket(s), their expected decisions, and isolated policy tenant(s) are fictional evaluation data.

This ran through the public app at https://dist-omega-black-31.vercel.app, backed by Supabase project lxlokqtowvaesxjishqz, which is the development database. It is deployed-path evidence, not production customer or adoption evidence.

Batch: seed 20260928, 1 evaluated from the approved 500-ticket batch (1 flagged in this selection); SHA-256 `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96`.
Corpus SHA-256: `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`. Evaluation-only margin: 0.17; shipped default: 0.18.

Decision accuracy: **100.0%** (1/1); failure rate: **0.0%** (0/1).
False escalations: 0; unsafe/wrong-SOP answers: 0; runtime errors: 0.
Browser click-to-render latency: mean 30.10 ms; median 30.10 ms; p95 30.10 ms; max 30.10 ms.

Hosted tag audit: 1/1 query events, 1/1 escalations, 8 SOP versions, 2 user profiles, and 1 enrolled web devices are scoped to SIMULATED DATA tenants; untagged rows: 0.

Local comparison at margin 0.17: batch input hash matches, corpus hash matches, selected per-ticket outcomes identical.

Local same-batch baseline at margin 0.17: 72.4% (362/500), 138 failures, 0 unsafe answers. This deployed path is a separate environment comparison, not a paired app-code fix.

## Failure categories

- None.

## Worst failures (all text below is synthetic)

No failed tickets.
## Interpretation

**The low-failure criterion is not met.** This run measures the deployed UI, bundle, local model, gate, and tagged ingest path. It does not establish real-world correctness. There is no design partner, so no partner comparison was performed and none is claimed.

All generated records remain isolated to the clearly named SIMULATED DATA tenants. No real tenant was used.
