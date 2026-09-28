<div align="center">

# LIVE Support Assistant

**An explainable browser support prototype with an on-device confidence gate.**

![Status](https://img.shields.io/badge/status-prototype-yellow)
![Gate](https://img.shields.io/badge/confidence%20gate-10%20checks%20passing-2ea043)
![Licence](https://img.shields.io/badge/licence-MIT-blue)
![TypeScript](https://img.shields.io/badge/typescript-app-3178c6)

</div>

## One-line identity

LIVE Support Assistant is an explainable browser support prototype that answers from a
tenant's own procedures using an on-device retrieval runtime and a deterministic
confidence gate — and escalates instead of guessing when the match is weak.

> [!NOTE]
> **Operating principle.** No generative model sits in the answering path. A wrong procedure in a support reply is a compliance breach, not a drafting aid — so retrieval, a deterministic confidence gate, and human escalation decide what a user sees. The gate requires an absolute floor and a measured margin between the best and second-best procedure; if that margin is not met, the reply is escalated to a human rather than shown as an answer.

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
> This is a prototype, not a production deployment. The on-device retrieval + confidence gate flow was re-verified on current HEAD on 2026-09-27. The backend verification suites (RBAC, RLS, telemetry, retention, encrypted sync, key rotation, telemetry queue) pass independently, but the hosted transport that would connect them to the running client is not wired into the standalone demo — a query's telemetry or escalation is not actually delivered there. No external security audit, no certified data isolation, no signed installer. No revenue and no paying users. The latest tagged release is **v1.0.1** (2026-08-29); it predates the current HEAD. In-sample prototype results (e.g. the 0.18 margin auto-answers 8 of 50 in-scope queries) are not a production SLA; threshold calibration remains a per-tenant onboarding task.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

To exercise the hosted demo you also need a `.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` pointing at a Supabase project that has the
`supabase/migrations` applied and a provisioned user. `pnpm build` outputs to
`apps/web/dist/`; it requires those build-time variables.

## Related work

- [Helix Prime](https://github.com/HatemIsmailShalaby1979/Helix-Prime) — the operations core
- [Helix Education](https://github.com/HatemIsmailShalaby1979/Helix-Education) — event-sourced learning engine
- [Study Studio](https://github.com/HatemIsmailShalaby1979/Study-Studio) — local-first AI tutor
- [L&D Command Center](https://github.com/HatemIsmailShalaby1979/L-D-Command-Center) — desktop learning and career workstation
- [Blue Waves](https://github.com/HatemIsmailShalaby1979/Blue-Waves-) — content studio
- [Full portfolio](https://github.com/HatemIsmailShalaby1979) — how this project fits the wider work

### The 2026 building attempts

- [WFM Forecasting Calculator](https://github.com/HatemIsmailShalaby1979/wfm-forecasting-calculator)
- [RTA Command Center](https://github.com/HatemIsmailShalaby1979/RTA_command_center)
- [CX Sentiment Sentinel](https://github.com/HatemIsmailShalaby1979/cx-sentiment-sentinel)
- [Dynamic Ops Automation Engine](https://github.com/HatemIsmailShalaby1979/Dynamic-Ops-Automation-Engine)

## Author

**Hatem Ismail Shalaby** — Operations Architect · AI Systems Engineer · Founder

- GitHub: [HatemIsmailShalaby1979](https://github.com/HatemIsmailShalaby1979)
- LinkedIn: [hatem-shalaby-202902127](https://www.linkedin.com/in/hatem-shalaby-202902127/)
- Email: hatemshalaby2025@gmail.com
- Education: BSc Managerial Sciences (Computer Section), Sadat Academy for Management Sciences; Business Analytics Nanodegree, Udacity

Based in Al Obour City, Al-Qalyubia Governorate, Egypt.

## Licence

MIT
