# LIVE Support Assistant

A keyword-matching support bot for TikTok LIVE. Built in an afternoon, shipped as a portfolio piece.

## What it does

Paste a viewer's question. Click "Find Answer." Get the matching help center policy and a ready-to-send reply.

That's it. No AI, no magic — just keyword matching against 5 public TikTok LIVE help articles. Runs entirely in the browser.

## Run it

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Build for production

```bash
npm run build
```

Output lands in `dist/` — drop it on GitHub Pages, Netlify, Vercel, whatever.

## Why this exists

Someone asked if I could build a support assistant. I said "sure" and built this to show how I'd approach it: simple, local, zero backend, explainable matching. Not a production system. A conversation starter.

## Stack

- React 19 + TypeScript 6
- Vite 8
- Tailwind CSS v4
- Zero backend

## Boundary

Only public TikTok LIVE Help Center content goes in here. No internal SOPs, no ticket IDs, no proprietary anything.

## License

MIT