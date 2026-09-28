# False-escalation analysis — 500-ticket simulated batch

**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.

This is a read-only analysis. No product code, gate logic, or threshold was changed, and no recorded result file was modified.

## Sources

| | Local run | Deployed-path run |
|---|---|---|
| File | `tooling/eval/simulated-tenant/phase5-label-fix-margin-017.json` | `tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.json` |
| Run | phase5-label-fix-margin-017 | 0aec9773442c4282 |
| Applied margin | 0.17 | 0.17 |
| Batch SHA-256 | `717c40dcc7d1f31b…` | `717c40dcc7d1f31b…` |
| Corpus SHA-256 | `e9e058685d255b24…` | `e9e058685d255b24…` |

The shipped default margin is **0.18** (`DEFAULT_GATE_CONFIG.minMargin`, read from `packages/core`). Both recorded runs applied a test-only 0.17. This analysis reports against the applied margin and states the shipped default separately; it does not present 0.17 as a tenant setting.

## Method, and what is not measurable

A ticket is a **false escalation** when the batch expects an answer and the assistant escalated. The gate's margin is recomputed with the gate's own formula (`packages/core/src/gate.ts`): rank the recorded top-k candidates by descending score, then subtract the runner-up's score.

- The **local** run records candidate scores for all 500 tickets, so its margin is measurable exactly.
- The **deployed-path** run records a decision and a reason per ticket but **no candidate scores**. Its margin distribution is therefore **not measurable** from the recorded file, and this report does not estimate it. The single exception is the recorded safety counterexample, quoted in section 4.
- The deployed-path run and the local run agree on **499 of 500** decisions; the deployed run additionally answered one ticket it should have escalated.
- **The tickets are not independent observations.** The batch draws its text from a small template pool: 500 tickets carry only 47 distinct messages, and the 138 false escalations carry only 17. Counts below are ticket counts, so a single failing template contributes many rows. The per-language and per-chaos-type *rates* are the meaningful figures; the raw counts are not independent samples.

## 1. By language

| Language | Tickets | Correct | Accuracy | False escalations | False-escalation rate | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| en | 309 | 278 | 90.0% | 31 | 10.0% | 0 |
| es | 111 | 48 | 43.2% | 63 | 56.8% | 0 |
| pt-BR | 45 | 10 | 22.2% | 35 | 77.8% | 0 |
| fr | 34 | 25 | 73.5% | 9 | 26.5% | 0 |
| (missing) | 1 | 1 | 100.0% | 0 | 0.0% | 0 |

Across all 500 tickets the local run produced 138 false escalations and 0 unsafe answers.

**Caveat on the language field.** The batch mutates the `language` column in two chaos types: `wrong_fields` injects `de` regardless of the message, and `mixed_language_typos_sarcasm` picks a language at random while the message text is a blend. `missing_fields` can delete the column entirely, which appears here as `(missing)`. The split below is therefore by the ticket's declared language, not by the language of its text.

## 2. By chaos type

| Chaos type | Tickets | Correct | Accuracy | False escalations | False-escalation rate | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| near_duplicate | 7 | 6 | 85.7% | 1 | 14.3% | 0 |
| missing_fields | 7 | 4 | 57.1% | 3 | 42.9% | 0 |
| wrong_fields | 7 | 6 | 85.7% | 1 | 14.3% | 0 |
| mixed_language_typos_sarcasm | 8 | 3 | 37.5% | 5 | 62.5% | 0 |
| off_hours_volume_spike | 8 | 5 | 62.5% | 3 | 37.5% | 0 |
| reopened_ticket | 8 | 6 | 75.0% | 2 | 25.0% | 0 |
| agent_handoff | 7 | 5 | 71.4% | 2 | 28.6% | 0 |
| wrong_category_tag | 8 | 7 | 87.5% | 1 | 12.5% | 0 |
| contradicting_sops | 7 | 7 | 100.0% | 0 | 0.0% | 0 |
| no_correct_answer | 8 | 8 | 100.0% | 0 | 0.0% | 0 |
| baseline | 425 | 305 | 71.8% | 120 | 28.2% | 0 |

`baseline` is the unmutated remainder of the batch.

### By expected procedure

| Expected procedure | Tickets | Correct | Accuracy | False escalations | False-escalation rate | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| wc-gifts | 118 | 104 | 88.1% | 14 | 11.9% | 0 |
| wc-payout | 87 | 28 | 32.2% | 59 | 67.8% | 0 |
| wc-login | 63 | 44 | 69.8% | 19 | 30.2% | 0 |
| wc-security | 16 | 16 | 100.0% | 0 | 0.0% | 0 |
| wc-live | 67 | 37 | 55.2% | 30 | 44.8% | 0 |
| wc-appeal | 56 | 56 | 100.0% | 0 | 0.0% | 0 |
| wc-eligibility | 41 | 25 | 61.0% | 16 | 39.0% | 0 |
| (none) | 52 | 52 | 100.0% | 0 | 0.0% | 0 |

`(none)` covers the tickets whose expected handling is escalation with no procedure attached (`no_supported_procedure`, `conflicting_procedure_guidance`). A ticket whose expected handling is escalation cannot produce a false escalation, so those rows are 0 by construction.

## 3. Language × chaos type — false-escalation counts

| Language | near_duplicate | missing_fields | wrong_fields | mixed_language_typos_sarcasm | off_hours_volume_spike | reopened_ticket | agent_handoff | wrong_category_tag | contradicting_sops | no_correct_answer | baseline | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 0 | 1 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 26 | 31 |
| es | 0 | 1 | 1 | 2 | 3 | 2 | 0 | 1 | 0 | 0 | 53 | 63 |
| pt-BR | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 34 | 35 |
| fr | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 9 |
| (missing) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## 4. Gate reason and margin

### Local run

| Gate reason (false escalations) | Count |
|---|---:|
| insufficient_margin | 138 |

- Blocked by **insufficient margin**: 138 of 138.
- Blocked with **no usable candidate at all**: 0. 138 of 138 false-escalation rows recorded candidate scores, so retrieval always returned something to compare.
- Blocked **below the absolute floor**: 0. The shipped floor is `thresholdAccept` 0, so this path is effectively unreachable on this corpus.

### Margin distribution (local, false escalations with a computable margin)

| Measure | Value |
|---|---:|
| Count | 138 |
| Minimum | 0.013248 |
| Median | 0.087425 |
| Mean | 0.085908 |
| Maximum | 0.163173 |

Applied margin: 0.17. Shipped default: 0.18.

- Within **0.05 below the applied margin** (0.12 – 0.17): **30** of 138.
- At or above the applied margin: **0** — a false escalation cannot occur above the threshold, so this must be 0 and is.
- Margin not computable from the recorded file: 0.

| Margin bucket | False escalations |
|---|---:|
| < 0.05 | 24 |
| 0.05 – 0.10 | 71 |
| 0.10 – 0.15 | 40 |
| 0.15 – 0.17 | 3 |
| >= 0.17 | 0 |

### Did retrieval find the right procedure?

- Top-ranked candidate **is** the expected procedure: **96** of 138. The right policy was retrieved and ranked first; only the margin was too small.
- Top-ranked candidate is a **different** procedure: **42**.
- No ranked candidate recorded: 0.

### Deployed-path run

The deployed-path result records no candidate scores, so its margin distribution is not measurable and is not reported.

| Gate reason (deployed false escalations) | Count |
|---|---:|
| insufficient_margin | 138 |

The one recorded deployed margin is the safety counterexample: ticket `SIM-TICKET-00272`, score 0.715348, margin **0.180757**, applied margin 0.17. That ticket was answered rather than escalated, so it is an unsafe answer, not a false escalation, and it is excluded from the counts above. Its margin is also above the shipped 0.18 default.

## 5. Ten worst-margin false escalations per language

Identical query text recurs across tickets, because the batch draws from a small template pool: the rows below are the ten lowest-margin tickets in each language, not ten distinct questions.

### en — showing 10 of 31

| Ticket | Margin | Chaos type | Expected procedure | Top-1 candidate | Query text |
|---|---:|---:|---:|---:|---:|
| SIM-TICKET-00164 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00172 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00146 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00197 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00180 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00209 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00144 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00203 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00175 | 0.087425 | baseline | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |
| SIM-TICKET-00173 | 0.087425 | missing_fields | wc-payout | wc-payout | Could you check the normal payout timing? The status changed to processed earlier this week. |

### es — showing 10 of 63

| Ticket | Margin | Chaos type | Expected procedure | Top-1 candidate | Query text |
|---|---:|---:|---:|---:|---:|
| SIM-TICKET-00161 | 0.018384 | mixed_language_typos_sarcasm | wc-payout | wc-gifts | Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles. |
| SIM-TICKET-00108 | 0.020627 | mixed_language_typos_sarcasm | wc-gifts | wc-gifts | Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou. |
| SIM-TICKET-00323 | 0.059988 | off_hours_volume_spike | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00311 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00338 | 0.059988 | off_hours_volume_spike | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00302 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00356 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00335 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00309 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |
| SIM-TICKET-00322 | 0.059988 | baseline | wc-live | wc-eligibility | Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. |

### pt-BR — showing 10 of 35

| Ticket | Margin | Chaos type | Expected procedure | Top-1 candidate | Query text |
|---|---:|---:|---:|---:|---:|
| SIM-TICKET-00294 | 0.013248 | missing_fields | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00295 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00316 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00332 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00298 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00303 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00326 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00340 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00358 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |
| SIM-TICKET-00293 | 0.013248 | baseline | wc-live | wc-eligibility | Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. |

### fr — showing 9 of 9

| Ticket | Margin | Chaos type | Expected procedure | Top-1 candidate | Query text |
|---|---:|---:|---:|---:|---:|
| SIM-TICKET-00452 | 0.066478 | baseline | wc-eligibility | wc-eligibility | Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. |
| SIM-TICKET-00454 | 0.066478 | baseline | wc-eligibility | wc-eligibility | Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. |
| SIM-TICKET-00423 | 0.066478 | baseline | wc-eligibility | wc-eligibility | Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. |
| SIM-TICKET-00460 | 0.066478 | baseline | wc-eligibility | wc-eligibility | Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. |
| SIM-TICKET-00392 | 0.071928 | near_duplicate | wc-eligibility | wc-eligibility | Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue. |
| SIM-TICKET-00239 | 0.137768 | mixed_language_typos_sarcasm | wc-login | wc-login | I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo. |
| SIM-TICKET-00166 | 0.163173 | baseline | wc-payout | wc-payout | Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés. |
| SIM-TICKET-00176 | 0.163173 | baseline | wc-payout | wc-payout | Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés. |
| SIM-TICKET-00184 | 0.163173 | baseline | wc-payout | wc-payout | Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés. |

### (missing) — showing 0 of 0

No false escalation with a computable margin in this language.

## 6. Conclusion

### What the data supports

1. **Every false escalation is the same mechanism.** All 138 local false escalations were blocked with reason `insufficient_margin`; none was blocked for an absent candidate and none for the absolute floor. Retrieval returned candidate scores on 138 of them.
2. **Retrieval is not the failure; separation is.** In 96 of 138 false escalations the expected procedure was already ranked **first** — the assistant found the right policy and then declined to use it because the runner-up was close behind.
3. **Most of the shortfall is not marginal.** The margin distribution is min 0.013248, median 0.087425, max 0.163173, against an applied margin of 0.17. Only 30 of 138 sit within 0.05 below the threshold; the rest are further away. So the larger part of the failure is separation that is far too small, not a hair's-breadth calibration miss.
4. **The failures are not confined to the chaos mutations.** 120 of 425 unmutated tickets (28.2%) failed, which is the single largest group by count. The mutations that add tone, typos or noise (mixed_language_typos_sarcasm, 62.5%) raise the rate but did not create the failure mode.
5. **The rate differs by declared language.** pt-BR has the highest false-escalation rate (77.8%, 35/45) and en the lowest (10.0%, 31/309). The corpus repeats every procedure in all four languages, so this is a difference in measured outcome, not evidence that one language is unsupported.

### What the data does not support

1. **It does not show that lowering the threshold is safe.** The one unsafe answer in the deployed run — ticket `SIM-TICKET-00272` — was accepted at a margin of 0.180757, *above* the shipped default. The same statistic that marks these 138 tickets as too close also marked that one as close enough. Tightening or loosening a single margin value cannot separate the two cases, and this analysis does not propose a new value.
2. **It does not identify a cause.** Nothing here measures `triggerKeywords`, summary wording, passage length or model behaviour. The finding is that the top-2 scores are close; why they are close is not measured by this data.
3. **It does not generalise, and the tickets are not independent.** The batch is synthetic and its expected decisions come from the same generator and corpus as the procedures, so the evaluation is in-sample. The 500 tickets carry only 47 distinct messages and the 138 false escalations only 17, so one failing template supplies many rows. These rates are properties of this fixed batch, not of real support traffic.
4. **It does not describe the deployed margin distribution.** The deployed-path result records no candidate scores, so only the local margin distribution is measured. The deployed run produced the same 138 false escalations, but its margins are not available to compare.
5. **It does not separate the language effect from the corpus effect.** The declared-language split is confounded by the two mutations that overwrite the language column, and the corpus's four translations are not identical in length or phrasing. The per-language rates in section 1 are measured; the reason for the difference is not.

### Reproduction

```bash
node tooling/eval/analyze-false-escalations.mjs
```

