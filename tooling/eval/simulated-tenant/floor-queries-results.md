# Floor-query set — results

**SIMULATED DATA / author-written.** This set is the author's own frontline patterns, written from the procedure topics; it is not customer traffic and not a real partner's data. There is no design partner.

Scored with `tooling/eval/score-real-phrased.mjs` on the deployed-equivalent local path (browser-local MiniLM -> passage retrieval -> Confidence Gate -> agent view) at margins **0.18** (shipped default) and **0.17** (evaluation baseline). No gate threshold, model, or corpus text was changed, and no label was changed.

## Sample and provenance

- **29 messages**, one author. `label_source` on every row: **"author-written, author-labeled"**.
- **21 answerable** (in-scope), **5 escalate + 3 ambiguous** (refusal).
- **6 rows carry a "messy" note** (Arabizi / typos): ff-002, ff-005, ff-008, ff-014, ff-017, ff-020.
- Two rows are **"also could be"**: ff-003 (`wc-gifts` | `wc-payout`), ff-012 (`wc-security` | `wc-login`). A gate decision on **either** listed procedure counts as correct.
- **"Also could be" rule applied:** ff-003 and ff-012 were both escalated by the gate at 0.18 and 0.17, so accepting either listed procedure changed no outcome.
- Two rows are **topic-match, procedure silent**: ff-006 (how to change bank details) and ff-018 (appeal review time) match a procedure's topic, but the procedure text does not state the answer. Reported on their own line.

## Safety first — refusal-set false accepts

**0 of 8** refusal rows (5 escalate + 3 ambiguous) were auto-answered at margin 0.18. The gate escalated every row the author marked escalate or ambiguous.

## Headline

| Margin | In-scope correct | Wrong procedure | False escalations | Refusal false accepts |
|---|---:|---:|---:|---:|
| 0.18 | 5/21 | 0 | 16 | 0 |
| 0.17 | 6/21 | 0 | 15 | 0 |

In-scope accuracy at 0.18: **23.8%** (5/21). At 0.17: **28.6%**.

Raw scorer output for this set: 0.18 — 26 scored of 29, 10/26 correct, 16 false escalations, 0 unsafe; 0.17 — 11/26 correct, 15 false escalations, 0 unsafe. (The 26 scored = 21 answerable + 5 escalate; the 3 ambiguous rows are excluded from the headline.)

One row, ff-002 (margin 0.1755), sits inside the [0.17, 0.18) band, so it is the only decision that differs between the two margins.

## IN-SCOPE — 21 answerable rows (margin 0.18)

| id | expected procedure | gate | gate procedure | top-1 | top-2 | margin | outcome |
|---|---|---|---|---:|---:|---:|---|
| ff-001 | wc-gifts | answer | wc-gifts | 0.5179 | 0.3186 | 0.1993 | correct |
| ff-002 | wc-gifts | escalate | insufficient_margin | 0.5713 | 0.3958 | 0.1755 | false_escalation (messy) |
| ff-003 | wc-gifts | escalate | insufficient_margin | 0.4603 | 0.3872 | 0.0732 | false_escalation |
| ff-004 | wc-payout | escalate | insufficient_margin | 0.5776 | 0.4930 | 0.0846 | false_escalation |
| ff-005 | wc-payout | escalate | insufficient_margin | 0.1897 | 0.1586 | 0.0311 | false_escalation (messy) |
| ff-006 | wc-payout | escalate | insufficient_margin | 0.5320 | 0.3745 | 0.1576 | false_escalation (topic-match, procedure silent) |
| ff-007 | wc-login | answer | wc-login | 0.5351 | 0.3277 | 0.2073 | correct |
| ff-008 | wc-login | escalate | insufficient_margin | 0.2804 | 0.2761 | 0.0043 | false_escalation (messy) |
| ff-009 | wc-login | escalate | insufficient_margin | 0.3735 | 0.3004 | 0.0731 | false_escalation |
| ff-010 | wc-security | escalate | insufficient_margin | 0.4656 | 0.4225 | 0.0431 | false_escalation |
| ff-011 | wc-security | escalate | insufficient_margin | 0.3441 | 0.3410 | 0.0031 | false_escalation |
| ff-012 | wc-security | escalate | insufficient_margin | 0.4077 | 0.3508 | 0.0569 | false_escalation |
| ff-013 | wc-live | answer | wc-live | 0.6672 | 0.2916 | 0.3756 | correct |
| ff-014 | wc-live | escalate | insufficient_margin | 0.1579 | 0.1578 | 0.0002 | false_escalation (messy) |
| ff-015 | wc-live | answer | wc-live | 0.5270 | 0.1886 | 0.3384 | correct |
| ff-016 | wc-appeal | escalate | insufficient_margin | 0.5171 | 0.4489 | 0.0683 | false_escalation |
| ff-017 | wc-appeal | escalate | insufficient_margin | 0.2539 | 0.2514 | 0.0025 | false_escalation (messy) |
| ff-018 | wc-appeal | escalate | insufficient_margin | 0.4275 | 0.3627 | 0.0648 | false_escalation (topic-match, procedure silent) |
| ff-019 | wc-eligibility | answer | wc-eligibility | 0.5157 | 0.3111 | 0.2047 | correct |
| ff-020 | wc-eligibility | escalate | insufficient_margin | 0.3482 | 0.3167 | 0.0315 | false_escalation (messy) |
| ff-021 | wc-eligibility | escalate | insufficient_margin | 0.3659 | 0.3170 | 0.0489 | false_escalation |

**Topic-match, procedure silent** (reported separately; a correct procedure match does not mean the answer was available):
- ff-006 "I need to change my bank details before the next payout cycle, how?" — matched insufficient_margin, outcome false_escalation. The wc-payout procedure covers the topic but does not state this answer.
- ff-018 "how long does an appeal take to review? I submitted yesterday." — matched insufficient_margin, outcome false_escalation. The wc-appeal procedure covers the topic but does not state this answer.

Excluding these two rows — the procedure is silent, so escalation is defensible — in-scope is **5/19 correct, 14 false escalations** at 0.18 (6/19 correct, 13 false escalations at 0.17).

## REFUSAL — 5 escalate + 3 ambiguous (margin 0.18)

| id | author label | gate | gate procedure | top-1 | top-2 | margin |
|---|---|---|---|---:|---:|---:|
| ff-022 | ambiguous | escalate | insufficient_margin | 0.2911 | 0.2274 | 0.0637 |
| ff-023 | ambiguous | escalate | insufficient_margin | 0.4636 | 0.3851 | 0.0786 |
| ff-024 | ambiguous | escalate | insufficient_margin | 0.4342 | 0.3618 | 0.0724 |
| ff-025 | escalate | escalate | insufficient_margin | 0.2044 | 0.1806 | 0.0238 |
| ff-026 | escalate | escalate | insufficient_margin | 0.2298 | 0.1765 | 0.0533 |
| ff-027 | escalate | escalate | insufficient_margin | 0.3642 | 0.2396 | 0.1246 |
| ff-028 | escalate | escalate | insufficient_margin | 0.1587 | 0.1389 | 0.0197 |
| ff-029 | escalate | escalate | insufficient_margin | 0.2507 | 0.2359 | 0.0148 |

Escalate rows answered: 0 of 5. Ambiguous rows answered: 0 of 3.

## Messy vs clean (answerable rows)

| Group | Rows | Correct | Accuracy |
|---|---:|---:|---:|
| Messy (Arabizi / typos) | 6 | 0 | 0.0% |
| Clean | 15 | 5 | 33.3% |

Messy rows: ff-002 (false_escalation), ff-005 (false_escalation), ff-008 (false_escalation), ff-014 (false_escalation), ff-017 (false_escalation), ff-020 (false_escalation).

## Limits

29 messages written by one author who knows the procedure topics; a small sample; not customer traffic; likely easier than real traffic; not a substitute for real-partner evidence.

