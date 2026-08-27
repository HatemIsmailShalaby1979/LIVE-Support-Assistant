# LIVE Support Assistant

A working keyword-matching support assistant built with React, Vite, and TypeScript. Uses only publicly available TikTok LIVE Help Center content. A portfolio demo — not a production system.

## Quick Start

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

Output in `dist/` — deploy to any static hosting (GitHub Pages, Netlify, Vercel, etc.).

## What it does

1. Paste a customer message into the input field
2. Click "Find Answer"
3. The assistant matches against 5 TikTok LIVE policy entries using keyword matching
4. Displays the matched policy, a suggested reply, and escalation status
5. Copy the reply to clipboard with one click

## Tech stack

- React 19
- TypeScript 6
- Vite 8
- Tailwind CSS v4
- Zero backend — everything runs client-side

## Source boundary

Only publicly available TikTok LIVE Help Center content belongs in this project. Do not add internal SOP codes, ticket-system references, team names, proprietary terminology, or proprietary data.

## Repository status

This is a shipped public demo. It is not a claim of client deployment, production enterprise usage, or a reproduction of any private system.

Part of a larger body of work — see [Hatem Shalaby's profile](https://github.com/HatemIsmailShalaby1979) for the full story.
