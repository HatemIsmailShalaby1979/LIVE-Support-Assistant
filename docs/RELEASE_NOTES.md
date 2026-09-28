# Release notes — v1.0-simulated-validation

**Tag:** `v1.0-simulated-validation`
**Tagged commit:** `main` HEAD — see `git log -1` at tag time.
**Positioning (verbatim from `README.md`):** Validated on a simulated tenant; safety-first by
design; ready for a shadow-mode pilot. Not production-proven: no real customer traffic.

This release collects the simulated-tenant validation work into a single, auditable point. It is
**not** a production deployment and **not** a code change to the gate or thresholds.

## What is in this release

- **Two merged branches (on `main`):**
  - `feat/publish-conflict-block` — the publish path now refuses a contradictory corpus with
    **HTTP 422** ("publication blocked: the tenant corpus contains contradictory procedures")
    before signing; live in the development Supabase project.
  - `exp/deployed-local-parity` — deployed-vs-local parity evidence (39/39 identical margins on a
    7-procedure corpus). Tooling only; no product-code change.
- **Four evidence-only tags** (measured, rejected or kept as evidence, not merged — their code is
  not on `main`):
  - `evidence/procedure-wording` (`bd6db511a0ca`)
  - `evidence/reranker` (`495b52f6399b`)
  - `evidence/multilingual-embedder` (`65b76aef103f`)
  - `evidence/scale-rung` (`e5a7d9baf4f6`)
- **Documentation consistency pass:** `README.md`, `proof-of-concept.md`, `docs/PRODUCTION_STATUS.md`,
  `docs/CASE_STUDY.md`, `docs/DEMO.md`, `AGENTS.md` now state the merged state, the parity result,
  and the publish-refusal (HTTP 422) consistently; all experiment-branch references now cite tag +
  SHA.
- **New documents:** `docs/KNOWN_ISSUES.md` (7 open issues, each with a source path),
  `docs/DEMO_NARRATION.md` (2–3 min TTS script), `docs/PORTFOLIO_SUMMARY.md` (60-second pitch +
  resume bullets).

## Validation gates (all green before tagging)

| Gate | Result |
| --- | --- |
| `pnpm run verify` (`tooling/run-verification.mjs`) | **8/8 suites passed**, including the new publish-path conflict block |
| 500-ticket validator (`run-chaos-evaluation.mjs`, `chaos-500.json`, margin 0.18) | 335/500 (67.0%), 165 false escalations, **0 unsafe**, **0 runtime errors** |
| Documented build (`pnpm -r run build`) | exit 0; `apps/web`, `apps/desktop`, `packages/*` all built |

A separate deployed-path run (public Vercel app + development Supabase, `chaos-500.json`, margin
0.18) measured **361/500 (72.2%), 1 unsafe answer, 0 runtime errors** with tenant isolation
audited (500/500 tagged query events, 261/261 escalation records, 0 untagged rows).

## Headline numbers (from `README.md` claims table)

- 500 simulated tickets, 47 distinct messages, 7 procedures, four languages.
- Deployed path: 361/500 (72.2%), 138 false escalations, 1 unsafe, 0 runtime errors.
- Local harness parity: 39/39 identical decisions and margins (Δ = 0.0000) on a 7-procedure corpus.
- One unsafe answer found and documented; the publish-conflict block now removes that failure class
  at the source (HTTP 422).

## Does NOT show

- No real customer traffic, design partner, or pilot. Every number is synthetic or author-written.
- No proof at production corpus sizes (largest tested: 48 procedures, not 5,000).
- No per-tenant threshold calibration; 0.18 is a prototype default, 0.17 a harness-only value.
- The standalone demo does not wire the hosted transport (telemetry/escalation not delivered to the
  live backend in that path). See `docs/KNOWN_ISSUES.md`.
