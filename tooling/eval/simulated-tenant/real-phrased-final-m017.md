# real-phrased-final-m017 — real-phrased query scoring

Provenance: Real-phrased wording collected from public sources; real-phrased-queries.csv
These are real support questions collected from public sources; the wording is quoted, and no usernames or personal details are recorded.

Scored 60 of 72 queries (12 labelled ambiguous and excluded from the headline).
Margin: 0.17 (evaluation-only; the shipped default is 0.18).

- Accuracy: **60.0%** (36/60).
- False escalations: 17.
- Unsafe answers: 7.
- Runtime errors: 0.
- `answerable` rows without a named procedure: 0.

## By source type

| Source type | Queries | Scored | Correct | Accuracy | False escalations | Unsafe answers |
|---|---:|---:|---:|---:|---:|---:|
| help center FAQ title | 26 | 24 | 16/24 | 66.7% | 6 | 2 |
| public forum | 46 | 36 | 20/36 | 55.6% | 11 | 5 |

## Every scored query

| id | source | label | expected procedure | decision | procedure | outcome |
|---|---|---|---|---|---|---|
| rp-001 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-002 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-003 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-004 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-005 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-006 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-007 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-008 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-009 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-010 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-011 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-012 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-013 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-014 | public forum | answerable | wc-gifts | escalate | insufficient_margin | incorrect |
| rp-015 | public forum | answerable | wc-appeal | answer | wc-live | incorrect |
| rp-016 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-017 | public forum | escalate | — | answer | wc-live | incorrect |
| rp-018 | public forum | answerable | wc-login | escalate | insufficient_margin | incorrect |
| rp-019 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-020 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-021 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-022 | public forum | escalate | — | answer | wc-live | incorrect |
| rp-023 | public forum | escalate | — | answer | wc-live | incorrect |
| rp-024 | public forum | answerable | wc-eligibility | escalate | insufficient_margin | incorrect |
| rp-025 | public forum | ambiguous | — | answer | wc-live | ambiguous |
| rp-026 | public forum | ambiguous | — | answer | wc-live | ambiguous |
| rp-027 | public forum | answerable | wc-eligibility | escalate | insufficient_margin | incorrect |
| rp-028 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-029 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-030 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-031 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-032 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-033 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-034 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-035 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-036 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-037 | public forum | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-038 | public forum | answerable | wc-appeal | answer | wc-live | incorrect |
| rp-039 | public forum | answerable | wc-gifts | escalate | insufficient_margin | incorrect |
| rp-040 | public forum | ambiguous | — | answer | wc-live | ambiguous |
| rp-041 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-042 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-043 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-044 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-045 | help center FAQ title | answerable | wc-appeal | escalate | insufficient_margin | incorrect |
| rp-046 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-047 | help center FAQ title | answerable | wc-login | escalate | insufficient_margin | incorrect |
| rp-048 | help center FAQ title | answerable | wc-login | escalate | insufficient_margin | incorrect |
| rp-049 | help center FAQ title | answerable | wc-login | escalate | insufficient_margin | incorrect |
| rp-050 | help center FAQ title | answerable | wc-security | escalate | insufficient_margin | incorrect |
| rp-051 | help center FAQ title | answerable | wc-security | escalate | insufficient_margin | incorrect |
| rp-052 | help center FAQ title | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-053 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-054 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-055 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-056 | help center FAQ title | answerable | wc-appeal | answer | wc-live | incorrect |
| rp-057 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-058 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-059 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-060 | help center FAQ title | escalate | — | answer | wc-payout | incorrect |
| rp-061 | help center FAQ title | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-062 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-063 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-064 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-065 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-066 | help center FAQ title | escalate | — | escalate | insufficient_margin | correct |
| rp-067 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-068 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-069 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-070 | public forum | ambiguous | — | escalate | insufficient_margin | ambiguous |
| rp-071 | public forum | escalate | — | escalate | insufficient_margin | correct |
| rp-072 | public forum | escalate | — | escalate | insufficient_margin | correct |

The runner executes the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, load a tenant bundle, write telemetry, or call the live database.
