# Scale-rung corpus confusability

**data_mode: "simulated".** Corpus geometry only — it measures how similar two procedures’
wording is under the pinned MiniLM embedder. It is a proxy for margin risk, not a predictor of
query behaviour. No gate, threshold, or corpus text was changed.

Procedures: 48 · passage pairs: 1128 · mean pairwise max cosine: 0.5790.

## Most confusable procedure pairs (max passage cosine)

| Pair | Max cosine |
|---|---:|
| sc-login-loop ↔ sc-live-disconnect | 0.8501 |
| sc-rest-strike ↔ sc-rest-live | 0.8387 |
| sc-payout-timing ↔ sc-payout-method | 0.8304 |
| sc-prem-cancel ↔ sc-prem-restore | 0.8113 |
| sc-elig-threshold ↔ sc-comm-tab | 0.8092 |
| sc-sec-takeover ↔ sc-spec-access | 0.8062 |
| sc-rest-removed ↔ sc-rest-live | 0.8027 |
| sc-rest-removed ↔ sc-rest-strike | 0.7936 |
| sc-payout-timing ↔ sc-prem-billing | 0.7895 |
| sc-prem-billing ↔ sc-prem-cancel | 0.7745 |
| sc-payout-timing ↔ sc-payout-missing | 0.7744 |
| sc-sec-takeover ↔ sc-sec-email | 0.7576 |
| sc-comm-block ↔ sc-prem-cancel | 0.7558 |
| sc-prem-billing ↔ sc-prem-restore | 0.7547 |
| sc-gift-refund ↔ sc-gift-send-error | 0.7467 |
| sc-elig-threshold ↔ sc-an-export | 0.7455 |
| sc-up-processing ↔ sc-an-watchtime | 0.7430 |
| sc-an-viewcount ↔ sc-an-watchtime | 0.7327 |
| sc-login-email ↔ sc-sec-suspicious | 0.7321 |
| sc-up-upload ↔ sc-up-processing | 0.7311 |

Read against the shipped margin: a pair whose max cosine is at or above the margin is one where a
query sitting between the two topics can be answered from either. The run’s confusion pairs
(`scale-rung-results.md`) are the behavioural counterpart to this geometry.
