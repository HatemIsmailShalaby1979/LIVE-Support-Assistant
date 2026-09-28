# Procedure-wording experiment — before and after

**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.

The experiment edits four procedures (`wc-live`, `wc-eligibility`, `wc-payout`, `wc-gifts`) in all four languages: each opening sentence names the procedure's own topic, and cross-references that name another procedure's topic are removed. No policy fact changed — every number, window, age and follower count is identical, and the conflicting-procedure lint still reports 0 conflicts.

Gate logic, the shipped threshold, `chaos-500.json` and the holdout batch are untouched. The "before" figures are the recorded runs on the pre-edit corpus; the "after" figures are fresh runs on the edited corpus.

| Configuration | Corpus SHA (before → after) |
|---|---|
| chaos-500 @ 0.17 | `e9e058685d25…` → `5da97ad6b50b…` |
| chaos-500 @ 0.18 | `e9e058685d25…` → `5da97ad6b50b…` |
| holdout @ 0.17 | `e9e058685d25…` → `5da97ad6b50b…` |
| holdout @ 0.18 | `e9e058685d25…` → `5da97ad6b50b…` |

## Summary

| Configuration | Correct before | Correct after | Δ | False escalations before | after | Δ | Wrong-first before | after | Δ | Unsafe before | after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chaos-500 @ 0.17 | 362/500 (72.4%) | 355/500 (71.0%) | -1.4 | 138 | 145 | 7 | 42 | 42 | 0 | 0 | 0 |
| chaos-500 @ 0.18 | 335/500 (67.0%) | 355/500 (71.0%) | +4.0 | 165 | 145 | -20 | 42 | 42 | 0 | 0 | 0 |
| holdout @ 0.17 | 379/500 (75.8%) | 373/500 (74.6%) | -1.2 | 121 | 127 | 6 | 40 | 40 | 0 | 0 | 0 |
| holdout @ 0.18 | 359/500 (71.8%) | 372/500 (74.4%) | +2.6 | 141 | 128 | -13 | 40 | 40 | 0 | 0 | 0 |

`Wrong-first` counts false escalations where the procedure ranked first was not the batch's expected procedure. `Unsafe` counts answers given where escalation was expected, plus answers from the wrong procedure.

## Failures introduced and repaired

### chaos-500 @ 0.17

- New unsafe answers: **0**
- New wrong-first tickets: **6** — SIM-TICKET-00403, SIM-TICKET-00366, SIM-TICKET-00415, SIM-TICKET-00413, SIM-TICKET-00385, SIM-TICKET-00409
- Wrong-first tickets repaired: 0
- False escalations repaired: 0
- New false escalations: 7

### chaos-500 @ 0.18

- New unsafe answers: **0**
- New wrong-first tickets: **6** — SIM-TICKET-00403, SIM-TICKET-00366, SIM-TICKET-00415, SIM-TICKET-00413, SIM-TICKET-00385, SIM-TICKET-00409
- Wrong-first tickets repaired: 0
- False escalations repaired: 27
- New false escalations: 7

### holdout @ 0.17

- New unsafe answers: **0**
- New wrong-first tickets: **5** — SIM-TICKET-00404, SIM-TICKET-00364, SIM-TICKET-00407, SIM-TICKET-00368, SIM-TICKET-00370
- Wrong-first tickets repaired: 0
- False escalations repaired: 1
- New false escalations: 7

### holdout @ 0.18

- New unsafe answers: **0**
- New wrong-first tickets: **5** — SIM-TICKET-00404, SIM-TICKET-00364, SIM-TICKET-00407, SIM-TICKET-00368, SIM-TICKET-00370
- Wrong-first tickets repaired: 0
- False escalations repaired: 20
- New false escalations: 7

## Per distinct message

One row per distinct message, ordered by the pre-edit margin. Identical text repeats across tickets, so ticket counts are weighted by repetition; these rows are the unit of evidence.

### chaos-500 @ 0.17 — 47 distinct messages, 4 changed

| Language | Expected | Tickets | top-1 before | top-1 after | top-2 before | top-2 after | Margin before | Margin after | Decision before | Decision after | fe before | fe after |
|---|---|---:|---|---|---|---|---:|---:|---|---|---:|---:|
| pt-BR | wc-appeal | 6 | wc-appeal | wc-payout | wc-payout | wc-appeal | 0.005409 | 0.012905 | escalate | escalate | 0 | 0 |
| es | (none) | 5 | wc-gifts | wc-gifts | wc-security | wc-security | 0.006472 | 0.013472 | escalate | escalate | 0 | 0 |
| pt-BR | (none) | 2 | wc-live | wc-security | wc-security | wc-live | 0.008915 | 0.015922 | escalate | escalate | 0 | 0 |
| es | wc-security | 1 | wc-security | wc-security | wc-login | wc-login | 0.009746 | 0.006356 | escalate | escalate | 0 | 0 |
| pt-BR | wc-live | 10 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.013248 | 0.023698 | escalate | escalate | 10 | 10 |
| es | (none) | 1 | wc-gifts | wc-live | wc-security | wc-gifts | 0.013902 | 0.020507 | escalate | escalate | 0 | 0 |
| en | wc-security | 11 | wc-login | wc-login | wc-security | wc-security | 0.015865 | 0.030104 | escalate | escalate | 0 | 0 |
| es | wc-payout | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.018384 | 0.026627 | escalate | escalate | 1 | 1 |
| es | wc-gifts | 1 | wc-gifts | wc-gifts | wc-appeal | wc-appeal | 0.020627 | 0.033031 | escalate | escalate | 1 | 1 |
| fr | wc-appeal | 6 | wc-live | wc-live | wc-appeal | wc-appeal | 0.021180 | 0.016340 | escalate | escalate | 0 | 0 |
| en | (none) | 24 | wc-security | wc-security | wc-payout | wc-payout | 0.028604 | 0.038546 | escalate | escalate | 0 | 0 |
| pt-BR | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.032840 | 0.025207 | escalate | escalate | 1 | 1 |
| pt-BR | wc-login | 4 | wc-security | wc-security | wc-login | wc-login | 0.039380 | 0.041272 | escalate | escalate | 4 | 4 |
| pt-BR | (none)/wc-payout | 8 | wc-gifts | wc-gifts | wc-live | wc-live | 0.040806 | 0.042383 | escalate | escalate | 7 | 7 |
| en/fr | (none) | 8 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.049451 | 0.055418 | escalate | escalate | 0 | 0 |
| pt-BR | wc-appeal | 1 | wc-appeal | wc-appeal | wc-live | wc-live | 0.059832 | 0.052905 | escalate | escalate | 0 | 0 |
| es | wc-live | 20 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.059988 | 0.039693 | escalate | escalate | 20 | 20 |
| fr | wc-eligibility | 4 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.066478 | 0.044549 | escalate | escalate | 4 | 4 |
| fr | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.071928 | 0.052761 | escalate | escalate | 1 | 1 |
| fr | wc-security | 1 | wc-security | wc-security | wc-gifts | wc-gifts | 0.078103 | 0.069912 | escalate | escalate | 0 | 0 |
| fr | (none) | 5 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.080794 | 0.013453 | escalate | escalate | 0 | 0 |
| es | wc-appeal | 10 | wc-appeal | wc-appeal | wc-security | wc-security | 0.084444 | 0.112668 | escalate | escalate | 0 | 0 |
| es | (none)/wc-payout | 18 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.085500 | 0.071481 | escalate | escalate | 17 | 17 |
| en | (none)/wc-payout | 32 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.087425 | 0.090606 | escalate | escalate | 29 | 29 |
| es | wc-security | 3 | wc-security | wc-security | wc-appeal | wc-eligibility | 0.089158 | 0.093953 | escalate | escalate | 0 | 0 |
| pt-BR | wc-gifts | 13 | wc-gifts | wc-gifts | wc-eligibility | wc-eligibility | 0.119256 | 0.129906 | escalate | escalate | 13 | 13 |
| es | wc-eligibility | 10 | wc-eligibility | wc-eligibility | wc-security | wc-security | 0.132457 | 0.138454 | escalate | escalate | 10 | 10 |
| es | wc-login | 14 | wc-login | wc-login | wc-security | wc-security | 0.134836 | 0.130118 | escalate | escalate | 14 | 14 |
| fr | wc-login | 1 | wc-login | wc-login | wc-gifts | wc-gifts | 0.137768 | 0.129633 | escalate | escalate | 1 | 1 |
| en | wc-payout | 2 | wc-payout | wc-payout | wc-eligibility | wc-eligibility | 0.145778 | 0.111991 | escalate | escalate | 2 | 2 |
| fr | (none)/wc-payout | 4 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.163173 | 0.159285 | escalate | escalate | 3 | 3 |
| en | (none)/wc-payout | 29 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.167715 | 0.167043 | answer/escalate | answer/escalate | 0 | 0 |
| (none)/es | wc-gifts | 27 | wc-gifts | wc-gifts | wc-payout | wc-login | 0.175024 | 0.183411 | answer | answer | 0 | 0 |
| fr | wc-gifts | 7 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.180346 | 0.098172 | answer | escalate | 0 | 7 |
| en | wc-gifts | 33 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.193851 | 0.210674 | answer | answer | 0 | 0 |
| en | wc-login | 19 | wc-login | wc-login | wc-security | wc-security | 0.208814 | 0.208467 | answer | answer | 0 | 0 |
| fr | wc-login | 4 | wc-login | wc-login | wc-security | wc-security | 0.214030 | 0.209010 | answer | answer | 0 | 0 |
| es | wc-login | 1 | wc-login | wc-login | wc-gifts | wc-gifts | 0.214460 | 0.201308 | answer | answer | 0 | 0 |
| en | wc-appeal | 33 | wc-appeal | wc-appeal | wc-live | wc-live | 0.216227 | 0.212008 | escalate | escalate | 0 | 0 |
| en | wc-login | 17 | wc-login | wc-login | wc-security | wc-security | 0.224554 | 0.225107 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.224708 | 0.247670 | answer | answer | 0 | 0 |
| en | wc-login | 3 | wc-login | wc-login | wc-live | wc-security | 0.236110 | 0.264534 | answer | answer | 0 | 0 |
| en | wc-eligibility | 25 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.241982 | 0.286691 | answer | answer | 0 | 0 |
| en | wc-gifts | 36 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.305380 | 0.330349 | answer | answer | 0 | 0 |
| en | wc-live | 17 | wc-live | wc-live | wc-login | wc-login | 0.324201 | 0.354498 | answer | answer | 0 | 0 |
| en | wc-live | 1 | wc-live | wc-live | wc-login | wc-login | 0.338605 | 0.350436 | answer | answer | 0 | 0 |
| en | wc-live | 19 | wc-live | wc-live | wc-login | wc-login | 0.355996 | 0.388618 | answer | answer | 0 | 0 |

### chaos-500 @ 0.18 — 47 distinct messages, 5 changed

| Language | Expected | Tickets | top-1 before | top-1 after | top-2 before | top-2 after | Margin before | Margin after | Decision before | Decision after | fe before | fe after |
|---|---|---:|---|---|---|---|---:|---:|---|---|---:|---:|
| pt-BR | wc-appeal | 6 | wc-appeal | wc-payout | wc-payout | wc-appeal | 0.005409 | 0.012905 | escalate | escalate | 0 | 0 |
| es | (none) | 5 | wc-gifts | wc-gifts | wc-security | wc-security | 0.006472 | 0.013472 | escalate | escalate | 0 | 0 |
| pt-BR | (none) | 2 | wc-live | wc-security | wc-security | wc-live | 0.008915 | 0.015922 | escalate | escalate | 0 | 0 |
| es | wc-security | 1 | wc-security | wc-security | wc-login | wc-login | 0.009746 | 0.006356 | escalate | escalate | 0 | 0 |
| pt-BR | wc-live | 10 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.013248 | 0.023698 | escalate | escalate | 10 | 10 |
| es | (none) | 1 | wc-gifts | wc-live | wc-security | wc-gifts | 0.013902 | 0.020507 | escalate | escalate | 0 | 0 |
| en | wc-security | 11 | wc-login | wc-login | wc-security | wc-security | 0.015865 | 0.030104 | escalate | escalate | 0 | 0 |
| es | wc-payout | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.018384 | 0.026627 | escalate | escalate | 1 | 1 |
| es | wc-gifts | 1 | wc-gifts | wc-gifts | wc-appeal | wc-appeal | 0.020627 | 0.033031 | escalate | escalate | 1 | 1 |
| fr | wc-appeal | 6 | wc-live | wc-live | wc-appeal | wc-appeal | 0.021180 | 0.016340 | escalate | escalate | 0 | 0 |
| en | (none) | 24 | wc-security | wc-security | wc-payout | wc-payout | 0.028604 | 0.038546 | escalate | escalate | 0 | 0 |
| pt-BR | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.032840 | 0.025207 | escalate | escalate | 1 | 1 |
| pt-BR | wc-login | 4 | wc-security | wc-security | wc-login | wc-login | 0.039380 | 0.041272 | escalate | escalate | 4 | 4 |
| pt-BR | (none)/wc-payout | 8 | wc-gifts | wc-gifts | wc-live | wc-live | 0.040806 | 0.042383 | escalate | escalate | 7 | 7 |
| en/fr | (none) | 8 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.049451 | 0.055418 | escalate | escalate | 0 | 0 |
| pt-BR | wc-appeal | 1 | wc-appeal | wc-appeal | wc-live | wc-live | 0.059832 | 0.052905 | escalate | escalate | 0 | 0 |
| es | wc-live | 20 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.059988 | 0.039693 | escalate | escalate | 20 | 20 |
| fr | wc-eligibility | 4 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.066478 | 0.044549 | escalate | escalate | 4 | 4 |
| fr | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.071928 | 0.052761 | escalate | escalate | 1 | 1 |
| fr | wc-security | 1 | wc-security | wc-security | wc-gifts | wc-gifts | 0.078103 | 0.069912 | escalate | escalate | 0 | 0 |
| fr | (none) | 5 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.080794 | 0.013453 | escalate | escalate | 0 | 0 |
| es | wc-appeal | 10 | wc-appeal | wc-appeal | wc-security | wc-security | 0.084444 | 0.112668 | escalate | escalate | 0 | 0 |
| es | (none)/wc-payout | 18 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.085500 | 0.071481 | escalate | escalate | 17 | 17 |
| en | (none)/wc-payout | 32 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.087425 | 0.090606 | escalate | escalate | 29 | 29 |
| es | wc-security | 3 | wc-security | wc-security | wc-appeal | wc-eligibility | 0.089158 | 0.093953 | escalate | escalate | 0 | 0 |
| pt-BR | wc-gifts | 13 | wc-gifts | wc-gifts | wc-eligibility | wc-eligibility | 0.119256 | 0.129906 | escalate | escalate | 13 | 13 |
| es | wc-eligibility | 10 | wc-eligibility | wc-eligibility | wc-security | wc-security | 0.132457 | 0.138454 | escalate | escalate | 10 | 10 |
| es | wc-login | 14 | wc-login | wc-login | wc-security | wc-security | 0.134836 | 0.130118 | escalate | escalate | 14 | 14 |
| fr | wc-login | 1 | wc-login | wc-login | wc-gifts | wc-gifts | 0.137768 | 0.129633 | escalate | escalate | 1 | 1 |
| en | wc-payout | 2 | wc-payout | wc-payout | wc-eligibility | wc-eligibility | 0.145778 | 0.111991 | escalate | escalate | 2 | 2 |
| fr | (none)/wc-payout | 4 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.163173 | 0.159285 | escalate | escalate | 3 | 3 |
| en | (none)/wc-payout | 29 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.167715 | 0.167043 | answer/escalate | answer/escalate | 0 | 0 |
| (none)/es | wc-gifts | 27 | wc-gifts | wc-gifts | wc-payout | wc-login | 0.175024 | 0.183411 | escalate | answer | 27 | 0 |
| fr | wc-gifts | 7 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.180346 | 0.098172 | answer | escalate | 0 | 7 |
| en | wc-gifts | 33 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.193851 | 0.210674 | answer | answer | 0 | 0 |
| en | wc-login | 19 | wc-login | wc-login | wc-security | wc-security | 0.208814 | 0.208467 | answer | answer | 0 | 0 |
| fr | wc-login | 4 | wc-login | wc-login | wc-security | wc-security | 0.214030 | 0.209010 | answer | answer | 0 | 0 |
| es | wc-login | 1 | wc-login | wc-login | wc-gifts | wc-gifts | 0.214460 | 0.201308 | answer | answer | 0 | 0 |
| en | wc-appeal | 33 | wc-appeal | wc-appeal | wc-live | wc-live | 0.216227 | 0.212008 | escalate | escalate | 0 | 0 |
| en | wc-login | 17 | wc-login | wc-login | wc-security | wc-security | 0.224554 | 0.225107 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.224708 | 0.247670 | answer | answer | 0 | 0 |
| en | wc-login | 3 | wc-login | wc-login | wc-live | wc-security | 0.236110 | 0.264534 | answer | answer | 0 | 0 |
| en | wc-eligibility | 25 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.241982 | 0.286691 | answer | answer | 0 | 0 |
| en | wc-gifts | 36 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.305380 | 0.330349 | answer | answer | 0 | 0 |
| en | wc-live | 17 | wc-live | wc-live | wc-login | wc-login | 0.324201 | 0.354498 | answer | answer | 0 | 0 |
| en | wc-live | 1 | wc-live | wc-live | wc-login | wc-login | 0.338605 | 0.350436 | answer | answer | 0 | 0 |
| en | wc-live | 19 | wc-live | wc-live | wc-login | wc-login | 0.355996 | 0.388618 | answer | answer | 0 | 0 |

### holdout @ 0.17 — 51 distinct messages, 5 changed

| Language | Expected | Tickets | top-1 before | top-1 after | top-2 before | top-2 after | Margin before | Margin after | Decision before | Decision after | fe before | fe after |
|---|---|---:|---|---|---|---|---:|---:|---|---|---:|---:|
| pt-BR | wc-appeal | 4 | wc-appeal | wc-payout | wc-payout | wc-appeal | 0.005409 | 0.012905 | escalate | escalate | 0 | 0 |
| pt-BR | wc-security | 2 | wc-login | wc-login | wc-security | wc-security | 0.005566 | 0.006260 | escalate | escalate | 0 | 0 |
| es | (none) | 6 | wc-gifts | wc-gifts | wc-security | wc-security | 0.006472 | 0.013472 | escalate | escalate | 0 | 0 |
| pt-BR | (none) | 2 | wc-live | wc-security | wc-security | wc-live | 0.008915 | 0.015922 | escalate | escalate | 0 | 0 |
| en | wc-payout | 2 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.013095 | 0.014577 | escalate | escalate | 2 | 2 |
| pt-BR | wc-live | 5 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.013248 | 0.023698 | escalate | escalate | 5 | 5 |
| en | wc-security | 11 | wc-login | wc-login | wc-security | wc-security | 0.015865 | 0.030104 | escalate | escalate | 0 | 0 |
| pt-BR | (none)/wc-payout | 13 | wc-gifts | wc-gifts | wc-live/wc-payout-conflict | wc-live/wc-payout-conflict | 0.016803 | 0.022116 | escalate | escalate | 12 | 12 |
| en | wc-payout | 1 | wc-payout | wc-payout | wc-login | wc-login | 0.018890 | 0.029614 | escalate | escalate | 1 | 1 |
| fr | wc-appeal | 5 | wc-live | wc-live | wc-appeal | wc-appeal | 0.021180 | 0.016340 | escalate | escalate | 0 | 0 |
| en | (none) | 31 | wc-security | wc-security | wc-payout | wc-payout | 0.028604 | 0.038546 | escalate | escalate | 0 | 0 |
| pt-BR | wc-eligibility | 4 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.032840 | 0.025207 | escalate | escalate | 4 | 4 |
| pt-BR | wc-login | 9 | wc-security | wc-security | wc-login | wc-login | 0.039380 | 0.041272 | escalate | escalate | 9 | 9 |
| en/es/pt-BR | (none) | 8 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.049451 | 0.055418 | escalate | escalate | 0 | 0 |
| fr | wc-appeal | 1 | wc-appeal | wc-live | wc-live | wc-appeal | 0.055431 | 0.012322 | escalate | escalate | 0 | 0 |
| es | wc-live | 12 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.059988 | 0.039693 | escalate | escalate | 12 | 12 |
| es | wc-payout | 1 | wc-payout | wc-payout | wc-eligibility | wc-eligibility | 0.062934 | 0.047833 | escalate | escalate | 1 | 1 |
| fr | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.066478 | 0.044549 | escalate | escalate | 1 | 1 |
| fr | wc-security | 1 | wc-security | wc-security | wc-gifts | wc-gifts | 0.078103 | 0.069912 | escalate | escalate | 0 | 0 |
| fr | (none) | 1 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.080794 | 0.013453 | escalate | escalate | 0 | 0 |
| es | wc-appeal | 10 | wc-appeal | wc-appeal | wc-security | wc-security | 0.084444 | 0.112668 | escalate | escalate | 0 | 0 |
| es | (none)/wc-payout | 21 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.085500 | 0.071481 | escalate | escalate | 19 | 19 |
| en | (none)/wc-payout | 20 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.087425 | 0.090606 | escalate | escalate | 19 | 19 |
| es | wc-security | 6 | wc-security | wc-security | wc-appeal | wc-eligibility | 0.089158 | 0.093953 | escalate | escalate | 0 | 0 |
| fr | wc-live | 2 | wc-live | wc-live | wc-eligibility | wc-eligibility | 0.096443 | 0.047427 | escalate | escalate | 2 | 2 |
| fr | (none)/wc-payout | 5 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.108600 | 0.093962 | escalate | escalate | 4 | 4 |
| pt-BR | wc-gifts | 8 | wc-gifts | wc-gifts | wc-eligibility | wc-eligibility | 0.119256 | 0.129906 | escalate | escalate | 8 | 8 |
| es | wc-live | 1 | wc-live | wc-live | wc-login | wc-login | 0.120522 | 0.175526 | escalate | answer | 1 | 0 |
| es | wc-eligibility | 7 | wc-eligibility | wc-eligibility | wc-security | wc-security | 0.132457 | 0.138454 | escalate | escalate | 7 | 7 |
| en | wc-appeal | 1 | wc-appeal | wc-appeal | wc-live | wc-live | 0.133146 | 0.118312 | escalate | escalate | 0 | 0 |
| es | wc-login | 12 | wc-login | wc-login | wc-security | wc-security | 0.134836 | 0.130118 | escalate | escalate | 12 | 12 |
| en | (none)/wc-payout | 30 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.160111 | 0.159439 | answer/escalate | answer/escalate | 0 | 0 |
| fr | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.161436 | 0.095942 | escalate | escalate | 1 | 1 |
| pt-BR | wc-login | 1 | wc-login | wc-login | wc-security | wc-security | 0.165986 | 0.165522 | escalate | escalate | 1 | 1 |
| es | wc-gifts | 20 | wc-gifts | wc-gifts | wc-payout | wc-login | 0.175024 | 0.183411 | answer | answer | 0 | 0 |
| fr | wc-gifts | 7 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.180346 | 0.098172 | answer | escalate | 0 | 7 |
| en | wc-gifts | 38 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.193851 | 0.210674 | answer | answer | 0 | 0 |
| en | wc-login | 13 | wc-login | wc-login | wc-security | wc-security | 0.208814 | 0.208467 | answer | answer | 0 | 0 |
| fr | wc-login | 4 | wc-login | wc-login | wc-security | wc-security | 0.214030 | 0.209010 | answer | answer | 0 | 0 |
| en | wc-appeal | 37 | wc-appeal | wc-appeal | wc-live | wc-live | 0.216227 | 0.212008 | escalate | escalate | 0 | 0 |
| fr | wc-login | 1 | wc-login | wc-login | wc-security | wc-security | 0.216298 | 0.204961 | answer | answer | 0 | 0 |
| en | wc-login | 18 | wc-login | wc-login | wc-security | wc-security | 0.224554 | 0.225107 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.224708 | 0.247670 | answer | answer | 0 | 0 |
| en | wc-login | 1 | wc-login | wc-login | wc-live | wc-security | 0.236110 | 0.264534 | answer | answer | 0 | 0 |
| en | wc-eligibility | 23 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.241982 | 0.286691 | answer | answer | 0 | 0 |
| es | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.260674 | 0.307378 | answer | answer | 0 | 0 |
| en | wc-gifts | 40 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.305380 | 0.330349 | answer | answer | 0 | 0 |
| de/en | wc-live | 24 | wc-live | wc-live | wc-login | wc-login | 0.324201 | 0.354498 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.332439 | 0.360964 | answer | answer | 0 | 0 |
| en | wc-live | 1 | wc-live | wc-live | wc-login | wc-gifts | 0.351073 | 0.397842 | answer | answer | 0 | 0 |
| en | wc-live | 25 | wc-live | wc-live | wc-login | wc-login | 0.355996 | 0.388618 | answer | answer | 0 | 0 |

### holdout @ 0.18 — 51 distinct messages, 5 changed

| Language | Expected | Tickets | top-1 before | top-1 after | top-2 before | top-2 after | Margin before | Margin after | Decision before | Decision after | fe before | fe after |
|---|---|---:|---|---|---|---|---:|---:|---|---|---:|---:|
| pt-BR | wc-appeal | 4 | wc-appeal | wc-payout | wc-payout | wc-appeal | 0.005409 | 0.012905 | escalate | escalate | 0 | 0 |
| pt-BR | wc-security | 2 | wc-login | wc-login | wc-security | wc-security | 0.005566 | 0.006260 | escalate | escalate | 0 | 0 |
| es | (none) | 6 | wc-gifts | wc-gifts | wc-security | wc-security | 0.006472 | 0.013472 | escalate | escalate | 0 | 0 |
| pt-BR | (none) | 2 | wc-live | wc-security | wc-security | wc-live | 0.008915 | 0.015922 | escalate | escalate | 0 | 0 |
| en | wc-payout | 2 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.013095 | 0.014577 | escalate | escalate | 2 | 2 |
| pt-BR | wc-live | 5 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.013248 | 0.023698 | escalate | escalate | 5 | 5 |
| en | wc-security | 11 | wc-login | wc-login | wc-security | wc-security | 0.015865 | 0.030104 | escalate | escalate | 0 | 0 |
| pt-BR | (none)/wc-payout | 13 | wc-gifts | wc-gifts | wc-live/wc-payout-conflict | wc-live/wc-payout-conflict | 0.016803 | 0.022116 | escalate | escalate | 12 | 12 |
| en | wc-payout | 1 | wc-payout | wc-payout | wc-login | wc-login | 0.018890 | 0.029614 | escalate | escalate | 1 | 1 |
| fr | wc-appeal | 5 | wc-live | wc-live | wc-appeal | wc-appeal | 0.021180 | 0.016340 | escalate | escalate | 0 | 0 |
| en | (none) | 31 | wc-security | wc-security | wc-payout | wc-payout | 0.028604 | 0.038546 | escalate | escalate | 0 | 0 |
| pt-BR | wc-eligibility | 4 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.032840 | 0.025207 | escalate | escalate | 4 | 4 |
| pt-BR | wc-login | 9 | wc-security | wc-security | wc-login | wc-login | 0.039380 | 0.041272 | escalate | escalate | 9 | 9 |
| en/es/pt-BR | (none) | 8 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.049451 | 0.055418 | escalate | escalate | 0 | 0 |
| fr | wc-appeal | 1 | wc-appeal | wc-live | wc-live | wc-appeal | 0.055431 | 0.012322 | escalate | escalate | 0 | 0 |
| es | wc-live | 12 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.059988 | 0.039693 | escalate | escalate | 12 | 12 |
| es | wc-payout | 1 | wc-payout | wc-payout | wc-eligibility | wc-eligibility | 0.062934 | 0.047833 | escalate | escalate | 1 | 1 |
| fr | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-payout | wc-payout | 0.066478 | 0.044549 | escalate | escalate | 1 | 1 |
| fr | wc-security | 1 | wc-security | wc-security | wc-gifts | wc-gifts | 0.078103 | 0.069912 | escalate | escalate | 0 | 0 |
| fr | (none) | 1 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.080794 | 0.013453 | escalate | escalate | 0 | 0 |
| es | wc-appeal | 10 | wc-appeal | wc-appeal | wc-security | wc-security | 0.084444 | 0.112668 | escalate | escalate | 0 | 0 |
| es | (none)/wc-payout | 21 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.085500 | 0.071481 | escalate | escalate | 19 | 19 |
| en | (none)/wc-payout | 20 | wc-payout | wc-payout | wc-gifts | wc-gifts | 0.087425 | 0.090606 | escalate | escalate | 19 | 19 |
| es | wc-security | 6 | wc-security | wc-security | wc-appeal | wc-eligibility | 0.089158 | 0.093953 | escalate | escalate | 0 | 0 |
| fr | wc-live | 2 | wc-live | wc-live | wc-eligibility | wc-eligibility | 0.096443 | 0.047427 | escalate | escalate | 2 | 2 |
| fr | (none)/wc-payout | 5 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.108600 | 0.093962 | escalate | escalate | 4 | 4 |
| pt-BR | wc-gifts | 8 | wc-gifts | wc-gifts | wc-eligibility | wc-eligibility | 0.119256 | 0.129906 | escalate | escalate | 8 | 8 |
| es | wc-live | 1 | wc-live | wc-live | wc-login | wc-login | 0.120522 | 0.175526 | escalate | escalate | 1 | 1 |
| es | wc-eligibility | 7 | wc-eligibility | wc-eligibility | wc-security | wc-security | 0.132457 | 0.138454 | escalate | escalate | 7 | 7 |
| en | wc-appeal | 1 | wc-appeal | wc-appeal | wc-live | wc-live | 0.133146 | 0.118312 | escalate | escalate | 0 | 0 |
| es | wc-login | 12 | wc-login | wc-login | wc-security | wc-security | 0.134836 | 0.130118 | escalate | escalate | 12 | 12 |
| en | (none)/wc-payout | 30 | wc-payout | wc-payout | wc-gifts/wc-payout-conflict | wc-gifts/wc-payout-conflict | 0.160111 | 0.159439 | answer/escalate | answer/escalate | 0 | 0 |
| fr | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.161436 | 0.095942 | escalate | escalate | 1 | 1 |
| pt-BR | wc-login | 1 | wc-login | wc-login | wc-security | wc-security | 0.165986 | 0.165522 | escalate | escalate | 1 | 1 |
| es | wc-gifts | 20 | wc-gifts | wc-gifts | wc-payout | wc-login | 0.175024 | 0.183411 | escalate | answer | 20 | 0 |
| fr | wc-gifts | 7 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.180346 | 0.098172 | answer | escalate | 0 | 7 |
| en | wc-gifts | 38 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.193851 | 0.210674 | answer | answer | 0 | 0 |
| en | wc-login | 13 | wc-login | wc-login | wc-security | wc-security | 0.208814 | 0.208467 | answer | answer | 0 | 0 |
| fr | wc-login | 4 | wc-login | wc-login | wc-security | wc-security | 0.214030 | 0.209010 | answer | answer | 0 | 0 |
| en | wc-appeal | 37 | wc-appeal | wc-appeal | wc-live | wc-live | 0.216227 | 0.212008 | escalate | escalate | 0 | 0 |
| fr | wc-login | 1 | wc-login | wc-login | wc-security | wc-security | 0.216298 | 0.204961 | answer | answer | 0 | 0 |
| en | wc-login | 18 | wc-login | wc-login | wc-security | wc-security | 0.224554 | 0.225107 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.224708 | 0.247670 | answer | answer | 0 | 0 |
| en | wc-login | 1 | wc-login | wc-login | wc-live | wc-security | 0.236110 | 0.264534 | answer | answer | 0 | 0 |
| en | wc-eligibility | 23 | wc-eligibility | wc-eligibility | wc-appeal | wc-appeal | 0.241982 | 0.286691 | answer | answer | 0 | 0 |
| es | wc-eligibility | 1 | wc-eligibility | wc-eligibility | wc-live | wc-live | 0.260674 | 0.307378 | answer | answer | 0 | 0 |
| en | wc-gifts | 40 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.305380 | 0.330349 | answer | answer | 0 | 0 |
| de/en | wc-live | 24 | wc-live | wc-live | wc-login | wc-login | 0.324201 | 0.354498 | answer | answer | 0 | 0 |
| en | wc-gifts | 1 | wc-gifts | wc-gifts | wc-payout | wc-payout | 0.332439 | 0.360964 | answer | answer | 0 | 0 |
| en | wc-live | 1 | wc-live | wc-live | wc-login | wc-gifts | 0.351073 | 0.397842 | answer | answer | 0 | 0 |
| en | wc-live | 25 | wc-live | wc-live | wc-login | wc-login | 0.355996 | 0.388618 | answer | answer | 0 | 0 |

## Where the margins sit — the band between 0.17 and 0.18

A ticket whose margin falls between 0.17 and 0.18 is decided by the threshold rather than by retrieval: it is a false escalation at 0.18 and an answer at 0.17. The size of that band is therefore the size of the effect any threshold move would have.

| Configuration | Below 0.17 before | after | In band before | after | At or above 0.18 before | after | Median margin before | after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| chaos-500 @ 0.17 | 229 | 236 | 27 | 0 | 244 | 264 | 0.175024 | 0.183411 |
| chaos-500 @ 0.18 | 229 | 236 | 27 | 0 | 244 | 264 | 0.175024 | 0.183411 |
| holdout @ 0.17 | 217 | 223 | 20 | 1 | 263 | 276 | 0.193851 | 0.208467 |
| holdout @ 0.18 | 217 | 223 | 20 | 1 | 263 | 276 | 0.193851 | 0.208467 |

## What actually moved

Distinct messages whose decision changed, with the number of tickets each carries.

### chaos-500 @ 0.17

| Language | Expected | Tickets | Margin before | Margin after | Decision before | Decision after | Query text |
|---|---|---:|---:|---:|---|---|---|
| fr | wc-gifts | 7 | 0.180346 | 0.098172 | answer | escalate | J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. |

### chaos-500 @ 0.18

| Language | Expected | Tickets | Margin before | Margin after | Decision before | Decision after | Query text |
|---|---|---:|---:|---:|---|---|---|
| es | wc-gifts | 27 | 0.175024 | 0.183411 | escalate | answer | Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado. |
| fr | wc-gifts | 7 | 0.180346 | 0.098172 | answer | escalate | J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. |

### holdout @ 0.17

| Language | Expected | Tickets | Margin before | Margin after | Decision before | Decision after | Query text |
|---|---|---:|---:|---:|---|---|---|
| fr | wc-gifts | 7 | 0.180346 | 0.098172 | answer | escalate | J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. |
| es | wc-live | 1 | 0.120522 | 0.175526 | escalate | answer | Já tentei isso. Same problem, no change. The stream starts, then viewers say the audio cuts out. It happened twice during tonight’s broadcast. |

### holdout @ 0.18

| Language | Expected | Tickets | Margin before | Margin after | Decision before | Decision after | Query text |
|---|---|---:|---:|---:|---|---|---|
| es | wc-gifts | 20 | 0.175024 | 0.183411 | escalate | answer | Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado. |
| fr | wc-gifts | 7 | 0.180346 | 0.098172 | answer | escalate | J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas. |

## Interpretation

1. **No new unsafe answer appeared in any of the four configurations** (0 total). The new wrong-first tickets are all tickets whose expected outcome is escalation and whose decision did not change — their top-1 flipped between two procedures at margins near 0.01, where the ranking is noise rather than signal.
2. **The sign of the result depends on the margin.** At the shipped default 0.18 the edit reduces false escalations on both batches (chaos-500 165 → 145, holdout 141 → 128). At the evaluation margin 0.17 it increases them (chaos-500 138 → 145, holdout 121 → 127). Both after-runs at the two margins produced identical decisions on each batch, because the edit emptied the band between them.
3. **The effect is a few templates crossing the 0.18 line, not a broad gain in separation.** On chaos-500 every changed decision comes from 1 distinct message; on the holdout, 2. Each template carries many tickets, so a per-ticket rate makes this look like a multi-point accuracy move when it is one wording change moving one way and another moving the other way.
4. **The corpus's worst confusion pair did not improve.** Between the two confusability reports the mean pairwise similarity fell only slightly (0.5046 → 0.4956), the single riskiest pair rose (es `wc-gifts` ↔ `wc-payout`, 0.6704 → 0.6819), and the largest reductions were all `wc-live` pairs — the one cross-reference the edit removed. The topic prefixes on the other three procedures did not separate them.
5. **The edit is therefore not a principled improvement on this evidence.** It is a perturbation whose measured benefit depends on where the threshold sits, driven by templates rather than by the confusion the analysis identified.

**Recommendation: do not merge.** The change is not unsafe, but it is not shown to help: it helps at 0.18 and hurts at 0.17 on both batches, the effect is a handful of templates rather than a separation gain, and the corpus's dominant confusion pair got slightly worse. A second wording iteration would be tuning to these templates, which is what the experiment was set up to avoid. If the direction is worth pursuing, it should start from the `wc-gifts` ↔ `wc-payout` overlap with a corpus that is not built from 47 repeated templates.

## Method notes

- The margin is recomputed with the gate's own formula from the recorded top-k candidate scores; the shipped default margin is 0.18.
- The "before" runs are the recorded evaluations on the pre-edit corpus, whose SHA-256 is shown above. The "after" runs are fresh, on the edited corpus.
- Nothing here measures why a margin moved. The confusability reports (`confusability-report-before.md`, `confusability-report-after.md`) record the corpus geometry either side of the edit.

