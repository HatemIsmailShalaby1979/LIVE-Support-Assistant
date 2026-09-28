# Phase 5 — simulated hardening comparison

**data_mode: "simulated" — every ticket, procedure, and evaluation outcome referenced here is fictional.**

All evaluation runs used the same 500-ticket batch (seed `20260928`, 75 chaos-tagged tickets, configured chaos rate 15%) in a local browser through the shipped MiniLM → passage retrieval → Confidence Gate → agent-view decision path. No live tenant, database, telemetry transport, or production traffic was used.

| Run | Evaluation setup | Correct | Failure rate | False escalations | Unsafe answers | Runtime errors |
|---|---|---:|---:|---:|---:|---:|
| Phase 4 baseline | English-only fictional SOPs; margin 0.18 | 242/500 (48.4%) | 51.6% | 258 | 0 | 0 |
| Phase 5 round 1 | Localized fictional SOP summaries; margin 0.18 | 269/500 (53.8%) | 46.2% | 231 | 0 | 0 |
| Phase 5 round 2 | Localized, symptom-specific fictional guidance; margin 0.18 | 335/500 (67.0%) | 33.0% | 165 | 0 | 0 |
| Phase 5 round 3 | Round-2 corpus; harness-only margin 0.17 | 362/500 (72.4%) | 27.6% | 138 | 0 | 0 |
| Stability repeat | Identical round-3 setup and batch | 362/500 (72.4%) | 27.6% | 138 | 0 | 0 |
| Margin 0.16 safety probe (rejected) | Same batch/corpus; harness-only margin 0.16 | 363/500 (72.6%) | 27.4% | 135 | 2 | 0 |

## Stability and remaining failures

The two 0.17 runs have identical batch and corpus SHA-256 values. A row-by-row comparison of all 500 results found no changes in ticket ID, disposition, or correctness. The stability repeat's per-decision latency was mean 18.68 ms, median 18.30 ms, p95 25.50 ms, and maximum 33.60 ms.

All 138 remaining failures at 0.17 are false escalations due to `insufficient_margin`; 120 are baseline tickets, and the other 18 are chaos tickets. The system returned no wrong-SOP answers and had no runtime errors. At 0.16, one additional ticket was dispositioned correctly, but two contradictory-guidance tickets were answered instead of escalated (one payout answer each in English and French). That trade is unsafe; the 0.16 report is retained as a rejected experiment, and the shipped 0.18 default is unchanged.

## Deployed-path validation

The same batch and corpus were also run through the public Vercel app, an
isolated signed bundle, the browser model and gate, and the development
Supabase ingest path. This is deployed-path validation, not production
customer evidence. The run used a test-only margin of 0.17, verified in both
the range control and the rendered React state.

Run `0aec9773442c4282` produced **361/500 correct (72.2%)**, 138 false
escalations, **one unsafe answer**, and zero runtime errors. Its mean
click-to-render latency was 22.38 ms (median 21.70 ms, p95 32.70 ms, maximum
47.30 ms). The local and deployed decisions differ on exactly one ticket:
`SIM-TICKET-00272`, a contradictory payout-policy case.

The event stored for that ticket has `minMargin: 0.17` and a measured
top-one/top-two margin of `0.1807574329`. The gate accepts when the candidate
margin is at least the configured value, so this outcome would also clear the
shipped 0.18 threshold if the same scores recur. This identifies a real
synthetic safety gap in deployed-path behavior; it is not evidence that 0.17
is a safe tenant setting. No product code or shipped threshold was changed.
The local repeat's zero unsafe answers do not override this deployed-path
counterexample.

The preliminary run `c1de47a173764e5f` is explicitly invalidated: the harness
changed the slider's DOM value without verifying React applied it. It is kept
only as evidence of that test-harness defect. The corrected runner now uses
keyboard input, confirms the displayed React state, waits for device
enrollment before bundle publication, and audits the tagged device rows.

The new-seed, 500-ticket holdout produced 71.8% accuracy (359/500) at 0.18 and 75.8% (379/500) at 0.17, with zero unsafe answers in both runs. It uses the same generator and template pool, so it checks seed sensitivity but is not an independently authored or human-labelled holdout. The harmful localized-corpus experiment and subject-plus-message experiment remain rejected: they reduced accuracy or introduced unsafe answers and are documented in their individual reports.

## Conclusion

The local disposition result is stable for this fixed synthetic batch, but its 27.6% failure rate is not low; the deployed-path run had a 27.8% failure rate and one unsafe answer. Lowering the threshold to 0.16 barely changed the aggregate failure rate and introduced unsafe answers locally. The requested low-and-stable criterion has **not** been met. Synthetic corpus tuning risks overfitting these examples, and no production configuration or threshold was changed. This evaluation is not a production accuracy or readiness measure.

## Artifacts

- `chaos-500.json` — unchanged simulated input batch.
- `phase5-round1.json` / `.md` — localized-corpus run.
- `phase5-round2.json` / `.md` — localized and symptom-specific corpus run.
- `phase5-round3-margin-017.json` / `.md` — evaluation-only 0.17 run.
- `phase5-stability-margin-017.json` / `.md` — repeatability run.
- `phase5-original-margin-016.json` / `.md` — rejected lower-margin safety probe.
- `phase5-deployed-run-0aec9773442c4282.json` / `.md` — valid deployed-path run with React-confirmed margin and full simulated-data audit.
- `phase5-deployed-run-c1de47a173764e5f.json` / `.md` — invalidated threshold comparison; retained with the DOM/React-state test defect disclosed.
- `phase5-deployed-run-f2c81013086d4327.json` / `.md` — one-ticket contradictory-policy smoke run after the gate-control correction.
- `phase5-deployed-run-5c77413c866f4b10.json` / `.md` — visible-browser recording-control smoke; not a batch accuracy result.
- `phase5-holdout-seed-20260929-margin-018.json` / `.md` and
  `phase5-holdout-seed-20260929-margin-017.json` / `.md` — new-seed results from
  the same template generator, not an independent human-authored holdout.

The Phase 4 aggregate baseline remains recorded in `AGENTS.md`; the original Phase 4 per-ticket report was overwritten when the runner reused its filenames for Phase 5 round 1.
