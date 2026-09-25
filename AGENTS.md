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
| `tooling/eval` | Parity harness, golden set, retrieval evaluation |
| `tooling/sync` | `verify-sync.mjs` — the 31-check sync verification |
| `tooling/db` | `verify-phase2.sh` — brings up PostgreSQL, applies everything, runs the RBAC matrix |
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
| 5 | Telemetry + threshold-failure dashboard | **complete** (2026-09-25) — 17-probe DB matrix, 0 failures; client queue built + wired; transport + Supabase runtime still unbuilt |
| 6 | Tauri + Expo packaging | **complete** (2026-09-25) — debug and release desktop binaries linked; persistence adapters 19/0; mobile typechecked (Metro/native packaging still blocked) |
| 7 | Hardening and audit | **complete** (2026-09-25) — rotation 13/0; DB write-boundary + RLS suites 99/0, 17/0, 40/0; queue 30/0 |

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
2. `bash tooling/db/verify-phase7.sh` — all three suites OK: RBAC matrix (99/0),
   Phase 5 telemetry (17/0), and the bypass suite (**40/0**).
3. `node tooling/telemetry/verify-queue.mjs` — **30 checks, 0 failures**.
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
   17 Phase 5, 40 bypass probes, 0 failures**.

**Current measured result on the completed corpus.** MiniLM recall@1 is 78%,
recall@5 is 100%, and the precision-qualified auto-answer rate is **8/50 (16%)**
at margin 0.18 with no measured wrong procedure or out-of-scope acceptance.
BGE has 80% recall@1 but the same 8/50 auto-answer result. One disjoint hold-out
fold falls to 0.857 precision, so no global threshold is validated. The answer
criterion still fails its 25/50 requirement; the escalation path remains the
primary product experience.

**Verification.** Full workspace typecheck, lint, and build are green; the
optimized Tauri binary links. Sync 31/0, persistence 19/0, rotation 13/0, legacy
parity 25/0, queue 30/0, gate 10/0, and database 99/17/40 all pass. Headless
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
