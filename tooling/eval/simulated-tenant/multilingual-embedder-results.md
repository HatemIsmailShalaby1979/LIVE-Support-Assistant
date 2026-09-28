# Embedder swap — multilingual candidates against the shipped MiniLM

**data_mode: "simulated".** Fictional evaluation data only; there is no design partner and no customer data.

Read-only measurement. **The gate, its logic, and every threshold are unchanged.**
The shipped default embedder is unchanged; the alternate specs live in the harness runner only.
The unit of evidence is the **distinct message**, not the ticket.

## Models under test

| Key | Model | Dims | q8 size | Trained for | Prefixes |
|---|---|---:|---:|---|---|
| `minilm` | `Xenova/all-MiniLM-L6-v2` | 384 | 21.91 MB | sentence similarity, English-oriented | none |
| `multilingual-minilm` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 384 | 112.83 MB | sentence similarity, 50+ languages | none |
| `multilingual-e5-small` | `Xenova/multilingual-e5-small` | 384 | 112.83 MB | retrieval, 100 languages | `query: ` / `passage: ` |

All three run in the same runtime (transformers.js / ONNX Runtime, `q8`).

## Headline — by distinct message

`answered correctly` counts only in-scope messages (those with at least one ticket expecting an
answer) where every such ticket was answered with the right procedure. **Escalation-by-construction
rows are excluded**: a message whose expected outcome is escalation cannot produce a wrong
procedure, so counting it would inflate every column equally.

### scale-rung

| Embedder | Margin | Distinct msgs | In-scope | Answered correctly | False escalations | Wrong-first | Unsafe | Escalation-only |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) | 0.18 | 414 | 302 | 84 (27.8%) | 218 | 86 | 0 | 112 |
| MiniLM (shipped) | 0.17 | 414 | 302 | 93 (30.8%) | 208 | 86 | 1 | 112 |
| multilingual-MiniLM-L12-v2 | 0.18 | 414 | 302 | 85 (28.1%) | 216 | 81 | 1 | 112 |
| multilingual-MiniLM-L12-v2 | 0.17 | 414 | 302 | 91 (30.1%) | 210 | 81 | 2 | 112 |
| multilingual-e5-small | 0.18 | 414 | 302 | 1 (0.3%) | 301 | 80 | 0 | 112 |
| multilingual-e5-small | 0.17 | 414 | 302 | 1 (0.3%) | 301 | 80 | 0 | 112 |

### chaos-500

| Embedder | Margin | Distinct msgs | In-scope | Answered correctly | False escalations | Wrong-first | Unsafe | Escalation-only |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) | 0.18 | 47 | 32 | 14 (43.8%) | 18 | 5 | 0 | 15 |
| MiniLM (shipped) | 0.17 | 47 | 32 | 15 (46.9%) | 17 | 5 | 0 | 15 |
| multilingual-MiniLM-L12-v2 | 0.18 | 47 | 32 | 18 (56.3%) | 14 | 0 | 2 | 15 |
| multilingual-MiniLM-L12-v2 | 0.17 | 47 | 32 | 20 (62.5%) | 12 | 0 | 2 | 15 |
| multilingual-e5-small | 0.18 | 47 | 32 | 0 (0.0%) | 32 | 0 | 0 | 15 |
| multilingual-e5-small | 0.17 | 47 | 32 | 0 (0.0%) | 32 | 0 | 0 | 15 |

## Per language — in-scope answered correctly / in-scope

Declared language of the ticket. The chaos mutations overwrite this column in the 500-ticket
batch (`wrong_fields` injects `de`, `mixed_language_typos_sarcasm` picks at random, `missing_fields`
deletes it), so the 500-batch split is by declared language, not by the language of the text.

### scale-rung

| Embedder | Margin | en | es | pt |
|---|---:|---:|---:|---:|
| MiniLM (shipped) | 0.18 | 74/155 (47.7%) | 5/73 (6.8%) | 5/74 (6.8%) |
| MiniLM (shipped) | 0.17 | 82/155 (52.9%) | 6/73 (8.2%) | 5/74 (6.8%) |
| multilingual-MiniLM-L12-v2 | 0.18 | 59/155 (38.1%) | 12/73 (16.4%) | 14/74 (18.9%) |
| multilingual-MiniLM-L12-v2 | 0.17 | 62/155 (40.0%) | 12/73 (16.4%) | 17/74 (23.0%) |
| multilingual-e5-small | 0.18 | 1/155 (0.6%) | 0/73 (0.0%) | 0/74 (0.0%) |
| multilingual-e5-small | 0.17 | 1/155 (0.6%) | 0/73 (0.0%) | 0/74 (0.0%) |

### chaos-500

| Embedder | Margin | en | es | pt-BR | fr | (none) |
|---|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) | 0.18 | 11/13 (84.6%) | 1/8 (12.5%) | 0/5 (0.0%) | 2/6 (33.3%) | 0/1 (0.0%) |
| MiniLM (shipped) | 0.17 | 11/13 (84.6%) | 2/8 (25.0%) | 0/5 (0.0%) | 2/6 (33.3%) | 1/1 (100.0%) |
| multilingual-MiniLM-L12-v2 | 0.18 | 4/13 (30.8%) | 7/8 (87.5%) | 3/5 (60.0%) | 4/6 (66.7%) | 1/1 (100.0%) |
| multilingual-MiniLM-L12-v2 | 0.17 | 6/13 (46.2%) | 7/8 (87.5%) | 3/5 (60.0%) | 4/6 (66.7%) | 1/1 (100.0%) |
| multilingual-e5-small | 0.18 | 0/13 (0.0%) | 0/8 (0.0%) | 0/5 (0.0%) | 0/6 (0.0%) | 0/1 (0.0%) |
| multilingual-e5-small | 0.17 | 0/13 (0.0%) | 0/8 (0.0%) | 0/5 (0.0%) | 0/6 (0.0%) | 0/1 (0.0%) |

## Score distribution — ticket-level rows

The gate compares `top-1 minus top-2` against the margin. Cosine scales are **not comparable
across models**, so each model is reported on its own scale and no threshold is proposed.
One row per ticket (not per distinct message), so the 500-ticket batch is repetition-weighted here.

| Embedder | Batch | Margin | Top-1 score min | median | mean | max | Margin min | median | mean | max |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) | scale-rung | 0.18 | 0.2320 | 0.6480 | 0.6415 | 0.9144 | 0.0001 | 0.0891 | 0.1209 | 0.4833 |
| MiniLM (shipped) | scale-rung | 0.17 | 0.2320 | 0.6480 | 0.6415 | 0.9144 | 0.0001 | 0.0891 | 0.1209 | 0.4833 |
| MiniLM (shipped) | chaos-500 | 0.18 | 0.2903 | 0.6602 | 0.6419 | 0.7760 | 0.0054 | 0.1750 | 0.1637 | 0.3560 |
| MiniLM (shipped) | chaos-500 | 0.17 | 0.2903 | 0.6602 | 0.6419 | 0.7760 | 0.0054 | 0.1750 | 0.1637 | 0.3560 |
| multilingual-MiniLM-L12-v2 | scale-rung | 0.18 | 0.2794 | 0.6474 | 0.6422 | 0.8891 | 0.0008 | 0.1004 | 0.1261 | 0.4447 |
| multilingual-MiniLM-L12-v2 | scale-rung | 0.17 | 0.2794 | 0.6474 | 0.6422 | 0.8891 | 0.0008 | 0.1004 | 0.1261 | 0.4447 |
| multilingual-MiniLM-L12-v2 | chaos-500 | 0.18 | 0.3499 | 0.6692 | 0.6450 | 0.7651 | 0.0005 | 0.1648 | 0.1427 | 0.3499 |
| multilingual-MiniLM-L12-v2 | chaos-500 | 0.17 | 0.3499 | 0.6692 | 0.6450 | 0.7651 | 0.0005 | 0.1648 | 0.1427 | 0.3499 |
| multilingual-e5-small | scale-rung | 0.18 | 0.8123 | 0.8765 | 0.8765 | 0.9308 | 0.0000 | 0.0164 | 0.0195 | 0.0895 |
| multilingual-e5-small | scale-rung | 0.17 | 0.8123 | 0.8765 | 0.8765 | 0.9308 | 0.0000 | 0.0164 | 0.0195 | 0.0895 |
| multilingual-e5-small | chaos-500 | 0.18 | 0.8385 | 0.8872 | 0.8848 | 0.9260 | 0.0005 | 0.0329 | 0.0326 | 0.0680 |
| multilingual-e5-small | chaos-500 | 0.17 | 0.8385 | 0.8872 | 0.8848 | 0.9260 | 0.0005 | 0.0329 | 0.0326 | 0.0680 |

## Margin buckets — distinct in-scope messages, by each message's minimum margin

Buckets are on each model's own scale. Read as "how much of the corpus sits near the applied
margin", which is what decides whether the margin statistic can separate at all.

| Embedder | Batch | Margin | < 0.05 | 0.05 – 0.10 | 0.10 – 0.15 | 0.15 – 0.20 | >= 0.20 |
|---|---|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) | scale-rung | 0.18 | 97 | 59 | 43 | 25 | 78 |
| MiniLM (shipped) | scale-rung | 0.17 | 97 | 59 | 43 | 25 | 78 |
| MiniLM (shipped) | chaos-500 | 0.18 | 6 | 5 | 5 | 5 | 11 |
| MiniLM (shipped) | chaos-500 | 0.17 | 6 | 5 | 5 | 5 | 11 |
| multilingual-MiniLM-L12-v2 | scale-rung | 0.18 | 83 | 59 | 53 | 29 | 78 |
| multilingual-MiniLM-L12-v2 | scale-rung | 0.17 | 83 | 59 | 53 | 29 | 78 |
| multilingual-MiniLM-L12-v2 | chaos-500 | 0.18 | 1 | 4 | 2 | 13 | 12 |
| multilingual-MiniLM-L12-v2 | chaos-500 | 0.17 | 1 | 4 | 2 | 13 | 12 |
| multilingual-e5-small | scale-rung | 0.18 | 276 | 26 | 0 | 0 | 0 |
| multilingual-e5-small | scale-rung | 0.17 | 276 | 26 | 0 | 0 | 0 |
| multilingual-e5-small | chaos-500 | 0.18 | 30 | 2 | 0 | 0 | 0 |
| multilingual-e5-small | chaos-500 | 0.17 | 30 | 2 | 0 | 0 | 0 |

## Change against the shipped embedder — in-scope distinct messages answered correctly

Percentage-point change versus the incumbent MiniLM run on the **same batch and margin**.
This is the comparison the swap exists to make: does multilingual coverage move non-English
without giving back English?

### scale-rung

| Embedder | Margin | All in-scope | en | es | pt |
|---|---:|---:|---:|---:|---:|
| multilingual-MiniLM-L12-v2 | 0.18 | +0.3 pp | -9.7 pp | +9.6 pp | +12.2 pp |
| multilingual-MiniLM-L12-v2 | 0.17 | -0.7 pp | -12.9 pp | +8.2 pp | +16.2 pp |
| multilingual-e5-small | 0.18 | -27.5 pp | -47.1 pp | -6.8 pp | -6.8 pp |
| multilingual-e5-small | 0.17 | -30.5 pp | -52.3 pp | -8.2 pp | -6.8 pp |

### chaos-500

| Embedder | Margin | All in-scope | en | es | pt-BR | fr | (none) |
|---|---:|---:|---:|---:|---:|---:|---:|
| multilingual-MiniLM-L12-v2 | 0.18 | +12.5 pp | -53.8 pp | +75.0 pp | +60.0 pp | +33.3 pp | +100.0 pp |
| multilingual-MiniLM-L12-v2 | 0.17 | +15.6 pp | -38.5 pp | +62.5 pp | +60.0 pp | +33.3 pp | +0.0 pp |
| multilingual-e5-small | 0.18 | -43.8 pp | -84.6 pp | -12.5 pp | +0.0 pp | -33.3 pp | +0.0 pp |
| multilingual-e5-small | 0.17 | -46.9 pp | -84.6 pp | -25.0 pp | +0.0 pp | -33.3 pp | -100.0 pp |

## Cost — download, load and per-query latency

Download sizes are the published `q8` ONNX blob sizes from the Hugging Face model API
(`onnx/model_quantized.onnx`). Load and latency are measured in this run. **The load figure is a
cold load in a fresh browser profile, so it includes the one-time fetch of the weights over the
network** — it is not a warm-start cost. The per-query figure is steady-state inference.

| Embedder | q8 download | vs shipped | Cold model load | Index build (48 proc / 7 proc) | Decision mean | Decision p95 |
|---|---:|---:|---:|---:|---:|---:|
| MiniLM (shipped) (scale-rung) | 21.91 MB | — | 14.7 s | 12.5 s | 9.26 ms | 14.40 ms |
| MiniLM (shipped) (scale-rung) | 21.91 MB | — | 12.6 s | 12.2 s | 8.73 ms | 12.90 ms |
| MiniLM (shipped) (chaos-500) | 21.91 MB | — | 16.4 s | 3.9 s | 17.18 ms | 22.70 ms |
| MiniLM (shipped) (chaos-500) | 21.91 MB | — | 15.3 s | 3.6 s | 16.86 ms | 22.60 ms |
| multilingual-MiniLM-L12-v2 (scale-rung) | 112.83 MB | +90.92 MB (5.1×) | 42.3 s | 15.0 s | 15.37 ms | 20.70 ms |
| multilingual-MiniLM-L12-v2 (scale-rung) | 112.83 MB | +90.92 MB (5.1×) | 39.6 s | 14.9 s | 15.06 ms | 21.00 ms |
| multilingual-MiniLM-L12-v2 (chaos-500) | 112.83 MB | +90.92 MB (5.1×) | 45.6 s | 5.7 s | 30.07 ms | 36.70 ms |
| multilingual-MiniLM-L12-v2 (chaos-500) | 112.83 MB | +90.92 MB (5.1×) | 44.9 s | 5.8 s | 30.08 ms | 37.30 ms |
| multilingual-e5-small (scale-rung) | 112.83 MB | +90.92 MB (5.1×) | 39.4 s | 16.0 s | 18.36 ms | 23.80 ms |
| multilingual-e5-small (scale-rung) | 112.83 MB | +90.92 MB (5.1×) | 44.4 s | 15.8 s | 17.92 ms | 23.40 ms |
| multilingual-e5-small (chaos-500) | 112.83 MB | +90.92 MB (5.1×) | 39.7 s | 5.9 s | 35.02 ms | 45.90 ms |
| multilingual-e5-small (chaos-500) | 112.83 MB | +90.92 MB (5.1×) | 49.2 s | 5.5 s | 32.62 ms | 39.50 ms |

## Provenance

| Run label | Embedder id | Revision | Batch SHA-256 | Applied margin |
|---|---|---|---|---:|
| `scale-rung-m018` | `Xenova/all-MiniLM-L6-v2` | `751bff37182d…` | `cce453400470…` | 0.18 |
| `scale-rung-m017` | `Xenova/all-MiniLM-L6-v2` | `751bff37182d…` | `cce453400470…` | 0.17 |
| `ml-base-chaos-m018` | `Xenova/all-MiniLM-L6-v2` | `751bff37182d…` | `717c40dcc7d1…` | 0.18 |
| `ml-base-chaos-m017` | `Xenova/all-MiniLM-L6-v2` | `751bff37182d…` | `717c40dcc7d1…` | 0.17 |
| `ml-minilm-scale-m018` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046…` | `cce453400470…` | 0.18 |
| `ml-minilm-scale-m017` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046…` | `cce453400470…` | 0.17 |
| `ml-minilm-chaos-m018` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046…` | `717c40dcc7d1…` | 0.18 |
| `ml-minilm-chaos-m017` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046…` | `717c40dcc7d1…` | 0.17 |
| `ml-e5s-scale-m018` | `Xenova/multilingual-e5-small` | `761b726dd34f…` | `cce453400470…` | 0.18 |
| `ml-e5s-scale-m017` | `Xenova/multilingual-e5-small` | `761b726dd34f…` | `cce453400470…` | 0.17 |
| `ml-e5s-chaos-m018` | `Xenova/multilingual-e5-small` | `761b726dd34f…` | `717c40dcc7d1…` | 0.18 |
| `ml-e5s-chaos-m017` | `Xenova/multilingual-e5-small` | `761b726dd34f…` | `717c40dcc7d1…` | 0.17 |

## Recommendation — do not swap the embedder

**Measured on the 414-distinct-message batch, the multilingual candidate is a wash overall and a
language trade underneath.** Against the shipped MiniLM at margin 0.18, `multilingual-MiniLM-L12-v2`
moves in-scope accuracy by **+0.3 pp**, made up of **-9.7 pp English**,
**+9.6 pp Spanish** and **+12.2 pp Portuguese**. At 0.17 the same
shape appears (-0.7 pp overall, -12.9 pp en, +8.2 pp es,
+16.2 pp pt).

Reasons, in order of weight:

1. **The product metric does not move.** The auto-answer rate is the number the gate exists to
   raise, and it is flat (+0.3 pp at 0.18). A swap that leaves it flat has no
   product case on its own.
2. **It is a language trade, not a gain.** English loses -9.7 pp while Spanish and
   Portuguese gain +9.6 pp and +12.2 pp. English is the majority
   language of both batches and the only one where the shipped path is strong. Whether that trade
   is worth taking is a **tenant-traffic question**, not something this experiment can settle.
3. **The cost is large for an on-device model.** 5.1× the download
   (21.91 MB → 112.83 MB) and roughly 1.7× the per-query latency, on a path whose stated product
   experience is the escalation handover rather than the auto-answer.
4. **The retrieval-trained candidate cannot be compared at these margins.** `multilingual-e5-small`
   answers 1 of 302 in-scope messages at 0.18 because its margin scale is far below the shipped
   margin — median margin 0.0164 against MiniLM's 0.0891. That is a *scale* result, not evidence
   that the model is worse; it would need its own calibrated operating point, which is a per-tenant
   onboarding step and is explicitly out of scope here.

**What would change the recommendation.** A tenant whose traffic is majority non-English, and a
per-tenant margin calibrated for the swapped model. Neither is established by this data.

This result is consistent with the existing do-not-repeat record: an English bi-encoder swap was
already measured and rejected on this corpus. This experiment extends that finding to multilingual
candidates — the aggregate does not move — and adds the one thing the earlier record did not have:
the per-language trade, measured.

## What this does not show

- It does not propose or validate a new threshold. Score scales differ per model; a margin that is
  "safe" on one model is not transferable to another, and none of these figures is a tenant setting.
- It does not generalise beyond these two synthetic batches, which are in-sample and authored by the
  same agent that wrote the corpus.
- The 500-ticket batch carries only 47 distinct messages; its distinct-message figures rest on that.

