![License](https://img.shields.io/github/license/HatemIsmailShalaby1979/live-support-assistant)
![Release](https://img.shields.io/github/v/release/HatemIsmailShalaby1979/live-support-assistant)

# LIVE Support Assistant

**Status: enterprise rebuild in progress; current local prototype verified
2026-09-25.**

Verified: the pnpm/Turborepo workspace builds, the confidence gate has 10 passing
verification checks, the encrypted sync protocol has 31 passing checks, and the
PostgreSQL RBAC, telemetry, and RLS-bypass suites pass 99/17/40 locally. Not
verified: no hosted Supabase runtime, no authenticated bundle or telemetry
transport, no signed installer, no production usage, and no revenue.

LIVE Support Assistant is a component of **Helix Codex**. It remains a small,
explainable support prototype rather than a production platform. The current
implementation uses a local embedding model, passage retrieval, and a
deterministic gate; it uses no generative language model.

## Download and run

- [Download current source ZIP](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/archive/refs/heads/main.zip)
- [View releases](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/releases)

### Run from source

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/) and pnpm from
[pnpm.io](https://pnpm.io/), then:

```bash
pnpm install
pnpm dev
```

Opens at **http://localhost:5173**.

### Build a static download

```bash
pnpm build
```

Output lands in `apps/web/dist/`. Serve it with either:

```bash
npx serve apps/web/dist
```

```bash
python -m http.server 8080 --directory apps/web/dist
```

Open **http://localhost:8080**.

## What it does

1. Click **Load model and build index** to start the on-device search runtime.
2. Paste a customer message and click **Find Answer**.
3. MiniLM embeds the message and retrieves relevant passages from five public TikTok LIVE policy entries.
4. The deterministic Confidence Gate either returns a policy and suggested reply or escalates without exposing procedure content.
5. Copy an accepted reply to the clipboard.

The confidence gate requires an absolute floor and a measured margin between the
best and second-best procedure. On the current five-entry evaluation corpus, the
lowest audited fixed prototype margin (0.18) auto-answers 8 of 50 in-scope
queries with no measured wrong procedure or out-of-scope acceptance. A correct
match to a policy that explicitly requires human review is escalated instead of
counted as an auto-answer. These are in-sample prototype results, not a
production SLA, and threshold calibration remains a per-tenant onboarding task.

## Stack

- React 19, TypeScript 6, Vite 8, and Tailwind CSS v4
- Transformers.js 4.3 with a pinned MiniLM int8 model and ONNX Runtime
- pnpm workspaces with Turborepo
- PostgreSQL/Supabase-oriented Command Center schema with RLS and SQL ingest contracts
- No generative model in query, gate, answer, or escalation decisions

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | React web client and local telemetry queue |
| `apps/desktop` | Tauri shell hosting the web client |
| `apps/mobile` | Expo WebView shell |
| `packages/core` | Domain types, Confidence Gate, agent view, and escalation record |
| `packages/embedder` | Pinned local embedding and evaluation models |
| `packages/vector-store` | Passage extraction and cosine retrieval |
| `packages/sync` | Canonical JSON, encrypted bundles, install pipeline, persistence, and key rotation |
| `supabase` | Command Center migrations, fixtures, and database verification suites |
| `tooling` | Gate, parity, sync, persistence, rotation, telemetry, and database harnesses |
| `docs` | System design and measured operating decisions |

## Source boundary

Only publicly available TikTok LIVE Help Center content belongs in this project.
Do not add internal SOP codes, ticket-system references, team names, proprietary
terminology, or proprietary data.

The Community Guidelines appeal summary was checked against TikTok's public
[Content violations and bans](https://support.tiktok.com/en/safety-hc/account-and-user-safety/content-violations-and-bans)
help article on 2026-09-25. It is a dated snapshot, not a live policy feed.

## Honest boundary

The assistant searches five policy entries and nothing more. It does not use a
generative language model, handle account-specific cases, authenticate tenants,
or connect to ticketing. Query evaluation is local to the current web client,
but first use contacts Hugging Face and jsDelivr for model/runtime downloads,
and blocked-query evidence is retained in browser storage. No Command Centre
transport is configured, so queued items are never presented as delivered.

This is not a production deployment claim. There is no external audit, hosted
Supabase runtime, certified data isolation, or signed security review. No
revenue has been realised.

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
