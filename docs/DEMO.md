# Demo — run the decision path in 5 minutes

**data_mode: "simulated".** Everything the demo evaluates is fictional. There is no design
partner and no customer data.

This runs the shipped decision path — pinned MiniLM → passage retrieval → Confidence Gate →
agent view — in a local browser. **No sign-in, no tenant bundle, no database, no telemetry.** It
is the only flow in this repository a stranger can run end to end without an account.

## Prerequisites

| Need | Why |
| --- | --- |
| Node ≥ 22 and pnpm 11.20.0 | The workspace toolchain. |
| Google Chrome | The harness drives a headless Chrome over CDP. |
| Network access to huggingface.co on first run | The pinned MiniLM weights (~22 MB) are fetched once and cached. The **query text is embedded locally and never leaves the machine**. |

## Setup

```bash
pnpm install
pnpm -r run build
```

`pnpm -r run build` (not `pnpm build`) is deliberate: `turbo run build` fails on this Windows host
with `All pipe instances are busy. (os error 231)`. The build produces `packages/*/dist`, which
the harness imports.

## Run it

From the repository root:

```bash
SIMULATION_RUN_LABEL=my-demo \
SIMULATION_MIN_MARGIN=0.18 \
SIMULATION_BATCH=demo-tickets.json \
SIMULATION_CORPUS=corpus.json \
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs
```

It starts Vite at the repository root, opens headless Chrome, loads the model, runs the four
tickets, and writes `my-demo.md` and `my-demo.json` into `tooling/eval/simulated-tenant/`. It
takes about a minute, most of it the model load. The markdown is printed to stdout as well.

**Re-running with the same label fails on purpose** — the driver refuses to overwrite an existing
report so evidence is never silently replaced. Use a new label, or delete the old pair first.

### No-Chrome alternative

Serve the repository root with Vite directly, then open the harness page in any browser:

```bash
node apps/web/node_modules/vite/bin/vite.js . \
  --config apps/web/vite.config.ts \
  --port 5173 --host 127.0.0.1 --strictPort
```

```
http://127.0.0.1:5173/tooling/eval/simulated-tenant/chaos-runner.html?batch=demo-tickets.json&corpus=corpus.json&minMargin=0.18
```

The page shows progress and a summary; it does not write a report file.

**Do not use `pnpm dev` for this.** It runs `turbo run dev`, which fails on this Windows host with
`All pipe instances are busy. (os error 231)` — the same host limitation that makes `pnpm build`
unusable. The direct Vite command above is the working equivalent and is what the driver itself
uses.

### Narrated walkthrough — no setup at all

If you only want to see the path decide, watch `tooling/video/demo-video.mp4` (199.11 s). It narrates the four scenarios below with the real gate decisions and top
candidate scores on screen, and is built from a capture of this same local browser
evaluation — not from the hosted app. The script is `docs/DEMO_NARRATION.md`; regeneration
steps are in `tooling/eval/simulated-tenant/screen-recording-instructions.md`. The MP4 is a
build output and is not committed.

## What to expect

Four tickets, each extracted verbatim from the pinned 500-ticket batch. Measured on 2026-09-28;
the checked-in output is `tooling/eval/simulated-tenant/demo-four-tickets.md`.

| # | Scenario | Ticket | Top-1 / Top-2 | Margin | Gate decision | Correct? |
| --- | --- | --- | --- | ---: | --- | --- |
| 1 | **Clean, in-scope** | `SIM-TICKET-00002` | `wc-gifts` 0.5968 / `wc-payout` 0.4029 | 0.1939 | **answers from `wc-gifts`** | yes |
| 2 | **Messy input** | `SIM-TICKET-00123` | `wc-payout` 0.5044 / `wc-eligibility` 0.3586 | 0.1458 | escalates (`insufficient_margin`) | no — false escalation |
| 3 | **Should escalate** | `SIM-TICKET-00132` | `wc-gifts` 0.5288 / `wc-payout` 0.4794 | 0.0495 | **escalates** | yes |
| 4 | **Contradiction** | `SIM-TICKET-00272` | `wc-payout` 0.7197 / `wc-payout-conflict` 0.5520 | 0.1677 | **escalates** | yes |

Totals: **3/4 correct, 1 false escalation, 0 unsafe answers, 0 runtime errors**, mean decision
latency 20.02 ms.

### What each scenario shows

1. **Clean.** An unambiguous gifts/purchases question. The best procedure clears the margin by
   0.1939 against the 0.18 bar, so the gate answers and names the procedure it used.
2. **Messy.** The same payout question, wrapped in frustration, a Spanish word and a typo
   (`payuot`). The right procedure is still ranked first, but its lead over the runner-up falls to
   0.1458 — below the bar — so the gate escalates. This is the failure mode the numbers describe:
   **most failures are the gate refusing to answer, not answering wrongly.** All 138 false
   escalations in the 500-ticket run were blocked for `insufficient_margin`.
3. **Should escalate.** No supplied procedure covers the question (a closed account, a payout held
   for audit). Nothing scores clearly, margin 0.0495, and the gate escalates without showing any
   procedure text.
4. **Contradiction.** Two procedures in the same category give different payout windows
   (`wc-payout`, and `wc-payout-conflict` injected by the ticket). On this local harness the gate
   escalates here because the two are close (margin 0.1677). **On the deployed path this ticket can
   no longer be replayed:** publishing a bundle containing the contradictory procedure is refused
   with **HTTP 422** ("publication blocked: the tenant corpus contains contradictory procedures").
   The earlier deployed unsafe answer (margin 0.180757) predates that block. See
   `docs/decisions/conflicting-procedures.md` and `README.md` (Deployed-vs-local parity).

## Known rough edges

- **The contradiction case is now blocked at publish, not answered.** In this local run the margin
  is 0.1677 and the gate escalates. The historical deployed-path run **answered** the same ticket at
  margin 0.180757 — above both the applied 0.17 and the shipped 0.18 — but that was before the
  publish-conflict block. Now the deployed publish path **refuses** any bundle containing the
  contradictory procedure with **HTTP 422**, so the dangerous corpus never reaches the gate. The
  local harness still escalates it (0.1677). The gate measures how decisive a match is, not whether
  the matched policy agrees with itself.
- **Chrome is a hard requirement** for the report-writing path. Without it, use the no-Chrome
  alternative above.
- **`pnpm build` will fail** on this host; use `pnpm -r run build`.
- **The first run is slow** because of the one-time model download.

## The hosted path (needs an account)

The deployed app is a separate path and requires `.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` pointing at a project with `supabase/migrations` applied and a
provisioned user. There is **no guest account**. That flow is described in
`docs/PRODUCTION_STATUS.md`; its recording steps are in
`tooling/eval/simulated-tenant/screen-recording-instructions.md`.

## Limits

The demo is four tickets chosen to show four behaviours. It is **not** a score. The measured
behaviour on the full batches is in the claims table in `README.md`; the false-escalation rate
there is 27.6% at margin 0.17 and the corpus is synthetic and in-sample.
