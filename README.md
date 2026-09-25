![License](https://img.shields.io/github/license/HatemIsmailShalaby1979/live-support-assistant)
![Release](https://img.shields.io/github/v/release/HatemIsmailShalaby1979/live-support-assistant)

# LIVE Support Assistant

**Status: shipped public demo. Snapshot 2026-08-27.**

Verified on 2026-08-27: the app runs from source with `npm run dev`, builds with
`npm run build`, and matches five publicly available TikTok LIVE policy entries
using keyword matching. Not verified: no client deployment, no production usage,
and no revenue.

LIVE Support Assistant is a component of **Helix Codex**. It is deliberately
modest: a small, explainable support prototype, not a platform. It exists to
demonstrate one engineering judgement. Start with the smallest useful system,
keep the behaviour inspectable, and add complexity only when a measured problem
justifies it.

## Download and run

- [Download current source ZIP](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/archive/refs/heads/main.zip)
- [View releases](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/releases)

### Run from source

Install Node.js 20 or newer from [nodejs.org](https://nodejs.org/), then:

```bash
npm install
npm run dev
```

Opens at **http://localhost:5173**.

### Build a static download

```bash
npm run build
```

Output lands in `dist/`. Serve it with either:

```bash
npx serve dist
```

```bash
python -m http.server 8080 --directory dist
```

Open **http://localhost:8080**.

## What it does

1. Paste a customer message into the input field
2. Click "Find Answer"
3. The assistant matches the message against 5 TikTok LIVE policy entries using keyword matching
4. It displays the matched policy, a suggested reply, and escalation status
5. Copy the reply to clipboard with one click

A message needs at least two keyword matches before an answer is returned. Below
that threshold the assistant reports that it cannot find a confident match and
asks for human review.

## Stack

- React 19
- TypeScript 6
- Vite 8
- Tailwind CSS v4
- Zero backend, everything runs client-side

## Source boundary

Only publicly available TikTok LIVE Help Center content belongs in this project.
Do not add internal SOP codes, ticket-system references, team names, proprietary
terminology, or proprietary data.

## Honest boundary

The assistant matches five policy entries and nothing more. It does not use a
language model, it does not handle account-specific cases, and it is not connected
to any ticketing system. Its answers can go stale because the policy text is
copied by hand from public help-centre pages. It is a demonstration of a matching
approach, not a support product.

This is not a production deployment claim. There is no external audit, no
certified data isolation, and no signed security review. No revenue has been
realised.

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
