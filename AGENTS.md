# AGENTS.md — build ledger

Repository ledger for `live-support-assistant`, maintained by the agent. Read
this first in any new session; update it at the end of every completed step.

## Standing authorization

- Commits inside this repository are authorized for sanctioned work.
- Pushes, releases, and anything public are **not** authorized. Ask first.
- No destructive operation on personal directories, ever.

## Repository

| Path | Contents |
| --- | --- |
| `apps/web` | React 19 + Vite client (`@sop/web`) — the shipped prototype |
| `packages/core` | `@sop/core` — domain types, Confidence Gate, scoring |
| `packages/embedder` | `@sop/embedder` — pinned local embedding (transformers.js, ONNX) |
| `packages/vector-store` | `@sop/vector-store` — passage extraction, cosine retrieval |
| `packages/sync` | `@sop/sync` — encrypted bundle protocol: canonical JSON, crypto, install pipeline, server publish |
| `tooling/eval` | Parity harness, golden set, retrieval evaluation, simulated-tenant evaluation (label fix, real-phrased scorer) |
| `tooling/conflicts` | `lint-procedure-conflicts.mjs` — same-category numeric policy conflicts; `verify-conflict-lint.mjs` — regression test |
| `tooling/sync` | `verify-sync.mjs` — the 31-check sync verification |
| `tooling/db` | `verify-phase7.sh` — brings up PostgreSQL, applies everything, runs all three SQL suites. `verify-phase2.sh` and `verify-phase5.sh` are subsets of it, kept for focused reruns |
| `tooling/run-verification.mjs` | **The gate.** Runs all seven JS harnesses and requires both exit 0 and each suite's own verdict line |
| `tooling/audit-gate.mjs` | Dependency gate: fails on new or escalated advisories vs `tooling/audit-baseline.json` |
| `tooling/db/verify-hosted.sh` | Runs all three SQL suites against a real Supabase project over the session pooler, and removes the probe functions afterwards |
| `tooling/db/provision-hosted-fixtures.mjs` | Creates the seven fixture principals through the Auth Admin API, because a hosted project will not let us choose their UUIDs |
| `.github/workflows/ci.yml` | Four required jobs: workspace, database, desktop, audit |
| `supabase/config.toml` | CLI project config. Note `app` is listed in the exposed schemas, without which every RPC is unreachable. **Never `supabase config push` it against a hosted project — see the transport record** |
| `.env.example` | Environment contract. Two variables are read by code; the rest are reserved and labelled |
| `docs` | System design documents |
| `supabase` | `migrations/`, `seed/`, `tests/` — the Command Center schema and its RBAC matrix. Edge functions are Phase 3/5. |

Toolchain: Node ≥ 22, pnpm 11.20.0, Turborepo 2.11.4, Docker 29.8.0, Rust 1.98.1
(stable-x86_64-pc-windows-msvc, installed 2026-09-25 — MSVC linker via VS 2022
Community, already on the host).

## Phase status

Source: `docs/SYSTEM_DESIGN.md` §8, §10, §11, §12.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Monorepo scaffold, `packages/core` extraction, parity verified | **complete** (2026-09-25) |
| 1 | Edge embedder, passage-level cosine retrieval, threshold calibration | **complete with one unmet criterion** (2026-09-25; remeasured on completed corpus) — see below |
| 2 | Command Center: schema, RLS, SOP lifecycle, RBAC matrix | **complete** (2026-09-25) — 99 probes, 0 failures |
| 3 | Encrypted sync engine | **complete** (2026-09-25) — 31 checks, 0 failures; no transport or device persistence |
| 4 | Confidence Gate UI + escalation flow | **complete** (2026-09-25) — 10 gate checks, 0 failures; manual-review SOPs content-free; full browser model/query/retry path verified |
| 5 | Telemetry + threshold-failure dashboard | **complete** (2026-09-25) — 27-probe DB matrix, 0 failures; client queue built + wired; transport + Supabase runtime still unbuilt |
| 6 | Tauri + Expo packaging | **complete** (2026-09-25) — debug and release desktop binaries linked; persistence adapters 33/0; mobile typechecked (Metro/native packaging still blocked) |
| 7 | Hardening and audit | **complete** (2026-09-25; re-verified 2026-09-27) — rotation 13/0; DB write-boundary + RLS suites 99/0, 27/0, 40/0; queue 35/0; retention 16/0 |

## Phase 0 record — 2026-09-25

**Executed.** Root Vite app moved to `apps/web` via `git mv` (history preserved);
`packages/core` created; npm replaced by pnpm workspaces + Turborepo;
`package-lock.json` and the npm `node_modules` tree removed.

**Verified.**

1. `pnpm install` — clean, 174 packages, pnpm 11.20.0.
2. `pnpm -r run build` — green: `@sop/core` (tsc) then `@sop/web` (tsc -b && vite
   build), 21 modules transformed, `apps/web/dist` emitted.
3. `node tooling/eval/parity-check.mjs` — 25 queries, **0 mismatches**. Answered
   procedure ids and hit counts identical to the pre-migration rule, including
   the below-bar block paths, the document-order tie at two hits
   (`appeal guidelines penalty` → procedure 2), and case-insensitive input.
4. `turbo run build --dry=json` — task graph correct: `@sop/web#build` declares
   `dependencies: ["@sop/core#build"]`; framework inferred as `vite`.

**Not verified / blocked.**

- `turbo run build` itself failed on this host with
  `All pipe instances are busy. (os error 231)` when spawning any child process,
  including a single filtered task and with `--concurrency=1`. The identical
  build succeeded once earlier in the same session (`Tasks: 2 successful, 2
  total`), so this is intermittent Windows resource exhaustion in the host, not
  a repository defect. Use `pnpm -r run build` as the fallback runner on this
  machine.
- The dev server was not exercised through Turbo for the same reason.

**Deviations from the design document.**

- `apps/web/tsconfig.app.json` still stands alone rather than extending
  `tsconfig.base.json`, and it does not enable `strict`. Carried over unchanged
  from the prototype to keep Phase 0 behaviour-neutral. Adopting the shared base
  config is a Phase 1 cleanup item.
- `SopDocument.triggerKeywords` and `scoreByKeywords` are explicitly
  transitional. `LEGACY_GATE_CONFIG.thresholdAccept = 1` reproduces the legacy
  two-hit bar; Phase 4 replaces the scorer and removes the field.

## Phase 1 baseline record — placeholder corpus, superseded by the final review record (2026-09-25)

**Executed.** `@sop/embedder` (pinned MiniLM int8 via transformers.js 4.3.0) and
`@sop/vector-store` (passage extraction + brute-force cosine) built; golden set of
50 in-scope and 15 out-of-scope queries written; `tooling/eval/semantic-eval.mjs`
produced retrieval, latency, scale and calibration measurements.

**Verified.**

1. Recall@5 **100%** semantic vs **20%** keyword — a delta of **+80 points**.
   The keyword matcher returned no candidate at all for 38 of 50 real customer
   messages.
2. Query embed + search p95 **3.3 ms**; model load 508 ms cold; batch throughput
   526 passages/sec; projected 5,000-procedure index build 41.8 s. All well
   inside the criteria.
3. Search over 10,000 vectors: 9.2 ms mean. Flat and predictable.
4. `node tooling/eval/parity-check.mjs` still reports 25 queries / 0 mismatches
   after the gate was rewritten, so the legacy path is intact.

**Criterion not met.**

- "A gate at ≥0.95 precision answering ≥50% of in-scope queries" — the best
  measured operating point answers **15/50 (30%)** at precision 1.000.

**Design change forced by measurement.** The 0.90 absolute cosine threshold in
the design document answered **0 of 50** in-scope queries: MiniLM's absolute
similarity scale is compressed and corpus-dependent, and the in-scope and
out-of-scope distributions overlap almost entirely (in-scope min 0.217 vs
out-of-scope max 0.460). The gate now requires **both** an absolute floor and a
top-1-minus-top-2 **margin**, defaulting to `thresholdAccept: 0`,
`minMargin: 0.15`. Swept across floors 0.10–0.45 the floor never changed a
decision — it is inert on this corpus and kept only as a tenant-raisable guard.
`docs/SYSTEM_DESIGN.md` §4 and §10 carry the full evidence.

**Open question this phase could not settle.** The margin statistic is weak over
five candidate procedures, and the out-of-scope queries are topically adjacent
hard negatives. Whether margin separates better at enterprise corpus size is
**unmeasured**. Re-calibrate per tenant; do not port 0.15 across deployments.

**Recommended next step before Phase 2.** The 30% auto-answer rate is a product
problem that Phase 2 would otherwise build lifecycle management on top of. Test a
cross-encoder reranker over the top-20 candidates, or swap to `bge-small-en-v1.5`
/ `e5-small-v2` at int8 — both are the same order of magnitude in size and are
trained for retrieval rather than sentence similarity.

## Phase 1 second pass — placeholder corpus, methodology superseded (2026-09-25)

The two recommendations above were tested. **Neither improved the 30% answer
rate.** Negative results, recorded as such; full detail in
`docs/SYSTEM_DESIGN.md` §11.

| Lever | Result |
|---|---|
| Retrieval-trained bi-encoder | `bge-small-en-v1.5` and `e5-small-v2` raised recall@1 72% → **76%** but dropped the calibrated answer rate to **10%** and **6%**. MiniLM stays the default. |
| Cross-encoder reranking | `ms-marco-MiniLM-L-6-v2` over top-20 **reduced** recall@1 72% → **58%** and the answer rate to **6%**. |
| Global threshold | Hold-out validation: margin stable at 0.135–0.145, but held-out precision fell to **0.909** in one fold. Not reliably shippable. |

`tooling/eval/reranker-sanity.mjs` confirms the reranker's query/passage pairing is
correct — the right passage scores above the wrong one — but its scores are
compressed to near zero (0.0002 vs 0.0002 on one pair), i.e. far outside its
trained regime. Reranking is not disproven in general, only as configured here.

**The lesson that matters:** recall and gate separability are different
objectives. Every model swap improved retrieval and degraded the confidence
signal. The product runs on the second one.

**Corrected position.** The 30% rate is a property of the corpus and the margin
statistic, not of the model. With five procedures the top-1/top-2 margin is weak.
The highest-value untested unknown is **corpus size**: a 5,000-procedure tenant
may separate far better. That experiment requires a realistic corpus and is Phase
2 work.

**Two decisions follow, and they need the owner's sign-off:**

1. Threshold calibration moves from a shipped default to a **per-tenant
   onboarding step**. The shipped `minMargin: 0.15` is a starting point, not a
   validated constant.
2. The escalation path is designed as the **primary experience**, not the
   fallback. At a third deflection with zero measured errors, the handover is the
   product.

**Do not repeat these experiments.** Model swapping and cross-encoder reranking
have both been measured and rejected on this corpus.

## Phase 2 record — 2026-09-25

**Executed.** Six migrations, fixtures, and a 59-probe RBAC matrix, all run
against PostgreSQL 17 in Docker. Reproduce with:

```bash
bash tooling/db/verify-phase2.sh
```

The script drops and recreates the database first, so the result cannot pass
because of leftover state.

**Verified: 65 probes, 0 failures** — tenant isolation 12/12, sop content roles
10/10, telemetry append-only 9/9, telemetry idempotency 4/4, escalations 7/7,
bundle publishing 4/4, device enrolment 2/2, privilege audit 17/17.

**The suite can fail.** Two deliberate negative controls were run: asserting that
an agent may insert a procedure reported `denied:privilege, ok = false`; asserting
999 visible telemetry rows when 3 exist reported `rows:3, ok = false`. A suite
that has never failed is not evidence, so this matters as much as the pass.

**Guarantees now proven, not asserted:**

1. Tenant isolation holds against the strongest role — Beta's ops manager cannot
   read, update, or insert into Alpha's tenant, across all nine tables.
2. Append-only telemetry is guaranteed twice: no UPDATE/DELETE policy exists, and
   no UPDATE/DELETE privilege is granted. A careless future policy cannot restore
   the verb.
3. Agents, team leads and auditors cannot author procedure content.
4. Only an ops manager can publish a bundle.
5. Bundle versions are monotonic and gap-free, enforced by trigger.
6. Frontline agents see zero telemetry rows.
7. Partition routing verified — events landed in `telemetry_events_2026_09`.

**Schema corrections carried into `docs/SYSTEM_DESIGN.md` §6 and §13.** The original
§6 was wrong twice, and the second error only surfaced after attempting the
"correct" fix for the first. Both are now measured, not reasoned.

1. **`telemetry_events` cannot have `id` unique while partitioned on
   `occurred_at`.** PostgreSQL: `unique constraint on partitioned table must
   include all partitioning columns`. There is no global unique index across
   partitions. Idempotency therefore lives in `telemetry_ingest_dedup` — an
   unpartitioned table with `primary key (id)` — and ingest goes through
   `app.ingest_telemetry_event()` so the claim and the insert cannot half-apply.
   The rejected alternative, `on conflict (id, occurred_at)`, only holds if the
   client resends a byte-identical timestamp; a client that regenerates it writes
   a duplicate audit row with the same id and a different time.

2. **Do NOT add a foreign key into `telemetry_events`.** A composite FK into a
   partitioned table is legal and PostgreSQL enforces it — and then propagates a
   separate constraint onto *every partition*. Each of those depends on its
   partition, so `drop table telemetry_events_2026_09` is refused **even when no
   escalation references it any more**; the dependency is structural, not
   data-dependent. `CASCADE` would silently drop the FK from `escalations`.
   Retention by partition drop and a foreign key into a partitioned table are
   mutually exclusive. Integrity is enforced at write time by
   `app.enforce_escalation_event_exists()` instead, which also verifies the event
   belongs to the same tenant — something an FK would never have checked.

3. **That trigger must be `SECURITY DEFINER`.** Written as the invoker, it
   rejected every legitimate escalation with `23503`: the check reads
   `telemetry_events`, and the role that creates escalations — the frontline
   agent — cannot read telemetry by policy. An integrity check must not be subject
   to the caller's read policy.

`escalations` carries `query_occurred_at` (provenance, identifies the partition)
and an `evidence jsonb` snapshot, so an escalation is self-contained and survives
retirement of the telemetry it came from. Phase 5 must populate `evidence`.

**Not verified.** No Supabase project exists: the local `auth` shim reproduces the
claim-reading contract, but JWT signing, connection pooling and PostgREST are
platform concerns and remain untested. The web client is still on the Phase 0
keyword path — nothing in Phase 2 is wired to the app yet.

**Local test infrastructure.** Container `sop-pg-test`, image `postgres:17-alpine`,
port 55432. It is a throwaway test database and can be removed with
`docker rm -f sop-pg-test`.

## Phase 3 record — 2026-09-25

**Executed.** `packages/sync` holds both halves of the bundle protocol — canonical
JSON, the crypto primitives, the client install pipeline, an in-memory store, and
the server publish path. Migration `0008_bundle_publish.sql` adds the database
half. Reproduce with:

```bash
pnpm build && node tooling/sync/verify-sync.mjs
```

**Verified: 31 checks, 0 failures.** All four exit criteria:

| Criterion | Evidence |
|---|---|
| offline install on reconnect | device holds v1 through the outage, queued v2 installs on reconnect |
| signature tamper rejected | modified manifest and foreign signing key both `signature_invalid` |
| non-monotonic version rejected | replayed v1 and stale v1-after-v2 both `not_monotonic` |
| failed decrypt leaves the previous bundle active | `decrypt_failed`, active still v1, commit count unchanged |

Supporting: the ciphertext was decoded and searched for procedure text and
contains none; the decrypted corpus matches the source field by field; every
rejection is asserted on both the reason *and* the fact that the store did not
move.

**Correction to design §3, carried into the document.** §3 said the content key is
"wrapped (RFC 3394) for each enrolled device's public key". RFC 3394 is
symmetric — it cannot wrap for a public key. A capability probe confirmed Ed25519,
X25519, AES-KW, AES-256-GCM and HKDF are all available, and the implemented
construction is ECDH → HKDF-SHA256 → AES-KW. X25519 was chosen over RSA-OAEP
because its public keys are 32 bytes rather than 294.

**The case that justifies the pipeline order.** A signature alone cannot catch a
compromised server that re-signs a payload it cannot produce. The harness builds
exactly that — corrupted ciphertext, a manifest whose `payloadHash` matches it,
signed with the real tenant key — and the client rejects it at `decrypt_failed`,
keeping v1 active. Hash the ciphertext before unwrapping; treat the GCM tag as a
hard gate.

**A test bug worth remembering.** Two probes first failed with `not_monotonic`
where `payload_hash_mismatch` and `key_unwrap_failed` were expected. The pipeline
checks in a fixed order — signature, version, payload hash, unwrap, decrypt — and
the probes used a version equal to the active one, so the version check fired
first. **Any probe must clear the checks preceding the one it targets**, and
should run both against a fresh client and against a client already serving a
bundle.

**Database half.** `app.next_bundle_version`, `app.enrolled_devices`,
`app.publish_policy_bundle`. The version helper is not atomic alone and does not
need to be — the trigger from `0003` rejects anything that is not exactly max + 1,
so concurrent publishers produce one success and one error, never a duplicate or a
gap. RBAC matrix now **69 probes, 0 failures**, including proof that the tenant
*argument* of `enrolled_devices` cannot read another tenant's roster.

**Not verified — do not claim otherwise:**

- **No transport.** Bundles are passed as objects. No WebSocket push, no HTTP
  pull, no retry or backoff.
- **No device persistence.** `MemoryBundleStore` stands in for IndexedDB and
  SQLite. The atomic-swap guarantee that matters on a real device is the hard part
  of Phase 6.
- **No revocation.** Removing a device stops future wrapping but does not re-key
  the tenant; a removed device can still read bundles it already holds. Key
  rotation is Phase 7 and is not started.
- **No Supabase runtime.** Nothing has run as an edge function.

## Phase 4 record — 2026-09-25

**Executed.** The Phase 1 gate is now a type and a surface, and the client calls
it. Reproduce the gate proof with:

```bash
node tooling/gate/verify-gate.mjs
```

**Verified: gate suite 10 checks, 0 failures.** The 65-query harness walked at the
0.18 prototype margin: 8 auto-answers, 57 escalations, of which 3 are confident
matches to SOPs whose own policy requires human review. Every escalation
`AgentView` was serialised and scanned for all procedure text, every passage, and
the query string — **0 found**. The determinism check ran 20 queries against two
independent in-memory indexes: zero score or decision mismatches.

**Manual-review boundary.** `buildAgentView` now returns the content-free
`manual_review_required` escalation whenever a confident SOP has
`escalationRequired = true`. The operations record still carries the query and
candidate passages. The 9-check suite proves manual-review SOPs never become
answers and their escalation records retain candidates.

**Client.** `apps/web/src/App.tsx` uses an explicit, dynamically imported model
load; `searchTopK` → `evaluateGate` → `buildAgentView` → local queue. Loading
progress, load/query errors, retry, stale-answer clearing, clipboard failure, and
empty-input states are explicit. The telemetry no-op was removed: queued items
stay local and are never presented as delivered.

**Migration `0009_threshold_audit.sql`.** `tenant_threshold_changes` + the
`app.audit_threshold_change()` trigger on `tenants` — every gate-parameter change is
recorded with who and the before value, append-only by privilege. RBAC matrix is
now **99 probes, 0 failures** (threshold-audit section 5/5); re-run with
`bash tooling/db/verify-phase2.sh`.

**Browser verification — complete for the current web path.** Headless Chrome
observed 0 model requests before activation, then loaded the real MiniLM/ONNX
stack, rendered an audited safe answer, and rendered a manual-review escalation
with no title, passage, or suggested reply. A blocked-host fault produced the
retry state and recovered to ready. All runs finished with 0 console errors and 0
failed responses.

**Still not verified.**
- Escalation/query transport to a hosted Supabase runtime.
- Per-tenant threshold persistence; the 0.18 slider remains local-only.
- `BUNDLE_VERSION` is a constant (1) until authenticated bundle transport lands.

## Phase 5 record — 2026-09-25

**Executed.** The client emits a telemetry event per query and an escalation
record per refused query. The SQL ingest contracts and operations views are
verified against PostgreSQL; the current client retains both locally because no
network transport is configured. Reproduce the server half with:

```bash
bash tooling/db/verify-phase5.sh
```

**Verified: 17 probes, 0 failures** (`supabase/tests/phase5_telemetry.sql`, real
PostgreSQL 17, DB dropped + recreated each run):

| Section | Result |
|---|---|
| escalation ingest | 6/6 — first ingest accepted; replay of the same id rejected; exactly one row; `evidence` jsonb persisted verbatim (reason, bundleVersion, 2 candidates) |
| escalation integrity | 3/3 — orphan event (FK miss) rejected `foreign_key_violation`; another tenant's event rejected (trigger checks tenant, an FK could not); no-tenant-claim rejected `insufficient_privilege` |
| ingest contract | 2/2 — malformed query and escalation evidence payloads rejected with `22023` |
| ops dashboard | 4/4 — `ops_escalation_dashboard` shows the `insufficient_margin` group; `ops_gate_funnel` shows the day with queries=1/escalated=1; `ops_threshold_changes` shows the ops-manager's margin move |

**Server half.** Migration `0010_escalation_ingest.sql`: `app.ingest_escalation`
(SECURITY DEFINER, idempotent on `escalations.id` via `on conflict (id) do
nothing`, populates `evidence`). `escalations` is NOT partitioned, so the simple
idempotent form is correct — the dedup-ledger form from §13 only exists because
`telemetry_events` is partitioned. Three views: `app.ops_escalation_dashboard`
(reason × bundle_version × min_margin × model), `app.ops_gate_funnel`
(queries/answered/escalated per day from `telemetry_events.payload.outcome`), and
`app.ops_threshold_changes` (append-only audit from 0009). RLS scopes every view
to the caller's tenant, so an ops manager sees only their own.

**Client half.** `apps/web/src/telemetry.ts` — `TelemetryQueue` (localStorage-
backed, survives reload), `Transport` (the integration seam), and
`QueryTelemetryEvent`. Flush is ordered events-then-escalations so the referenced
query event exists before the escalation names it. `App.tsx` generates UUID event
and escalation ids with `crypto.randomUUID()`, enqueues both, and labels the
queue **local only**. `NoopTransport` and the destructive "Sync now" control were
removed; no success is simulated. Phase 7 retry/backoff, overflow, and ordering
remain active; queue verification is 30/0.

**Not verified — stated honestly.**
- **No real transport.** The queue has no network send path and is never drained by
  the client. The server destination is proven by `verify-phase5.sh`; a hosted
  Supabase Edge Function and authenticated client transport remain unbuilt.
- **No Supabase runtime.** The views and functions are untested as edge functions.
- Phase 5's original lack of retry/backoff and size guards is **superseded by the
  Phase 7 record**; those are no longer pending work.

## Phase 6 record — 2026-09-25

**Prerequisite.** Rust was installed on the host this session: rustup 1.98.1,
`stable-x86_64-pc-windows-msvc`, minimal profile. The MSVC linker was already
present (VS 2022 Community with the VC++ tools component, verified via
`vswhere`). Tauri icon set generated from a square PNG written programmatically
(`hero.png` was not square).

**Executed.** `apps/desktop` — a Tauri v2 shell (`src-tauri`: Cargo.toml,
build.rs, `tauri.conf.json`, a command-less `main.rs`) whose `frontendDist` is
`apps/web/dist`. One engine, three platforms: the shell hosts the same web
bundle the browser runs. `apps/mobile` — an Expo (SDK 51) shell whose screen is
a WebView over the tenant-configured engine origin (`EXPO_PUBLIC_ENGINE_ORIGIN`,
inlined at bundle time). `packages/sync` — the two production `BundleStore`
adapters Phase 3 deferred: `IdbBundleStore` (single-record single-transaction
atomic swap) and `SqliteBundleStore` (one row, one `INSERT OR REPLACE`, driver
injected so the package keeps zero platform dependencies).

**Verified.**

1. `cargo build` — the desktop shell **compiles and links**:
   `target/debug/sop-desktop.exe` (19 MB, debug). Release + NSIS bundling not
   run.
2. `node tooling/sync/verify-persistence.mjs` — **19 checks, 0 failures**. Both
   adapters driven through the REAL install pipeline (`installBundle`), not
   mocks of it: first install, upgrade, field-for-field corpus round-trip,
   corrupted bundle rejected with the previous bundle left active, and state
   surviving a store restart. `MemoryBundleStore` asserted to lose state on
   restart — the documented limitation the adapters remove.
3. Mobile: `tsc --noEmit` green (strict).

**Not verified — stated honestly.**

- **No packaged desktop installer.** Debug and optimized `sop-desktop.exe` binaries
  compile and link, but the Tauri command uses `--no-bundle`; NSIS/code signing and
  runtime behaviour under WebView2 remain unexercised. The claim is not ship.
- **No native mobile build.** Android SDK / Xcode absent on this host. Expo's
  Metro bundler also failed to resolve `@babel/runtime` through pnpm's symlinks
  on Windows (the file demonstrably exists at the linked path; Metro does not
  follow it). Known fix is `node-linker=hoisted` for the Expo app, which would
  re-layout the workspace's verified installs — deferred, not silently dropped.
- **The SQLite adapter ran against a driver double**, not real expo-sqlite; the
  SQL is standard and minimal, but the real driver integration is untested.
- Device-key persistence ( enrolment keys surviving reinstall) is unsolved —
  the stores hold bundles, not device identities.

**Host notes for the next session.** `cargo build` failed twice on host-side
noise, not repo defects: a poisoned schemars registry cache (see Phase 7
record's workaround note) and a Windows permission-denied lock on a `wry`
object file that cleared after deletion. The intermittent `EBUSY` /
"All pipe instances are busy" failure also hits `spawnSync` from Node when
another build runs concurrently — serialise builds on this machine.

## Phase 7 record — 2026-09-25

**Executed.** Three hardening workstreams plus the attack suite:

1. **Key rotation + revocation** — `packages/sync/src/rotation.ts`:
   `rotateTenantKeys` generates a fresh tenant wrapping keypair, publishes the
   next bundle under a fresh content key, and wraps only for the active devices.
   Migration `0011_tenant_key_versions.sql`: the audit ledger (public material
   only; revocation only through `app.revoke_tenant_key`, ops-manager-only, the
   table append-only by privilege).
2. **RLS bypass suite** — `supabase/tests/rls_bypass.sql` +
   `tooling/db/verify-phase7.sh` (runs the full regression: RBAC matrix +
   Phase 5 + bypass suite, DB dropped each run).
3. **Queue hardening** — `telemetry.ts`: per-item attempts with capped
   exponential backoff (1s base, 60s ceiling), events flushed before
   escalations, oldest query events shed past a cap with a raised flag, and
   escalation records never shed — the backlog is surfaced instead.
   `tooling/telemetry/verify-queue.mjs` tests it in deterministic virtual time.

**Verified.**

1. `node tooling/sync/verify-rotation.mjs` — **13 checks, 0 failures**. The
   revoked device receives no wrapped key; its cached v1 wrapped key fails the
   GCM tag against the v2 payload; a foreign device's wrapped key fails
   unwrapping; an active device that missed the key distribution cannot
   upgrade; v1 replay refused; signing rotation proven a pure distribution
   event. The limitation rotation cannot fix is asserted, not hidden: the
   revoked device still reads the pre-rotation bundle.
2. `bash tooling/db/verify-phase7.sh` — all four suites OK: RBAC matrix (99/0),
   Phase 5 telemetry (27/0), RLS bypass (**40/0**), retention (**16/0**).
3. `node tooling/telemetry/verify-queue.mjs` — **35 checks, 0 failures**.
4. `pnpm -r run build` green across the workspace.

**A real vulnerability, found by the bypass suite and fixed.** The Phase 5
dashboard views leaked cross-tenant data. Created without
`security_invoker`, each view executed as its owner — `postgres`, a superuser,
which bypasses RLS entirely — so Beta's ops manager could read Alpha's
escalations, funnel, and threshold changes through the views. Measured: the
bypass suite observed foreign rows through all three views before the fix.
Migration `0012_security_invoker_views.sql` recreates all three with
`security_invoker = true` (the option cannot be changed by CREATE OR REPLACE),
and the suite now observes zero foreign rows. Two lessons recorded: views are
an RLS boundary and must be attacked like tables; and Phase 5's own suite could
not have caught this because it only ever probed a single tenant — negative
controls need an attacker's perspective, which is exactly what the bypass
suite adds.

**Host note — the schemars detour.** `cargo build` initially failed with
E0107 in `schemars` (tauri-build enables `preserve_order`; upstream
schemars 0.8.2x ships that feature wired to indexmap 1.x while the code under
it is written for indexmap 2 — dead on arrival, tauri-apps/tauri#14928).
Downgrading did not help; the registry cache was also poisoned (0.8.21's
extracted source was 0.8.22's). The durable fix is vendored:
`apps/desktop/src-tauri/vendor/schemars-0.8.22` with the `preserve_order`
feature pointed at the renamed `indexmap2` dependency and the two aliases in
`lib.rs` referencing `indexmap2::`, wired through `[patch.crates-io]`.

**Not verified.** The rotation ledger's function surface is tested in SQL, but
the edge-function flow that calls `rotateTenantKeys` and records the version is
unbuilt (no Supabase runtime). Queue overflow UI flag is client-side only; no
transport exists to exercise real retry behaviour.

## Technical review correction record — 2026-09-25

**Executed.** A change-scoped technical review found that several phase records
described a prototype that no longer matched the code. The following corrections
are now shipped and verified; the earlier Phase 1 answer-rate tables remain only
as explicitly labelled placeholder-corpus history.

1. **No silent telemetry loss.** The production `NoopTransport` and destructive
   "Sync now" path are removed. Query/escalation ids use `crypto.randomUUID()`;
   the queue retains records locally until a real transport exists. The accepted
   query event now includes the same top-K passage evidence shown in the UI.
2. **Explicit model activation.** The initial web entry no longer contains the
   Transformers.js/ONNX integration. User activation dynamically loads it with
   download progress, visible failure, and in-session retry. Query controls are
   disabled during inference; editing a query or margin invalidates the stale
   result.
3. **Manual-review content boundary.** A confident match to an SOP whose own
   `escalationRequired` flag is true now produces `manual_review_required`, the
   same content-free shape as a gate block. The operations escalation record
   retains the candidates. The gate suite is **10 checks, 0 failures**.
4. **Completed public corpus.** Procedure 2's literal placeholder was replaced
   with a dated summary verified against TikTok's public Content Violations and
   Bans help article. The README records the source and retrieval date.
5. **Evaluation methodology.** Auto-answer rate now excludes SOPs that must route
   to a human; the reranker really scores 20 passages before procedure collapse;
   calibration uses observed margins; in-scope and out-of-scope hold-outs are
   disjoint; and MiniLM is predeclared before the hold-out. The old 0.15 default
   now measures 10 auto-answers plus one false accept (precision 0.909), so the
   audited prototype and new-tenant default move to **0.18**.
6. **Fail-closed vectors.** Embedder output is checked for exact width and finite
   values; vector width mismatches throw; the gate blocks non-finite scores and
   invalid configuration as `invalid_candidate` rather than accepting them.
7. **Dependency-safe overflow.** The queue never sheds a query event referenced
   by a retained escalation. If that makes the cap unshrinkable, it raises the
   visible overflow flag instead of creating an escalation that can never ship.
   The queue suite is **30 checks, 0 failures**.
8. **Database write boundary.** Migration `0013_ingest_write_boundary.sql` makes
   ingest functions the sole telemetry/dedup/escalation/audit write path; checks
   tenant+role, validates query payloads and same-tenant devices, uses pinned
   `search_path`, revokes default `PUBLIC` execute, restricts escalation UPDATE
   to workflow columns, excludes agents from raw escalation evidence, and sets
   the new-tenant margin default to 0.18. The database regression is **99 RBAC,
   27 Phase 5, 40 bypass probes, 0 failures**.

**Current measured result on the completed corpus.** MiniLM recall@1 is 78%,
recall@5 is 100%, and the precision-qualified auto-answer rate is **8/50 (16%)**
at margin 0.18 with no measured wrong procedure or out-of-scope acceptance.
BGE has 80% recall@1 but the same 8/50 auto-answer result. One disjoint hold-out
fold falls to 0.857 precision, so no global threshold is validated. The answer
criterion still fails its 25/50 requirement; the escalation path remains the
primary product experience.

**Verification.** Full workspace typecheck, lint, and build are green; the
optimized Tauri binary links. Sync 31/0, persistence 33/0, rotation 13/0, legacy
parity 25/0, queue 35/0, gate 10/0, and database 99/27/40 all pass. Headless
Chrome observed zero model requests before activation, then loaded the real
stack, rendered an audited answer, invalidated it on edit, and rendered a
manual-review escalation with no title, passage, or suggested reply. A blocked
model-host run reached visible retry and recovered. Final browser runs had zero
console errors and zero failed responses.

**Still unbuilt / unverified.** No hosted Supabase runtime, authenticated bundle
or telemetry transport, automatic flush scheduler, tenant query-text policy,
device-key persistence, Command Center UI, packaged desktop installer, native
mobile build, or packaged offline model. The 0.18 margin is a conservative
prototype starting point, not a tenant-calibrated constant.

## Production-readiness audit and slice 1 — 2026-09-25

**Audit verdict: NO-GO.** Not a near-miss. Every phase above is a *component*
completion and each says so honestly in its own record; what never existed was
the word **integrated**. Four independent reviews (architecture, security,
operations, product) reached the same verdict, and one fact settles it: a grep
for `fetch(`, `supabase`, `createClient`, `Authorization`, `Bearer`,
`EventSource` and `WebSocket` across `apps/web/src` returns **no matches**. The
shipped client cannot reach a server, cannot know a tenant exists, and writes
query text and escalation evidence to `localStorage`. `packages/sync` and the
whole hardened schema are unreachable from the product. The phase table's
"complete" values must never be read as "the product works".

**Estimated remaining work: 43–67 person-days, ~9–13 weeks** for one engineer
familiar with the codebase, Supabase chosen, no compliance certification in
scope. Earliest honest pilot with real customer data: **8–10 weeks**. The full
blocker list and the roadmap live in the audit report, not here.

**Executed (slice 1).** CI plus the gate it runs, plus an environment contract.

1. **`tooling/run-verification.mjs` — the gate.** Runs all six JS harnesses in
   one command, sequentially, and requires **two independent signals per
   suite**: exit 0 *and* the suite's own verdict line. That second condition is
   the repo's own pattern from `verify-phase2.sh`, and it catches the one case a
   `&&` chain waves through — a suite that exits 0 while reporting failures. A
   preflight refuses to run before `pnpm build` and says so, instead of emitting
   a module resolution error. `semantic-eval` and `reranker-sanity` are
   deliberately excluded: they measure rather than assert, they are the
   experiments already recorded as rejected, and a number that moves is not a
   regression.
2. **`tooling/audit-gate.mjs` + `tooling/audit-baseline.json`.** The workspace
   carries **36 production advisories (1 critical, 25 high, 9 moderate, 1 low),
   every one reachable only through `apps/mobile` → `expo`**. Clearing them
   belongs with the packaging work; what was needed now was a gate that stops
   the number from getting worse. It fails on any **new** advisory or any
   **severity escalation** by rank, and never on a resolved one, so the
   baseline needs no edit as the count drops. Keyed on `github_advisory_id`,
   never on affected paths — pnpm reports those OS-dependently
   (`apps__mobile>expo` on Linux, backslashes on Windows) and a per-platform
   baseline teaches people to ignore gates. Delete the baseline when the count
   reaches zero and the gate becomes strict with no code change.
3. **`.github/workflows/ci.yml`** — four required jobs: `workspace`
   (lint, typecheck, build, the gate, model cache keyed on the pinned revision
   sha), `database` (`verify-phase7.sh`: 99 + 27 + 40 + 16 probes), `desktop` (Rust
   link with Tauri's documented Linux system libraries, which are a real
   prerequisite, not ceremony), `audit`. No deploy job and no release artifact:
   there is no transport to deploy, so that stage would be decoration.
4. **`.env.example`** — the honest version. Two variables are read by code
   today (`EXPO_PUBLIC_ENGINE_ORIGIN`, `SOP_SKIP_COMPILE`). The Supabase
   variables the transport slice will need are listed under an explicit
   "NOT read by any code yet" heading, because a variable that is set but unread
   is a false signal that a feature is configured.

**Verified on this host, 2026-09-25.**

1. `pnpm run verify` — **6 of 6 suites pass**: parity 25/0, sync 31/0,
   persistence 33/0, rotation 13/0, gate 10/0, queue 35/0.
2. `pnpm run verify:db` — **exit 0**: `RBAC MATRIX OK`, `PHASE5 OK`,
   `RLS BYPASS SUITE OK` (7 sections, 40/40, zero failures).
3. `pnpm run verify:all` — exit 0. The single local command that runs both
   halves.
4. `pnpm run audit` — exit 0, 36 advisories, 0 new, 0 escalated.

**Both gates were made to fail on purpose.** A gate that has never failed is not
evidence.

- The audit gate was run against a deliberately broken baseline: one advisory
  deleted and one severity downgraded. It reported `NEW GHSA-27p8-2357-5qqv
  @xmldom/xmldom high` and `ESCALATED GHSA-2v35-w6hq-6mfw low -> high`, exited
  1, and passed again once the baseline was restored.
- The verification gate was run with one suite's expected verdict corrupted. It
  reported `FAIL — exited 0 but never printed "..."` and exited 1, confirming
  the verdict check fires on its own rather than only on a crash.
- The runner's preflight was exercised from a directory with no build output and
  exited 2 with the instruction to run `pnpm build`.

**A trap found while proving it.** Adding a `test` task to `turbo.json` with
`dependsOn: ["build"]` made `pnpm test` hang for three minutes: a bare `build`
includes the package's *own* build, so `@sop/desktop`'s Rust link ran on every
test invocation. The root script now filters that package
(`--filter=!@sop/desktop`) and `pnpm test` completes in 34 ms from cache. If the
filter is ever dropped, the task silently stops being cheap.

**Honest gaps in this slice.**

- **There are no unit tests.** `pnpm test` runs the workspace build and zero
  test tasks, because no package defines one. It is a seam, not coverage.
- **`tooling/` is not linted.** `pnpm lint` covers `apps/web` only, so the new
  runner and gate are unlinted. Pre-existing, not introduced here.
- **The CI workflow has never executed.** It is unproven YAML on a machine with
  no GitHub remote. Every command it runs was proven individually on this host,
  but the first real run is the first real run.
- **The model weights are fetched from Hugging Face at CI time.** The revision
  is pinned to a commit sha and the cache key encodes it, so a changed pin
  cannot silently reuse stale weights — but a first CI run still depends on
  Hugging Face being reachable.
- **36 known advisories remain**, all in the unbuilt mobile tree. The gate stops
  regression; it does not clear them.

**Hosted half of slice 1, executed against project `lxlokqtowvaesxjishqz`.**

All 13 migrations applied. The CLI's dry run parsed every file as a
14-digit version, and `migration list` now reports `local == remote` for all 13
with a second dry run answering `upToDate: true`. Schema equivalence with the
container was then proved without a password, by dumping both and comparing
object lists: **every** table, function, view, policy, index and constraint
matches. The three `ops_*` views were checked individually rather than trusted
from the diff, all carrying `security_invoker='true'`.

**Three defects stood between that and a working hosted run**, none of them
visible in a container:

1. **The auth shim would have broken the platform.** `0001` used a bare
   `create or replace function auth.jwt()`. Hosted, that function belongs to
   GoTrue, and replacing it breaks PostgREST, realtime, and every policy calling
   `auth.uid()` across the whole project. The first push failed with
   `permission denied for schema auth (SQLSTATE 42501)` because `postgres` has
   no CREATE on the `auth` schema — and `create table if not exists auth.users`
   still demands the privilege, so the existence check has to happen *before* the
   statement, not alongside it. The shim now installs nothing where the platform
   already provides it, and the CLI rolled the failed migration back cleanly.
2. **Every RPC would have 404'd.** `config.toml` exposed only `public` and
   `graphql_public`, so the entire `app` function surface was unreachable.
3. **The suites could not address a single user.** `public.users.id` references
   `auth.users(id)`; hosted, that table can only be written through the Auth
   Admin API, which assigns its own UUID. `set role supabase_auth_admin` is
   denied and a chosen-UUID insert is refused, both proven rather than assumed.
   So 129 hard-coded UUIDs became injectable psql variables, and the 7 that sit
   inside plpgsql bodies became email lookups, because a dollar-quoted body is
   the one place psql expands nothing.

**Verified on the hosted project, twice in a row, 182 probes and 0 failures:**
RBAC 99/0, Phase 5 27/0, RLS bypass 40/0. `tenant isolation` 12/12 and
`privilege audit` 34/34 — the two hardest guarantees — hold unchanged against
GoTrue's real auth. A `db push` creates the seven principals; the suites then
assert claims directly, so nothing ever authenticates as them.

**Three things the platform taught us, none of which a container could:**

- Supabase installs its own `public.rls_auto_enable()` event trigger that enables
  RLS on new `public` tables, so ours are protected twice over.
- The suites are **not** self-contained: run without the seed applied
  immediately before, five probes fail on leftover state. The gate is green
  because both harnesses seed first, and `verify-hosted.sh` re-seeds before
  *each* suite. A green verdict with fewer probes is the failure mode to watch
  for, and it happened here during the refactor — a suite reporting OK on 79 of
  99 probes because whole sections had silently produced no rows.
- The probe helpers are a live exposure if left behind. `rbac_probe` runs
  `execute p_sql` on a caller-supplied string and sets the role itself, and
  Supabase grants EXECUTE on new `public` functions to `anon` — so a leftover
  helper means anyone with the anon key can run SQL as `authenticated`.
  `verify-hosted.sh` drops all ten helpers and three result tables afterwards,
  and warns loudly with a detection query if that ever fails.

**Two bugs were mine, and both are now permanent tests of the harness itself.**
`verify-hosted.sh` filtered output with a case-sensitive grep, hiding every probe
row and the uppercase `FAILED` verdict, so it reported "no verdict line" while
the suite had reported 12 failures; it now prints everything on failure. And
recording only `sqlstate` made four FK failures indistinguishable, so the
helpers now record `sqlerrm` too, which named the constraint and exposed a
default UUID leaking past an override.

**Still unverified.** No auth client and no transport, so none of this is
reachable from the product yet; the hosted database holds fixture data and
throwaway auth principals; the `app` schema is exposed but nothing calls it.
The CI workflow still has never executed.

## Transport slice record — the first authenticated path, 2026-09-25

The audit's central claim was that the client could not reach a server. That is
now false, and it was false within a session rather than over a phase, which is
the honest way to record a correction.

**`apps/web/src/supabase.ts`** — the first module in the application that can
reach a server. It throws at import time when `VITE_SUPABASE_URL` or
`VITE_SUPABASE_PUBLISHABLE_KEY` is missing, rather than failing later inside a
request with a message about the network. `apps/web/src/transport.ts` implements
the `Transport` seam the queue was already written against, calling the two
ingest functions from migration 0013 — the only write path to those tables, and
one that takes the tenant from the JWT rather than from anything the caller
supplies.

**`pnpm run probe:auth` — 7/7.** A real sign-in returns a real JWT; the server
attributes the session to the right tenant and the right role; an unauthenticated
caller is refused. That last check is the one that matters, and if it ever starts
passing the boundary is gone.

**`pnpm run probe:telemetry` — 11/11.** A record created by client code lands in
the hosted database: the query event is accepted and its payload round-trips
intact, the escalation naming it is accepted, replaying both does not duplicate
either row, and a payload claiming a foreign tenant cannot relabel the row —
it is filed under the caller's tenant because the function ignores the claim.

**The exposed-schema trap, and why the CLI was not the answer.** The client
answered `Invalid schema: app` for every RPC, because `config.toml` only
configures local `supabase start` while a hosted project keeps its exposed-schema
list in its own API settings. `supabase config push` *would* have set it, and
`config diff` showed why that route is a trap: pushing a `supabase init` config
also disables MFA enrollment and verification, email confirmations and SMS auth,
and shortens the OTP from 8 to 6. The fix used instead was a deliberately
minimal config declaring only `api.schemas`; the diff then reported exactly one
`update` and thirteen `remote_only` properties left alone, and pushing that
changed nothing else. A `config push` with the repository's own config.toml would
have quietly weakened a real project's security posture.

**Three errors the probes caught in our own code, none of them in the schema.**

1. The first telemetry payload claimed `score` and `margin` on an escalation.
   The ingest contract requires all three of `sopId`, `score` and `margin` to be
   JSON null, because an escalation carrying a score is claiming the gate
   answered confidently. The server refused it correctly and the probe was wrong.
2. The probe read its own write back as a frontline agent and saw zero rows,
   which read as a transport failure. It is the opposite: migration 0005 makes
   telemetry unreadable to agents, and a passing guarantee looked like a broken
   wire. Reads were moved to the service role, and the agent's inability to read
   is now asserted as a check of its own.
3. `flush` was referenced from a `useCallback` dependency array above its own
   declaration — a temporal dead zone error at render, not at build.

**Still unbuilt.** Bundle publish/fetch transport and device enrolment; a
sign-in surface in the UI (the probes authenticate programmatically); an
automatic flush scheduler rather than flush-per-decision; the Command Center;
and device-key persistence. The Vite build inlines the two variables and does
not validate them, so a build without them produces a bundle that throws on
load — a loud failure at runtime, but CI will not catch it.

## Bundle delivery slice record — 2026-09-25

**Executed.** The next structural gap: a published bundle had no way to reach a
device, and nothing had found out until a device asked for one.

**Two defects, both invisible to any test that did not fetch.**

1. **Nowhere to put a per-device wrapped content key.** `publishBundle` wraps the
   content key to every enrolled device and returns a `Map<deviceId, key>`.
   `app.publish_policy_bundle` had no parameter for it and `policy_bundles` had
   no column. A published bundle was a thing **no device could ever decrypt** —
   not a slow feature, a dead one. The old function is now dropped rather than
   left in place, because a publish path that produces uninstallable bundles is
   a footgun, not a fallback.
2. **The signed manifest was not reconstructible.** The signature covers the
   canonical JSON of the whole manifest, which includes `dimensions`, `iv`,
   `sopCount` and `publishedAt`. Only `manifest_hash` was stored, so a client
   could fetch a ciphertext and a signature but had to trust the server to tell
   it the other fields — the exact dependency the signature exists to remove.
   The manifest is now stored whole as `jsonb`, with a constraint requiring it to
   agree with the columns that index and filter the bundle.

**`pnpm run probe:bundle` — 16/16, twice in a row.** A device generates a
keypair and enrols; the server half encrypts the corpus, signs the manifest and
wraps the content key to that device; the device fetches its own bundle and
installs it through the real `installBundle` pipeline; the installed corpus
matches the published corpus field for field. The ciphertext contains no
procedure text, a replay is refused as `not_monotonic`, a tampered manifest as
`signature_invalid`, another tenant's device gets nothing, and the active bundle
survives every refusal.

**Four design decisions worth keeping.** The manifest is nullable, deliberately:
a row with no manifest cannot be fetched or installed, and the RBAC matrix inserts
bare rows to prove the monotonic version guard independently of the delivery
path. `bundle_for_device` refuses a bundle with no manifest, so the two together
mean a device is never handed a signature with nothing to verify. The publish
function stays **SECURITY INVOKER** and the new table has an insert policy
restricted to `ops_manager`, because making it SECURITY DEFINER was the easy way
to get the insert working and it would also have let an editor publish — RLS is
the authority here, not a check in a function body. And the check constraint is
written with explicit `is not null` on every field, because a CHECK passes on
NULL: the first version compared with `=` and was therefore vacuously true, and a
partially populated manifest satisfied it.

**Four errors the probe caught in our own code.** `device_registrations.user_id`
references `public.users`, and a GoTrue identity is not a tenant user until
onboarding creates that row — so enrolment failed on a foreign key before
anything crypto was exercised. PostgREST takes `bytea` as a hex string, and
passing a Buffer stored something else entirely; the client then rejected the
result with `payload_hash_mismatch`, which was the protocol working correctly.
The manifest comparison used `JSON.stringify`, which fails on a bundle that is
in fact identical, because `jsonb` does not preserve key order and the signature
is computed over canonical sorted-key JSON. And the platform column is
constrained to `web`/`desktop`/`mobile`, so a probe run must re-key its device
rather than register a new identity under a fresh label.

## Device identity and server-side publish — 2026-09-25

**Executed.** The two gaps the previous record left open, both closed and proven
rather than described.

**Gap 1 — a device that forgets itself on reload.** `packages/sync/src/identity-store.ts`
adds `DeviceIdentity`, `MemoryIdentityStore` and `IdbIdentityStore`, plus
`newDeviceIdentity`. Two properties carry the whole design:

- The device private key is generated **non-extractable** (`generateDeviceKeyPair`).
  For an asymmetric algorithm the `extractable` argument applies to the private
  key only, so the public half is still exportable and can be registered — which
  is the only reason a non-extractable keypair is usable at all. A `CryptoKey`
  survives a reload because it is structured-cloneable and the browser re-wraps
  it under origin protection, so the key persists without any script on the page
  being able to read it out.
- The store holds exactly one record and replaces it in a single IndexedDB
  transaction, so a torn identity is never observable. Same discipline as the
  bundle store: an identity is a unit.

**A coordination bug found while doing it.** The KEK salt was a parameter both
the publisher and the device had to be handed, and nothing in the protocol or the
database carried it — so a publisher and a device could silently disagree, and the
failure would surface as an opaque GCM tag error on the content key. It is now
derived: `tenantKekSalt(tenantId)`. A KDF salt is not secret, only unique per
tenant, and the tenant id is inside the signed manifest, so a device can compute
the right salt from a value it has already authenticated. Both `PublishParams.kekSalt`
and `SyncIdentity.kekSalt` are now optional and default to it.

**`verify-persistence.mjs` — 27 checks, 0 failures** (was 19). The new checks run
through a real IndexedDB and then through the **real install pipeline** after a
simulated restart: the private key cannot be exported before or after a reload,
the restored key installs a bundle with no salt passed by either side, the corpus
round-trips, one tenant's derived salt is stable and two tenants' differ, and
clear removes it.

**Gap 2 — the signing key was in a test process.**
`supabase/functions/publish-bundle/index.ts` now holds the tenant signing keypair
and the server wrapping keypair in the platform's secret store. It imports
`publishBundle` from the **built** `packages/sync/dist` rather than
reimplementing any of it, and that works because the package compiles to fully
relative specifiers — `@sop/core` is a type-only import, so nothing bare survives
and Deno can load it with no bundler and no import map.

**Authorization is not decided in the function.** The caller's own JWT is
forwarded to PostgREST, so `app.publish_policy_bundle` runs as the caller and RLS
is what says no. The function holds the key; it does not get a say in who may use
it. An early 403 on the role claim was added only so that a refusal is not
reported as a 502 "bad gateway" — the first version returned 502 with "new row
violates row-level security policy" underneath, which blames the wrong system.

**`pnpm run probe:publish` — 8/8.** An ops_manager publishes through the function;
the device fetches that bundle and the signature verifies and installs; an agent
is refused 403; a caller with no session gets 401; the response carries only
`bundleVersion`, `manifest` and `wrappedFor`, and no signing material.

**Three errors the probe caught, one of them mine twice.**

1. `onConflict: 'id'` on the device registration does not conflict where the unique
   key actually is — `(tenant_id, user_id, platform)`. The insert was rejected, the
   *previous* run's public key stayed registered, the bundle was wrapped for a key
   nobody held, and the install failed with `key_unwrap_failed`. That reads like a
   crypto bug and is actually a stale fixture.
2. The first `401` path proved the boundary, but the role check was missing, so an
   agent reached the database and was stopped by RLS — correct outcome, wrong
   status code, and the error text named the database rather than the caller.
3. `erasableSyntaxOnly` in the package tsconfig rejects constructor parameter
   properties, so `IdbIdentityStore`'s factory is a declared field.

**Verified.** `pnpm run verify` 6/6. Hosted SQL suites 182/182. `probe:bundle` 16/16,
`probe:publish` 8/8, `probe:auth` 7/7, `probe:telemetry` 11/11. Typecheck, lint and
build green. Audit gate 0 new, 0 escalated.

**Still unbuilt.** A sign-in surface in the UI — the probes authenticate
programmatically, so nobody has actually signed in to this product yet. An
automatic flush scheduler. The Command Center, which is where the corpus the
function encrypts will eventually come from: today it arrives in the request body,
which is honest about the boundary but is not where a tenant's procedures live.
Key rotation now has a signing key to rotate and no procedure for it. And the
hosted project holds a real signing key, real fixture rows and throwaway auth
principals: it is a development database and must not hold customer data until the
retention policy exists.



## Sign-in surface — 2026-09-25

**Executed.** Every authentication in this project had so far happened inside a
Node script. Nobody had ever signed into this product.

**`apps/web/src/auth.ts` and `apps/web/src/SignIn.tsx`.** A signed-out visitor
gets the sign-in form and nothing else — not a disabled search box, because a page
that renders and then fails at flush time is a product that appears to work for a
user it has not identified. The tenant and role on screen come from
`app.current_tenant()` and `app.current_role()`, not from decoding the JWT: a token
is a bearer credential, its contents are not authoritative, and deciding what a
user may do from the client is the exact boundary the database was built to avoid.

Password rather than magic link, and that is a trade-off rather than a preference.
Magic link is the better answer for this product, but it needs working outbound
email, and a fresh Supabase project's default SMTP only delivers to the project's
own team members. So password is what can be proven today, and the shape is
deliberately the one a magic-link flow can replace without touching the app shell.

**`pnpm run verify:signin` — 10/10, in real headless Chrome.** Not a unit test and
not a jsdom render: the app is served by Vite, driven over the DevTools Protocol,
and the credentials are typed into a real form. An unauthenticated visitor is shown
the sign-in form and is *not* shown a query box; a wrong password is refused and the
page stays signed out; the right password signs in and the tenant and role on screen
are the ones the server reported; signing out returns to the form; the page reported
zero console errors.

It drives Chrome directly over CDP — no Puppeteer, no Playwright, no new
dependency. Node's built-in WebSocket is enough, which mattered: the workspace
already carries 36 advisories in its unbuilt mobile tree and had no appetite for
adding a browser-automation package to that gate.

**Two errors the run hit, both mine and both instructive.**

1. The dev server bound to `localhost`, which resolves to `::1` first on Windows,
   so a `127.0.0.1` readiness probe never reached a server that was plainly up and
   the harness reported "the dev server never came up". Fixed with `--host
   127.0.0.1`, which is now part of the command.
2. The "app is reachable" check waited for `button[type="submit"]`, which the app
   shell does not have, so it timed out on a working page. A false failure caused
   by the test, not the code — the same category as the earlier case of a suite
   reporting OK on 79 of 99 probes, and worth naming in both places.

**Verified.** `verify` 6/6, browser sign-in 10/10, typecheck, lint, build and the
audit gate all green. Hosted SQL suites unchanged at 182/182.

**Not a CI job, and honestly so.** `verify:signin` needs a live project, a real
auth principal and the Vite server, so it cannot be a required check until the
project's secrets are available to CI. It is a local gate today and belongs in
`ci.yml` as soon as the hosted environment stops being a laptop.

**Still unbuilt at the time of this record.** The corpus still came from a checked-in
`knowledgeBase.json` rather than from the bundle a device can now fetch and install
— superseded by the record below, which closes it. Also missing: an automatic
flush scheduler, no Command Center, and no rotation procedure for the signing key
that now exists.


## The app serves its own bundle - 2026-09-25

**Executed.** The join between three slices of transport work and the application
that answers queries. Until now the two had never met: the app loaded
`apps/web/src/data/knowledgeBase.json` out of the repository, and the transport was
proven only by probes.

**`apps/web/src/bundle-client.ts`.** Load or mint the device identity, register or
re-register the device, fetch this device's bundle, install it through the real
pipeline, and report what is now serving. It never throws for an ordinary
condition: no bundle yet, a failed fetch and a rejected install are three different
states the UI has to be able to name, and an exception would collapse them into
"something went wrong".

**The rule the file exists to enforce: the corpus the app searches is the corpus
that was signed for this tenant.** No fallback, no bundled copy, no default. The
app says it has no bundle. Serving a repository file when the tenant's bundle is
missing is the same failure as telemetry that never left the browser: a product
that appears to work for a tenant it has not actually been given anything. The
panel above the query box now names which bundle is serving and how many
procedures it holds, and `knowledgeBase.json` survives only as a fixture corpus
for the harnesses.

**`pnpm run verify:signin` - 16/16, in real headless Chrome.** The full loop, driven
as a person would drive it: sign in, activate, the app enrols its own device and
finds no bundle and *says so*; an ops_manager publishes through the edge function;
the app retries and now serves that bundle. The assertion is the procedure count
the tenant actually has, so a silent fallback to the five-procedure file in the
repository would fail it.

**Two errors this found, and the second is the valuable one.**

1. `device_registrations.tenant_id` is NOT NULL and `registerDevice` passed `null`.
2. The device lookup filtered on tenant and platform but **not on `user_id`**, so
   the app adopted *another user's* device row - the tenant's seed registers a
   device for a different user - and then tried to re-key it. The re-key silently
   did nothing, because **row-level security filters rows rather than raising**:
   the update matched nothing visible and reported success. So the app believed it
   held a device whose public key it did not have, and the publisher wrapped a
   bundle for a key nobody could unwrap. The lookup is now scoped to the user, and
   the update selects the affected rows, because a re-key that RLS filtered to zero
   is otherwise indistinguishable from one that worked.

**Also worth recording.** Two earlier runs of this harness failed on the *test*
rather than the code: a presence check that read a panel's initial "not loaded yet"
text, and a click the app never received. The bundle sync sits behind the explicit
activation button by design - the model must not be fetched before a person asks -
so the harness has to ask. And a genuine product behaviour showed up as a failure
worth keeping: a device that enrols *after* a bundle is published correctly gets no
bundle until the next publication, and the app reported exactly that instead of
serving something.

**Verified.** `verify` 6/6, browser sign-in and bundle 16/16, typecheck, lint and
build green, audit gate 0 new and 0 escalated. Hosted SQL suites unchanged at
182/182.

**Still unbuilt.** An automatic flush scheduler, so telemetry goes out on a timer
rather than per decision. The Command Center, which is the only place a tenant's
procedures can be authored: today they arrive in the publish request body, which is
honest about the boundary but means no tenant can edit its own policy. A rotation
procedure for the tenant signing key, which now exists and has never been rotated.
Offline operation in the browser: the bundle survives a reload, but nothing proves
the app starts and serves with the network down. And the 36 advisories in the
unbuilt mobile tree, which the gate stops but does not clear.
## The corpus comes from the tenant's records - 2026-09-25

**Executed.** The Command Center's first half, and the half that decides whether
the rest is worth building. Until now the publish function took the corpus in the
HTTP request body: the procedures a device was told were whatever the caller typed.
A tenant could not review them, could not change them, and no audit trail existed.

**`supabase/functions/upsert-sop`.** A procedure body is stored encrypted
(`sop_versions.body_ciphertext`), and the key that encrypts it must never be held
by the browser that typed it - so authoring is the same shape as publishing. The
caller is authorized by row-level security; the function owns the key. Every edit
is a new immutable version, never an update, and `sops.status` moves draft ->
in_review -> published -> retired. The encrypted body is the whole procedure
document as JSON; the title stays in the clear, because a procedure's name is not
the sensitive part and an auditor needs to see it without a decryption key.

**`publish-bundle` now reads the corpus from the database** and decrypts each
published procedure's latest version with the key only that side of the platform
holds. A request body is no longer authoritative for anything.

**`pnpm run probe:corpus` - 12/12.** An editor authors a procedure; the stored body
is not readable as text and a hash of the plaintext is recorded beside it; an agent
cannot author and a procedure with no summary is refused; a tenant with nothing
published cannot publish; a body this server did not write is refused **by name**;
publishing sends an empty request body and still succeeds; and a device installs a
bundle whose procedure summary is the authored text, verbatim.

**Three errors this found.**

1. The first read of the tenant's procedures failed and the function returned a
   generic 502. The seed leaves placeholder procedures marked `published` whose
   body is a single zero byte, which is not an envelope this server wrote - so the
   function crashed on a `decrypt` it could not catch. It now refuses with the
   procedure's own name, because "the server could not read this tenant's
   procedures" sends a reader to the wrong system entirely.
2. I had invented a "this tenant already has a procedure" rule with a 409, and the
   lookup behind it used `maybeSingle()` over a table that legitimately holds
   several rows. A tenant is supposed to have many procedures. Removed.
3. The probe registered its device *after* publishing, so the fetch correctly
   returned null - the same ordering lesson as the browser harness, now the third
   time this shape has cost a run. The device has to exist before the publish,
   because a bundle wraps its key only for the devices enrolled at that moment.

**One test bug worth naming.** The check that a non-decryptable body is refused
depended on a seeded placeholder that the *previous* run had already retired, so it
passed once and then reported `undefined` forever. A test that measures the history
of the test is worse than no test: it now creates its own undecryptable procedure
and retires it afterwards.

**Still unbuilt.** The Command Center *interface* - no screen yet where an author
types a procedure, reviews it, or promotes it. `upsert-sop` is the path that screen
will call, and it is proven, so the UI is a client of something that works rather
than a thing being designed against a hope. Also still open: the escalation
console, the automatic flush scheduler, a rotation procedure for the signing key,
and offline operation in the browser.

**The hosted project is now carrying real content.** It holds encrypted procedure
bodies written by this function, real bundles, and a dozen throwaway auth
principals. It remains a development database and must not hold customer data
until a retention policy exists.
## The Command Center interface — 2026-09-25

**Executed.** The screen an editor actually works in. Until now `upsert-sop` was a
proven function that only a script could call, so the honest statement about the
Command Center was "the path a screen will use" — a promise about a future, not a
product.

**`apps/web/src/command-center.ts` is the contract before the screen.** What a
procedure looks like from a browser, and the four things a tenant can do to its own
policy. Both mutations go through an edge function, never to a table directly,
because the body is stored encrypted and the key must not be reachable from a page
that accepted the text.

**`apps/web/src/CommandCenter.tsx`** is a tab beside the agent view, not a separate
product, so navigation answers "where am I" on every screen. It lists the tenant's
procedures with status and version, authors a new one, and publishes to devices.

**`pnpm run verify:signin` — 20/20, in real headless Chrome.** The Command Center is
reachable from the signed-in app; a procedure authored through it is accepted by the
server and appears in the list the app renders; and the list shows what the server
stored rather than what the browser typed. The whole harness, sign-in to bundle to
authoring, is one browser run.

**Two design decisions worth keeping.** Every action has a visible surface: saving
and publishing both disable their button and say what they are doing, because each
is a round trip to a server that encrypts and signs. And failures show the edge
function's own text rather than a flattened message — a refusal that reads
"permission denied" with no subject is not actionable, which is why the functions
name the procedure and the cause.

**One limit that is visible rather than hidden.** A stored body cannot be read back
— the browser has no key — so the screen can list, author, and change a status, but
it cannot load a procedure's text for editing. The status dropdown therefore
carries a placeholder body and says so in the code, because a control that appeared
to preserve content while silently replacing it would be worse than one that admits
the limit. Revising content properly needs a server path that decrypts to an
authorised editor, which is a privilege question rather than a plumbing one.

**Two errors the browser run caught, both in my own assertions.** The first pinned
an expected procedure count of two, and failed the moment another probe changed the
tenant's published set; the publish function now returns `sopCount` and the assertion
compares against what the server said, which is the claim being tested. And a title
mismatch was hidden by truncating the diagnostic to 120 characters, so the failure
read as "the row is missing" when the row was present and the detail had been cut
off. Both are the same lesson as the earlier false failures in this harness: when a
check fails, find out whether the check is right before changing the code.

**Verified.** `verify` 6/6, `probe:corpus` 12/12, browser 20/20, typecheck, lint and
build green, audit gate 0 new and 0 escalated. Hosted SQL suites unchanged at
182/182.

**Still unbuilt, in the order the product needs them.** A read-back path so an
editor can revise a procedure's text. The escalation console, which is the other
half of the Command Center and where a human actually picks up the handovers this
system produces. An automatic flush scheduler, so telemetry goes out on a timer
rather than per decision. A rotation procedure for the tenant signing key. Offline
operation in the browser, unproven: the bundle survives a reload but nothing has
demonstrated the app starting and serving with the network down. And the 36
advisories in the unbuilt mobile tree, which the gate stops and does not clear.
## Read-back, and a CORS hole the browser found — 2026-09-25

**Executed and verified.** The Command Center could author and change a status but
could not load a procedure's text, so revising content meant retyping it — and the
status dropdown was carrying a placeholder body to compensate, which would have
quietly replaced every procedure anyone edited. `upsert-sop` now serves a decrypted
read to an editor or ops manager, the screen has an Edit action that loads the
current text, and a revision is a new version carrying the real body.

**`pnpm run verify:signin` — 29/29, in real headless Chrome.** An agent pressing
Edit is refused and the screen says why; the editor signs in and the server reports
`sop_editor`; the authored procedure loads into the form holding the decrypted
text; a revision saves as version 2; the server stored the **revised** text and not
the original; and the page reported zero console errors.

**A hole no probe could have found, because nothing had ever called an edge
function from the browser.** The whole transport to date went through PostgREST,
which answers CORS itself. The first browser call to an edge function returned
"Failed to send a request to the Edge Function" — supabase-js's message when the
*preflight* goes unanswered, which is indistinguishable from a network outage. A
legitimate 403 was being reported as a network fault, and the search went looking
for a transport bug that did not exist. `upsert-sop` now answers OPTIONS itself and
sets the CORS headers on every response.

**Second finding: `functions.invoke` drops the error body.** A refusal arrived as
"Edge Function returned a non-2xx status code" — a string that names neither the
procedure nor the cause. The functions say exactly what is wrong ("authoring a
procedure requires an editor or ops manager"), and `callFunction` now uses plain
`fetch` so that text survives to the screen.

**Third finding, and the one that took longest: React was crashing, not timing
out.** The panel threw on render, and the only symptom in the log was a component
stack with no message. Asking the server directly — from Node, where the answer is
printable — named it in one shot: the stored body has **no `title`**. The title is
a column on `sops`, deliberately kept in the clear so an auditor can read a
procedure's name without a key, so it is *not* inside the encrypted body. The
client typed the response as a whole `ProcedureDraft`, handed the form
`title: undefined`, and every field bound to an undefined value. `readProcedure`
now assembles the draft from the title plus the body and defaults each field, so a
body written by an older client degrades instead of taking the screen down. The
harness now pins the split: the title is in the clear, the rest is encrypted, and
the body does not duplicate the title.

**Three harness bugs, all mine, and the same lesson as every earlier one.** The run
clicked Edit *then* waited, so it clicked a page whose list had not rendered yet —
the third time this shape has cost a run, and the fix is always to wait for the
thing you are about to touch. The revision wrote `${marker}`, the text it started
from, so the decisive assertion would have passed while proving nothing about the
content moving. And a `String.Replace` meant to switch the harness's own read to
POST silently did not match, leaving it on the GET path it was meant to stop
testing.

**Lesson, and it is the same one again.** The screen was green in typecheck, lint
and build for the whole of this change. All four defects passed all three. Only a
real browser found them, and only because something was changed that made the
browser path exist for the first time.

## Retention: the finding is recorded, the implementation is not finished — 2026-09-25

**One small thing shipped; one thing abandoned with its findings written down.**

**Shipped: the meta description.** It read *"an explainable support prototype … over
five public TikTok LIVE policy entries"*, which stopped being true the moment the
corpus came from each tenant's own authored procedures. It now describes what the
product does. It is the one line a stranger sees in a link preview, and it was
contradicting the product.

**A repo defect found while running the database suite: no `.gitattributes`.** A
`git checkout` of `tooling/db/verify-phase7.sh` on Windows rewrote it to CRLF, and
bash then died on line 2 with `$'\r': command not found`. The file was fine; the
checkout was not. This is invisible on a Linux clone and only appears on a machine
that checked the file out — so it would have been discovered in CI, on someone
else's day. Added `.gitattributes` pinning `*.sh` and `*.sql` to LF.

### P0-2 — retention and plaintext query text: DONE — 2026-09-25

**The finding that changed the plan, and it is worth more than the code.** A plan
reading "retention = drop old partitions" would look finished and leave the personal
data in place, because the query text exists in two places with opposite lifecycles:

- `telemetry_events.payload` — partitioned by month (`telemetry_events_2026_09`, plus
  a `telemetry_events_default` catch-all), droppable, and an append-only record of
  every query anyone asked.
- `escalations.evidence` — **not** partitioned, deliberately: the schema comment says
  an escalation must outlive the telemetry that produced it, so it carries its own
  copy of the query, the scores and the candidates.

**So dropping a telemetry partition does not remove the customer's words.** Retention
is two jobs with different justifications: telemetry is *dropped* (volume, and the
audit value expires); escalations are **redacted, not deleted** — the row, the
reason, the timing, the assignee and the resolution note are the audit trail, and
that value is not in the customer's words. Deleting the row instead would destroy the
audit trail to solve a retention problem.

**Executed.** Migration `20260925001500_retention.sql`: `app.purge_telemetry_older_than`
drops whole monthly partitions older than the horizon and deletes expired rows from
the catch-all default partition; `app.redact_escalation_query_text` tombstones the
query text while preserving reason, bundle version and candidates; `app.run_retention`
runs both and reports all three counts. The horizon is a parameter defaulting to 90
days — a starting point, not a legal answer, because the right period depends on the
tenant's obligations, which this repository cannot decide.

**Verified, both environments.** `supabase/tests/phase8_retention.sql` — 16 checks:

| Section | Result |
|---|---|
| removes what it should | 7/7 — expired fixture present before the run, expired monthly partition gone, event row gone with it, escalation row survives, query text redacted, non-PII evidence preserved |
| never too eager | 4/4 — current partition intact, recent event and question survive, recent escalation not redacted |
| closed to app roles | 5/5 — ops_manager, team_lead, agent, auditor, sop_editor all `denied:privilege` |

Local: `verify-phase7.sh` exit 0, all four suites OK. Hosted (`lxlokqtowvaesxjishqz`,
migration pushed with the owner's approval): all four suites OK. The negative control
is the pre-run presence assertion — a retention function that does nothing fails the
suite because the expired fixture is proven present first.

**The six findings from the abandoned first attempt stand as permanent warnings:**

1. `revoke … from public, anon, authenticated` **fails locally** — the container has
   only `authenticated`; `anon` and `service_role` exist only on a hosted project. The
   role names have to be resolved inside a `DO` block that checks `pg_roles`. A
   migration that only applies to production is a migration that is never tested.
2. Seeding an event by direct insert is **refused** — migration 0013 made
   `app.ingest_telemetry_event()` the only write path. Correct behaviour; the fixture
   must go through the same function a client uses, or it tests a schema state that
   cannot occur.
3. That function **validates every candidate's shape**, so `'[]'::jsonb` is rejected
   with *telemetry candidates failed contract validation*. A real
   `{sopId, score, passage}` object is required.
4. `:'alpha_ops'` inside a dollar-quoted body is **not** expanded by psql, so
   `r_seed()` was never created and every later check failed with a cascade of
   unrelated errors. This was the **eighth** occurrence of that lesson in this
   repository. Pass it as a function argument instead.
5. The suite was **not self-contained**: the first run's purge removed the expired
   event, so a re-run found nothing expired and reported the removal checks as
   *vacuously passing*. A retention suite that can pass because its fixture is
   already gone is worse than no suite. It must delete its own fixture rows first.
6. Three checks still failed on the unfinished run: the expired telemetry row
   survived (it lands in the `telemetry_events_default` catch-all), the redaction
   count was read after a second run had already consumed it, and one assertion
   counted *all* escalations with a matching reason instead of scoping to its own
   fixture id. The finished suite sidesteps the first two by proving the
   **partition-drop** path with a dedicated January partition, and scopes every
   assertion to its own fixture ids.

**Two things this slice deliberately does not do.** It does not run on a schedule —
`app.run_retention` is a function, not a cron job; Supabase pg_cron or an external
scheduler still has to call it. And it does not set the horizon as policy — 90 days
is the default, and the legal answer belongs to the tenant.

**Still open from the audit, untouched:** ingest is unthrottled, and
`access-control-allow-origin: '*'` sits on the one function that returns decrypted
procedure bodies.


**Executed. P0-1 of the production-readiness audit, and the only finding on that
list that could hand one tenant's policy to another.**

**The defect, measured rather than reasoned.** `signOut` was two lines: end the
Supabase session. Three things survived it, all tenant data in plain storage on a
machine the next person will use:

1. the active bundle — a decrypted procedure corpus, in IndexedDB under one record
   keyed `bundle` with **no tenant and no user**;
2. the device identity — and it is tenant-coupled, because the KEK salt is derived
   from the tenant id, so a cached identity for another tenant cannot unwrap anything
   here and only produces a `key_unwrap_failed` that reads like a crypto fault;
3. the telemetry queue — **customer query text**, in `localStorage`.

The sequence that leaks, and each step was verified against the code: agent A signs
in, a bundle installs at version 5; agent A signs out; agent B signs in as a
*different* tenant; the fetch returns that tenant's bundle at version 1; the install
pipeline refuses it as `not_monotonic` against the cached version 5; so the device
keeps serving the previous tenant's procedures — and the panel reports *"Serving
bundle 5 — signed for this tenant"*, because the signature genuinely is valid. It
came from the wrong tenant. **The no-fallback rule was honest about a missing bundle
while the cache was a fallback by another name.**

**Two independent fixes, because one of them is not enough.**

1. **Refuse to serve another tenant's cache.** `syncBundle` reads the tenant from
   `app.current_tenant()` — the server, not the token — and compares it against
   `active.tenantId`, which is inside the signed manifest. A mismatch discards the
   record and says so. This defends every path, including the ones nobody thought
   about: a crash, a closed tab, a sign-out that never ran.
2. **Wipe on sign-out.** `apps/web/src/device-state.ts` owns the list of what a
   browser holds for a tenant, so the control is reviewable in one file rather than
   scattered. A security control nobody can see is a control nobody maintains. The
   session ends *first*: if the wipe then fails, the leftover data sits on a device
   with no valid credential, which is the lower-risk state. A failed wipe is reported
   on the signed-out screen — "Do not use this machine until it has been cleared" —
   rather than swallowed.

**`clear()` is now on the `BundleStore` interface, not optional.** A store you cannot
clear is a store you cannot secure, and putting it on the interface is what found the
two implementations that lacked it: `IdbBundleStore` and `SqliteBundleStore`. The
persistence harness's fake SQLite driver also had to learn `delete from active_bundle`;
that the double could not answer a new statement is the double's honesty showing.

**Verified. `verify:signin` — 45/45, and persistence 33 checks (was 27).** The new
persistence checks run per store: the bundle is held before a wipe, a wipe leaves
nothing a reader could serve, and a wiped store can install again — the last one
because a device that is bricked rather than wiped is its own failure. The browser
check asserts against the **actual storage**, not the UI, because this is a property
of the device: the next person uses these stores, not this page.

**And the gate was made to fail on purpose.** With the wipe disabled it reports
`{"bundle":"present","telemetry":"present"}` and fails. A gate that has never failed
is not evidence.

**One thing this audit found that is not fixed here.** The `meta description` in
`apps/web/index.html` still reads *"an explainable support prototype … over five
public TikTok LIVE policy entries"*, which is no longer true — the corpus comes from
each tenant's own authored procedures. It is five minutes' work and it is the one
line a stranger sees in a link preview.


**Executed.** The last item that had been listed as unbuilt since the transport
slice. Telemetry went out at the moment a decision was made and at no other time, so
a record only left the browser if the agent happened to ask another question.

**This was not theoretical, and the escalation console proved it.** That run found
the agent's escalation still in flight when the session ended, and the team lead
reading the queue too early sees an empty queue — indistinguishable from a handover
that never happened. The harness had to poll the database waiting for the row to
land. That race is the scheduler's reason to exist.

**`FLUSH_INTERVAL_MS = 15_000`,** chosen as a product decision rather than a technical
one: long enough that a busy agent is not making a request per question, short
enough that a handover is on a lead's screen while they are still reading the query.
The interval is only a backstop — a record is still flushed as soon as it is
enqueued — so it governs the worst case, not the common one.

**A timer is not sufficient alone, and that is the part that matters.** A tab closed
between enqueue and the next tick loses the record anyway, so the scheduler also
fires on `visibilitychange` to hidden. `pagehide` and `beforeunload` are not
guaranteed to run, and an async fetch started during `unload` is usually cancelled
before it leaves. The tick only attempts items whose backoff has elapsed
(`queue.due()`), so a poisoned item backs off instead of being retried every tick.

**A bug my own effect contained, caught before it shipped.** The first version
guarded on `if (queue.pending === 0) return undefined`. The queue object is a stable
reference, so an effect conditioned on its contents installs the interval *once* and
never again — the timer would exist only if the app happened to start with something
already queued, which is the one case that does not need it. `due()` already returns
0 for an empty queue, so the guard was both wrong and redundant. Removing it is
strictly better: the tick is a cheap no-op, and the interval is always installed.

**`tooling/telemetry/verify-queue.mjs` — 35 checks, 0 failures** (was 30). The new
ones cover the scheduler's only real decision: an empty queue has nothing due, a
freshly enqueued record is due immediately, a failed item is *not* due again
immediately, and it becomes due once its backoff has elapsed. The two bracket the
behaviour, so removing the backoff fails the first and keeping it fails neither.
Every construction in the new block needs `backing.clear()` first, because the queue
loads from a shared fake `localStorage` and would otherwise inherit the previous
block's items — which is exactly what happened, and showed up as `due` returning 2
instead of 1.

**A small accessibility fix the work turned up.** The delivery sentence changes on a
timer, with nothing focused and no click to trigger it, and it had no `role`. A
screen reader could not announce it, so an agent using one had no way to know their
telemetry was failing or that it had gone out. It is now `role="status"` with a
`data-testid`, which is also what the harness needs to address it.

**Verified.** `verify` 6/6 (queue 35/0), `verify:signin` 44/44, typecheck, lint and
build green, audit 0 new and 0 escalated.

**Not verified, and stated rather than papered over: the timer firing in a real
browser.** A browser-level proof was attempted — override `window.fetch`, ask a
question, let the flush fail, restore the network, and assert the queue drains with
nothing else happening. Two things came out of it. The assertion that *was* solid
passed: with the network down the record is retained and the panel says "retained
and will retry", which is the promise the design makes. The recovery half produced
an unhandled rejection in the page that could not be attributed with the context
available, and an intermittent check is worse than an acknowledged gap, so the whole
probe was removed rather than left in a state where it might pass. **So the interval
and the `visibilitychange` hook are covered by construction and by the `due()`
contract, and their interaction with a real network is not yet demonstrated.** The
third instance of this session's lesson applies: read the source before asserting on
the DOM. Three assertions in this slice were wrong about what the page renders, and
all three were caught only by the gate — none by typecheck, lint or build.


**Executed and verified. `pnpm run verify:signin` — 43/43, twice, in real headless
Chrome.** The full handover in one run: an agent asks a question the gate refuses,
the record reaches the database, a team lead sees the query and the candidates,
takes it, resolves it, and the note they typed is what the record carries. Zero
console errors.

**The console.** `apps/web/src/escalations.ts` and `EscalationConsole.tsx`. A queue
ordered by `query_occurred_at`, read with no filter argument so the tenant comes from
the JWT through `app.current_tenant()`. Four named states — loading, **nothing
waiting**, refused to read, failed — because an empty queue and a broken query look
identical to a team lead, and that difference is a quiet day versus an incident. Each
row carries the query text, the reason in words rather than the stored machine code,
the bundle version, the candidate count, the assignee, and the candidates behind a
disclosure. The status change and the resolution note travel together, because a
resolved row with no explanation is a deletion with a timestamp on it.

**What the schema already guaranteed, and what therefore shaped it.** Only
`ops_manager` and `team_lead` may update, and only the five workflow columns, so
"resolve it" cannot rewrite the evidence even if a policy were wrong. An `auditor`
reads the queue and is told why they cannot act on it, rather than being shown
buttons that would fail. The workflow update `select`s the affected rows and checks
the count, because row-level security filters rows rather than raising — an update
silently filtered to zero reports success while changing nothing, which is the same
trap as the device re-key in the bundle slice.

**The race, and it is the finding worth keeping.** The console reads once when it
opens. The agent's escalation is written by a flush that is still in flight at the
moment the refusal appears, and the agent's session ends the instant we sign out. So
the lead read the queue while the write was in flight, and an empty queue is
indistinguishable from a handover that never happened. It was intermittent, which is
worse than consistent: it passed once and failed twice.

Fixed on the harness side by polling the table with the lead's own token before
moving to the browser, and by giving every run a **unique query string**. The unique
string matters more than it looks — the first version reused a literal from an
abandoned attempt, and a check that can be satisfied by a row an earlier run left
behind is worse than no check. This is the third instance of that lesson in this
project, and the pattern is now: any assertion about accumulated data needs an
identity that only this run could have produced.

**Two harness bugs, and one product bug the browser found.** All three are now
closed *structurally*, not just where they were first hit.

1. `waitFor` coerced its expression through `Boolean(...)` and so **discarded the
   value**, which made `const text = await waitFor(...)` yield `true`; a following
   `.includes` on a boolean returns `false` rather than throwing, so a check passes
   or fails for the wrong reason instead of breaking. The name never said so. It is
   now `waitForCondition` and states the return type in its own doc comment, and a
   sibling `waitForText` returns the value for the cases that want it. A new check —
   *"the two wait helpers are distinguishable by return type"* — asserts the
   difference once, so a future change that collapses them is caught here rather
   than by a check that quietly stops meaning what it says. A sweep of every
   `tooling/**/*.mjs` found no other occurrence of the class.
2. `!bundleText.includes('5 procedure')` was a proxy for "not the repository file",
   and it failed once the tenant genuinely had fifteen procedures, because
   `"5 procedure"` is a substring of `"15 procedure(s)"`. It is now a **parsed
   integer** compared to the number the server reported, which is also correct in
   the direction the literal was not: interpolating `1` would have matched
   `"21 procedure(s)"`. The tenant is at 21 procedures, and the numeric comparison is
   what proves it.
3. **The module-level-helper trap, and the reason the run failed three times first.**
   `evaluate` and `waitForCondition` are `const` declarations *inside* the harness's
   `try` block, so any helper declared at module level that closes over them dies
   with "evaluate is not defined". The helpers belong immediately after
   `waitForCondition` closes, inside the block. A stack trace names the line; a bare
   message does not, so the run's failure report now carries the first three frames.

**Lesson, and it is the same one for the sixth time.** The screen was green in
typecheck, lint and build throughout. The race, the substring bug and the scope trap
all passed all three. A real browser and a real database, asked the question in the
order a person meets them, found every one.


## A status change needs no content - closing the publish deadlock - 2026-09-25

**Executed and verified. `pnpm run verify:signin` - 52/52, twice, in real headless
Chrome.**

**The deadlock, stated exactly.** One corrupt published row bricked the whole tenant:
`publish-bundle` refuses the entire publish naming the row (correct fail-closed),
and every UI control read the body first, so the read 502d on the same bytes and the
row could never be retired. Fail-closed on publish plus no repair path equals a
tenant stuck forever - and the seed's own placeholder proved it, by bricking the
browser gate the morning after a hosted re-seed restored it.

**The fix, in three layers.**

1. **Server.** `upsert-sop` accepts a call carrying `sopId` + `status` and *no body
   fields*, and copies the latest ciphertext and its hash verbatim into a new
   version. The key is never used, which is what makes it safe on the rows nothing
   else can read: for a corrupt body it copies corrupt bytes into a version nobody
   will publish or read, and the row stops blocking the tenant. Two deliberate
   limits: the title may be set (cleartext column, same role gate already passed),
   and "no body" means the existing bytes are kept, never blanked - there is no
   input on which this path writes an empty procedure. The normal path is untouched:
   any body field present takes the encrypt-and-write route as before.
2. **Client.** `setProcedureStatus(sopId, status)` sends only the two fields, so the
   branch is taken by construction rather than by convention.
3. **Screen.** When a status change's read fails, the failure is still shown - but
   the requested change is remembered, and the screen offers to apply it without
   reading: *"could not be read, so its text cannot be carried forward. Its stored
   bytes stay exactly as they are - this only changes the status."* A control that
   rewrote content it could not read would be worse than a dead end; this one names
   what it does not do.

**Proven end-to-end, not with a fixture row but with a planted corrupt one.** The
harness writes a published zero-byte version through the service key - the one shape
no legitimate path can produce - then, as the editor: the row lists normally, the
status change fails as it must, the repair is offered and names untouched bytes,
retiring lands as version 2, and the database confirms the row retired with exactly
two versions whose ciphertexts are byte-identical. Then the tenant publishes again
and the server no longer names the row. A repair that rewrote the content would pass
every screen check; the byte-equality assertion is what it cannot pass.

**Verified.** `verify` 6/6, `probe:corpus` 12/12 (it retires its own bad rows through
the full-body path, unaffected), browser 52/52 twice, typecheck, lint and build
green, audit 0 new and 0 escalated. The Part 1 harness retry that retired the seed
placeholder stays: it is what a person does, and it is now backed by a product path
rather than standing in for one.


## CORS pinned to an allowlist on the decrypting function - 2026-09-25

**Executed and verified.** `upsert-sop` answered every response and every preflight
with `access-control-allow-origin: '*'`, and it is the one function that returns
decrypted procedure bodies. A valid JWT was always required, so `*` was never
directly exploitable - but "not exploitable today" is not a control, and a token
that ever leaks into a browser context becomes usable from any origin under `*`.
That was my own line, set while fixing the CORS hole, and it stayed broader than it
needed to be for six slices.

**The fix.** The origin is echoed back if and only if it appears in the
`ALLOWED_ORIGINS` secret (comma-separated), with `Vary: Origin` on every response.
An unlisted origin gets no ACAO header, so the browser refuses the read.
Non-browser callers are unaffected - CORS is a browser policy, and the JWT check
still applies to everyone. If the secret is unset, nothing gets the header
(fail-closed). The set of app origins is a deployment fact rather than a code fact,
so it lives in the secret rather than the file: the dev server today, the hosted
web app when it deploys, the Tauri origins when desktop ships.

**Proven in both directions, at the wire and in the product.** An OPTIONS from the
dev origin returns 204 with the origin echoed; the same request from
`https://evil.example` returns 204 with no ACAO header at all. The browser harness
then exercises the allowed path end to end - authoring, reads, revision and the
status-only repair all go through this function - at 52/52, twice in a row.

**An intermittent the change did not cause, recorded rather than chased.** Four
browser runs since the deploy went fail, pass, fail, pass, and every failure began
in the agent-query phase - local model inference and a PostgREST flush, neither of
which touches this function. All checks exercising the changed function passed in
all four runs, including the failing ones. That is the evidence the two are
unrelated; the agent-phase flake predates this slice and belongs to whoever owns
that phase next.

**Verified.** Wire-level allow and deny, browser 52/52 twice, `probe:corpus` 12/12,
`verify` 6/6, audit 0 new and 0 escalated. `publish-bundle` carries platform-default
CORS and returns no plaintext bodies, so it is out of scope and untouched.


## Ingest throttle: the last open audit item — 2026-09-25

**Executed and verified.** Both ingest functions accepted unlimited writes from any
authenticated client: a compromised token, a buggy client in a retry loop, or one
bad actor could grow the telemetry tables and the plaintext query text inside them
without bound. Nothing limited it. Local DB, hosted DB, JS suites, browser, audit —
all green, both environments.

**The design, kept deliberately small.** Fixed one-minute windows (aligned, with the
2x-across-a-boundary property stated rather than hidden — a sliding log would store
every timestamp and this table's whole job is to stay tiny). Per-device buckets, so
one device cannot spend another's quota; deviceless events fall into a per-tenant
bucket because the pseudonym is client-supplied and forgeable. The counter update is
a single upsert with RETURNING, so concurrent increments serialize on the row lock
and the limit is exact rather than advisory. Old windows prune opportunistically
inside the check — indexed, usually zero rows — so the table stays tiny with no
scheduler. A rejection flows through the error path the telemetry queue already has:
failed items back off and retry, so throttled records are delayed, never lost, and
no client change was needed. Limits are parameters with defaults (60/min per
device, 120/min tenant), starting points in the same spirit as the 90-day retention
default.

**Enforcement is triggers, not edited functions.** Duplicating both 150-line ingest
bodies into the new migration just to add one call would be the larger diff and the
weaker guarantee. A `BEFORE INSERT` trigger fires for every write path into the
table — including future ones — and parent-table row triggers cover every
partition. The check runs at insert time, so invalid requests still fail contract
validation first without consuming quota. One accepted gap, stated in the migration:
replays hit the dedup ledger and return before any event row is written, which is
correct — punishing retries would break the queue's backoff contract.

**`phase5_telemetry.sql` grows an `ingest throttle` section — 10/10, both
environments.** Exact boundary (limit 2 admits two, third raises P0001), device and
tenant isolation, deviceless tenant bucket, zero-limit refused as misconfiguration,
self-pruning, end-to-end 60-admit-then-refuse through the real ingest path (the
probe that catches a check the migration forgot to wire), escalation path
unaffected, and direct RPC calls denied to every role. Fixture devices are minted
per run and enrollments are owned by the section, because exact-count assertions
against shared per-minute counters would be testing the weather. The browser run
also authors its own corpus before publishing now, after depending on leftover
tenant state broke it twice in opposite directions in one day.

**The debugging that earned its place in the ledger.** The first version failed with
a tenant-bucket refusal and zero rows from its own block, and the cause was never
one thing — it was four, found in order: a duplicated variable declaration that
killed the whole block at parse time; `on conflict (id)` not covering the
`(tenant_id, user_id, platform)` key the seed already holds; the escalation probe
using an unenrolled device (ingest validates enrollment, which the suite now also
proves); and hardcoded fixture devices shared with the seed and other suites. Each
fix was verified to change the failure before moving on. The standing lesson holds:
when the failure shape contradicts the code, stop theorizing and reproduce
minimally — the isolated-tenant repro proved the helper logic in one run, which is
what redirected the search from the function to the fixtures.

**Two things this slice does not do.** Per-tenant configurable limits (constants
with documented rationale instead), and a schedule for anything (the prune is
opportunistic precisely so none is needed).

**Still open: nothing from the audit.** Both P0s, the CORS pinning, and the throttle
are now closed and committed. Remaining work is product surface, not audit findings.

## Production slice — the first hosted SaaS path — 2026-09-26

**Executed.** No product code changed: the mission's missing piece was never a
feature, it was a URL. The prebuilt `apps/web/dist` bundle (built with the hosted
`VITE_` config; scanned afterwards — the full secret value is absent, the one
`sb_secret_` hit is supabase-js's own key-prefix check) was deployed as a static
production deployment to Vercel under the owner's logged-in account. New files:
`docs/PRODUCTION_STATUS.md` (the one status page) and
`tooling/browser/verify-deployed.mjs` + a `verify:deployed` script (the
rerunnable stranger-path gate). The temporary `apps/web/.env.local` used for the
build was deleted; `git status` shows only the new files.

**Live URL:** `https://dist-omega-black-31.vercel.app/` (alias; the deployment URL
`https://dist-bzqki1hio-teamo-38a8.vercel.app/` answers 200 with a Vercel login
page — deployment protection guards the deployment URL, the alias is public).
Project `teamo-38a8/dist`; GitHub auto-link failed (no Login Connection) and was
left unlinked — deploys are CLI-driven, which is all this slice needs.

**Auth flow:** email/password sign-in with a pre-provisioned demo agent
(`demo@alpha.example`, tenant Alpha, role `agent` from the server). No sign-up UI
was built — that is a stated limitation, not an oversight.

**Verified, real browser + real hosted project, 2026-09-26.**

1. `pnpm run probe:auth` — **7/7**: real sign-in, server attributes tenant and
   role, unauthenticated caller refused.
2. `pnpm run probe:telemetry` — **11/11**: event + escalation round-trip,
   idempotent replay, agent reads 0 rows, foreign-tenant claim filed under the
   caller.
3. Throwaway cross-tenant proof (temp dir, cleaned up) — **7/7**: Beta
   ops_manager reads 0 of Alpha's escalations/telemetry; Beta escalation naming
   Alpha's event refused (`source query event does not exist in tenant 2222…`).
4. `TARGET_URL=… DEMO_EMAIL=… DEMO_PASSWORD=… pnpm run verify:deployed` —
   **19/19, twice** (second run from the committed path): signed-out stranger sees
   only the sign-in form; wrong password refused; demo sign-in shows the
   server-reported tenant/role; fresh device is honestly told no bundle is
   serving; bundle published through the edge function is served with the
   server's count; one query yields a content-free escalation carrying no
   procedure text; that escalation is polled present in the hosted database;
   sign-out returns to the form; **zero console errors**. Timestamps in the run
   output (final green run 2026-09-26T06:22:30Z).
5. The full SQL matrix (`verify-hosted.sh`) could **not** run: Docker Desktop's
   daemon is down on this host (WSL has no Docker integration; Git Bash sees the
   client but no daemon). The REST proofs above are the equivalent hosted
   evidence; the matrix itself is unchanged and was last green per the earlier
   record.

**Three observations worth keeping.**

1. A fresh device that fetches a bundle wrapped for another device's key says
   `No bundle is serving: the server's bundle was refused: key_unwrap_failed`
   and serves nothing. That is the protocol working — a device that cannot
   unwrap serves no procedures — reported in words rather than failing silently.
2. The `auth/v1/logout?scope=global` request aborts in headless Chrome on every
   run. The property that matters was proven instead of assumed: the
   pre-sign-out refresh token is dead afterwards (refresh refused — revoked on
   the server). Local sign-out + device wipe + server revocation all hold; the
   abort is a client-reporting artifact, recorded here so nobody re-discovers it.
3. `upsert-sop` answers the deployed origin's preflight with **no ACAO header**
   (measured at the wire): the Command Center authoring path is not enabled from
   the public URL. Localhost dev remains the allowlisted origin. The stranger
   journey never touches that function, so this is a boundary, not a break.

**Still unbuilt / limits (carried into the status page).** No public sign-up
(demo credentials via the owner); a device enrolled after a publish gets no
bundle until the next publish; no Command Center from the deployed origin; the
URL is an auto-generated deployment name; the hosted project remains a
development database — no customer data, no retention schedule running
(`app.run_retention` is a function, still nothing calls it).

## Live deployment aggregate snapshot — 2026-09-28

Read-only counts queried from the Supabase project that the public Vercel bundle
currently targets (`lxlokqtowvaesxjishqz`), measured 2026-09-28 02:27 UTC.
`data_mode: "simulated"` — this is the prototype's development database, with
demo/probe principals and fixture content; these are not production customer or
adoption metrics.

| Measure | Observed |
|---|---:|
| Auth accounts | 29 |
| Accounts with a sign-in in the last 30 days | 22 |
| App-mapped users | 26 |
| Query telemetry rows currently stored | 11 |
| Tenants | 2 |
| Procedures (all statuses) | 20 |
| Published procedures | 16 |
| Retired procedures | 4 |

The 11 query rows are all the rows currently stored (earliest timestamp
2026-09-20); the result is a database count, not a validated lifetime usage
metric. No billing/subscription/invoice/payment/revenue tables are present.
The last documented paying-user and revenue figures remain 0 and $0, but the
database cannot independently verify commercial activity.

## Simulated ticket exercise — Phase 1 — 2026-09-28

Created `tooling/eval/simulated-tenant/client-brief.md` for fictional WaveCast
Creator Care. It is tagged `data_mode: "simulated"` and explicitly separates
ticket metadata from the product's actual plain-text query input. No synthetic
ticket corpus or product change has been generated in this phase. Continue only
after the brief is reviewed; dataset/schema grounding and the batch gates remain
ahead.

**Phase 1 approved; Phase 2 structure and 50-ticket sample generated.** Dataset
metadata and published schemas are documented in
`tooling/eval/simulated-tenant/dataset-sources.md`; no external ticket rows or
message text were fetched. No dataset with both a verifiable anonymization claim
and appropriate provenance was established, so the agent correctly stopped
short of calling any source “verified anonymized.” One inspected dataset
explicitly labels itself synthetic; another includes conversation fields and
does not establish anonymization. Both were schema-only references. All
generator content is newly written synthetic text.

The generator outputs fields patterned after the public schemas plus simulated
`channel`, `status`, `reopenCount`, `handoffCount`, and expected decision labels.
`verify-tickets.mjs` checks the input contract, per-record `data_mode`, synthetic
IDs, and obvious email/phone patterns (not an anonymization certification).
`sample-50.json` is 50 records, seed 20260928, baseline chaos rate 0, and passed
the validator. A representative sample has been shown to the owner, who approved
the 500-ticket, 15% chaos batch. Full-batch evaluation remains gated on review
and approval of the flagged-ticket preview.

## Simulated ticket exercise — Phase 3 batch candidate — 2026-09-28

Extended the generator with ten annotated chaos mutations: near-duplicates,
missing/wrong fields, mixed language/typos/frustration, an off-hours spike,
reopens, agent handoffs, wrong category/tags, conflicting SOPs, and cases with
no supported answer. Every generated record remains tagged
`data_mode: "simulated"`.

Generated `chaos-500.json` with seed 20260928 at the approved 15% rate. The
validator confirms 500 tickets, exactly 75 flagged records, all ten mutation
types, seven explicit missing-field cases, and zero email-/phone-like pattern
findings. SOP-conflict cases are constrained to payout questions and inject one
explicitly simulated conflicting procedure. The 50-ticket baseline was
regenerated and revalidated with the finalized generator.

The syntax checks and both batch validations pass. Twenty flagged examples,
including two of each chaos type, were shown to the owner and approved. That
approval unlocked the Phase 4 run recorded below.

## Simulated ticket exercise — Phase 4 evaluation — 2026-09-28

**data_mode: "simulated".** Evaluated the approved, fixed-seed
`chaos-500.json` in a local headless browser using the shipped decision modules:
MiniLM `embedQuery` → passage `searchTopK` → `evaluateGate` → `buildAgentView`.
The fictional SOP corpus and ticket text stayed in the local browser. No
Supabase session, tenant data, database write, or telemetry transport was used.
The pinned model files were loaded from Hugging Face; only the synthetic query
text was passed to the local ONNX model.

**Measured result:** 242/500 expected dispositions correct (**48.4%**), 258
false escalations (all `insufficient_margin`), **0 unsafe/wrong-SOP answers**,
and **0 runtime errors**. Chaos subset: 41/75 correct (54.7%); baseline:
201/425 correct (47.3%). Per-query decision latency: mean 17.02 ms, median
16.30 ms, p95 24.20 ms, max 37.90 ms; model load was 25.87 s and index build
0.90 s, reported separately.

All 258 failures were false escalations. By ticket type, 224 were baseline,
6 off-hours-spike, 6 missing-field, 5 mixed-language/typo/tone, 4 wrong-category,
4 handoff, 3 wrong-field, 3 reopened, and 3 near-duplicate cases. The report
contains per-ticket scores and the ten worst failures with their simulated
ticket content.

Artifacts: `phase4-report.json` (all 500 fully tagged results) and
`phase4-report.md` (summary and ten failure examples), alongside the pinned
input batch. This is a measured local decision-path evaluation, not a live
production/adoption metric or a test of authenticated UI/transport behavior.
The original Phase 4 per-ticket report was later overwritten by the first
Phase 5 run when the report runner reused these filenames; its aggregate
baseline figures above are preserved, but its original per-ticket results are
not.

## Simulated ticket exercise — Phase 5 hardening — 2026-09-28

**data_mode: "simulated".** Re-ran the same approved 500-ticket batch through
the browser-local shipped decision path while iterating on synthetic test
corpus coverage. No app source, production gate default, live tenant, backend,
or transport was changed.

| Run | Test setup | Correct | False escalations | Unsafe answers | Runtime errors |
|---|---|---:|---:|---:|---:|
| Phase 4 baseline | Original English-only fictional SOPs, margin 0.18 | 242/500 (48.4%) | 258 (51.6%) | 0 | 0 |
| Phase 5 round 1 | Localized fictional SOP summaries, margin 0.18 | 269/500 (53.8%) | 231 (46.2%) | 0 | 0 |
| Phase 5 round 2 | Localized and symptom-specific fictional summaries, margin 0.18 | 335/500 (67.0%) | 165 (33.0%) | 0 | 0 |
| Phase 5 round 3 | Same round-2 corpus, evaluation-only margin 0.17 | 362/500 (72.4%) | 138 (27.6%) | 0 | 0 |
| Stability repeat | Exact round-3 settings and same batch | 362/500 (72.4%) | 138 (27.6%) | 0 | 0 |

The input batch SHA-256 remained
`717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96`;
the round-3 and stability corpus hashes also match
(`e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`).
Comparing all 500 per-ticket decisions across the two 0.17 runs found zero
disagreements. All 500 result rows in each report are tagged
`data_mode: "simulated"`.

The latest repeat measured decision latency mean 18.68 ms, median 18.30 ms,
p95 25.50 ms, max 33.60 ms. All 138 failures are false escalations caused by
`insufficient_margin`; there were no wrong-SOP answers or runtime errors. The
0.17 margin is only an evaluation-harness override, not the product default.
The recorded sweep found that going below 0.17 admitted wrong answers on
conflicting-SOP examples, so further relaxation is not a safe fix.

**Outcome: accuracy is repeatable on this fixed synthetic batch, but the
27.6% failure rate is not low.** The requested low-and-stable stopping
criterion is therefore unmet. Further corpus tuning risks fitting the
synthetic examples, and lowering the gate further has a measured safety cost;
no claim of production accuracy or readiness is supported. See
`tooling/eval/simulated-tenant/phase5-comparison.md` and the round-1, round-2,
round-3, and stability JSON/Markdown reports. The subsequent deployed-path
validation and Phase 6 package are recorded below. Phase 7 is redefined below,
because there is no design partner; publication of these changes has not yet
been performed.

## Phase 5 margin safety probe — 2026-09-28

**data_mode: "simulated".** Re-ran the unchanged approved 500-ticket batch and
corpus in the local shipped decision path at a test-only margin of 0.16. It
raised measured accuracy by one disposition (363/500, 72.6%) over margin 0.17,
but answered two payout cases whose expected handling is escalation because
the simulated policy set contains contradictory guidance. The run therefore
has 135 false escalations, 2 unsafe answers and a 27.4% failure rate. This is
not an acceptable hardening change; the shipped default remains 0.18 and the
evaluation baseline remains 0.17.

The results, including the two synthetic examples, are in
`tooling/eval/simulated-tenant/phase5-original-margin-016.json` and `.md`.
The 0.17 baseline also remains unchanged. No real customer data is used, and
there is no design partner.

## Deployed-path simulation and Phase 6 package — 2026-09-28

**data_mode: "simulated".** The approved 500-ticket batch was exercised through
the public Vercel app, isolated signed policy bundles, browser MiniLM and gate,
and the development Supabase ingest path. This is deployed-path validation, not
production-customer evidence.

**Valid full run:** `0aec9773442c4282`, seed `20260928`, same batch SHA-256
`717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96` and
corpus SHA-256 `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe`.
With the evaluation-only margin 0.17 verified through real keyboard input and
the displayed React state, results were **361/500 correct (72.2%)**, 138 false
escalations, **1 unsafe answer**, and 0 runtime errors. Browser click-to-render
latency: mean 22.38 ms, median 21.70 ms, p95 32.70 ms, max 47.30 ms. The
database audit confirmed 500/500 tagged query events, 261/261 escalation
records, 15 tagged SOP versions, 4 tagged user profiles, 2 tagged tenants, 2
active agent web devices, and 0 untagged audited rows.

The sole unsafe answer was synthetic contradictory payout ticket
`SIM-TICKET-00272`. Its tagged event records a 0.1807574329 top-one/top-two
margin, `minMargin: 0.17`, and an answer to `wc-payout`. Since `gate.ts`
accepts when `margin >= minMargin`, this measured score is also above the
shipped 0.18 default. The local 0.17 repeat was 362/500 with no unsafe answers;
the one deployed/local mismatch proves the local repeat is not a sufficient
safety claim. No product code or shipped default was changed. Failure is 27.8%
in this deployed run and 27.6% locally; the low-and-stable criterion remains
unmet.

**Harness defects found and corrected while proving the path.**

1. Run `e301cb5b45444040` delivered all 500 tickets but failed while constructing
   its report because the report object referred to itself during initialization.
   The report serialization was fixed before the valid run; this attempt has no
   report artifact.
2. Run `c1de47a173764e5f` changed the range element's DOM value without
   confirming React state, and its output contained 1 unsafe answer. The report
   is retained and marked invalid for threshold comparison; do not use its
   stated margin as applied.
3. Run `5209afa44d814f7f` completed and delivered the 493 non-conflict tickets,
   then exposed a race: bundle publication occurred before the conflict tenant's
   web device had enrolled. The run stopped before publishing that tenant's
   bundle. The harness now waits for that exact agent's active web device and
   audits the resulting device rows.
4. The corrected one-ticket conflict smoke (`f2c81013086d4327`) and the valid
   full run both confirmed the React margin and completed the enrollment audit.

All test-created tenants, profiles, SOP version notes, device rows, bundles,
events, escalations, visible browser output, and reports are associated with
`data_mode: "simulated"` or an explicitly named SIMULATED DATA tenant. Failed
attempts are retained only as clearly tagged development-project test data; no
cleanup or deletion was performed.

**Phase 6 deliverables.** Added root `proof-of-concept.md`, which records the
fictional profile, local before/after results, deployed-path results, limitations,
and the unsafe counterexample without presenting it as production accuracy.
Added `tooling/eval/simulated-tenant/screen-recording-instructions.md` with a
visible one-ticket workflow and credential/privacy precautions. Its two Enter
checkpoints were exercised in a visible-browser near-duplicate smoke
(`5c77413c866f4b10`); this was not counted as batch accuracy evidence.

**Phase 7 has no design partner.** No partner examples exist to compare against,
and none will be requested: there is no design partner, and no partner data was
created, stored, logged, or transmitted. The comparison is therefore redefined as
a real-phrased query set collected from public sources and labelled by the owner.
Stage 1 of that redefinition is recorded in the section below.

Reproduce the batch validator with:

```powershell
node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json
```

The valid deployed run report and detailed comparison are in
`tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.json`,
`.md`, and `phase5-comparison.md`. The public-app backend remains the development
Supabase project; do not describe these results as production-customer usage.

## Label fix, conflict lint, and Phase 7 without a partner — 2026-09-28

**data_mode: "simulated"** for the ticket batch and corpus. The real-phrased
query set is public wording, tagged `public-wording`. No design partner exists
and none is referenced anywhere in this work.

**Task A — label fix (`expectedOutcome`).** Added
`tooling/eval/simulated-tenant/expected-outcome.ts`. Every query now carries an
`expectedOutcome` of `answer` or `escalate`, derived in code from the batch's own
expected decision plus a code-encoded rule: a truncated query is expected to
escalate when it has fewer than four words or no surviving procedure trigger
keyword, and the keyword test is scoped to the query's own language. The pinned
batch was **not** modified, so `chaos-500.json` keeps its SHA `717c40dc…`; the
field is computed into every report row.

Measured on the same 500-ticket local path at the evaluation-only 0.17 margin
(`phase5-label-fix-margin-017.json` / `.md`):

| Measure | Before (batch labels) | After (label fix) |
|---|---:|---:|
| Correct | 362/500 (72.4%) | 362/500 (72.4%) |
| False escalations | 138 | 138 |
| Unsafe answers | 0 | 0 |
| Runtime errors | 0 | 0 |
| Queries reclassified | — | **0** |

The correction reclassifies **0** queries, because the batch contains no
truncated query: the shortest message is 14 words, no message ends in an
ellipsis, and none ends on a dangling article, preposition or conjunction. The
deployed path was therefore **not** re-run — the expected-decision counts did not
change. Two findings are recorded rather than hidden: the keyword test would
mislabel 112 non-English queries if it were not language-scoped (the corpus's
`triggerKeywords` are English while the corpus is four-language), and 2 English
typo-mutation queries lose their keyword to the mutation while keeping their
meaning. Both are left as `answer`.

**Task B — conflict lint.** Added `tooling/conflicts/lint-procedure-conflicts.mjs`
(report-only: exit 0 clean, 1 on conflict, 2 usage/input) and
`tooling/conflicts/verify-conflict-lint.mjs` (regression test, now a suite in
`pnpm run verify`). The lint extracts the numeric policy facts a procedure
asserts (payout/processing windows, minimum age, minimum followers, fees, payout
minimums), skips sentences that explicitly reject a value rather than assert it,
and reports same-category pairs whose asserted values are disjoint.

| Corpus | Procedures | Conflicts | Exit |
|---|---:|---:|---:|
| `corpus.json` | 7 | 0 | 0 |
| `corpus.json` + injected `wc-payout-conflict` | 8 | 1 | 1 |

The flagged pair is `Creator payouts / window_days`: `wc-payout` asserts 2–5
business days, `wc-payout-conflict` asserts 1 business day. The regression test
reproduces the case from `chaos-500.json` `SIM-TICKET-00272` itself and asserts
the lint catches it; no threshold was tuned to make it pass. **No shipped code
uses the lint.** `docs/decisions/conflicting-procedures.md` records the problem,
the measured case (top-one/top-two margin 0.180757 against a shipped default of
0.18), and two proposed fixes with trade-offs, awaiting the owner's decision.

**Task C — Phase 7, stage 1 (prepare).**
`tooling/eval/simulated-tenant/real-phrased-queries.csv` holds **72** real support
questions quoted from public sources — 46 public-forum thread titles and 26
help-centre FAQ titles — with the wording only, no usernames and no personal
details, and `my_label` / `my_sop_id` left empty. `my-floor-queries.template.csv`
carries 5 clearly marked EXAMPLE rows for the owner's own 40–60 patterns.
`tooling/eval/score-real-phrased.mjs` scores the filled CSVs through the same
browser-local MiniLM → retrieval → gate → agent-view path, reports accuracy,
false escalations, unsafe answers and a per-source breakdown, and refuses to run
while any row is unlabelled: verified, it exits 2 and names all 72 rows. A 5-row
smoke run exercised the path end to end (`real-phrased-smoke.json` / `.md`: 4
scored, 1 ambiguous, 3/4 correct, 1 false escalation, 0 unsafe); it is a path
check, not a result. **Stage 1 stops here. The agent labelled nothing.**

**Task D — documents.** `proof-of-concept.md` rewritten: no partner wording, the
development Supabase project named as such, the before/after label fix, the one
unsafe answer and its measured margin, a "What this proves / what it does not
prove" section, and an explicit statement that production readiness is not
proven. Added `docs/SIMULATED_TENANT_BRIEF.md`. Updated `docs/PRODUCTION_STATUS.md`
and the README status claim. The README claim reads exactly: "Validated on 500
simulated tickets through the deployed path with tenant isolation audited; one
unsafe answer found and documented."

**Gate change.** `tooling/run-verification.mjs` now runs seven JS harnesses; the
conflicting-procedure lint is the seventh.

## False-escalation analysis, and the scale of the evidence — 2026-09-28

Read-only analysis of the 138 false escalations, added as
`tooling/eval/analyze-false-escalations.mjs` → `false-escalation-analysis.md`.
No product code, gate logic, threshold, procedure, or recorded result file was
changed.

**Scale, now stated wherever the 500 figure appears.** The 500 tickets carry only
**47 distinct messages** (en 17, es 13, pt-BR 8, fr 10, plus one ticket whose
language column `missing_fields` removed) across **7 procedures**. The 138 false
escalations come from **17** distinct messages. Ticket counts are therefore
weighted by template repetition and are not independent observations. The README
status claim now reads: "Validated on 500 simulated tickets (47 distinct
messages, 7 procedures, four languages) through the deployed path with tenant
isolation audited; one unsafe answer found and documented."

**Measured.** All 138 false escalations were blocked for `insufficient_margin`;
none for an absent candidate or the absolute floor. The expected procedure was
ranked first in **96** of 138 tickets and not first in **42** (30.4%); at
distinct-message level, 12 of the 17 failing messages have the expected procedure
first throughout and 5 do not. Margin: min 0.013248, median 0.087425, max
0.163173 against an applied 0.17; only 30 of 138 sit within 0.05 below it. The
largest confusion pair is `wc-payout` → `wc-gifts` (49 tickets, 3 distinct
messages, median margin 0.087425).

**Runner-up identity.** `searchTopK` (`packages/vector-store/src/cosine.ts`)
collapses passages to procedures — `bestPerProcedure` — before the gate sees
them, so each procedure contributes at most one candidate and a runner-up can
never be another passage of the same procedure. Measured: 0 of 138. Every false
escalation is a cross-procedure confusion by construction, not by observation.

**Overlap, labelled as observation.** The competing passages behind the three
most frequent confusion pairs share almost no wording — at most two words, no
multi-word phrase. The overlap is topical, not lexical. The `wc-live` passage
carrying "not an eligibility question" while the eligibility passage carries
`LIVE` is recorded as a hypothesis, untested. No procedure was edited.

**Chaos types are not comparable.** Each mutated type carries 7–8 tickets and one
or two distinct messages. `contradicting_sops` and `no_correct_answer` — and the
`wc-security`, `wc-appeal` and `(none)` procedure rows — are 100% correct by
construction, because the expected outcome is escalation and a false escalation
is impossible. They are labelled as such in the report.

**Deployed margins are not measurable.** The deployed-path result records no
candidate scores, so its margin distribution is not reported rather than
estimated. The only recorded deployed margin remains the safety counterexample
(`SIM-TICKET-00272`, 0.180757).

## Publish-path conflict block — decision option (a) — 2026-09-28

**Decision (owner): accepted (a) / (b) deferred.** Branch `feat/publish-conflict-block`,
based on `origin/main`; not merged. `docs/decisions/conflicting-procedures.md`
status updated with the reason: (a) removes the failure class at the source with
no product-behaviour change; (b) would raise the false-escalation rate (already
the largest failure category) and needs a schema change, so it is deferred.

**What changed.**
- `supabase/functions/publish-bundle/index.ts` now runs the conflict check on the
  tenant's decrypted corpus *before* signing. On any same-category numeric
  conflict it returns HTTP **422** with `detail` naming the two procedures, the
  field (`window_days`, …), and both asserted values. No change to the gate, the
  0.18 threshold, or scoring.
- Detection logic is single-sourced in the new `tooling/conflicts/conflict-core.mjs`
  (pure, no `node:` built-ins), imported by the lint CLI, the Deno publish gate,
  and the harness. `lint-procedure-conflicts.mjs` was refactored to import it; its
  `runCli`/`findConflicts`/`extractPolicyFacts`/`loadCorpus` exports are unchanged,
  so `verify-conflict-lint.mjs` still passes.
- New harness `tooling/conflicts/verify-publish-conflict-block.mjs`, registered as
  the `publish-block` suite in `tooling/run-verification.mjs`.

**Tests, all passing.**
- (a) a conflicting corpus is blocked; (b) the clean 7-procedure corpus publishes;
- (c) the `SIM-TICKET-00272` payout case is blocked and names `wc-payout` vs
  `wc-payout-conflict`, field `window_days`, values 2–5 vs 1 business day;
- (d) negative control — two procedures stating the same window are not flagged;
- (e) the lint's stated limitation (English number words only) is locked: a
  Spanish-only conflicting pair is NOT flagged while the English equivalent IS.

**Verification.** `pnpm run verify` 8/8 suites pass (incl. `publish-block`); the
500-ticket validator passes; `pnpm run lint` passes (only `@sop/web` ships a lint
task). The earlier `(7,7)` extraction from `wc-payout`'s escalation sentence is
pre-existing lint behaviour, not a regression, and does not create a conflict
because only cross-procedure pairs are compared.
