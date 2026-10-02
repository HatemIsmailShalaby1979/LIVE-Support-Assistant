# Known issues

Open limitations of the current build, each with the source that establishes it.
These are documented honestly; none is hidden behind a passing claim. Numbers are
reported exactly as measured on simulated or author-written data.

## 1. The web client never verifies its loaded model against the bundle manifest

`packages/embedder/src/model.ts:6-7` documents the contract: "Policy bundles carry
the same values and a client refuses to serve search when its loaded model does not
match the bundle manifest." The client does **not** enforce this.

- `apps/web/src/bundle-client.ts:233-234` reads only `bundleVersion` and `sops` from
  the manifest — never the embedding-model id or revision.
- `apps/web/src/App.tsx:384-386` records the model in telemetry from the build-time
  constant `EMBEDDING_MODEL`, not from the bundle.

Consequence: a bundle published with a different embedding model would still be
served against a mismatched local model, silently degrading scores. This is the
recorded-but-unexplained cause of the one historical deployed/local divergence
(deployed `0aec9773442c4282` answered at 0.180757 vs local 0.167715 on the same
ticket). See `tooling/eval/simulated-tenant/parity-results.md`.

## 2. The conflict lint parses English number words only

`tooling/conflicts/conflict-core.mjs:39-42` states the limitation in full: "Only
English number words are parsed. The corpus repeats every summary in [es, pt-BR,
fr], and those translations render their figures in their own number words
('dos a cinco', 'dois a cinco', 'deux à cinq'), which this module does not parse."

The `NUMBER_PATTERN` at `conflict-core.mjs:55` is built from an English word list
plus `\d+`. Two effects:

- A contradictory procedure written in a non-English summary is **not** caught by the
  lint, and therefore not refused at publish for that language.
- The matcher is a regex over free text, so prose that mentions a policy range
  ("do not use the two-to-five-business-day estimate") can be read as a policy fact
  and produce a false positive. `conflict-core.mjs:33-34` documents this directly.

The lint is the basis of the publish-path HTTP 422 block
(`supabase/functions/publish-bundle/index.ts`); its English-only gap therefore limits
how far that block protects a multilingual corpus.

## 3. Recall at 48 procedures: 84/302 in scope

`tag evidence/scale-rung (e5a7d9baf4f6)`,
[scale-rung-results.md](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/blob/evidence/scale-rung/tooling/eval/simulated-tenant/scale-rung-results.md): with escalation-by-construction
rows excluded, in-scope recall at the 48-procedure corpus is **84/302 (27.8%)** at the
shipped 0.18 margin (93/302 at 0.17). This is the largest corpus measured and it is
the weakest recall point. A 40–70-procedure tenant is a rung, not the 5,000-procedure
scale the Phase 1 open question names. See also `README.md` (claims table, Tier 2).

## 4. Non-English gap on the same corpus

`tag evidence/scale-rung (e5a7d9baf4f6)`,
[scale-rung-results.md](https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant/blob/evidence/scale-rung/tooling/eval/simulated-tenant/scale-rung-results.md): on the 48-procedure corpus at
0.18, accuracy is **English 62.1% vs Spanish 32.0% and Portuguese 31.0%**. The change
is confounded (a different and larger corpus), so it is not attributable to language
alone, but the gap is real on the measured data. French was not part of the
multilingual measurement batch.

## 5. Out-of-scope public questions still answered

`AGENTS.md` (real-phrased refusal set) and `README.md` (claims table): the
real-phrased refusal set shows **6 of 52 false accepts at 0.18** (7 at 0.17) — public,
out-of-scope queries that the system accepted and answered instead of refusing. The
gate is calibrated for in-scope tenant procedures, not for deflecting every off-topic
question. Source:
`tooling/eval/simulated-tenant/real-phrased-label-results.md`.

## 6. No real-tenant calibration

`packages/core/src/types.ts` (`minMargin: 0.18`) is a **prototype default**, not a
value fitted to a customer. No tenant has been calibrated: there is no design partner,
no pilot customer, and no production traffic. 0.17 is a harness-only evaluation value
and must never be presented as a tenant setting. Per-tenant threshold tuning remains an
onboarding task. See `README.md` (Tier 3 — NOT PROVEN) and `docs/PRODUCTION_STATUS.md`.

## 7. Hosted transport not wired into the standalone demo

`proof-of-concept.md:210` and `README.md:84`: the backend verification suites (RBAC,
RLS, telemetry, retention, encrypted sync, key rotation, telemetry queue,
conflicting-procedure lint) pass independently, but the hosted transport that would
connect them to the running client is **not wired into the standalone demo**. A query's
telemetry or escalation is not actually delivered to the live backend in the demo path;
the deployed path (public Vercel app + development Supabase) is the only place the full
round trip is exercised. This is a demo limitation, not a backend failure.

## 8. The demo-video tooling is Windows-only

`tooling/video/` builds the narrated walkthrough, and two of its scripts assume Windows:

- `tooling/video/capture-demo.mjs:15-18` searches only
  `C:\Program Files\Google\Chrome\Application\chrome.exe` and the `Program Files (x86)`
  equivalent, and throws "Google Chrome was not found in either standard Windows install
  path" otherwise. The evaluation driver next to it also checks `%LOCALAPPDATA%`, so the
  two differ in how portable they are.
- `tooling/video/gen-titlecards.py:18-21` loads Arial from `C:\Windows\Fonts\`, so title
  cards cannot be generated off Windows without editing those paths.

`assemble-video.py` (ffmpeg via `shutil.which`) and `gen-audio.py` (edge-tts) are portable.
Consequence: the walkthrough can be re-rendered on Windows only, as written. This affects
build tooling, not the shipped decision path or any measured claim.

## 9. Accepted dependency advisory — GHSA-86w9-cpqp-85rv (node-forge, High)

Accepted as a known risk on 2026-10-02: the advisory (CVE-2026-85393, affected
`<=1.4.0`) has no patched release — `1.4.0` is the latest on npm — and it reaches the
build only through the unbuilt `@sop/mobile` app via Expo tooling
(`@expo/code-signing-certificates`, `selfsigned`); it is absent from the web app, the
desktop shell, and every `apps/*/src` / `packages/*/src` import, so it is off the
ticket-processing and credential path. Review by 2026-10-30; re-check with
`pnpm why node-forge` and `pnpm audit --prod`, and the accepted id stays in
`tooling/audit-baseline.json` so the gate stays green without hiding new advisories.
