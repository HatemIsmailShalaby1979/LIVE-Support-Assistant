![License](https://img.shields.io/github/license/HatemIsmailShalaby1979/live-support-assistant)
![Release](https://img.shields.io/github/v/release/HatemIsmailShalaby1979/live-support-assistant)

# LIVE Support Assistant

**Status: prototype with a hosted, sign-in-gated demo. The on-device retrieval +
confidence-gate flow was re-verified on current HEAD on 2026-09-27.**

## Honest status

This is a prototype, not a production deployment. The following is stated once,
confidently:

- No external security audit, no certified data isolation, and no signed installer.
- No revenue and no paying users.
- The backend verification suites (RBAC, RLS, telemetry, retention, encrypted
  sync, key rotation, telemetry queue) pass independently, but the hosted transport
  that would connect them to the running client is not wired into the standalone
  demo — a query's telemetry or escalation is not actually delivered there.
- The latest tagged release is **v1.0.1** (2026-08-29); it predates the current
  HEAD.

## What runs today

The part a user actually exercises: open the app, sign in through the hosted
Supabase backend, and the on-device search runtime answers from a tenant's own
procedures.

1. Sign in with the hosted Supabase account; the server assigns your tenant and role.
2. The app fetches the policy bundle signed for your tenant. There is deliberately
   no fallback to a checked-in corpus — a search over nothing returns nothing.
3. Click **Load model and build index** to start the on-device runtime (MiniLM,
   downloaded from Hugging Face on first use; ONNX runtime from jsDelivr).
4. Paste a customer message and click **Find Answer**.
5. MiniLM embeds the message and retrieves relevant passages from the tenant bundle.
6. The deterministic Confidence Gate either returns a policy and a suggested reply,
   or escalates without exposing procedure content.
7. Copy an accepted reply to the clipboard.

Embedding and the gate run entirely on the device. The gate requires an absolute
floor and a measured margin between the best and second-best procedure. In the
original five-candidate evaluation corpus, the lowest audited fixed prototype
margin (0.18) auto-answers 8 of 50 in-scope queries with no measured wrong
procedure or out-of-scope acceptance; a correct match to a policy that explicitly
requires human review is escalated instead of counted as an auto-answer. These are
in-sample prototype results, not a production SLA, and threshold calibration
remains a per-tenant onboarding task.

The confidence gate is covered by **10 passing verification checks**
(`tooling/gate/verify-gate.mjs`).

## Built and independently tested, not yet connected

These pieces are implemented and have their own verification suites, but are
**not** part of the standalone client path above — they are the backend and
encryption machinery the demo does not reach.

JavaScript suites — `pnpm verify` (all six exit 0 and print their own verdict line):

- **Encrypted sync protocol — 31/0** (`tooling/sync/verify-sync.mjs`)
- **Persistence adapters — 33/0** (`tooling/sync/verify-persistence.mjs`)
- **Key rotation and revocation — 13/0** (`tooling/sync/verify-rotation.mjs`)
- **Telemetry queue — 35/0** (`tooling/telemetry/verify-queue.mjs`)
- **Legacy keyword-parity rule — pass** (`tooling/eval/parity-check.mjs`)

PostgreSQL Command Center backend — migrations in `supabase/migrations`, run
against a throwaway Postgres via `pnpm verify:db`:

- **RBAC privilege matrix — 99/0**
- **Telemetry ingest + dashboards — 27/0** (was 17 at the 2026-09-25 baseline; the
  suite grew with the escalation console and ingest throttle)
- **RLS bypass attack suite — 40/0**
- **Retention — expiry + escalation redaction — 16/0**

## Helix Codex relationship

LIVE Support Assistant is **part of the Helix Codex / Helix Prime body of work** —
the same author and the same design philosophy (explainable, auditable, no
generative model in the answering path). It is an **independent repository with no
shared codebase, packages, or runtime infrastructure** with Helix Prime. There is
no code or dependency linking the two; "a component of Helix Codex" means portfolio
membership, not technical integration.

## Run from source

Install Node.js 22+ and pnpm 11.20.0+ ([pnpm.io](https://pnpm.io/)), then:

```bash
pnpm install
pnpm dev
```

Opens at **http://localhost:5173**. To exercise the hosted demo you also need a
`.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` pointing
at a Supabase project that has the `supabase/migrations` applied and a provisioned
user.

### Build a static bundle

```bash
pnpm build
```

Output lands in `apps/web/dist/`. Serve it with `npx serve apps/web/dist` or
`python -m http.server 8080 --directory apps/web/dist` (open **http://localhost:8080**).
The static bundle requires the Supabase build-time variables above; without them the
client throws on load.

## Deployment

The web client builds to a static `apps/web/dist` and is deployable to any static
host, but it is **not** a standalone client-side tool: every session is gated behind
Supabase sign-in and procedures are served from a tenant bundle on the hosted
backend. A GitHub Pages publish of the raw `dist` without those variables would fail
at load.

**Live and functioning (sign-in required):** https://dist-omega-black-31.vercel.app/
— confirmed from a clean, signed-out browser session on 2026-09-27: a genuine sign-in
form renders and unauthenticated access is rejected. There is no guest or public
account a stranger can use to pass the gate, so this is **not** an open "try it" demo.
The artifact a reviewer without an account should watch is a screen recording or GIF
walkthrough of the verified signed-in path; capture one before linking. To run your
own instance, supply the Supabase variables at build time and point at a project with
the migrations applied and a provisioned user.

## Stack

- React 19, TypeScript 6, Vite 8, Tailwind CSS v4
- Transformers.js 4.3 with a pinned MiniLM int8 model and ONNX Runtime
- pnpm workspaces with Turborepo
- PostgreSQL/Supabase Command Center schema with RLS and SQL ingest contracts
- No generative model in query, gate, answer, or escalation decisions

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | React web client (sign-in, on-device search, confidence gate, telemetry queue) |
| `apps/desktop` | Tauri shell hosting the web client |
| `apps/mobile` | Expo WebView shell |
| `packages/core` | Domain types, Confidence Gate, agent view, escalation record |
| `packages/embedder` | Pinned local embedding and evaluation models |
| `packages/vector-store` | Passage extraction and cosine retrieval |
| `packages/sync` | Canonical JSON, encrypted bundles, install pipeline, persistence, key rotation |
| `supabase` | Command Center migrations, fixtures, and database verification suites |
| `tooling` | Gate, parity, sync, persistence, rotation, telemetry, and database harnesses |
| `docs` | System design and measured operating decisions |

## Source boundary

Only publicly available TikTok LIVE Help Center content belongs in this project. Do
not add internal SOP codes, ticket-system references, team names, proprietary
terminology, or proprietary data.

The Community Guidelines appeal summary was checked against TikTok's public
[Content violations and bans](https://support.tiktok.com/en/safety-hc/account-and-user-safety/content-violations-and-bans)
help article on 2026-09-25. It is a dated snapshot, not a live policy feed.

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
