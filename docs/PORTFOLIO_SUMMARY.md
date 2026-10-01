# Portfolio summary

A 60-second pitch and four resume bullets for the Live Support Assistant decision path.
Every claim below is backed by the `README.md` claims table; the supporting file is named
for each item. The numbers are simulated or author-written — there is no real customer
traffic.

## 60-second pitch

Validated on a simulated tenant; safety-first by design; designed for a shadow-mode pilot; prerequisites not yet met.
Not production-proven: no real customer traffic.

The product is an on-device retrieval plus a Confidence Gate. It reads a support question,
retrieves the best procedure, and answers only when the best match clearly beats the second.
Otherwise it escalates to a person. On five hundred simulated tickets across seven procedures
in four languages, the deployed path answered three hundred and sixty-one, seventy-two point
two percent, with one unsafe answer and zero runtime errors. The rest were escalated, not
answered wrongly: one hundred and thirty-eight of the five hundred were refused for too little
confidence at the shipped margin of zero point one eight.

The decision path was proven identical between the deployed app and the local harness — same
decisions, same margins — on a shared seven-procedure batch. And the one dangerous case, a
corpus with two contradictory payout rules, is now refused at publish with HTTP 422, so it
can never reach a user.

It is a prototype. It has no design partner and no pilot customer. The next step is a
shadow-mode pilot on real, isolated tenant traffic.

## Resume bullets

- **Built a safety-first support assistant.** An on-device MiniLM retrieval path with a
  deterministic Confidence Gate that answers only above a margin and escalates otherwise.
  Supporting file: `README.md` (claims table, "What this is"), `packages/core/src/gate.ts`.
- **Validated on 500 simulated tickets across 7 procedures in 4 languages.** Deployed path:
  361/500 answered (72.2%), 1 unsafe answer, 0 runtime errors; 138 false escalations were
  refusals, not wrong answers. Supporting file: `tooling/eval/simulated-tenant/
  phase5-deployed-run-0aec9773442c4282.md`, `README.md` claims table.
- **Proved deployed-vs-local parity.** Same decisions and identical margins on a shared
  7-procedure batch (39/39 comparable tickets, Δ = 0.0000). Supporting file:
  `tooling/eval/simulated-tenant/parity-results.md`, `README.md` ("Deployed-vs-local parity").
- **Closed the one unsafe case at the source.** A corpus with contradictory payout procedures
  is now refused at publish with HTTP 422, so the dangerous corpus never reaches the gate.
  Supporting file: `supabase/functions/publish-bundle/index.ts`, `docs/DEMO.md` (contradiction
  scenario), `README.md` (release status).

## Does NOT show

- No real customer traffic, no design partner, no pilot, and no production deployment. Every
  number is synthetic or author-written (`README.md` Tier 3 — NOT PROVEN).
- No proof at production corpus sizes: the largest tested is 48 procedures, not the
  5,000-procedure scale named in the Phase 1 open question (`README.md`, `evidence/scale-rung`).
- No per-tenant calibration: the 0.18 margin is a prototype default, 0.17 a harness-only value
  (`packages/core/src/types.ts`).
- The standalone demo does not wire the hosted transport, so a query's telemetry or escalation
  is not delivered to the live backend in that path (`README.md` warning, `docs/KNOWN_ISSUES.md`
  item 7).
