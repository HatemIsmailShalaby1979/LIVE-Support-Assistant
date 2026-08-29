# LIVE Support Assistant

> **A small, explainable support experience for TikTok LIVE help content.**

LIVE Support Assistant is a browser-based support prototype. It matches a viewer question against five public TikTok LIVE Help Center articles and returns the relevant policy with a ready-to-send response.

It deliberately uses simple, inspectable matching—no hidden AI, no backend, and no proprietary data.

## Status

- Portfolio prototype
- Runs entirely in the browser
- Public help content only
- Not a production support system
- No ticket IDs, internal SOPs, or private customer data

## Download and run

- [Download current source ZIP](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/archive/refs/heads/main.zip)
- [View releases](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/releases)

### Windows and Linux from source

Install Node.js 20 or newer from [nodejs.org](https://nodejs.org/), then run:

    npm install
    npm run dev

Open the local URL shown by Vite, normally http://localhost:5173.

### Build a static download

    npm run build

The production files are written to dist/. Serve them with:

    npx serve dist

Or:

    python -m http.server 8080 --directory dist

Open http://localhost:8080.

## Why it belongs in the portfolio

This project demonstrates an important engineering judgment: start with the smallest useful system, keep behavior explainable, and add complexity only when the measured problem justifies it.

That principle continues into Helix Codex, where recommendations, evidence, approvals, and limitations remain visible to operators.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Zero backend

## Related work

- [Helix Prime](https://github.com/HatemIsmailShalaby1979/Helix-Prime)
- [Portfolio](https://github.com/HatemIsmailShalaby1979/HatemIsmailShalaby1979)

## License

MIT
