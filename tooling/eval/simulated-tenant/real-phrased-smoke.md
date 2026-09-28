# real-phrased-smoke — real-phrased query scoring

Provenance: Real-phrased wording collected from public sources; my-floor-queries.template.csv
These are real support questions collected from public sources; the wording is quoted, and no usernames or personal details are recorded.

Scored 4 of 5 queries (1 labelled ambiguous and excluded from the headline).
Margin: 0.17 (evaluation-only; the shipped default is 0.18).

- Accuracy: **75.0%** (3/4).
- False escalations: 1.
- Unsafe answers: 0.
- Runtime errors: 0.
- `answerable` rows without a named procedure: 0.

## By source type

| Source type | Queries | Scored | Correct | Accuracy | False escalations | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| operator experience | 5 | 4 | 3/4 | 75.0% | 1 | 0 |

## Every scored query

| id | source | label | expected procedure | decision | procedure | outcome |
|---|---|---|---|---|---|---|
| example-001 | operator experience | answerable | wc-payout | answer | wc-payout | correct |
| example-002 | operator experience | escalate | — | escalate | insufficient_margin | correct |
| example-003 | operator experience | ambiguous | — | escalate | insufficient_margin | ambiguous |
| example-004 | operator experience | escalate | wc-security | escalate | insufficient_margin | correct |
| example-005 | operator experience | answerable | wc-eligibility | escalate | insufficient_margin | incorrect |

The runner executes the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, load a tenant bundle, write telemetry, or call the live database.
