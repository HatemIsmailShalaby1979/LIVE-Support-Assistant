# System Design Document — Explainable SOP Escalation & Audit Engine

**Project:** live-support-assistant → Enterprise SOP Escalation & Audit Engine
**Status:** Design (v1.0) — approved plan precedes any implementation
**Author:** Codex (agent), for Hatem Shelby
**Date:** 2026-09-25

---

## 0. Executive Findings

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Semantic search runs entirely on the client** via `transformers.js` (ONNX Runtime WASM, WebGPU opt-in) running an int8-quantized `all-MiniLM-L6-v2` (384-dim, ~23 MB). | Zero query data leaves the device. Search has no application-backend call. First use downloads model/runtime files from Hugging Face and jsDelivr; packaged offline operation is not yet proven. |
| D2 | **The server is zero-knowledge for SOP content.** Policy bundles are pushed as AES-256-GCM ciphertext. The server never needs plaintext SOP bodies or embedding vectors because search is client-side. | Strongest possible privacy posture for an enterprise selling this as B2B SaaS: a breach of our backend does not expose client SOPs. |
| D3 | **Vector retrieval is brute-force cosine over an in-memory matrix** — no ANN index on the client. | Enterprise SOP corpora are 10²–10⁴ documents. 10,000 × 384-dim cosine scan is < 5 ms on WASM SIMD. Determinism and explainability beat approximate recall. |
| D4 | **Model revision is pinned per policy bundle.** Embeddings from different quantizations/revisions are not comparable; the bundle records the exact model hash. | Cosine scores must be deterministic and comparable across clients and time, or the Confidence Gate is meaningless. |
| D5 | **No generative LLM exists anywhere in the answering path.** The Confidence Gate is a hard threshold on retrieval scores; below threshold the system returns no answer and creates a structured escalation. | Zero hallucination is an architectural property, not a prompt-engineering hope. |
| D6 | **Supabase (PostgreSQL + RLS) is the Command Center.** Multi-tenancy is enforced by row-level security keyed on `tenant_id` claims in the JWT. | Fastest path to auth, RBAC, realtime push, and storage without operating a bespoke backend. |
| D7 | **Monorepo via Turborepo + pnpm.** Shared domain logic in `packages/*`; three thin platform shells. | One definition of the Gate, the sync protocol, and the telemetry schema — verified once, deployed three times. |

---

## 1. System Architecture

```mermaid
graph TB
    subgraph "Client Devices (Edge)"
        subgraph "Web (React/Vite PWA)"
            WUI[UI Shell]
        end
        subgraph "Desktop (Tauri v2)"
            DUI[UI Shell]
        end
        subgraph "Mobile (React Native/Expo)"
            MUI[UI Shell]
        end

        subgraph "Shared Edge Core (packages/*)"
            EMB[Embedder<br/>transformers.js<br/>MiniLM-L6-v2 int8]
            VDB[Vector Store<br/>in-memory matrix<br/>brute-force cosine]
            GATE[Confidence Gate<br/>threshold + escalate]
            SYNC[Sync Client<br/>pull/push + decrypt]
            TEL[Telemetry Queue<br/>batched, idempotent]
        end

        subgraph "Local Secure Storage"
            IDB[(IndexedDB<br/>Web)]
            SQL[(SQLite<br/>Tauri / Expo)]
        end
    end

    subgraph "Enterprise Command Center (Supabase)"
        AUTH[Auth + RBAC<br/>JWT with tenant_id]
        RLS[(PostgreSQL + RLS<br/>SOP lifecycle, bundles, telemetry)]
        RT[Realtime<br/>bundle-push channel]
        EDGE[Edge Functions<br/>enrollment, bundle signing]
        DASH[Analytics Dashboard<br/>threshold-failure analytics]
    end

    OPS[Ops Manager] -->|authors / versions SOPs| AUTH
    AUTH --> RLS
    RLS --> RT
    RT -->|WebSocket: new bundle_id| SYNC
    SYNC -->|pull manifest + ciphertext| EDGE
    EDGE -->|AES-256-GCM payload| SYNC
    SYNC -->|plaintext (device-local)| IDB
    SYNC --> SQL

    WUI --> EMB
    DUI --> EMB
    MUI --> EMB
    EMB --> VDB --> GATE
    GATE -->|≥ threshold: SOP + evidence| WUI
    GATE -->|< threshold: blocked + escalation record| WUI
    GATE --> TEL
    TEL -->|batched HTTPS + offline queue| EDGE
```

**Reading the diagram.** Three platform shells delegate everything to one shared edge core. The Command Center sees only metadata and ciphertext; the device sees plaintext SOPs and never sends query content home — only structured telemetry events.

---

## 2. Edge AI Execution — Local Semantic Search

### 2.1 Model selection

| Property | Value |
|---|---|
| Model | `sentence-transformers/all-MiniLM-L6-v2`, ONNX export, int8 dynamic quantization |
| Dimensions | 384 |
| Size on disk | ~23 MB (quantized) + tokenizer (~0.5 MB), cached after first run |
| Runtime | `@huggingface/transformers` v3 (ONNX Runtime WASM with SIMD; WebGPU backend where available, WASM fallback) |
| Throughput | ~50–150 embeddings/sec on mid-range laptop WASM; batch encoding of a full 5,000-doc corpus ≈ 30–90 s one-time, incremental thereafter |

### 2.2 Determinism contract

1. The bundle manifest records `model_id`, `model_revision`, `quantization`, `ort_version`. The client refuses to serve search if the loaded model hash ≠ manifest hash.
2. All SOP vectors are computed **once at publish time is forbidden** — wait, correction: vectors are computed **on the device from the bundle's plaintext**, at the moment the bundle is installed, using the pinned model. This guarantees every client's vectors are bit-comparable with its own query vectors. The server never stores or computes vectors at all.
3. Score determinism: cosine similarity over float32, no approximate index, no temperature, no sampling. The same input under the same bundle version yields the same score on every device — this is what makes the audit log trustworthy.

### 2.3 Retrieval algorithm (deterministic)

```
on query(q):
    v_q = embed(q)                                  # pinned model, float32
    candidates = top_k(cosine(v_q, V_matrix), k=5)  # full scan, SIMD
    best   = candidates[0]
    if best.score >= tenant.threshold:              # default 0.90
        return ANSWER(sop_id=best.id, sop_version, best.score, top_k=candidates)
    else:
        return BLOCKED(escalation, top_k=candidates)  # no synthesis, ever
```

Top-5 candidates are always returned with scores — that is the explainability payload shown to the frontline agent and written to the audit trail.

---

## 3. Encrypted Sync Engine

### 3.1 Threat model and key hierarchy

| Layer | Mechanism |
|---|---|
| Transport | TLS (Supabase) + bundle signatures (Ed25519) |
| Bundle at rest on server | AES-256-GCM ciphertext; server holds keys only for tenant *metadata*, never bundle content |
| Bundle on device | Decrypted in memory, persisted plaintext to app-sandboxed storage (IndexedDB in an origin only we use; SQLite in app-sandbox dirs on Tauri/Expo) |
| Key distribution | Per-device X25519 keypair at enrolment; KEK = HKDF-SHA256(ECDH(device private, tenant public)); the AES-256-GCM content key is wrapped under that KEK with AES-KW (RFC 3394) and unwrapped locally. **Amended 2026-09-25 — §3 originally said the key is "wrapped for each enrolled device's public key", which RFC 3394 cannot do; it is symmetric. See §14.** Key rotation re-wraps for the current device roster. |

### 3.2 Sync protocol (monotonic, append-only)

1. **Publish.** Ops Manager saves a new SOP version → server increments `bundle_version` (monotonic, gap-free per tenant), freezes the bundle, signs the manifest with the tenant signing key.
2. **Notify.** Realtime channel pushes `{tenant_id, bundle_version, manifest_hash}` to online clients. Offline clients discover the new version on next `pull` via checkpoint compare.
3. **Pull & verify.** Client fetches the encrypted bundle, verifies signature and content hash, decrypts with its wrapped content key, embeds the corpus locally, then **atomically installs**: write new store → verify → flip the active-bundle pointer. A failed install leaves the previous version active. Clients never roll back and never accept a version ≤ checkpoint.
4. **Ack.** Device reports install completion; the dashboard shows fleet bundle-currency (who is stale, on which version, since when).

### 3.3 Data staleness solved by construction

Every answer the Gate produces carries `bundle_version`. The UI always displays it. Staleness is therefore *visible on every answer*, and the telemetry lets Ops Managers filter outcomes by bundle version — e.g. "escalation rate dropped 40% after v42 shipped."

---

## 4. Confidence Gate Specification

**Amended 2026-09-25 after Phase 1 measurement. The original single 0.90 absolute
cosine threshold was disproven — see §10 — and replaced by a two-signal rule.**

| Parameter | Default | Owner |
|---|---|---|
| `min_margin` (top-1 minus top-2) | 0.18 prototype starting point | Per-tenant, Ops Manager, change-logged |
| `threshold_accept` (absolute floor) | 0.00 (inert guard) | Per-tenant |
| `top_k` | 5 | Fixed |
| Escalation routing | Tenant-configurable (team, Slack/e-mail webhook) | Ops Manager |

**Rules (hard):**

1. Acceptance requires **both** signals: the winner clears `threshold_accept` and
   holds at least `min_margin` over the runner-up. Either failing produces a
   structured escalation carrying the full query text, bundle version, top-K
   candidates with scores, device/user pseudonym, and timestamp.
2. There is **no** "the model thinks it's close" path, no synthesis, no paraphrase generation, no LLM fallback. The Gate is a comparison operator; the only things above it are retrieval and display.
3. Agent overrides of an accepted match are logged as `override` events with the override reason (free text) — this distinguishes "SOP matched but was wrong" from "no SOP matched," which the dashboard reports as separate curves.
4. Corpus is indexed **passage-wise**, not document-wise. Whole-procedure vectors
   diluted the signal badly enough that no threshold worked at all; see §10.
5. A confident match to an SOP whose own `escalation_required` flag is true is
   still an escalation. The agent view exposes no title, summary, passage, or
   suggested reply; the operations record retains the candidates.

---

## 5. Immutable Audit & Telemetry

### 5.1 Event taxonomy

| Event | Payload (beyond common fields) | Purpose |
|---|---|---|
| `query` | bundle_version, outcome, sop_id?, score?, margin?, gate_reason?, threshold_accept, min_margin, top_candidates [{sop_id, score, passage}] | Core explainability record; candidate evidence is retained for accepted and escalated queries |
| `escalation_created` | escalation_id, query_id, top_1_score | SLA clock starts |
| `escalation_resolved` | resolution, linked_sop_version_id?, time_to_resolve | Close the loop |
| `agent_override` | query_id, chosen_sop_version_id, reason | Detect right-SOP-wrong-match cases |
| `bundle_installed` | bundle_version, install_ms, corpus_size | Fleet currency |
| `sync_failed` | reason code | Ops signal |

*Query text is retained per tenant policy: full text (default), or salted hash for strict-privacy tenants. Scores and SOP references are always retained — the audit value does not depend on the text.

### 5.2 Pipeline properties

- Events are client-generated UUIDs and queued locally. The queue contract is idempotent and dependency-safe, but automatic count/time/reconnect flush is not built; the current client labels the queue local only.
- Delivery must be best-effort and never block search. Query events are capped with a visible overflow flag; retained escalations and their referenced events are never shed to make room.
- Server-side: append-only partitioned tables; no UPDATE/DELETE grants to any role, including service roles used by the dashboard. Corrections are new rows, not edits — immutability by privilege, not by convention.
- **Threshold-failure analytics:** blocked queries are clustered (client-side embedding of escalation queries, k-means, run by an Edge Function) so the dashboard shows "top 10 unaddressed topics this week" — direct SOP-rewrite candidates.

---

## 6. Database Schema (PostgreSQL)

```sql
-- ============ Tenancy & RBAC ============
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  threshold     numeric(4,3) not null default 0.000,
  min_margin    numeric(4,3) not null default 0.180,
  plan          text not null default 'standard',
  created_at    timestamptz not null default now()
);

create type app_role as enum ('ops_manager','sop_editor','team_lead','agent','auditor');

create table users (            -- mirrors auth.users 1:1
  id         uuid primary key references auth.users on delete cascade,
  tenant_id  uuid not null references tenants(id),
  display_name text not null,
  role       app_role not null,
  unique (tenant_id, id)
);

create table device_registrations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  user_id       uuid not null references users(id),
  platform      text not null check (platform in ('web','desktop','mobile')),
  public_key    text not null,              -- enrollment key for content-key wrapping
  status        text not null default 'active',
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id, user_id, platform)
);

-- ============ SOP Lifecycle ============
create table sops (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  title       text not null,                -- plaintext metadata (lifecycle/RBAC only)
  status      text not null default 'draft'
              check (status in ('draft','in_review','published','retired')),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table sop_versions (
  id            uuid primary key default gen_random_uuid(),
  sop_id        uuid not null references sops(id) on delete cascade,
  version       integer not null,
  body_ciphertext bytea not null,           -- encrypted content (zero-knowledge to server)
  body_hash     text not null,               -- SHA-256 of plaintext, for integrity
  change_note   text,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  unique (sop_id, version)
);

-- ============ Policy Bundles (sync unit) ============
create table policy_bundles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  bundle_version  bigint not null,
  manifest_hash   text not null,             -- sha256 over the canonical manifest
  signature       text not null,             -- Ed25519, tenant signing key
  model_id        text not null,             -- e.g. 'all-MiniLM-L6-v2'
  model_revision  text not null,
  quantization    text not null,
  payload_ciphertext bytea not null,         -- AES-256-GCM wrapped corpus + wrapped content keys
  published_at    timestamptz not null default now(),
  published_by    uuid not null references users(id),
  unique (tenant_id, bundle_version)
);

create table device_bundle_acks (             -- fleet-currency tracking
  device_id     uuid references device_registrations(id),
  tenant_id     uuid not null,
  bundle_version bigint not null,
  installed_at  timestamptz not null default now(),
  primary key (device_id, bundle_version)
);

-- ============ Telemetry (append-only) ============
-- AMENDED 2026-09-25 (twice — see §13). PostgreSQL refuses a unique constraint on
-- a partitioned table that omits the partition key, so `id` alone cannot be
-- unique here. Idempotency therefore lives in the ingest ledger below, which is
-- NOT partitioned and carries a plain primary key on `id`.
create table telemetry_events (
  id           uuid not null,
  tenant_id    uuid not null,
  device_id    uuid,
  user_pseudonym text not null,              -- salted hash, never raw identity
  event_type   text not null,
  bundle_version bigint,
  occurred_at  timestamptz not null,
  payload      jsonb not null,
  ingested_at  timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

-- Dedup cache, not an audit record: a maintenance role may prune it. It is the
-- only place the event id is unique, which is what makes ingest idempotent even
-- when a client regenerates its timestamp on retry.
create table telemetry_ingest_dedup (
  id         uuid primary key,
  tenant_id  uuid not null,
  first_seen timestamptz not null default now()
);

-- Ingest is a single function so the claim and the insert cannot half-apply.
-- Returns false when the event was already ingested.
create function app.ingest_telemetry_event(
  p_id uuid, p_device_id uuid, p_user_pseudonym text, p_event_type text,
  p_bundle_version bigint, p_occurred_at timestamptz, p_payload jsonb
) returns boolean;

create table escalations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  -- Provenance, NOT a foreign key: a durable record cannot hold an FK into a
  -- table that is periodically dropped by partition retention. See §13.
  query_event_id uuid not null,
  query_occurred_at timestamptz not null,
  -- The escalation outlives the telemetry that produced it, so it carries its own
  -- copy of the evidence: query text, scores, candidates.
  evidence      jsonb not null default '{}'::jsonb,
  status        text not null default 'open'
                check (status in ('open','assigned','resolved')),
  assigned_to   uuid references users(id),
  resolution    text,
  linked_sop_version uuid references sop_versions(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- Referential integrity is enforced at write time by a SECURITY DEFINER trigger,
-- which also verifies the event belongs to the same tenant. An FK would not have
-- checked the tenant, and would have blocked retention.
create trigger escalations_event_exists
  before insert or update of query_event_id, query_occurred_at on escalations
  for each row execute function app.enforce_escalation_event_exists();

create trigger escalations_references_tenant
  before insert or update of assigned_to, linked_sop_version on escalations
  for each row execute function app.enforce_escalation_references_tenant();

-- ============ Row-Level Security (pattern; repeated on all tenant tables) ============
alter table sops enable row level security;
create policy tenant_isolation on sops
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
-- auditors: SELECT-only policy; agents: no write on sops/sop_versions;
-- telemetry and escalation inserts go only through role-checked ingest functions;
-- telemetry SELECT excludes agents; escalation SELECT is operations-only.
-- Telemetry has no UPDATE/DELETE. Escalation UPDATE is column-limited to workflow
-- fields; evidence, ids, tenant, provenance timestamps, and created_at are immutable.
```

---

## 7. Monorepo Folder Structure (Turborepo + pnpm)

```
live-support-assistant/
├── apps/
│   ├── web/                     # React 19 + Vite PWA (current prototype migrates here)
│   │   └── src/
│   ├── desktop/                 # Tauri v2 shell (src-tauri/ with Rust host)
│   └── mobile/                  # Expo (React Native)
├── packages/
│   ├── core/                    # domain types, Confidence Gate, scoring — pure TS, zero deps
│   ├── embedder/                # transformers.js wrapper, model pinning, batch embed
│   ├── vector-store/            # cosine engine, bundle install/atomic swap
│   │   ├── idb/                 #   IndexedDB adapter (web)
│   │   └── sqlite/              #   SQLite adapter (Tauri / Expo)
│   ├── sync/                    # sync protocol, key unwrap, manifest verify, checkpoints
│   ├── telemetry/               # event schema, queue, batching, flush
│   └── ui/                      # shared React components (answer card, evidence view, gate banner)
├── supabase/
│   ├── migrations/              # schema above
│   ├── functions/               # enrollment, bundle publish/sign, telemetry ingest, clustering
│   └── seed/
├── tooling/
│   └── eval/                    # retrieval eval harness: golden query set, recall@k vs baseline
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

Migration note: the current root-level Vite app becomes `apps/web` verbatim; `src/data/knowledgeBase.json` becomes the first seeded tenant corpus through the SOP lifecycle rather than a bundled file.

---

## 8. Phased Execution Plan

| Phase | Scope | Exit criteria (verified, not asserted) |
|---|---|---|
| **0 — Monorepo scaffold** | Turborepo + pnpm, move prototype to `apps/web`, extract `packages/core` types | `turbo build` green across all workspaces; web app behaves identically to today |
| **1 — Edge embedder POC** | `packages/embedder` + `vector-store`; WASM MiniLM int8; brute-force cosine | Eval harness: ≥ 1,000-query golden set, recall@5 ≥ keyword baseline + 15 pts; p95 embed < 80 ms; index rebuild 5,000 docs < 2 min |
| **2 — Command Center** | Supabase: schema, RLS, auth, SOP lifecycle UI (draft → review → publish) | RBAC matrix enforced by test suite (each role × each table); version history immutable by privilege audit |
| **3 — Sync engine** | Enrollment, key wrapping, bundle sign/publish, pull/verify/atomic-swap, acks | Kill-network test: offline client installs bundle on reconnect; signature-tamper rejected; non-monotonic version rejected; failed decrypt leaves previous bundle active |
| **4 — Confidence Gate + escalation** | Gate in `packages/core`, escalation UI, tenant threshold config | Same-query-same-bundle score identical across web/desktop/mobile; below-threshold shows zero SOP content, creates escalation; threshold change audited |
| **5 — Telemetry + dashboard** | Event queue, ingest, partitioning, threshold-failure clustering, dashboard | Offline-generated events arrive idempotently; dashboard shows escalation rate per bundle version and top unaddressed topics |
| **6 — Platform packaging** | Tauri v2 desktop (macOS/Win), Expo mobile; SQLite adapters; model asset packaging | Signed installers; cold-start < 3 s with cached model; identical Gate test-suite green on all three platforms |
| **7 — Hardening & audit** | Key rotation drill, threat-model review, load test telemetry ingest, pen-test RLS | Rotation re-wraps roster without reinstall; 10k events/s ingest sustained; RLS bypass test suite empty |

Dependencies: 1 and 2 are parallelizable. 3 depends on both. 4–7 are sequential. No code in this phase — implementation begins at Phase 0 only on approval.

---

## 9. Known Risks & Open Decisions

| # | Item | Position |
|---|---|---|
| R1 | Quantized int8 embeddings score slightly lower than fp32 — thresholds must be calibrated on the quantized model, not ported from fp32 intuition. | Calibration is part of Phase 1 exit criteria. |
| R2 | `transformers.js` first-run download (~24 MB) on mobile networks. | Model bundled as an app asset on Tauri/Expo; only web downloads lazily with progress UI. |
| R3 | Zero-knowledge server means server-side backup of SOP *content* is meaningless — the ciphertext + per-device keys mean a tenant that loses all devices loses content. | Optional tenant escrow key (Ops-Manager-held, split secret) offered at onboarding; default off, documented. |
| R4 | Open decision: escalation channel surface (in-app only vs Slack/Jira webhooks). | Deferred to Phase 4 with tenant input. |
| R5 | Open decision: strict-privacy tenants hashing query text lose the topic-clustering feature. | Accepted trade-off, per-tenant choice. |

---

*Design complete. Implementation awaits approval of Phase 0.*

---

## 10. Phase 1 Baseline Results — Placeholder Corpus (2026-09-25; superseded)

The figures in this section describe the original corpus while procedure 2 still
contained a literal placeholder summary. They remain useful as a historical
record of why absolute cosine thresholds failed, but they are not current
product measurements. §11A supersedes the answer-rate and model-choice tables.

Executed on this machine: `Xenova/all-MiniLM-L6-v2` at revision
`751bff37182d3f1213fa05d7196b954e230abad9`, int8 (`q8`) quantisation, ONNX Runtime
WASM/native, 384 dimensions, CPU only. Golden set: 50 in-scope queries written as
customers write, 15 out-of-scope queries with no answer in the corpus.

### Retrieval

| Metric | Keyword (shipped prototype) | Semantic (MiniLM int8) |
|---|---|---|
| recall@1 | 18.0% (9/50) | 72.0% (36/50) |
| recall@5 | 20.0% (10/50) | **100.0% (50/50)** |
| queries with no candidates at all | 38 of 50 | 0 |

Recall@5 improved by **80 points**. The keyword matcher produced no candidate at
all for 76% of real customer messages.

### Latency and scale

| Measurement | Result |
|---|---|
| Model load, cold cache | 508 ms |
| Corpus embed (5 procedures / 22 passages) | 124 ms |
| Query embed + search, p50 / p95 | 2.4 ms / 3.3 ms |
| Batch embedding throughput | ~526 passages/sec |
| Projected index build, 5,000 procedures (~22,000 passages) | 41.8 s |
| Search over 5,000 / 10,000 synthetic vectors, mean | 4.6 ms / 9.2 ms |

All three performance criteria met with wide margins.

### The finding that changed the design

**An absolute cosine threshold cannot gate this system.** Measured distributions:

| | min | p10 | median | p90 | max |
|---|---|---|---|---|---|
| in-scope top-1 cosine | 0.217 | 0.260 | 0.402 | — | — |
| out-of-scope top-1 cosine | — | — | 0.242 | 0.368 | 0.460 |

The distributions overlap almost completely. The best absolute threshold reaching
0.95 precision answered **1 of 50** in-scope queries. The design document's 0.90
default answered **0 of 50**. MiniLM's absolute similarity scale is compressed and
corpus-dependent, so it carries almost no information about whether an answer
exists.

The **margin between top-1 and top-2** does carry that information:

| Gate | Answers correctly | Wrong procedure | Out-of-scope accepted | Precision |
|---|---|---|---|---|
| absolute 0.90 (as designed) | 0/50 | 0 | 0 | — |
| best absolute at ≥0.95 precision | 1/50 | 0 | 0 | 1.000 |
| margin ≥ 0.15 | **15/50** | 0 | 0 | 1.000 |
| margin ≥ 0.12 | 19/50 | 1 | 1 | 0.905 |

Passage-level indexing (title, per-sentence, escalation rule) also lifted the
in-scope median from 0.355 to 0.402 and the minimum from 0.127 to 0.217 versus
whole-document vectors.

### Honest limits of this measurement

- **One criterion is not met.** The Phase 1 exit criterion required a gate at
  ≥0.95 precision answering ≥50% of in-scope queries. The best measured operating
  point answers 15/50 = 30%. The gate is *precise* but *conservative*: three of
  every four answerable queries escalate to a human.
- **The corpus is five procedures.** Margin is a weak statistic over five
  candidates, and out-of-scope queries are topically adjacent (same platform,
  same support domain), which makes them hard negatives. Whether the margin
  signal separates better on an enterprise-sized corpus is **unmeasured** and is
  the first thing a larger golden set should establish.
- **The sample is 65 queries.** Enough to disprove 0.90 and to rank two
  retrievers; not enough to publish a threshold. The 0.15 margin must be
  re-calibrated per tenant on their own labelled traffic.
- **No accuracy claim is made for the production path.** The web client still
  runs the Phase 0 keyword configuration; the semantic path is measured, not
  shipped.

### Consequence for the plan

The 30% auto-answer rate is a product problem, not a gating problem, and it
should be resolved before Phase 2 builds lifecycle management on top of it.
Three candidate directions, in order of expected value:

1. **Reranking.** Retrieve top-20 by cosine, then score with a cross-encoder
   small enough to run on-device. Cross-encoders separate far better than
   bi-encoders and would attack the overlap directly.
2. **A stronger embedding model.** `bge-small-en-v1.5` or `e5-small-v2` at int8
   are the same order of magnitude in size and are trained for retrieval rather
   than sentence similarity.
3. **Per-tenant calibration at onboarding.** Ship a labelled onboarding set, and
   derive the margin from the tenant's own corpus rather than a global default.

---

## 11. Phase 1 Second Pass — Placeholder Corpus (2026-09-25; methodology superseded)

The model runs and raw score observations below were executed, but the product
metric counted manual-review SOP matches as auto-answers, the reranker received
only five procedure candidates rather than 20 passages, and both hold-out folds
reused the full out-of-scope set. §11A records the corrected rerun. Do not use
this section as the current model or threshold decision.

The three directions above were tested in order. All three failed to improve on
the 30% answer rate. The results are negative and are recorded as such.

### Lever 1 — a retrieval-trained bi-encoder: rejected

| Model | recall@1 | recall@5 | Best gate at ≥0.95 precision |
|---|---|---|---|
| `all-MiniLM-L6-v2` (incumbent) | 72.0% | 100.0% | margin 0.145 → **15/50 (30.0%)** |
| `bge-small-en-v1.5` | **76.0%** | 100.0% | margin 0.105 → 5/50 (10.0%) |
| `e5-small-v2` | **76.0%** | 100.0% | margin 0.045 → 3/50 (6.0%) |

Both retrieval-trained models **improved recall@1 and made the gate worse**. Their
top-1/top-2 margins are smaller and noisier, so the confidence signal degraded
even as retrieval improved. This is the central lesson of the phase: **recall and
gate separability are different objectives, and the second one is what the product
runs on.** MiniLM remains the default.

### Lever 2 — cross-encoder reranking: rejected

`ms-marco-MiniLM-L-6-v2` over the top-20 shortlist, scores sigmoid-normalised:

| | recall@1 | Best gate at ≥0.95 precision |
|---|---|---|
| bi-encoder only | 72.0% | 15/50 (30.0%) |
| with reranker | **58.0%** | 3/50 (6.0%) |

Reranking **reduced** recall@1 by 14 points. A sanity check on three hand-picked
pairs (`tooling/eval/reranker-sanity.mjs`) confirms the query/passage pairing into
the tokenizer is correct — the correct passage does score above the wrong one —
but the absolute scores are compressed to near zero: **0.0002 against 0.0002** on
one pair, 0.0008 vs 0.0000 and 0.0182 vs 0.0000 on the others. The model is
operating far outside its trained regime (MS MARCO web passages, not short policy
sentences) and the int8 build appears to have degraded further. Reranking is not
disproven in general; it is disproven **as configured here**, and it is not worth
further effort until the corpus is realistic.

### Lever 3 — is a global threshold defensible? No.

Hold-out validation: calibrate the margin on half the golden set, evaluate on the
other half.

| Split | Calibrated margin | Held-out result |
|---|---|---|
| train even → test odd | 0.145 | 7/25 correct, 0 wrong, precision 1.000 |
| train odd → test even | 0.135 | 10/25 correct, 1 wrong, precision **0.909** |

The margin itself is reasonably stable (0.135–0.145), but precision on unseen
queries fell to **0.909** in one fold — below the 0.95 bar. A global constant is
therefore not reliably shippable.

### Conclusion

The 30% answer rate is a property of the corpus and of the margin statistic, not
of the model. With five procedures, the top-1/top-2 margin is a weak statistic,
and the out-of-scope queries are topically adjacent hard negatives. **The highest-
value unknown is corpus size**, and it is untested: a 5,000-procedure tenant may
separate far better than five. That experiment needs a realistic corpus, which is
Phase 2 work.

Until then the honest product claim is: *the gate answers about a third of
answerable queries with zero measured errors, and escalates the rest.* That is a
defensible product — it is the design's own thesis that the hard part is the
handover — but the escalation path must be designed as the primary experience, not
the fallback. **Threshold calibration moves from a shipped default to a per-tenant
onboarding step.**

---

## 11A. Completed-Corpus Re-measurement and Evaluation Audit (2026-09-25)

Procedure 2's placeholder summary was replaced with dated public policy text
from TikTok's **Content violations and bans** help article. Passage extraction
expanded the corpus from 22 to 26 passages, which changed retrieval and every
margin downstream. Re-running the same evaluation exposed two methodology bugs
as well as stale conclusions.

### Corrections made before accepting the new numbers

1. **Auto-answer policy is now honest.** A correct retrieval of SOP 2 or SOP 5
   is a successful manual-review routing, not an auto-answer. A confidently
   matched SOP with `escalation_required = true` now produces the same
   content-free `EscalationView` as a blocked gate decision.
2. **The reranker receives the promised shortlist.** `searchTopKPassages` returns
   the top 20 passages without procedure collapsing. The reranker scores all 20,
   then passages collapse back to their best procedure.
3. **Threshold candidates are observed margins.** Calibration no longer searches
   a 0.005 grid whose displayed value can imply precision the exact scores do
   not have; it evaluates the actual observed margin values.
4. **In-scope and out-of-scope hold-outs are disjoint.** Each fold calibrates on
   one half of both sets and tests only on the other halves.

### Current retrieval and answer-rate evidence

| Model | recall@1 | recall@5 | Auto-answers at ≥0.95 precision | Manual-only correct matches |
|---|---:|---:|---:|---:|
| `all-MiniLM-L6-v2` (incumbent) | 78.0% | 100.0% | **8/50 (16.0%)** | 3 |
| `bge-small-en-v1.5` | **80.0%** | 100.0% | **8/50 (16.0%)** | 1 |
| `e5-small-v2` | 74.0% | 100.0% | 1/50 (2.0%) | 1 |

BGE wins recall@1 by two points but ties the product metric. MiniLM remains the
incumbent; this is not evidence that it is the right model for a tenant corpus.

The incumbent threshold audit exposed a safety regression in the former default:

| Fixed margin | Auto-answers | Manual-only matches | Wrong | False accepts | Precision |
|---:|---:|---:|---:|---:|---:|
| 0.15 | 10/50 | 4 | 0 | 1 | 0.909 |
| **0.18** | **8/50** | 3 | 0 | 0 | **1.000** |
| 0.19 | 6/50 | 1 | 0 | 0 | 1.000 |
| 0.20 | 5/50 | 1 | 0 | 0 | 1.000 |

`DEFAULT_GATE_CONFIG.minMargin` therefore moves from 0.15 to **0.18**. This is
the lowest fixed audited margin retaining the precision bar in-sample, not a
validated tenant constant.

### Corrected hold-out evidence

| Split | Calibrated margin | Held-out result |
|---|---:|---|
| even train → odd test | 0.1455 | 6/25 auto-answered, 1 manual-only, 1 false accept, precision 0.857 |
| odd train → even test | 0.1853 | 3/25 auto-answered, 0 wrong, precision 1.000 |

The out-of-scope leakage is removed, and the result is worse in one fold. The
hold-out uses the **predeclared MiniLM incumbent**, not a model chosen after
seeing all labels. A global threshold still is not defensible; calibration
remains a tenant-onboarding step.

### Corrected reranking and performance evidence

The cross-encoder now really scores 20 passages per query. It is not selected
for deployment on this evidence. It reduces recall@1
to 70% and the precision-qualified auto-answer rate to **2/50 (4%)**. Its p95
latency measured 79.6–82.8 ms across repeated runs, straddling the 80 ms
retrieval budget before UI or storage work. It remains rejected as configured.

The MiniLM bi-encoder path measures 2.6 ms p95 query latency and projects a
5,000-procedure index build at 85.3 seconds in the latest run (85.1–96.5 seconds in
the first corrected run). Both scale criteria pass, but the projection varies
with host throughput and remains measured rather than enterprise evidence. The
answer-rate criterion still fails: **8/50 is below the required 25/50**.

### Decision

- Keep MiniLM pending representative tenant data; BGE is a challenger, not a
  default.
- Keep manual-review SOPs content-free to the agent at every confidence level.
- Use 0.18 only as a conservative prototype starting point.
- Do not restore the old 30% claim. It measured a different corpus and counted
  procedures that the product must route to a human as auto-answers.

---

## 12. Phase 2 — Command Center, Verified Against a Real PostgreSQL (2026-09-25)

Built and executed. The schema, the row-level security policies, the table
privileges and the monotonic bundle guard all run against PostgreSQL 17 in a
container; nothing in this section is a description of intended behaviour.

**Artifacts**

| Path | Contents |
|---|---|
| `supabase/migrations/0001_local_auth_shim.sql` | `auth.jwt()` / `auth.uid()` / `auth.users`, so Supabase policy text runs verbatim on plain PostgreSQL |
| `supabase/migrations/0002_tenancy_rbac.sql` | tenants, users, device registrations, `app_role`, claim helpers |
| `supabase/migrations/0003_sop_lifecycle.sql` | sops, sop_versions, policy_bundles, device_bundle_acks, monotonic version trigger |
| `supabase/migrations/0004_telemetry.sql` | partitioned telemetry, escalations |
| `supabase/migrations/0005_rls_policies.sql` | row-level security for all nine tables |
| `supabase/migrations/0006_grants.sql` | table privileges — the append-only guarantee |
| `supabase/tests/rbac_matrix.sql` | 59 probes across 7 sections |
| `tooling/db/verify-phase2.sh` | drops the database, reapplies everything, runs the matrix |

**Result: 59 probes, 0 failures.**

| Section | Passed |
|---|---|
| tenant isolation | 12/12 |
| sop content roles | 10/10 |
| telemetry append-only | 9/9 |
| escalations | 5/5 |
| bundle publishing | 4/4 |
| device enrolment | 2/2 |
| privilege audit | 17/17 |

**The test can fail.** A suite that has never failed proves nothing, so two
negative controls were run deliberately. Asserting that an *agent* may insert a
procedure — which they may not — reported `denied:privilege, ok = false`.
Asserting 999 visible telemetry rows when 3 exist reported `rows:3, ok = false`.
The harness detects violations rather than reporting agreement.

**What is actually guaranteed**

1. **Tenant isolation** holds for the strongest role: Beta's ops manager sees zero
   rows of Alpha's sops, versions, bundles, telemetry, escalations, users, devices
   or tenant record, cannot update Alpha's procedures, and cannot insert a
   procedure *into* Alpha's tenant — the `WITH CHECK` clause rejects it.
2. **Append-only telemetry is doubly guaranteed.** No UPDATE or DELETE policy
   exists, and `has_table_privilege('authenticated', …, 'UPDATE'|'DELETE')` is
   false for telemetry, sop_versions, policy_bundles and device_bundle_acks. A
   future migration that adds a careless policy still cannot grant the verb.
3. **Agents cannot author policy.** team_lead, agent and auditor are all blocked
   from inserting procedures; only ops_manager and sop_editor may.
4. **Only an ops manager publishes a bundle** — the act that pushes policy to
   every enrolled device.
5. **Bundle versions are monotonic and gap-free.** Publishing version 9 when the
   tenant's maximum is 2 is rejected by trigger, so a client holding version 5 can
   always tell "nothing changed" from "the sync is broken".
6. **Telemetry reads are restricted.** A frontline agent sees 0 rows; ops_manager,
   team_lead and auditor see their own tenant's events.
7. **Partition routing works** — all events landed in `telemetry_events_2026_09`.

**Deviations from §6, both corrected in the schema above**

- The partitioned `telemetry_events` primary key had to become `(id, occurred_at)`;
  PostgreSQL requires the partition key in every unique constraint. The client
  idempotency contract changes with it to `on conflict (id, occurred_at)`.
- `escalations.query_event_id` is not a foreign key, for the same reason.

**Not verified.** Nothing here has run against a Supabase project: the local
`auth` shim is faithful to the claim-reading contract but the real platform also
supplies JWT signing, connection pooling and the PostgREST layer. Those are
deployment concerns, not policy concerns — the policy text is identical. Phase 2
also has no client wiring yet: the web app still runs the Phase 0 keyword path and
no Supabase project exists.

---

## 13. Partitioned Telemetry — Two Errors, and What Fixing Them Actually Taught (2026-09-25)

§6 was wrong twice. Both errors were found by building the schema, and the second
one only became visible after attempting the "correct" fix for the first. Every
claim below was executed against PostgreSQL 17, not reasoned from documentation.

### Error 1 — a unique key on `id` is impossible on a partitioned table

```
create unique index p_id_only on p (id);
ERROR:  unique constraint on partitioned table must include all partitioning columns
DETAIL:  UNIQUE constraint on table "p" lacks column "t" which is part of the partition key.
```

There is no global unique index across partitions, so `id` cannot be unique in a
table partitioned on `occurred_at`. Three options exist:

| Option | Idempotency | Retention by partition drop | Verdict |
|---|---|---|---|
| `primary key (id, occurred_at)`, client uses `on conflict (id, occurred_at)` | only if the client resends a byte-identical timestamp | preserved | **rejected** |
| partition by hash on `id` | clean | **lost** — every time-range query scans all partitions, and retention needs DELETE, which is revoked | rejected |
| separate unpartitioned dedup ledger | clean, on `id` alone | preserved | **adopted** |

The first option was the tempting one and it is a trap. A client that regenerates
`occurred_at` on retry — an ordinary bug — writes a **second audit row with the
same event id and a different time**. In a system whose entire value is a
trustworthy record of what the gate decided, silently duplicating rows to corrupt
the threshold-failure analytics is not an acceptable failure mode. The dedup
ledger (`telemetry_ingest_dedup`, unpartitioned, `primary key (id)`) closes it, at
the cost of one narrow insert per event. It is a cache with a retention policy,
not an audit record, so a maintenance role may prune it.

### Error 2 — the foreign key is the wrong tool, and it took a third experiment to see why

The obvious fix for `escalations.query_event_id` looked available: a composite FK
into a partitioned table is legal and enforced.

```
create table c (ref_id uuid not null, ref_t timestamptz not null,
  foreign key (ref_id, ref_t) references p (id, t));
CREATE TABLE
-- referencing an absent row:
ERROR:  insert or update on table "c" violates foreign key constraint
```

So it was adopted — and then a check of the catalogue showed PostgreSQL had
**propagated a separate constraint onto every partition**:

```
escalations_query_event_id_query_occurred_at_fkey  -> telemetry_events(id, occurred_at)
escalations_query_event_id_query_occurred_at_fkey1 -> telemetry_events_2026_09(id, occurred_at)
escalations_query_event_id_query_occurred_at_fkey2 -> telemetry_events_default(id, occurred_at)
```

Each of those constraints depends on its partition, so retention by partition drop
breaks — **even when no escalation references the partition any more**:

```
-- after the referencing row was deleted:
drop table p_2026_09;
ERROR:  cannot drop table p_2026_09 because other objects depend on it
DETAIL:  constraint c_ref_id_ref_t_fkey on table c depends on table p_2026_09
HINT:  Use DROP ... CASCADE to drop the dependent objects too.
```

The dependency is structural, not data-dependent, so no amount of care at write
time helps. `CASCADE` would drop the FK from `escalations` altogether — quietly
trading integrity for a successful drop.

**The real error was a lifetime mismatch.** An escalation is the durable record;
raw telemetry is the volatile one. Asking the durable record to hold a foreign key
into the volatile one inverts the relationship. The design is therefore:

- `query_event_id` and `query_occurred_at` are **provenance, not a constraint**;
- the escalation carries its own `evidence jsonb` snapshot, so it is self-contained
  and survives the retirement of the partition it came from;
- integrity is enforced at **write time** by a trigger, which costs nothing
  structurally and leaves retention unblocked.

### A second bug, found by the test rather than by reasoning

The trigger was first written as `SECURITY INVOKER`. It then rejected **every
legitimate escalation** with `23503`, because the existence check reads
`telemetry_events` and the role that creates escalations — the frontline agent —
cannot read telemetry by policy. An integrity check must not be subject to the
caller's read policy, so the function is `SECURITY DEFINER` with a pinned
`search_path`.

Running elevated then allowed something the foreign key could never have done:
verifying that the referenced event belongs to **the same tenant** as the
escalation. The trigger is strictly stronger than the FK it replaced.

### Final state

65 probes, 0 failures, including four new ones that did not exist before this
investigation:

| Probe | Result |
|---|---|
| identical replay rejected | `false` |
| replay with a drifted timestamp rejected | `false` — the case the composite key missed |
| exactly one row exists for the event id | `1` |
| escalation against another tenant's event | blocked — stronger than an FK |

Two durable lessons are recorded in `AGENTS.md`: **do not reintroduce a unique
constraint on `id` alone**, and **do not reintroduce a foreign key into
`telemetry_events`**. Both have now been measured to fail, and the reasons are not
obvious from the schema alone.

---

## 14. Phase 3 — Encrypted Sync Engine, Verified (2026-09-25)

Built and executed. Server half and client half live in one package so the
protocol cannot drift between them; the Supabase Edge Function will import from it
rather than reimplement any of it.

### Correction to §3: RFC 3394 cannot wrap "for a public key"

§3 said the tenant content key is "wrapped (RFC 3394) for each enrolled device's
public key". That is not a thing — RFC 3394 (AES-KW) wraps a key under a
**symmetric** key. A capability probe was run before writing the module:

| Primitive | Result |
|---|---|
| Ed25519 keygen + sign + verify | 64 B signature, 32 B public key |
| X25519 keygen + ECDH derive | 32 B shared secret, 32 B public key |
| AES-KW generate + wrap + unwrap | 40 B wrapped key — RFC 3394 available |
| AES-256-GCM encrypt + decrypt | round-trips |
| RSA-OAEP-256 | works, but 294 B public key |

The intended construction is ECDH for the asymmetric step and AES-KW for the
wrapping, which is what is now implemented and what §3 has been amended to say:

```
tenant signing keypair     Ed25519   signs manifests
tenant wrapping keypair    X25519    one half of every device KEK
device wrapping keypair    X25519    generated on the device at enrolment
KEK                        HKDF-SHA256(ECDH(device private, server public))
content key (CEK)          AES-256-GCM, encrypts the bundle payload
wrapped CEK                AES-KW(KEK, CEK) — one per device, RFC 3394
```

X25519 was chosen over RSA-OAEP for the wrapping keys: 32-byte public keys in the
device registry instead of 294, and no modulus-length ceiling on what can be
wrapped.

### Result: 31 checks, 0 failures

| Exit criterion | Evidence |
|---|---|
| Offline install on reconnect | device holds v1 through the outage; the queued v2 installs on reconnect and the active version becomes 2 |
| Signature tamper rejected | a modified manifest and a foreign tenant's signing key both report `signature_invalid` |
| Non-monotonic version rejected | a replayed v1 reports `not_monotonic`; a stale v1 after v2 is refused |
| Failed decrypt leaves the previous bundle active | `decrypt_failed` with the active bundle still v1 and the commit count unchanged |

Supporting checks that make those meaningful:

- **The transport carries nothing readable.** The ciphertext was decoded and
  searched for procedure text; it contains none.
- **A failed install writes nothing.** Commit counts are asserted, not assumed —
  every rejection is checked for both the reason it reported *and* the fact that
  the store did not move. A fresh client that rejects a bundle holds `null`, not a
  half-written state.
- **An unenrolled device cannot decrypt**, and receives `key_unwrap_failed`
  rather than a corrupted bundle.
- **The decrypted corpus matches the source** field by field.

### The most interesting case: a re-signed corrupt payload

A signature alone cannot catch a compromised or buggy server that re-signs a
payload it cannot actually produce. The harness constructs exactly that — a
manifest whose `payloadHash` matches deliberately corrupted ciphertext, signed
with the real tenant key — and the client rejects it at `decrypt_failed`, keeping
v1 active. This is why the pipeline hashes the ciphertext before unwrapping, and
why the GCM tag is treated as a hard gate rather than a warning.

### A test bug worth recording

Two probes initially failed, reporting `not_monotonic` where
`payload_hash_mismatch` and `key_unwrap_failed` were expected. The cause was the
test, not the code: the pipeline checks in a fixed order — signature, version,
payload hash, unwrap, decrypt — and the probes were sending a bundle whose version
equalled the active one, so the version check fired first. Each probe now clears
the checks that precede the one it targets, and runs both against a fresh client
and against a client already serving a bundle.

### Database half

Migration `0008_bundle_publish.sql` adds `app.next_bundle_version`,
`app.enrolled_devices` and `app.publish_policy_bundle`. The version helper is not
atomic on its own and does not need to be: the trigger from `0003` rejects any
version that is not exactly max + 1, so concurrent publishers produce one success
and one error, never a duplicate or a gap.

The RBAC matrix is now **69 probes, 0 failures**, including a probe proving the
tenant *argument* of `enrolled_devices` cannot be used to read another tenant's
roster — RLS scopes rows to the caller's claim, not to the parameter.

### Not verified

- **No transport.** The harness passes bundle objects directly; there is no
  WebSocket push, no HTTP pull, no retry/backoff. The protocol is proven, the
  delivery mechanism is not built.
- **No device-side persistence.** `MemoryBundleStore` stands in for IndexedDB and
  SQLite. The atomic-swap guarantee that matters on a real device — a reader sees
  the old bundle or the new one, never a mixture — is trivial in memory and is the
  hard part of Phase 6.
- **No revocation.** Removing a device from the roster stops future wrapping but
  does not re-key the tenant, so a removed device can still read bundles it
  already holds. Key rotation is Phase 7 work and is not started.
- **No Supabase runtime.** Nothing has run as an edge function.

## 15. Phase 4 — Confidence Gate UI + Escalation Flow, Verified (2026-09-25)

Built and executed. The gate that Phase 1 calibrated is now a type, not a
convention, and the React client calls it. The hard rule — a blocked query shows
**no procedure content** — is enforced by the shape of the data, so no component
can leak it by accident.

### The guarantee lives in the type

Two new modules in `@sop/core`:

- `packages/core/src/agent-view.ts` — `buildAgentView(decision, corpus,
  bundleVersion, escalationId)`. The return is `AgentView`, which is
  `AnswerView | EscalationView`. `EscalationView` carries **only** `reason`,
  `escalationId`, `bundleVersion`, `message`. It has no field that could hold a
  procedure, a passage, or a candidate title. An engineer who writes
  `view.sop.title` on a blocked query gets a compile error, not a leak.
- `packages/core/src/escalation.ts` — `buildEscalationRecord(...)`, a **different
  object with a different audience**. It carries the query text, the scores, and
  the near-miss passages — everything the ops manager needs, nothing the agent
  sees. Its `evidence jsonb` shape maps field-for-field onto `escalations` from
  Phase 2: `queryEventId`, `queryOccurredAt`, and the snapshot. Keeping the two
  as separate types is what makes the leak structurally impossible in either
  direction.

The view layer handles the non-gate outcomes. `bundle_inconsistent` refuses a procedure id
missing from the active bundle. `manual_review_required` refuses even a confident
match when the SOP itself requires a human. Refusing is always the safe response
to either condition.

### The client

`apps/web/src/App.tsx` now uses the semantic path with explicit activation:

1. the initial bundle contains only application code; an explicit **Load model and
   build index** action dynamically imports the embedder and ONNX runtime;
2. `findAnswer` embeds the message, `searchTopK` returns the best passage per
   procedure, and `evaluateGate` decides;
3. a confident match to an auto-resolvable SOP becomes an `AnswerView`; a blocked
   gate decision or an SOP requiring human review becomes a content-free
   `EscalationView` and a `buildEscalationRecord` retained locally;
4. model download progress, load failure, retry, and query failure are explicit UI
   states; a live margin slider and bundle-version badge remain visible.

`BUNDLE_VERSION` is static at 1 until authenticated bundle transport exists. No
Command Centre transport is configured, so the UI labels queued items as local
only and never presents them as delivered.

### Migration 0009 — threshold change is audited

Migration `0009_threshold_audit.sql` adds `tenant_threshold_changes` and the
`app.audit_threshold_change()` trigger on `tenants`. The gate parameters decide how
much the system answers versus hands to a human; a silent `min_margin` change is
indistinguishable from a sudden quality collapse, so every change is recorded with
who made it and the before value. It is a trigger rather than application code
because the parameter can also move via a migration, a support script, or a
console session — paths that never touch the app. Like telemetry, the table is
append-only by privilege: only `SELECT` and `INSERT` are granted, no `UPDATE` or
`DELETE`. The RBAC matrix grew to **76 probes, 0 failures** and now has a dedicated
threshold-audit section (3/3), including a probe that a `min_margin` change writes
exactly one audit row and a downgrade does not raise an error.

### Result: gate verification, 10 checks, 0 failures

`tooling/gate/verify-gate.mjs` walks the 65-query harness and asserts:

| Check | Result |
|---|---|
| every accepted answer carries evidence | PASS |
| manual-review SOPs never become answers | 0 exposed — PASS |
| manual-review matches become escalations | 3 observed — PASS |
| escalation views leaking procedure content | 0 — PASS |
| escalation views echoing the query text | 0 — PASS |
| escalation views with wrong field set | 0 — PASS |
| escalation records missing candidates | 0 — PASS |
| score/decision mismatches across two indexes | 0 — PASS |
| non-finite retrieval scores fail closed | PASS |
| the golden set produced both outcomes | PASS |

The leak test is the load-bearing one: it serialises every escalation `AgentView`
and scans it for all procedure text, every passage, and the query string. At the
0.18 prototype margin, 8 of 65 queries produced auto-answers and 57 produced
escalations; 3 escalations were confident matches to SOPs that explicitly require
human review. The determinism check runs 20 queries against two independently
constructed indexes and finds zero decision or score mismatches.

### Browser verification — complete for the current web path

Headless Chrome exercised the built preview through the Chrome DevTools
Protocol:

- before activation, **0** model/runtime requests were made;
- the explicit load action downloaded the pinned model and ONNX runtime, showed
  progress, and enabled **Find Answer**;
- `gift refund` completed through real browser inference and rendered a matched
  procedure; the run finished with **0 console errors and 0 failed responses**;
- a fault-injection run blocked Hugging Face/jsDelivr, observed the visible retry
  state, restored the hosts, and reached **Find Answer** with 0 uncaught
  exceptions.

The production entry JavaScript is 247.6 kB raw / 77.5 kB gzip. Transformers.js
and the ONNX integration are emitted as a separate 539.2 kB lazy chunk; the
26.9 MB WASM asset is not requested before activation. The first-use dependency
is real and external, so an offline packaged model remains unverified.

### Not verified / open

- **In-browser query completion** through a real model download (above).
- **No transport of the escalation record.** `buildEscalationRecord` is built and
  shown, but nothing ships it to `escalations` yet — that is Phase 5, which must
  populate `evidence` and use idempotent ingest (`on conflict (id, occurred_at)` is
  the wrong tool; see §13 — go through `app.ingest_telemetry_event`).
- **No per-tenant threshold persistence in the client.** The slider is local-only;
  the source of truth is `tenants.threshold/min_margin`, audited by 0009.
- **`BUNDLE_VERSION` is a constant.** It must come from the installed bundle once
  Phase 3's transport lands, so staleness is real rather than cosmetic.

## 16. Phase 5 — Telemetry Queue + Escalation Ingest + Ops Dashboard, Verified (2026-09-25)

Built and executed. Every query the edge engine runs now emits a telemetry event;
every refused query also emits an escalation record; both reach the command centre
through a verified idempotent ingest and feed an operations dashboard the ops
manager uses to decide whether to recalibrate the gate.

### The server half — idempotent, integrity-checked, audited

Migration `0010_escalation_ingest.sql`:

- `app.ingest_escalation(p_escalation_id, p_query_event_id, p_query_occurred_at, p_evidence)` —
  SECURITY DEFINER, so a frontline agent can file an escalation without being
  granted read access to telemetry. Idempotent on `escalations.id` via
  `on conflict (id) do nothing`. `escalations` is **not** partitioned (only
  `telemetry_events` is, per §13), so the simple form is correct — the dedup-ledger
  form from §13 exists only because the partitioned table cannot carry a plain
  unique index. One replayed escalation id, one row, always. Migration 0013 adds
  the required role check: agents, team leads, and ops managers may ingest;
  auditors and policy editors may not.
- The write-time trigger from 0004 still enforces that the referenced query event
  exists and belongs to the same tenant. Migration 0013 also reads that source
  event inside the SECURITY DEFINER function and cross-checks the immutable
  bundle, gate settings, and candidate snapshot before insertion; a mismatch is
  rejected rather than silently stored.
- Three read-side views, all RLS-scoped to the caller's tenant:
  - `app.ops_escalation_dashboard` — escalations grouped by `reason`, `bundle_version`,
    `min_margin`, `model_id`, with counts and first/last timestamps. Reads straight
    from the `evidence` jsonb snapshot, which is the point of carrying it.
  - `app.ops_gate_funnel` — `telemetry_events` grouped per day into `queries`,
    `answered`, `escalated`, read from `payload.outcome` (written by the client queue).
  - `app.ops_threshold_changes` — every gate-parameter change from 0009, so a margin
    move and an escalation spike can be read side by side.

### The client half — ordered, persisted, pluggable transport

`apps/web/src/telemetry.ts`: `TelemetryQueue` buffers query events and escalation
records in localStorage (survives a reload), and `flush` sends events **before**
escalations so the referenced query event exists on the server before the
escalation names it. Overflow never sheds an event referenced by a retained
escalation; if that dependency makes the cap temporarily unshrinkable, the queue
raises its visible backlog flag instead of manufacturing a permanently rejected
escalation. `Transport` is the integration seam. The former `NoopTransport` and
"Sync now" control were removed because resolving a no-op deleted queued records
while presenting success. `App.tsx` now uses `crypto.randomUUID()`, enqueues the
query event with its top-K evidence plus any escalation, and labels the queue
**local only** until an authenticated transport exists.

### Result: 17 probes, 0 failures

`bash tooling/db/verify-phase7.sh` (drops + recreates the database, applies all
migrations through 0013, seeds, and runs the matrix):

| Section | Result |
|---|---|
| escalation ingest | 6/6 — accepted; replay of the same id rejected; exactly one row; `evidence` jsonb persisted verbatim (reason, bundle_version, 2 candidates) |
| escalation integrity | 3/3 — orphan event `foreign_key_violation`; another tenant's event rejected (trigger checks tenant); no-tenant-claim `insufficient_privilege` |
| ingest contract | 4/4 — missing decision evidence, missing evidence snapshot, source-gate mismatch, and fractional bundle version all reject with `22023` |
| ops dashboard | 4/4 — dashboard shows the `insufficient_margin` group; funnel shows the day with queries=1/escalated=1; threshold-changes view shows the ops-manager margin move |

The negative controls matter as much as the passes: an escalation pointing at a
missing event, at another tenant's event, or carrying no tenant claim is refused in
each case, so the suite would fail if any of those guarantees regressed.

`pnpm -r run build` is green across the workspace. The current browser path was
exercised with a real model load and real query; the local queue UI is rendered
but no application transport drains it.

### Not verified / open

- **No real transport.** The queue retains records locally and never presents
  them as delivered. A Supabase Edge Function and authenticated client transport
  remain unbuilt.
- **No Supabase runtime.** Views and SQL functions are tested against PostgreSQL
  but not as deployed edge functions.
- **Real network retry is unexercised.** Per-item backoff, poison-item isolation,
  overflow, and dependency-safe shedding are proven against deterministic failing
  transports in the 30-check queue harness; no hosted network exists yet.

## 17. Phase 6 — Desktop + Mobile Shells, Compiled and Proven (2026-09-25)

The Rust toolchain (1.98.1, `stable-x86_64-pc-windows-msvc`) was installed this
session; the MSVC linker was already present via VS 2022 Community. The
packaging phase's premise — "one engine, three platforms" — is now literal:

- **`apps/desktop`** — a Tauri v2 shell with no native commands. Its
  `frontendDist` is `apps/web/dist`, so the window runs the identical web
  bundle. `cargo build` compiles and links: `sop-desktop.exe` (debug).
  An icon set was generated programmatically (the repo's `hero.png` is not
  square).
- **`apps/mobile`** — an Expo (SDK 51) shell whose screen is a WebView over the
  tenant-configured engine origin (`EXPO_PUBLIC_ENGINE_ORIGIN`, inlined at
  bundle time). Typechecked under strict TS.
- **`packages/sync`** — the persistence adapters Phase 3 deferred. The
  `BundleStore` contract from `install.ts` gains two implementations:
  `IdbBundleStore` (the active bundle is one record in one transaction — the
  atomic swap is the store's shape, not extra code) and `SqliteBundleStore`
  (one row, one `INSERT OR REPLACE`, driver injected so the package holds no
  platform dependency).

### Result: 19 checks, 0 failures

`node tooling/sync/verify-persistence.mjs` drives both adapters through the
**real** `installBundle` pipeline — publish → verify → decrypt → commit — never
against mocks of the pipeline: first install, upgrade, field-for-field corpus
round-trip, corrupted bundle rejected with the previous bundle left active, and
state surviving a store restart. `MemoryBundleStore` is asserted to lose state
across a restart, which is precisely the limitation the adapters remove.

### Not verified

- **No packaged installer or runtime run.** Debug and release `sop-desktop.exe`
  binaries link, but `tauri build` uses `--no-bundle`; NSIS packaging and the
  shell's behaviour under WebView2 were not exercised.
- **No native mobile build.** No Android SDK/Xcode on this host, and Expo's
  Metro bundler fails to resolve `@babel/runtime` through pnpm's Windows
  symlinks (the file exists at the linked path; Metro does not follow it). The
  documented fix — `node-linker=hoisted` for the Expo app — re-layouts the
  workspace's verified installs and is deferred deliberately.
- **Device-key persistence is unsolved**: the stores hold bundles, not the
  device's own enrolment keys. A reinstall that loses the X25519 device key
  needs re-enrolment; that flow belongs to the transport phase.

## 18. Phase 7 — Hardening: Rotation, the Bypass Suite, and a Real Vulnerability (2026-09-25)

### Key rotation and revocation

Phase 3's gap: removing a device stopped future wrapping but did not re-key the
tenant, so a removed device read every bundle it held, forever.
`rotateTenantKeys` (`packages/sync/src/rotation.ts`) closes it: a fresh tenant
wrapping keypair, a fresh content key, wrapping only for the devices that keep
access. Migration `0011_tenant_key_versions.sql` adds the audit ledger — public
material only, revocation only through `app.revoke_tenant_key` (ops-manager
only), the table append-only by privilege.

`node tooling/sync/verify-rotation.mjs` — **13 checks, 0 failures** — attacks
the result: the revoked device is refused a wrapped key; its cached v1 wrapped
key fails the GCM tag against the v2 payload; a foreign device's wrapped key
fails unwrapping; an active device that missed the key distribution cannot
upgrade; v1 replay is refused; signing rotation is proven a pure distribution
event. And the boundary of the fix is asserted rather than hidden: the revoked
device still reads the pre-rotation bundle. Rotation goes forward, not
backwards; if leaked *content* must be invalidated, that is a content decision,
not a key decision.

### A real vulnerability in the Phase 5 views

`supabase/tests/rls_bypass.sql` attacks tenant isolation the way the RBAC
matrix never did — as an adversary rather than as each role doing its job. It
found one:

**The Phase 5 dashboard views leaked cross-tenant data.** Created without
`security_invoker`, each view executes its body as its owner — `postgres`, a
superuser, which bypasses row-level security entirely. Measured before the fix:
Beta's ops manager read Alpha's escalations through
`app.ops_escalation_dashboard`, Alpha's funnel rows through
`app.ops_gate_funnel`, and Alpha's threshold changes through
`app.ops_threshold_changes`.

Migration `0012_security_invoker_views.sql` recreates all three with
`security_invoker = true` (the option cannot be changed by CREATE OR REPLACE,
so each view is dropped and recreated identically). The bypass suite now
observes zero foreign rows.

Two durable lessons:

1. **Views are an RLS boundary.** A view is not a shortcut over an already-
   protected table; by default it is a hole through the protection, owned by
   whoever created it. Every future view in this schema carries
   `security_invoker = true` or a written justification for why not.
2. **Single-tenant suites cannot see tenant isolation bugs.** Phase 5's matrix
   passed while the leak existed, because every probe stood inside one
   tenant. Negative controls need an attacker's perspective; that is what the
   bypass suite adds, permanently.

### A second boundary flaw: direct writes bypassed their contracts

The follow-on review found that RLS described which rows a role could touch but
left several write verbs too broad. An authenticated agent could insert a forged
`tenant_threshold_changes` row, pre-claim a telemetry id in the dedup ledger and
suppress the real event, or write `telemetry_events` directly while bypassing the
dedup transaction. `app.ingest_escalation` was `SECURITY DEFINER` but did not
check the caller's role, so an auditor could insert through a function whose table
policy correctly excluded auditors.

Migration `0013_ingest_write_boundary.sql` makes the intended boundaries
mechanical:

1. direct `INSERT` on telemetry, the dedup ledger, escalations, and threshold
   audit is revoked; their insert policies are removed;
2. both ingest functions are `SECURITY DEFINER` with a pinned `search_path` and
   complete tenant+role checks; telemetry validates same-tenant devices and the
   full outcome-conditioned decision payload (SOP/score/margin/reason/config plus
   at most five bounded typed candidates); escalation evidence must carry the
   full query, model, bundle, gate, and candidate snapshot, and the immutable
   gate/bundle/candidate fields must match the referenced source event;
3. escalation creation permits only agents, team leads, and ops managers;
4. escalation `UPDATE` is granted only for workflow columns (`status`, assignee,
   resolution, linked SOP version, resolved time). Evidence, ids, tenant,
   provenance timestamps, and creation time are immutable; a trigger also
   requires assignee and linked SOP version to belong to the escalation tenant;
5. the threshold audit trigger is `SECURITY DEFINER`, so revoking direct insert
   does not break the legitimate tenant update path; new tenants default to the
   audited 0.18 margin rather than the rejected 0.15;
6. raw escalation reads exclude frontline agents;
7. default `PUBLIC` execute is revoked from every app function; explicit
   `authenticated` grants remain on the intended API.

The bypass suite now requires exact `denied:privilege` results for each direct
write and the auditor function attack. The RBAC privilege audit independently
checks that the four `INSERT` grants are absent and that immutable escalation
columns have no `UPDATE` privilege, so a future policy cannot repair what
privilege correctly removed.

The rest of the bypass suite — 40 probes, 0 failures — covers the
no-claim case (a stripped token sees nothing anywhere), function-argument
abuse (`enrolled_devices`, `publish_policy_bundle`, `next_bundle_version` aimed
at another tenant), key-ledger surfaces (editor revoke, cross-tenant revoke,
unknown kind, nonexistent version, direct UPDATE — all refused), schema-object
planting (no CREATE for `authenticated` on public/app/auth), and privilege
escalation (no UPDATE/DELETE/TRUNCATE on the key ledger, RLS enabled).

### Telemetry queue hardening

The Phase 5 queue had three failures waiting to happen: a transport error lost
everything after it; an offline client buffered without bound; a poison item
blocked the queue. The hardened `TelemetryQueue` gives each item its own
attempt count with capped exponential backoff (1s base, 60s ceiling), sheds the
oldest *unreferenced query events* past a cap while raising a flag the UI
surfaces. It atomically enqueues a query event with any escalation, so a
saturated queue cannot briefly orphan the new event, and it never sheds
*escalation records* or an event they reference. If
retained dependencies make the cap temporarily unshrinkable, the visible backlog
flag rises instead of creating an escalation whose source event can never ship.

`node tooling/telemetry/verify-queue.mjs` — **30 checks, 0 failures** — runs in
deterministic virtual time (the clock is injected), covering the total outage,
recovery, backoff growth, poison-item isolation, overflow shedding, saturated
event/escalation dependency retention, persistence across restarts, and
corrupt-storage recovery.

### Verification summary for this phase

| Suite | Result |
|---|---|
| `verify-rotation.mjs` | 13 checks, 0 failures |
| `verify-phase7.sh` (RBAC + Phase 5 + bypass) | 99 + 17 + 40 probes, 0 failures |
| `verify-queue.mjs` | 30 checks, 0 failures |
| package builds | full workspace green; desktop debug and release binaries link; mobile typechecked |

### Not verified

- The edge-function flow that would call `rotateTenantKeys` and record the key
  version is unbuilt (no Supabase runtime); the ledger's SQL surface is tested,
  the caller is not.
- Real retry behaviour is unexercised — there is no transport to fail. The
  queue's contract is proven against failing transports in test, not against
  the network.
- `tauri build` is still invoked with `--no-bundle`; installer packaging, WebView2
  runtime behaviour, and native mobile builds remain open (see §17).
