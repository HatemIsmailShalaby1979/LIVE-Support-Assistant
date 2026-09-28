# floor-queries-m017 — real-phrased query scoring

Provenance: Query wording as supplied in the input CSV(s): my-floor-queries.csv. Per-set provenance (public help-centre/forum wording vs author-written floor queries) is stated in the results document.
These are real support questions collected from public sources; the wording is quoted, and no usernames or personal details are recorded.

Scored 26 of 29 queries (3 labelled ambiguous and excluded from the headline).
Margin: 0.17 (evaluation-only; the shipped default is 0.18).

- Accuracy: **42.3%** (11/26).
- False escalations: 15.
- Unsafe answers: 0.
- Runtime errors: 0.
- `answerable` rows without a named procedure: 0.

## By source type

| Source type | Queries | Scored | Correct | Accuracy | False escalations | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| author floor experience | 29 | 26 | 11/26 | 42.3% | 15 | 0 |

## Every scored query

| id | source | label | expected procedure | decision | procedure | outcome |
|---|---|---|---|---|---|---|
| ff-001 | author floor experience | answerable | wc-gifts | answer | wc-gifts | correct |
| ff-002 | author floor experience | answerable | wc-gifts | answer | wc-gifts | correct |
| ff-003 | author floor experience | answerable | wc-gifts | escalate | insufficient_margin | incorrect |
| ff-004 | author floor experience | answerable | wc-payout | escalate | insufficient_margin | incorrect |
| ff-005 | author floor experience | answerable | wc-payout | escalate | insufficient_margin | incorrect |
| ff-006 | author floor experience | answerable | wc-payout | escalate | insufficient_margin | incorrect |
| ff-007 | author floor experience | answerable | wc-login | answer | wc-login | correct |
| ff-008 | author floor experience | answerable | wc-login | escalate | insufficient_margin | incorrect |
| ff-009 | author floor experience | answerable | wc-login | escalate | insufficient_margin | incorrect |
| ff-010 | author floor experience | answerable | wc-security | escalate | insufficient_margin | incorrect |
| ff-011 | author floor experience | answerable | wc-security | escalate | insufficient_margin | incorrect |
| ff-012 | author floor experience | answerable | wc-security | escalate | insufficient_margin | incorrect |
| ff-013 | author floor experience | answerable | wc-live | answer | wc-live | correct |
| ff-014 | author floor experience | answerable | wc-live | escalate | insufficient_margin | incorrect |
| ff-015 | author floor experience | answerable | wc-live | answer | wc-live | correct |
| ff-016 | author floor experience | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| ff-017 | author floor experience | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| ff-018 | author floor experience | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| ff-019 | author floor experience | answerable | wc-eligibility | answer | wc-eligibility | correct |
| ff-020 | author floor experience | answerable | wc-eligibility | escalate | insufficient_margin | incorrect |
| ff-021 | author floor experience | answerable | wc-eligibility | escalate | insufficient_margin | incorrect |
| ff-022 | author floor experience | ambiguous | — | escalate | insufficient_margin | ambiguous |
| ff-023 | author floor experience | ambiguous | — | escalate | insufficient_margin | ambiguous |
| ff-024 | author floor experience | ambiguous | — | escalate | insufficient_margin | ambiguous |
| ff-025 | author floor experience | escalate | — | escalate | insufficient_margin | correct |
| ff-026 | author floor experience | escalate | — | escalate | insufficient_margin | correct |
| ff-027 | author floor experience | escalate | — | escalate | insufficient_margin | correct |
| ff-028 | author floor experience | escalate | — | escalate | insufficient_margin | correct |
| ff-029 | author floor experience | escalate | — | escalate | insufficient_margin | correct |

The runner executes the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, load a tenant bundle, write telemetry, or call the live database.
