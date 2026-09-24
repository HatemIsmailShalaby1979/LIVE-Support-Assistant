# LIVE Support Assistant

**Status: shipped public demo. Snapshot 2026-08-27.**

Verified on 2026-08-27: the app runs from source with `npm run dev`, builds with `npm run build`, and matches five publicly available TikTok LIVE policy entries using keyword matching. Not verified: no client deployment, no production usage, and no revenue.

LIVE Support Assistant is a component of **Helix Codex**. It is deliberately modest: a small, explainable support prototype, not a platform.

## Quick start

### Run from source

```bash
npm install
npm run dev
```

Opens at **http://localhost:5173**.

### Build for production

```bash
npm run build
```

Output lands in `dist/` and can be deployed to any static host (GitHub Pages, Netlify, Vercel, and similar).

## What it does

1. Paste a customer message into the input field
2. Click "Find Answer"
3. The assistant matches the message against 5 TikTok LIVE policy entries using keyword matching
4. It displays the matched policy, a suggested reply, and escalation status
5. Copy the reply to clipboard with one click

A message needs at least two keyword matches before an answer is returned. Below that threshold the assistant reports that it cannot find a confident match and asks for human review.

## Tech stack

- React 19
- TypeScript 6
- Vite 8
- Tailwind CSS v4
- Zero backend, everything runs client-side

## Source boundary

Only publicly available TikTok LIVE Help Center content belongs in this project. Do not add internal SOP codes, ticket-system references, team names, proprietary terminology, or proprietary data.

## Honest boundary

The assistant matches five policy entries and nothing more. It does not use a language model, it does not handle account-specific cases, and it is not connected to any ticketing system. Its answers can go stale because the policy text is copied by hand from public help-centre pages. It is a demonstration of a matching approach, not a support product.

This is not a production deployment claim. There is no external audit, no certified data isolation, and no signed security review. No revenue has been realised.

## The founder's story

I spent twenty-eight years in contact-centre operations and workforce management.
Forecasting, scheduling, adherence, service levels, churn. The same problems
appeared in every company I worked in, and none of the tools solved them properly.

In April 2026 I left that career and started building full time — alone, and
teaching myself to write software as I went. The first four tools were published
six weeks later, in May and June 2026. Each one took a single operational problem
and solved it properly. They were not impressive. They were correct.

Those four tools converged into one idea: **Helix Codex**, an accountable AI
operating organization. Not an autonomous agent. An organization with a
constitution, named roles with bounded authority, evidence trails, and a human at
every consequential boundary. Helix Prime is its operations core.

LIVE Support Assistant is a component of Helix Codex. It is maintained by one person, with no team and
no funding. It has not been externally audited and it has not made revenue. Where
it is unfinished, this document says so.

## Related work

- [Helix Prime](https://github.com/HatemIsmailShalaby1979/Helix-Prime) — the operations core
- [Helix Education](https://github.com/HatemIsmailShalaby1979/Helix-Education) — event-sourced learning engine
- [Study Studio](https://github.com/HatemIsmailShalaby1979/Study-Studio) — local-first AI tutor
- [L&D Command Center](https://github.com/HatemIsmailShalaby1979/L-D-Command-Center) — desktop learning and career workstation
- [Blue Waves](https://github.com/HatemIsmailShalaby1979/Blue-Waves-) — content studio
- [Full portfolio](https://github.com/HatemIsmailShalaby1979) — the front door

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

Based in Al Obour City, Al-Qalyubia Governorate, Egypt.

## Licence

MIT
