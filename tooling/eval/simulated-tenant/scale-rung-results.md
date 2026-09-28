# Scale-rung evaluation — a 48-procedure simulated tenant

**data_mode: "simulated".** A larger fictional WaveCast corpus (48 procedures, 13 categories,
English + Spanish + Portuguese) and a batch of **408 distinct messages** (each used once, so the
distinct-message count equals the ticket count — unlike the 500-ticket batch, which carries only
47 distinct messages). The corpus passes the conflict lint (0 same-category numeric conflicts).

Corpus: `scale-rung-corpus.json` · Batch: `scale-rung-batch.json` · Runs: `scale-rung-m018` / `-m017`.
Gate, threshold, model and corpus logic unchanged; only the evaluation corpus and batch are new.

## Headline (by distinct message)

| Margin | Messages | Correct | Accuracy | False escalations | Wrong-first | Unsafe answers | Runtime errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0.18 | 408 | 190 | 46.6% | 218 | 86 | 0 | 0 |
| 0.17 | 408 | 199 | 48.8% | 208 | 86 | 1 | 0 |

Answerable messages: 302 of 408 (the rest expect escalation).
Margin (0.18): median 0.0900, min 0.0001, max 0.4833.

Figures are the label-fixed outcomes (`expectedOutcome`); **1 of 408** messages was reclassified by that rule (SCALE-0081). The raw batch label gives 189/408 (46.3%) at 0.18.

## Unsafe answers first

**0 unsafe answers at margin 0.18** — but **1 at 0.17**, so lowering the margin introduced one. At 0.18 no escalation-expected message was answered and no answerable message was answered with the wrong procedure.
- **(0.17 only)** SCALE-0328 (es) "desactivar la renovacion automatica" — expected answer sc-prem-cancel, actual answer sc-live-key (wrong_sop_answer)

## By language (0.18)

| Language | Messages | Correct | Accuracy | False escalations | Unsafe |
|---|---:|---:|---:|---:|---:|
| en | 211 | 130 | 61.6% | 81 | 0 |
| es | 98 | 30 | 30.6% | 68 | 0 |
| pt | 99 | 30 | 30.3% | 69 | 0 |

## Confusion pairs (0.18) — expected procedure → top-1 procedure

Counted over answerable messages whose top-1 candidate was not the expected procedure.

| Pair | Messages |
|---|---:|
| sc-payout-timing -> sc-payout-missing | 5 |
| sc-gift-refund -> sc-gift-missing | 3 |
| sc-payout-method -> sc-payout-missing | 2 |
| sc-gift-refund -> sc-prem-billing | 2 |
| sc-gift-send-error -> sc-gift-membership | 2 |
| sc-login-recovery -> sc-login-email | 2 |
| sc-live-lag -> sc-live-key | 2 |
| sc-elig-missing -> sc-live-audio | 2 |
| sc-elig-region -> sc-elig-threshold | 2 |
| sc-elig-standing -> sc-rest-live | 2 |
| sc-monet-review -> sc-monet-elig | 2 |
| sc-up-upload -> sc-rest-removed | 2 |
| sc-payout-timing -> sc-sec-2fa | 1 |
| sc-payout-timing -> sc-rest-strike | 1 |
| sc-payout-timing -> sc-an-export | 1 |

At 0.17 the same list is: sc-payout-timing -> sc-payout-missing (5); sc-gift-refund -> sc-gift-missing (3); sc-payout-method -> sc-payout-missing (2); sc-gift-refund -> sc-prem-billing (2); sc-gift-send-error -> sc-gift-membership (2); sc-login-recovery -> sc-login-email (2); sc-live-lag -> sc-live-key (2); sc-elig-missing -> sc-live-audio (2).

## Wrong-first (expected procedure not ranked first), up to 20 at 0.18

| Message | Language | Expected | Top-1 | Top-2 | Margin |
|---|---|---|---|---:|---:|
| SCALE-0001 | en | sc-payout-timing | sc-payout-missing | sc-payout-method | 0.0822 |
| SCALE-0003 | en | sc-payout-timing | sc-payout-missing | sc-payout-method | 0.1213 |
| SCALE-0004 | es | sc-payout-timing | sc-payout-missing | sc-payout-method | 0.1141 |
| SCALE-0005 | es | sc-payout-timing | sc-sec-2fa | sc-gift-refund | 0.0410 |
| SCALE-0006 | pt | sc-payout-timing | sc-rest-strike | sc-payout-method | 0.0371 |
| SCALE-0007 | pt | sc-payout-timing | sc-an-export | sc-payout-method | 0.0279 |
| SCALE-0008 | en | sc-payout-timing | sc-payout-missing | sc-payout-method | 0.0945 |
| SCALE-0011 | es | sc-payout-missing | sc-payout-timing | sc-payout-method | 0.0171 |
| SCALE-0012 | pt | sc-payout-missing | sc-an-export | sc-payout-method | 0.0640 |
| SCALE-0019 | es | sc-payout-method | sc-login-email | sc-gift-send-error | 0.0459 |
| SCALE-0020 | pt | sc-payout-method | sc-live-lag | sc-sec-email | 0.0268 |
| SCALE-0023 | pt | sc-payout-method | sc-payout-missing | sc-an-watchtime | 0.0590 |
| SCALE-0024 | es | sc-payout-method | sc-payout-missing | sc-payout-method | 0.0880 |
| SCALE-0031 | pt | sc-payout-tax | sc-an-watchtime | sc-spec-legal | 0.0013 |
| SCALE-0033 | en | sc-gift-refund | sc-gift-missing | sc-gift-refund | 0.0239 |
| SCALE-0035 | es | sc-gift-refund | sc-gift-membership | sc-gift-refund | 0.0399 |
| SCALE-0036 | pt | sc-gift-refund | sc-prem-billing | sc-gift-send-error | 0.0032 |
| SCALE-0038 | en | sc-gift-refund | sc-gift-missing | sc-gift-refund | 0.0084 |
| SCALE-0039 | pt | sc-gift-refund | sc-prem-billing | sc-gift-refund | 0.0687 |
| SCALE-0043 | es | sc-gift-missing | sc-gift-refund | sc-payout-method | 0.0627 |

## Confusability (corpus geometry)

Separate, read-only, in `scale-rung-confusability.md`: it measures the corpus itself. Mean
pairwise max cosine across the 48 procedures is **0.5790**; the most confusable pair is
`sc-login-loop ↔ sc-live-disconnect` at **0.8501**, well above the shipped margin, so those two
topics are the most likely to be answered from the wrong procedure. Geometry is a proxy for
margin risk, not a predictor of query behaviour.

## Compared with the 7-procedure result

| Corpus | Messages | Margin | Accuracy | False escalations | Unsafe |
|---|---:|---:|---:|---:|---:|
| 7 procedures (`chaos-500.json`) | 47 distinct / 500 tickets | 0.17 | 72.4% | 138 | 0 |
| 7 procedures (`chaos-500.json`) | 47 distinct / 500 tickets | 0.18 | 48.4% | 258 | 0 |
| 48 procedures (scale-rung) | 408 distinct | 0.17 | 48.8% | 208 | 1 |
| 48 procedures (scale-rung) | 408 distinct | 0.18 | 46.6% | 218 | 0 |

## Did margin behaviour change with corpus size?

- **The trade-off held.** At 0.18: 0 unsafe, 218 false escalations, 46.6% accurate. At 0.17: 1 unsafe, 208 false escalations, 48.8% accurate. Lowering the margin answered more and introduced an unsafe answer — the same direction as the 7-procedure corpus.
- **The operating point moved, and it is confounded.** The 7-procedure corpus scored 72.4% at 0.17 (138/500 false escalations); this 48-procedure corpus scores 48.8% at 0.17 (208/408). It is a *different, larger* corpus with new procedures, so the change is content and size together — this experiment cannot attribute it to size alone.
- **Language drove more of it than size.** English 61.6% accurate, Spanish 30.6%, Portuguese 30.3%: the shorter translated summaries and queries false-escalate far more.
- **Still synthetic and in-sample.** It does not establish behaviour at a 5,000-procedure tenant. Each message is used once, so the distinct-message figures equal the ticket figures here.
