<div align="center">

# LIVE Support Assistant

**An explainable browser support prototype with an on-device confidence gate.**

![Status](https://img.shields.io/badge/status-prototype-yellow)
![Confidence gate — CI](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/actions/workflows/ci.yml/badge.svg)
![Licence](https://img.shields.io/badge/licence-MIT-blue)
![TypeScript](https://img.shields.io/badge/typescript-app-3178c6)

</div>

## One-line identity

LIVE Support Assistant is an explainable browser support prototype that answers from a
tenant's own procedures using an on-device retrieval runtime and a deterministic
confidence gate — and escalates instead of guessing when the match is weak.

> [!IMPORTANT]
> **Positioning.** Validated on a simulated tenant; safety-first by design; designed for a
> shadow-mode pilot; six prerequisites listed, none met yet. Not production-proven: no real customer traffic.

> [!NOTE]
> **Operating principle.** No generative model sits in the answering path. A wrong procedure in a support reply is a compliance breach, not a drafting aid — so retrieval, a deterministic confidence gate, and human escalation decide what a user sees. The gate requires an absolute floor and a measured margin between the best and second-best procedure; if that margin is not met, the reply is escalated to a human rather than shown as an answer.

> [!CAUTION]
> **Read this first — the three weakest measured results.**
> - One unsafe answer on the deployed path at margin **0.180757** — the shipped 0.18 default would not have stopped it ([Safety](#safety--what-is-claimed-and-what-is-not)).
> - **6 of 52** out-of-scope public questions answered at margin 0.18 ([Safety](#safety--what-is-claimed-and-what-is-not)).
> - In-scope recall **84/302 (27.8%)** at 48 procedures ([Evidence tiers](docs/EVIDENCE.md#tier-2--measured-limits)).

## What it does

The part a user actually exercises: open the app, sign in through the hosted Supabase
backend, and the on-device search runtime answers from a tenant's own procedures.

1. Sign in with the hosted Supabase account; the server assigns your tenant and role.
2. The app fetches the policy bundle signed for your tenant. There is deliberately no fallback to a checked-in corpus — a search over nothing returns nothing.
3. Click **Load model and build index** to start the on-device runtime (MiniLM from Hugging Face on first use; ONNX runtime from jsDelivr).
4. Paste a customer message and click **Find Answer**.
5. MiniLM embeds the message and retrieves relevant passages from the tenant bundle.
6. The deterministic Confidence Gate either returns a policy and a suggested reply, or escalates without exposing procedure content.
7. Copy an accepted reply to the clipboard.

Embedding and the gate run entirely on the device. The confidence gate is covered by
**10 passing verification checks** (`tooling/gate/verify-gate.mjs`).

### Built and independently tested, not yet connected

These pieces are implemented and have their own verification suites, but are **not**
part of the standalone client path — they are the backend and encryption machinery the
demo does not reach:

- Encrypted sync protocol — 31/0 · Persistence adapters — 33/0 · Key rotation — 13/0
  · Telemetry queue — 35/0 (`tooling/sync/*`, `tooling/telemetry/*`).
- Conflicting-procedure lint — reproduces the contradictory-payout case and catches
  it (`tooling/conflicts/*`). **Wired into publishing** via `supabase/functions/publish-bundle/index.ts`: a contradictory corpus is refused at publish with **HTTP 422**.
- PostgreSQL Command Center backend: RBAC 99/0 · Telemetry ingest 27/0 · RLS bypass
  40/0 · Retention 16/0 (`supabase/migrations`, `pnpm verify:db`).

## How it fits Helix Codex

LIVE Support Assistant is part of the Helix Codex / Helix Prime body of work — the same
author and the same design philosophy (explainable, auditable, no generative model in
the answering path). It is an **independent repository with no shared codebase,
packages, or runtime infrastructure** with Helix Prime; "a component of Helix Codex"
means portfolio membership, not technical integration. A possible future relationship:
its operational signals **could** inform Helix Education's curriculum — designed to
consume that feed; **not yet wired**.

## Architecture

- `apps/web` — React client (sign-in, on-device search, confidence gate, telemetry queue).
- `apps/desktop` — Tauri shell; `apps/mobile` — Expo WebView shell.
- `packages/core` — domain types, Confidence Gate, agent view, escalation record.
- `packages/embedder` — pinned local embedding and evaluation models.
- `packages/vector-store` — passage extraction and cosine retrieval.
- `packages/sync` — canonical JSON, encrypted bundles, install pipeline, persistence, key rotation.
- `supabase` — Command Center migrations, fixtures, database verification suites.
- `tooling` — gate, parity, sync, persistence, rotation, telemetry, database harnesses.

Stack: React 19, TypeScript, Vite, Tailwind; Transformers.js with a pinned MiniLM int8
model and ONNX Runtime; pnpm workspaces + Turborepo; PostgreSQL/Supabase with RLS and
SQL ingest contracts. No generative model in query, gate, answer, or escalation.

## Production status & test coverage

> [!WARNING]
> This is a prototype, not a production deployment. **Validated on a simulated tenant; safety-first by design; designed for a shadow-mode pilot; six prerequisites listed, none met yet. Not production-proven: no real customer traffic.** The headline measurement is 500 simulated tickets (47 distinct messages, 7 procedures, four languages) through the deployed path with tenant isolation audited. **One unsafe answer was found and documented, and the shipped 0.18 margin would not have stopped it** — see *Safety* below. It was repeated on an independent holdout seed and at 48 procedures — see [`docs/EVIDENCE.md`](docs/EVIDENCE.md). The on-device retrieval + confidence gate flow was re-verified on current HEAD on 2026-09-27. The backend verification suites (RBAC, RLS, telemetry, retention, encrypted sync, key rotation, telemetry queue, conflicting-procedure lint) pass independently, but the hosted transport that would connect them to the running client is not wired into the standalone demo — a query's telemetry or escalation is not actually delivered there. No external security audit, no certified data isolation, no signed installer. No revenue and no paying users. The latest tag is **v1.0-simulated-validation** (2026-09-28, cut on `main` HEAD — see `docs/RELEASE_NOTES.md`); the last product release tag remains **v1.0.1** (2026-08-29). In-sample prototype results (e.g. the 0.18 margin auto-answers 8 of 50 in-scope queries) are not a production SLA; threshold calibration remains a per-tenant onboarding task. There is no design partner.

## Release status & merge state

This release is on `main`. Two branches are **merged**:

- `feat/publish-conflict-block` — the publish path now refuses a contradictory corpus with **HTTP 422** ("publication blocked: the tenant corpus contains contradictory procedures"). Live in the development Supabase project.
- `exp/deployed-local-parity` — deployed-vs-local parity evidence (39/39 identical margins on a 7-procedure corpus). Tooling only; no product-code change.

Four experiment branches are **evidence-only** — measured, rejected or kept as evidence, and tagged (not merged, so their code is not on `main`). Their reports survive branch cleanup because they are pinned by tag and commit SHA:

| Tag | Branch | Finding |
| --- | --- | --- |
| [`evidence/scale-rung`](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/blob/evidence/scale-rung/tooling/eval/simulated-tenant/scale-rung-results.md) (`e5a7d9baf4f6`) | `exp/scale-rung` | 48-procedure corpus; in-scope recall 84/302 (27.8%) at 0.18 |
| `evidence/multilingual-embedder` (`65b76aef103f`) | `exp/multilingual-embedder` | +0.3 pp overall at 5.1× download — rejected |
| `evidence/reranker` (`495b52f6399b`) | `exp/reranker-measurement` | +14/+15 unsafe answers — rejected |
| `evidence/procedure-wording` (`bd6db511a0ca`) | `exp/procedure-distinctness` | threshold-dependent — rejected |

## Deployed-vs-local parity

The shipped decision path was measured on the **deployed** app (public Vercel app + development Supabase) and on the **local** browser harness over the **same 39 comparable tickets** on a **7-procedure corpus**, on the current build.

- Result: **39/39 identical decisions**, identical top-1 and top-2 procedures, and margins identical to four decimal places (Δ min/median/mean/max = 0.0000).
- The contradiction ticket (`SIM-TICKET-00272`) is **not** a margin comparison: the deployed publish path now **refuses the contradictory corpus with HTTP 422**, so it cannot be replayed there. The local harness still escalates it (margin 0.167715).
- **What it does not cover:** the set is 39 tickets on a 7-procedure corpus, not the full 500 or the 48-procedure corpus; one historical deployed/local divergence (deployed `0aec9773442c4282` answered at 0.180757 vs local 0.167715) is recorded but **unexplained** — the web client never verifies its loaded model against the bundle manifest. Report: `tooling/eval/simulated-tenant/parity-results.md`.

### Safety — what is claimed, and what is not

The design is **safety-first**: the gate answers only when the best procedure clears both the
absolute floor and the margin, and an escalation carries no procedure text, no title and no
suggested reply (10/10 checks, `tooling/gate/verify-gate.mjs`).

**That is not the same as "fails safe", and the difference is measured, not rhetorical.**

- **One unsafe answer is recorded, and the shipped default would not have stopped it.** On the
  deployed path, `SIM-TICKET-00272` — a deliberately contradictory payout case — was **answered**
  at a measured top-1/top-2 margin of **0.180757**, which is **≥ the shipped 0.18 default** as well
  as the applied 0.17 (`tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md`).
  The gate measures how *decisive* a match is, not whether the matched policy agrees with itself.
- **The local harness does not reproduce that answer** — it escalates the same ticket at margin
  0.167715. The counterexample therefore rests on the deployed run alone.
- **Out-of-scope public questions were answered.** Scored at margin 0.18 on the browser-local path,
  the assistant **answered 6 of 52 out-of-scope public questions** — questions the owner labelled
  escalate or ambiguous, where the correct behaviour is not to answer
  (`tooling/eval/simulated-tenant/real-phrased-label-results.md`):

  | Query | Text | Owner label | Label provenance | Contested? |
  | --- | --- | --- | --- | --- |
  | `rp-022` | Livestream on youtube by phone and microphone not enabling this just started happening | escalate | human-resolved | **yes** — both agent passes called it answerable; the owner overrode |
  | `rp-023` | How can i Enable Live Streaming? | escalate | human-resolved | **yes** — same split |
  | `rp-025` | Live stream on mobile | ambiguous | human-resolved | no |
  | `rp-026` | Live streaming issues | ambiguous | recorded as "live streaming issues are technical stream problems" | no |
  | `rp-040` | YouTube: We have detected multiple streams using the same stream key with auto-start enabled. | ambiguous | human-resolved | **yes** — same split |
  | `rp-060` | How can creators monetize on TikTok? | escalate | agent-agreed, unconfirmed | no |

  "Contested" means the row is in the set where two independent agent passes agreed the query was
  answerable and the owner overrode to escalate/ambiguous — three of the six. The other three are
  uncontested, and the assistant answered them anyway. At margin 0.17 the same set produced **7**
  false accepts.
- **Against that, the author-written floor set held.** **0 of 8** refusal rows (5 escalate + 3
  ambiguous) were auto-answered at 0.18 and 0.17
  (`tooling/eval/simulated-tenant/floor-queries-results.md`).

Net: the refusal path is real and the direction is right, but the claim is **"safety-first by
design"**, not "safe".

### Evaluation evidence — summary

Every number below is a measurement on simulated or author-written data, with its source
file. Nothing here is a production-customer measure. The three tiers — demonstrated,
measured limits, and not proven — are the honest reading, moved in full to
[`docs/EVIDENCE.md`](docs/EVIDENCE.md).

- **Demonstrated (simulated):** 500-ticket deployed run 72.2% (361/500), 1 unsafe answer at
  margin 0.180757; author-written floor set 0/8 refusal rows answered at 0.18 and 0.17; gate
  10/10 checks (`tooling/gate/verify-gate.mjs`).
- **Measured limits:** in-scope recall 84/302 (27.8%) at 48 procedures (0.18); non-English gap
  en 62.1% vs es 32.0% / pt 31.0%; three changes (procedure wording, cross-encoder reranker,
  multilingual embedders) measured and rejected.
- **Not proven:** real customer traffic (none exists); recall at production corpus sizes (largest
  tested is 48 procedures); per-tenant calibration (shipped `minMargin: 0.18` is a prototype
  default, the 0.17 used here is harness-only).

Full tier tables, source paths and tags: [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

## Run the demo (5 minutes, no account needed)

The shipped decision path — pinned MiniLM → passage retrieval → Confidence Gate → agent view —
runs entirely on the device. The evaluation harness drives that same path in a browser with **no
sign-in, no tenant bundle, no database and no telemetry**, so it is the one flow a stranger can
run end to end.

```bash
pnpm install
pnpm -r run build          # builds packages/*/dist, which the harness imports
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs \
  SIMULATION_RUN_LABEL=my-demo
```

That last line needs the environment variables set, so copy it exactly:

```bash
SIMULATION_RUN_LABEL=my-demo SIMULATION_MIN_MARGIN=0.18 \
SIMULATION_BATCH=demo-tickets.json SIMULATION_CORPUS=corpus.json \
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs
```

It launches headless Chrome, runs four tickets, and writes `my-demo.md` and `my-demo.json` into
`tooling/eval/simulated-tenant/`. First run downloads the pinned MiniLM model (~22 MB) from
Hugging Face; the query text never leaves the machine. Requires Node ≥ 22, pnpm, and Chrome.

Full runbook, including the four scenarios and their expected outcomes:
[`docs/DEMO.md`](docs/DEMO.md). A pre-run copy of the output is checked in as
`tooling/eval/simulated-tenant/demo-four-tickets.md`.

**Narrated walkthrough.** `tooling/video/demo-video.mp4` (3 minutes 2 seconds) shows the same
four-ticket run with the real gate decisions on screen, narrated from
[`docs/DEMO_NARRATION.md`](docs/DEMO_NARRATION.md). It is a capture of the **local browser**
evaluation, not of the hosted app. Regenerate it with `node tooling/video/capture-demo.mjs`
then `python tooling/video/assemble-video.py`; the derived MP4 is not committed, but the
sources and `tooling/video/demo-video-manifest.json` are.

<!-- TODO(Hatem): paste GitHub user-attachments video URL on its own line here -->

Narrated walkthrough video (hosted copy pending). A three-minute screen recording of the local
four-ticket browser run: the shipped decision path answers one clear question, refuses three
weaker ones, and shows the real confidence-gate decisions on screen. It is a capture of the
**local browser** evaluation, not of the hosted app. The MP4 is deliberately not committed to
this repository; the hosted copy is attached to a GitHub issue or pull request comment, and the
resulting `user-attachments` URL is pasted on the line above.

The **hosted** app is a separate, credential-gated path — see `docs/PRODUCTION_STATUS.md`. There
is no guest account, so a reviewer without one should watch the narrated walkthrough above
rather than click through.

## Shadow-mode pilot checklist

A shadow-mode pilot means the assistant runs alongside human agents and its answers are **not**
shown to customers. Before that is worth doing, a real pilot needs:

1. **Real-tenant procedures.** The tenant's own published policy, imported and versioned — not the
   seven fictional WaveCast procedures. The conflict lint must pass on that corpus before publish.
2. **Calibration per tenant.** Re-derive `minMargin` on the tenant's own traffic and procedures.
   The shipped 0.18 is a prototype default and does not transfer; the 0.17 used in these
   evaluations is harness-only.
3. **Monitoring.** Escalation rate, false-escalation rate, unsafe-answer count and retrieval
   latency, reported per language. The non-English gap measured here (Spanish 32.0%, Portuguese
   31.0% against English 62.1%) is the first thing a real corpus should be checked for.
4. **Rollback.** A way to withdraw the assistant and revert to the human queue, with the bundle
   version that was live at the time recorded.
5. **Consent and data handling.** Agreed handling for query text, retention limits, and who can
   read escalation evidence. The demo writes query text to `localStorage` and has no tenant
   query-text policy.
6. **A named owner for the handover.** Who resolves an escalation, and what happens when the
   assistant is wrong — the design assumes the handover is the product, not the fallback.

Nothing in this repository has been through any of the six.

## Related work

- [Portfolio and wider work](https://github.com/HatemIsmailShalaby1979/HatemIsmailShalaby1979)

## Author

**Hatem Ismail Shalaby** — Operations Architect · AI Systems Engineer · Founder

- GitHub: [HatemIsmailShalaby1979](https://github.com/HatemIsmailShalaby1979)
- LinkedIn: [hatem-shalaby-202902127](https://www.linkedin.com/in/hatem-shalaby-202902127/)
- Email: hatemshalaby2025@gmail.com
- Education: BSc Managerial Sciences (Computer Section), Sadat Academy for Management Sciences; Business Analytics Nanodegree, Udacity

Based in Al Obour City, Al-Qalyubia Governorate, Egypt.

## Licence

MIT
