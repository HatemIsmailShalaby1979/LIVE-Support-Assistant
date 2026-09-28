# False-escalation analysis — 500-ticket simulated batch

**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.

This is a read-only analysis. No product code, gate logic, threshold, procedure, or recorded result file was changed.

## Scale, stated once

- **500 tickets are 47 distinct messages.** By declared language the distinct-message counts are en 17, es 13, pt-BR 8, fr 10; those four sets sum to 48 because one message is declared both en and fr. One further ticket has no language column at all (`missing_fields` removed it) and carries a message already counted under es.
- **7 procedures**, each indexed as several passages (title, summary sentences, escalation rule).
- Applied margin **0.17** — test-only. Shipped default **0.18**.
- The batch draws its text from a small template pool, so ticket counts are weighted by repetition. The distinct-message table in section 1 is the unit of evidence; the ticket-level rates elsewhere are repetition-weighted.

## Sources

| | Local run | Deployed-path run |
|---|---|---|
| File | `tooling/eval/simulated-tenant/phase5-label-fix-margin-017.json` | `tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.json` |
| Run | phase5-label-fix-margin-017 | 0aec9773442c4282 |
| Applied margin | 0.17 | 0.17 |
| Batch SHA-256 | `717c40dcc7d1f31b…` | `717c40dcc7d1f31b…` |
| Corpus SHA-256 | `e9e058685d255b24…` | `e9e058685d255b24…` |

## Method, and what is not measurable

A ticket is a **false escalation** when the batch expects an answer and the assistant escalated. The gate's margin is recomputed with the gate's own formula (`packages/core/src/gate.ts`): rank the recorded top-k candidates by descending score, then subtract the runner-up's score.

- The **local** run records candidate scores for all 500 tickets, so its margin is measurable exactly.
- The **deployed-path** run records a decision and a reason per ticket but **no candidate scores**. Its margin distribution is therefore **not measurable** from the recorded file, and this report does not estimate it. The single exception is the recorded safety counterexample, quoted in section 5.
- The deployed-path run and the local run agree on **499 of 500** decisions; the deployed run additionally answered one ticket it should have escalated.
- **Ticket counts are not independent observations.** 500 tickets carry only 47 distinct messages, and the 138 false escalations only 17. One failing template therefore supplies many rows, so the distinct-message table in section 1 — not a ticket count — is the unit of evidence.

## 1. Distinct messages — all 47, by ascending margin

One row per distinct message. `Tickets` counts the tickets carrying it, `ok` the correct ones and `fe` the false escalations. `top-1` and `top-2` are the procedures retrieval ranked first and second on those tickets; the margin is the minimum observed for the message.

A low margin is not the same as a failure. Several of the lowest-margin messages are **correct**, because the batch expects escalation on them and the gate escalated. Those rows are correct by construction and cannot fail.

| Language | Expected | Tickets | ok | fe | top-1 | top-2 | Margin |
|---|---|---:|---:|---:|---|---|---:|
| pt-BR | wc-appeal | 6 | 6 | 0 | wc-appeal | wc-payout | 0.005409 |
| es | (none) | 5 | 5 | 0 | wc-gifts | wc-security | 0.006472 |
| pt-BR | (none) | 2 | 2 | 0 | wc-live | wc-security | 0.008915 |
| es | wc-security | 1 | 1 | 0 | wc-security | wc-login | 0.009746 |
| pt-BR | wc-live | 10 | 0 | 10 | wc-eligibility | wc-live | 0.013248 |
| es | (none) | 1 | 1 | 0 | wc-gifts | wc-security | 0.013902 |
| en | wc-security | 11 | 11 | 0 | wc-login | wc-security | 0.015865 |
| es | wc-payout | 1 | 0 | 1 | wc-gifts | wc-payout | 0.018384 |
| es | wc-gifts | 1 | 0 | 1 | wc-gifts | wc-appeal | 0.020627 |
| fr | wc-appeal | 6 | 6 | 0 | wc-live | wc-appeal | 0.021180 |
| en | (none) | 24 | 24 | 0 | wc-security | wc-payout | 0.028604 |
| pt-BR | wc-eligibility | 1 | 0 | 1 | wc-eligibility | wc-appeal | 0.032840 |
| pt-BR | wc-login | 4 | 0 | 4 | wc-security | wc-login | 0.039380 |
| pt-BR | wc-payout/(none) | 8 | 1 | 7 | wc-gifts | wc-live | 0.040806 |
| en/fr | (none) | 8 | 8 | 0 | wc-gifts | wc-payout | 0.049451 |
| pt-BR | wc-appeal | 1 | 1 | 0 | wc-appeal | wc-live | 0.059832 |
| es | wc-live | 20 | 0 | 20 | wc-eligibility | wc-appeal | 0.059988 |
| fr | wc-eligibility | 4 | 0 | 4 | wc-eligibility | wc-payout | 0.066478 |
| fr | wc-eligibility | 1 | 0 | 1 | wc-eligibility | wc-payout | 0.071928 |
| fr | wc-security | 1 | 1 | 0 | wc-security | wc-gifts | 0.078103 |
| fr | (none) | 5 | 5 | 0 | wc-payout | wc-gifts | 0.080794 |
| es | wc-appeal | 10 | 10 | 0 | wc-appeal | wc-security | 0.084444 |
| es | wc-payout/(none) | 18 | 1 | 17 | wc-payout | wc-gifts | 0.085500 |
| en | wc-payout/(none) | 32 | 3 | 29 | wc-payout | wc-gifts | 0.087425 |
| es | wc-security | 3 | 3 | 0 | wc-security | wc-appeal | 0.089158 |
| pt-BR | wc-gifts | 13 | 0 | 13 | wc-gifts | wc-eligibility | 0.119256 |
| es | wc-eligibility | 10 | 0 | 10 | wc-eligibility | wc-security | 0.132457 |
| es | wc-login | 14 | 0 | 14 | wc-login | wc-security | 0.134836 |
| fr | wc-login | 1 | 0 | 1 | wc-login | wc-gifts | 0.137768 |
| en | wc-payout | 2 | 0 | 2 | wc-payout | wc-eligibility | 0.145778 |
| fr | wc-payout/(none) | 4 | 1 | 3 | wc-payout | wc-gifts | 0.163173 |
| en | wc-payout/(none) | 29 | 29 | 0 | wc-payout | wc-gifts/wc-payout-conflict | 0.167715 – 0.256357 |
| es/(none) | wc-gifts | 27 | 27 | 0 | wc-gifts | wc-payout | 0.175024 |
| fr | wc-gifts | 7 | 7 | 0 | wc-gifts | wc-payout | 0.180346 |
| en | wc-gifts | 33 | 33 | 0 | wc-gifts | wc-payout | 0.193851 |
| en | wc-login | 19 | 19 | 0 | wc-login | wc-security | 0.208814 |
| fr | wc-login | 4 | 4 | 0 | wc-login | wc-security | 0.214030 |
| es | wc-login | 1 | 1 | 0 | wc-login | wc-gifts | 0.214460 |
| en | wc-appeal | 33 | 33 | 0 | wc-appeal | wc-live | 0.216227 |
| en | wc-login | 17 | 17 | 0 | wc-login | wc-security | 0.224554 |
| en | wc-gifts | 1 | 1 | 0 | wc-gifts | wc-payout | 0.224708 |
| en | wc-login | 3 | 3 | 0 | wc-login | wc-live | 0.236110 |
| en | wc-eligibility | 25 | 25 | 0 | wc-eligibility | wc-appeal | 0.241982 |
| en | wc-gifts | 36 | 36 | 0 | wc-gifts | wc-payout | 0.305380 |
| en | wc-live | 17 | 17 | 0 | wc-live | wc-login | 0.324201 |
| en | wc-live | 1 | 1 | 0 | wc-live | wc-login | 0.338605 |
| en | wc-live | 19 | 19 | 0 | wc-live | wc-login | 0.355996 |

### The 17 failing distinct messages

- Expected procedure ranked **first on every ticket of the message**: **12** of 17.
- Expected procedure **not** ranked first: **5**.
- No procedure to rank (the batch expects escalation with no procedure attached): 0.

At ticket level the same split is **96 of 138** with the expected procedure first and **42** without.

## 2. By language

| Language | Tickets | Correct | Accuracy | False escalations | Rate | Unsafe |
|---|---:|---:|---:|---:|---:|---:|
| en | 309 | 278 | 90.0% | 31 | 10.0% | 0 |
| es | 111 | 48 | 43.2% | 63 | 56.8% | 0 |
| pt-BR | 45 | 10 | 22.2% | 35 | 77.8% | 0 |
| fr | 34 | 25 | 73.5% | 9 | 26.5% | 0 |
| (none) | 1 | 1 | 100.0% | 0 | 0.0% | 0 |

These rates are **weighted by template repetition**: each language's ticket count is a multiple of how often its templates were drawn, and the distinct-message counts behind them are en 17, es 13, pt-BR 8, fr 10. A rate over tickets is not a rate over questions.

**Caveat on the language field.** The batch overwrites the `language` column in two chaos types: `wrong_fields` injects `de` regardless of the message, and `mixed_language_typos_sarcasm` picks a language at random while the message text is a blend. `missing_fields` can delete the column entirely, which appears as `(none)`. The split is by the ticket's declared language, not by the language of its text.

## 3. By chaos type

| Chaos type | Tickets | Correct | Accuracy | False escalations | Rate | Unsafe |
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

**Sample size.** Each mutated type carries only 7–8 tickets and one or two distinct messages. Those counts are far too small to compare types against one another, and no ordering of them is meaningful. `baseline` (425 tickets) is the only row with enough volume to read as a rate.

**Correct by construction.** `contradicting_sops` and `no_correct_answer` expect escalation on every ticket, so they cannot produce a false escalation. Their 100% is a property of the batch design, not a measured strength.

### By expected procedure

| Expected procedure | Tickets | Correct | Accuracy | False escalations | Rate | Unsafe |
|---|---:|---:|---:|---:|---:|---:|
| wc-gifts | 118 | 104 | 88.1% | 14 | 11.9% | 0 |
| wc-payout | 87 | 28 | 32.2% | 59 | 67.8% | 0 |
| wc-login | 63 | 44 | 69.8% | 19 | 30.2% | 0 |
| wc-security † | 16 | 16 | 100.0% | 0 | 0.0% | 0 |
| wc-live | 67 | 37 | 55.2% | 30 | 44.8% | 0 |
| wc-appeal † | 56 | 56 | 100.0% | 0 | 0.0% | 0 |
| wc-eligibility | 41 | 25 | 61.0% | 16 | 39.0% | 0 |
| (none) † | 52 | 52 | 100.0% | 0 | 0.0% | 0 |

† `wc-security` and `wc-appeal` expect specialist review — escalation — on every ticket, and `(none)` has no procedure attached, so none of the three can produce a false escalation. Their 100% is correct by construction, not a measured strength.

## 4. Language × chaos type — false-escalation counts

| Language | near_duplicate | missing_fields | wrong_fields | mixed_language_typos_sarcasm | off_hours_volume_spike | reopened_ticket | agent_handoff | wrong_category_tag | contradicting_sops | no_correct_answer | baseline | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| en | 0 | 1 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 26 | 31 |
| es | 0 | 1 | 1 | 2 | 3 | 2 | 0 | 1 | 0 | 0 | 53 | 63 |
| pt-BR | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 34 | 35 |
| fr | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 9 |
| (none) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## 5. Gate reason and margin

### Local run

| Gate reason (false escalations) | Count |
|---|---:|
| insufficient_margin | 138 |

- Blocked by **insufficient margin**: 138 of 138.
- Blocked with **no usable candidate at all**: 0. 138 of 138 false-escalation rows recorded candidate scores.
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

| Margin bucket | False escalations |
|---|---:|
| < 0.05 | 24 |
| 0.05 – 0.10 | 71 |
| 0.10 – 0.15 | 40 |
| 0.15 – 0.17 | 3 |
| >= 0.17 | 0 |

### Deployed-path run

The deployed-path result records no candidate scores, so its margin distribution is not measurable and is not reported.

| Gate reason (deployed false escalations) | Count |
|---|---:|
| insufficient_margin | 138 |

The one recorded deployed margin is the safety counterexample: ticket `SIM-TICKET-00272`, score 0.715348, margin **0.180757**, applied margin 0.17. That ticket was answered rather than escalated, so it is an unsafe answer, not a false escalation, and it is excluded from the counts above. Its margin is also above the shipped 0.18 default.

## 6. Runner-up identity and confusion pairs

Every false escalation has a runner-up. The pair below is (procedure ranked first, procedure ranked second) across the 138 false escalations.

| Top-1 | Top-2 (runner-up) | Distinct messages | Tickets | Median margin |
|---|---|---:|---:|---:|
| wc-payout | wc-gifts | 3 | 49 | 0.087425 |
| wc-eligibility | wc-appeal | 2 | 21 | 0.059988 |
| wc-login | wc-security | 1 | 14 | 0.134836 |
| wc-gifts | wc-eligibility | 1 | 13 | 0.119256 |
| wc-eligibility | wc-live | 1 | 10 | 0.013248 |
| wc-eligibility | wc-security | 1 | 10 | 0.132457 |
| wc-gifts | wc-live | 1 | 7 | 0.040806 |
| wc-eligibility | wc-payout | 2 | 5 | 0.066478 |
| wc-security | wc-login | 1 | 4 | 0.039380 |
| wc-payout | wc-eligibility | 1 | 2 | 0.145778 |
| wc-gifts | wc-payout | 1 | 1 | 0.018384 |
| wc-login | wc-gifts | 1 | 1 | 0.137768 |
| wc-gifts | wc-appeal | 1 | 1 | 0.020627 |

### Is any runner-up another passage of the same procedure?

**No — and it cannot be, by construction.** `searchTopK` in `packages/vector-store/src/cosine.ts` scores every passage and then collapses them to procedures before returning:

```ts
const bestPerProcedure = new Map<string, MatchCandidate>();
for (const candidate of scored) {
  if (!bestPerProcedure.has(candidate.sopId)) bestPerProcedure.set(candidate.sopId, candidate);
}
return [...bestPerProcedure.values()].slice(0, k);
```

Each procedure contributes at most one candidate — its best-scoring passage — so the gate never compares two passages of the same procedure. The candidates recorded in the result file are always distinct procedures, and the measured count of same-procedure runner-ups is **0 of 138**. That is what the code requires, not an empirical result. Every false escalation is therefore a cross-procedure confusion, and the evidence text recorded for each candidate is that procedure's best-scoring passage.

## 7. Overlap observation — read-only

The competing passages behind the most frequent confusion pairs, side by side, taken from the evidence recorded with each candidate. **This is an observation about the text, not a cause.** No procedure was edited, and nothing here establishes why the scores are close.

### wc-payout vs wc-gifts

Most common competing pair, on 29 of the 49 tickets in this confusion pair.

| Procedure | Passage text |
|---|---|
| `wc-payout` (top-1) | A payout marked processed but not yet visible in the creator’s bank account is a payout timing question; check how many business days have passed. |
| `wc-gifts` (top-2) | If a successful purchase receipt is present but Coins have not appeared, check the purchase and balance status; this is a purchase settlement issue. |

- Shared words (length ≥ 4, function words removed): `check`.
- Shared two-word phrases: none.
- Shared three-word phrases: none.

### wc-eligibility vs wc-live

Most common competing pair, on 10 of the 10 tickets in this confusion pair.

| Procedure | Passage text |
|---|---|
| `wc-eligibility` (top-1) | Nesta simulação fictícia, para acessar o LIVE a pessoa precisa ter pelo menos dezoito anos, 750 seguidores, estar em uma região compatível e manter a conta em situação regular. |
| `wc-live` (top-2) | Se a transmissão LIVE cai após alguns segundos ou perde o áudio apesar de a conexão estar estável, é um problema técnico de transmissão, não de elegibilidade. |

- Shared words (length ≥ 4, function words removed): `live`, `estar`.
- Shared two-word phrases: none.
- Shared three-word phrases: none.

### wc-eligibility vs wc-appeal

Most common competing pair, on 20 of the 21 tickets in this confusion pair.

| Procedure | Passage text |
|---|---|
| `wc-eligibility` (top-1) | En esta simulación ficticia, para acceder a LIVE la persona debe tener al menos dieciocho años, 750 seguidores, estar en una región admitida y mantener la cuenta en buen estado. |
| `wc-appeal` (top-2) | Se um criador contestar uma medida de conteúdo ou restrição de LIVE, deve abrir o aviso no aplicativo e enviar a contestação por ele. |

- Shared words (length ≥ 4, function words removed): `live`.
- Shared two-word phrases: none.
- Shared three-word phrases: none.

**What this shows, and what it does not.** The competing passages share almost no wording: across these 3 pairs the most any two passages share is 2 words, and no multi-word phrase at all. What they share is a *topic* — payout against purchase settlement, LIVE access against LIVE technical faults. That is an observation about lexical overlap only; it does not establish that topical adjacency caused the score gap, because nothing here measures the embedding space.

One textual detail is worth recording because it is visible: in this corpus the `wc-live` passage states that a streaming fault is "not an eligibility question", which places the word `elegibilidade` inside the LIVE passage while the eligibility passage carries `LIVE`. Whether that influences the ranking is a **hypothesis, not a finding**, and it has not been tested.

## 8. Lowest-margin false escalations per language

Collapsed to distinct queries, because identical text repeats across tickets. Up to ten lowest-margin distinct queries per language, with the number of tickets each carries.

### en — 2 distinct of 31 tickets

| Query text | Tickets | Margin | Expected | Top-1 | Top-2 |
|---|---:|---:|---|---|---|
| Could you check the normal payout timing? The status changed to processed earlier this week. | 29 | 0.087425 | wc-payout | wc-payout | wc-gifts |
| I already tried twice, gracias — this is getting ridiculous. Could you check the normal payuot timing? The status changed to processed earlier this week. | 2 | 0.145778 | wc-payout | wc-payout | wc-eligibility |

### es — 6 distinct of 63 tickets

| Query text | Tickets | Margin | Expected | Top-1 | Top-2 |
|---|---:|---:|---|---|---|
| Sure, because waiting another week is just brilliant 🙃. El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles. | 1 | 0.018384 | wc-payout | wc-gifts | wc-payout |
| Super, encore une réponse automatique… anyway, I need help. Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou. | 1 | 0.020627 | wc-gifts | wc-gifts | wc-appeal |
| Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada. | 20 | 0.059988 | wc-live | wc-eligibility | wc-appeal |
| El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles. | 17 | 0.085500 | wc-payout | wc-payout | wc-gifts |
| Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE. | 10 | 0.132457 | wc-eligibility | wc-eligibility | wc-security |
| Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo. | 14 | 0.134836 | wc-login | wc-login | wc-security |

### pt-BR — 5 distinct of 35 tickets

| Query text | Tickets | Margin | Expected | Top-1 | Top-2 |
|---|---:|---:|---|---|---|
| Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado. | 10 | 0.013248 | wc-live | wc-eligibility | wc-live |
| Atendo aos requisitos de idade e seguidores, mas a opção de iniciar uma live não aparece. | 1 | 0.032840 | wc-eligibility | wc-eligibility | wc-appeal |
| Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez. | 4 | 0.039380 | wc-login | wc-security | wc-login |
| O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis. | 7 | 0.040806 | wc-payout | wc-gifts | wc-live |
| Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou. | 13 | 0.119256 | wc-gifts | wc-gifts | wc-eligibility |

### fr — 4 distinct of 9 tickets

| Query text | Tickets | Margin | Expected | Top-1 | Top-2 |
|---|---:|---:|---|---|---|
| Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. | 4 | 0.066478 | wc-eligibility | wc-eligibility | wc-payout |
| Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas. Just following up on this — same issue. | 1 | 0.071928 | wc-eligibility | wc-eligibility | wc-payout |
| I already tried twice, gracias — this is getting ridiculous. Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo. | 1 | 0.137768 | wc-login | wc-login | wc-gifts |
| Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés. | 3 | 0.163173 | wc-payout | wc-payout | wc-gifts |

## 9. Conclusion

### What the data supports

1. **Every false escalation is the same mechanism.** All 138 local false escalations were blocked with reason `insufficient_margin`; none was blocked for an absent candidate and none for the absolute floor. Retrieval returned candidate scores on 138 of them.
2. **Mostly a separation problem, but roughly a third are also misranked.** At ticket level the expected procedure was ranked **first in 96 of 138** and **not first in 42** (30.4%). At distinct-message level, of the 17 failing messages, **12** have the expected procedure ranked first throughout and **5** do not. So the assistant usually found the right policy and declined to use it because the runner-up was close, but in a substantial minority it did not find the right policy at all.
3. **Most of the shortfall is not marginal.** The margin distribution is min 0.013248, median 0.087425, max 0.163173, against an applied margin of 0.17. Only 30 of 138 sit within 0.05 below the threshold.
4. **The failures are not confined to the chaos mutations.** 120 of 425 unmutated tickets (28.2%) failed. Each mutated type carries only 7–8 tickets, too few to compare against one another.
5. **The confusion is concentrated in a few procedure pairs.** The largest is `wc-payout` → `wc-gifts`: 49 tickets across 3 distinct messages, median margin 0.087425.
6. **The ticket-level rate differs by declared language**, from en at 10.0% (17 distinct messages) to pt-BR at 77.8% (8 distinct messages). The corpus repeats every procedure in all four languages, so this is a difference in measured outcome, not evidence that one language is unsupported — and with 8 distinct messages behind the worst figure, it rests on a small sample.

### What the data does not support

1. **It does not show that lowering the threshold is safe.** The one unsafe answer in the deployed run — ticket `SIM-TICKET-00272` — was accepted at a margin of 0.180757, *above* the shipped default. The same statistic that marks these 138 tickets as too close also marked that one as close enough. This analysis does not propose a new value.
2. **It does not identify a cause.** Nothing here measures keywords, summary wording, passage length or the embedding space. Section 7 shows the competing passages share almost no wording; why they score closely is not measured by this data.
3. **It does not generalise.** The batch is synthetic and its expected decisions come from the same generator and corpus as the procedures, so the evaluation is in-sample. 500 tickets carry only 47 distinct messages and the 138 false escalations only 17; the ticket counts are not independent samples.
4. **It does not describe the deployed margin distribution.** The deployed-path result records no candidate scores, so only the local margin distribution is measured. The deployed run produced the same 138 false escalations, but its margins are not available to compare.
5. **It does not separate the language effect from the corpus effect.** The declared-language split is confounded by the two mutations that overwrite the language column, and the four translations are not identical in length or phrasing. The per-language figures are measured; the reason for the difference is not.

### Reproduction

```bash
node tooling/eval/analyze-false-escalations.mjs
```

