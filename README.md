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

## Run locally

    npm install
    npm run dev

Build with npm run build. The output is written to dist/ for static hosting.

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