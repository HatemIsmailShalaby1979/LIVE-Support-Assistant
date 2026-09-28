# Deployed-vs-local parity — the 40-ticket batch

**data_mode: "simulated".** Fictional evaluation data only; there is no design partner and no customer data.

Read-only. No product code, gate, threshold or corpus was changed by this analysis.

## Setup

| | Local | Deployed |
| --- | --- | --- |
| Report | `parity-local-m017.json` | `phase5-deployed-run-2bdf0864473a4d50.json` |
| Batch | `parity-40.json` | `parity-39.json` |
| Batch SHA-256 | `d843d638628d…` | `a37e0d995a54…` |
| Corpus SHA-256 | `e9e058685d25…` | `e9e058685d25…` |
| Applied margin | 0.17 | 0.17 |
| Model | `Xenova/all-MiniLM-L6-v2` @ `751bff37182d…` (q8) | `Xenova/all-MiniLM-L6-v2` @ `751bff37182d…` (q8) |
| Runtime | browser, onnxruntime-web (WASM) | browser (onnxruntime-web), not the Node native runtime |

The local margin is recomputed from the recorded candidates with the gate's own formula. The deployed margin is read back from the tagged telemetry payload the app itself persisted, because the deployed UI shows no scores on an escalation.

## Margin delta distribution (deployed − local)

| Measure | Value |
| --- | ---: |
| Comparable tickets | 39 |
| Minimum | 0.0000 |
| Median | 0.0000 |
| Mean | 0.0000 |
| Maximum | 0.0000 |

- Deployed margin **higher** on 0 ticket(s), **lower** on 0, **equal** on 39.
- Within ±0.01: **39 of 39**. Within ±0.05: **39 of 39**.
- Top-1 procedure differs between paths on **0** ticket(s).
- Decision (answer/escalate) differs on **0** ticket(s).

## Per ticket

| Ticket | Class | Local top-1 | Local top-2 | Local margin | Deployed top-1 | Deployed top-2 | Deployed margin | Δ margin | Local → Deployed |
| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | --- |
| PARITY-RP-022 | real-phrased-false-accept | wc-live 0.5087 | wc-login 0.2794 | 0.2293 | wc-live 0.5087 | wc-login 0.2794 | 0.2293 | +0.0000 | answer/wc-live → answer/wc-live |
| PARITY-RP-023 | real-phrased-false-accept | wc-live 0.5722 | wc-eligibility 0.3048 | 0.2674 | wc-live 0.5722 | wc-eligibility 0.3048 | 0.2674 | +0.0000 | answer/wc-live → answer/wc-live |
| PARITY-RP-025 | real-phrased-false-accept | wc-live 0.5512 | wc-appeal 0.2692 | 0.2821 | wc-live 0.5512 | wc-appeal 0.2692 | 0.2821 | +0.0000 | answer/wc-live → answer/wc-live |
| PARITY-RP-026 | real-phrased-false-accept | wc-live 0.7055 | wc-appeal 0.2880 | 0.4175 | wc-live 0.7055 | wc-appeal 0.2880 | 0.4175 | +0.0000 | answer/wc-live → answer/wc-live |
| PARITY-RP-040 | real-phrased-false-accept | wc-live 0.3741 | wc-login 0.1143 | 0.2598 | wc-live 0.3741 | wc-login 0.1143 | 0.2598 | +0.0000 | answer/wc-live → answer/wc-live |
| PARITY-RP-060 | real-phrased-false-accept | wc-payout 0.4981 | wc-eligibility 0.3112 | 0.1869 | wc-payout 0.4981 | wc-eligibility 0.3112 | 0.1869 | +0.0000 | answer/wc-payout → answer/wc-payout |
| SIM-TICKET-00002 | clean | wc-gifts 0.5968 | wc-payout 0.4029 | 0.1939 | wc-gifts 0.5968 | wc-payout 0.4029 | 0.1939 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00016 | near-duplicate | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00025 | clean | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00059 | clean | wc-gifts 0.5968 | wc-payout 0.4029 | 0.1939 | wc-gifts 0.5968 | wc-payout 0.4029 | 0.1939 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00100 | clean | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00102 | clean | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | wc-gifts 0.7138 | wc-payout 0.4085 | 0.3054 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00108 | messy | wc-gifts 0.6135 | wc-appeal 0.5929 | 0.0206 | wc-gifts 0.6135 | wc-appeal 0.5929 | 0.0206 | +0.0000 | escalate → escalate |
| SIM-TICKET-00111 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00123 | messy | wc-payout 0.5044 | wc-eligibility 0.3586 | 0.1458 | wc-payout 0.5044 | wc-eligibility 0.3586 | 0.1458 | +0.0000 | escalate → escalate |
| SIM-TICKET-00132 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00148 | near-duplicate | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00161 | messy | wc-gifts 0.5163 | wc-payout 0.4979 | 0.0184 | wc-gifts 0.5163 | wc-payout 0.4979 | 0.0184 | +0.0000 | escalate → escalate |
| SIM-TICKET-00164 | clean | wc-payout 0.5761 | wc-gifts 0.4887 | 0.0874 | wc-payout 0.5761 | wc-gifts 0.4887 | 0.0874 | +0.0000 | escalate → escalate |
| SIM-TICKET-00196 | clean | wc-payout 0.7197 | wc-gifts 0.4634 | 0.2564 | wc-payout 0.7197 | wc-gifts 0.4634 | 0.2564 | +0.0000 | answer/wc-payout → answer/wc-payout |
| SIM-TICKET-00205 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00208 | messy | wc-payout 0.5044 | wc-eligibility 0.3586 | 0.1458 | wc-payout 0.5044 | wc-eligibility 0.3586 | 0.1458 | +0.0000 | escalate → escalate |
| SIM-TICKET-00239 | messy | wc-login 0.6555 | wc-gifts 0.5177 | 0.1378 | wc-login 0.6555 | wc-gifts 0.5177 | 0.1378 | +0.0000 | escalate → escalate |
| SIM-TICKET-00251 | clean | wc-login 0.6906 | wc-security 0.4660 | 0.2246 | wc-login 0.6906 | wc-security 0.4660 | 0.2246 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00264 | near-duplicate | wc-gifts 0.6657 | wc-payout 0.4410 | 0.2247 | wc-gifts 0.6657 | wc-payout 0.4410 | 0.2247 | +0.0000 | answer/wc-gifts → answer/wc-gifts |
| SIM-TICKET-00266 | clean | wc-login 0.7113 | wc-security 0.5025 | 0.2088 | wc-login 0.7113 | wc-security 0.5025 | 0.2088 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00274 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00275 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00283 | near-duplicate | wc-login 0.7237 | wc-gifts 0.5092 | 0.2145 | wc-login 0.7237 | wc-gifts 0.5092 | 0.2145 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00300 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00328 | near-duplicate | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | wc-login 0.6932 | wc-live 0.4571 | 0.2361 | +0.0000 | answer/wc-login → answer/wc-login |
| SIM-TICKET-00359 | clean | wc-live 0.5180 | wc-login 0.1620 | 0.3560 | wc-live 0.5180 | wc-login 0.1620 | 0.3560 | +0.0000 | answer/wc-live → answer/wc-live |
| SIM-TICKET-00373 | near-duplicate | wc-live 0.6984 | wc-login 0.3598 | 0.3386 | wc-live 0.6984 | wc-login 0.3598 | 0.3386 | +0.0000 | answer/wc-live → answer/wc-live |
| SIM-TICKET-00381 | escalation | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | wc-gifts 0.5288 | wc-payout 0.4794 | 0.0495 | +0.0000 | escalate → escalate |
| SIM-TICKET-00392 | near-duplicate | wc-eligibility 0.6074 | wc-payout 0.5355 | 0.0719 | wc-eligibility 0.6074 | wc-payout 0.5355 | 0.0719 | +0.0000 | escalate → escalate |
| SIM-TICKET-00393 | messy | wc-appeal 0.5404 | wc-live 0.4806 | 0.0598 | wc-appeal 0.5404 | wc-live 0.4806 | 0.0598 | +0.0000 | escalate → escalate |
| SIM-TICKET-00431 | clean | wc-eligibility 0.5379 | wc-appeal 0.2959 | 0.2420 | wc-eligibility 0.5379 | wc-appeal 0.2959 | 0.2420 | +0.0000 | answer/wc-eligibility → answer/wc-eligibility |
| SIM-TICKET-00443 | clean | wc-eligibility 0.5379 | wc-appeal 0.2959 | 0.2420 | wc-eligibility 0.5379 | wc-appeal 0.2959 | 0.2420 | +0.0000 | answer/wc-eligibility → answer/wc-eligibility |
| SIM-TICKET-00477 | messy | wc-gifts 0.2903 | wc-security 0.2764 | 0.0139 | wc-gifts 0.2903 | wc-security 0.2764 | 0.0139 | +0.0000 | escalate → escalate |

## The contradiction case — SIM-TICKET-00272

- **Local**: top-1 `wc-payout` 0.7197, top-2 `wc-payout-conflict` 0.5520, margin **0.1677** → escalate.
- **Deployed**: not measured. The deployed publish path **refused to serve this corpus at all** — publishing a bundle containing the injected `wc-payout-conflict` procedure returns **HTTP 422, "publication blocked: the tenant corpus contains contradictory procedures"**. The ticket therefore has no deployed margin in this run, and the earlier recorded deployed unsafe answer (margin 0.180757) can no longer be reproduced on the deployed path.

This is the most consequential result in the exercise, and it is not a margin comparison. The mitigation is **live in the deployed environment**: the publish edge function refuses a contradictory corpus before it can be signed, so the failure class that produced the one unsafe answer is closed at the source on the deployed path. The local harness still serves it, because it injects the conflicting procedure into the ticket rather than publishing it through the guarded path — which is exactly why the local run keeps escalating that ticket while the deployed run once answered it.

## Sources of difference — investigated

The parity run found no difference on 39 of 39 comparable tickets, so none of the candidates below is active on the current deployed build. They are recorded because the one historical divergence is still unexplained.

| Candidate | Verdict | Evidence |
| --- | --- | --- |
| Model file and quantization | **Verified identical** | The deployed JS bundle pins `{id: Xenova/all-MiniLM-L6-v2, revision: 751bff37…, dtype: q8, dimensions: 384, pooling: mean, normalize: true}` — the same literal as `packages/embedder/src/model.ts:57-67`. Both reports also record the same model id, revision and dtype. |
| Tokenizer | **Same artifact by construction; not separately verified** | `createEmbedder` passes the spec `revision` to `pipeline()` (`packages/embedder/src/embedder.ts:61-67`), so the tokenizer resolves from the same pinned commit as the weights. |
| Runtime (WASM vs Node) | **Not a differentiator** | Both paths run in Chrome: the deployed app bundles onnxruntime-web and the local harness is served by Vite into the same browser engine. Neither uses the Node native runtime. |
| Query text | **Verified identical** | The batch message and both recorded messages are the same string. |
| Corpus / bundle version | **Verified identical** | Both reports record corpus SHA-256 `e9e058685d25…` and the same batch lineage. |
| Passage text and chunking | **Verified identical on the 7-procedure corpus** | Both paths call `buildCorpusPassages` (`packages/vector-store/src/chunk.ts:79`), and 39/39 tickets produced identical top-1/top-2 scores to four decimals — only possible if the indexed text is identical. |
| Deployed build identity | **Not provably the same commit — hypothesis** | The deployed CSS asset hash matches a HEAD build exactly; the JS asset hash, chunk count and size do not. Whether the deployed decision-path code is the same source is unestablished. |

### The unexplained historical divergence

On 2026-09-28, deployed run `0aec9773442c4282` answered `SIM-TICKET-00272` at margin 0.180757 while the local harness escalated it at 0.167715 — same batch SHA, same corpus SHA, same applied margin, same query text. The candidate vectors were:

| Rank | Local | Deployed `0aec9773` |
| ---: | --- | --- |
| 1 | `wc-payout` 0.719725 | `wc-payout` 0.715348 |
| 2 | `wc-payout-conflict` 0.552009 | `wc-payout-conflict` 0.534590 |
| 3 | `wc-gifts` 0.463367 | `wc-gifts` 0.458538 |
| 4 | `wc-eligibility` 0.221708 | **`wc-login` 0.236902** |
| 5 | `wc-login` 0.188211 | **`wc-eligibility` 0.184470** |

Every score differs and ranks 4 and 5 are **swapped**. A difference confined to the injected conflict procedure could not do that, so the original deployed run indexed the corpus differently from the local one across the board, not only in the injected procedure.

Two things would have settled it and neither exists. The original report predates the `bundleIdentity` capture added here. And the web client never verifies its loaded model against the bundle manifest: `apps/web/src/bundle-client.ts:233-234` reads only `manifest.bundleVersion` and `sops`, while `apps/web/src/App.tsx:385-386` uses the build-time `EMBEDDING_MODEL` directly. The manifest `model_revision` — which the original bundle also records as `751bff37…` — is therefore publisher-side evidence and does not prove what the app loaded. `packages/embedder/src/model.ts:6-7` claims a client refuses to serve when its loaded model does not match the bundle manifest; that check is **not implemented in the web client**.

**Hypothesis, labelled as such:** the original deployed run served a different app build — a different transformers.js / ONNX runtime, or a differently transformed corpus. The current deployed build reproduces the local harness exactly, which is consistent with the app having been redeployed since.

## Can the local zero-unsafe results support claims about the deployed path?

**More strongly than before, but not completely — and the exception is the one that matters.**

- **Supporting.** On the current deployed build, 39 of 39 comparable tickets produced identical decisions, identical top-1 and top-2 procedures, and margins identical to four decimal places. That is a paired, same-input comparison, not an inference from a separate run.
- **Against.** The parity set is 39 tickets on a 7-procedure corpus, not the full 500 and not the 48-procedure corpus.
- **Against.** The one ticket where the two paths are known to have diverged **cannot be re-tested**: the deployed publish path now refuses the contradictory corpus outright. The local harness still escalates it correctly, but that is no longer a deployed-path demonstration — it is superseded by a publish-time refusal.
- **Against.** The deployed build is not provably the same commit as this HEAD, and nothing enforces that it is, because the client does not check its model against the bundle manifest.

**What would close it:** run the full 500-ticket batch on both paths and compare per ticket; record the deployed commit and bundle identity in every deployed report (started here with `bundleIdentity`); implement the manifest model check the embedder documentation already promises, so a mismatch fails loudly instead of being invisible; and re-run parity whenever the app or the model changes.

## Limits

- Both reports are on simulated data. Nothing here is production evidence.
- The deployed margin is a value the app recorded; the local margin is recomputed from recorded candidates. Both use the same gate formula, but only the local one is independently recomputable from stored scores.
- The batch is a deliberately chosen set, not a random sample.
- The deployed bundle is not a byte-identical build of this HEAD: its CSS asset hash matches a HEAD build exactly, but its JS asset hash, chunk count and size do not. The model pin inside the deployed JS does match HEAD exactly.

