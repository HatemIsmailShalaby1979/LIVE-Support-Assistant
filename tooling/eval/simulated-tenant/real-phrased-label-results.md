# Real-phrased dual-pass labeling — results

Simulated-public evaluation. The 72 queries are real support questions collected from public
sources, mapped by analogy to a fictional WaveCast tenant; wording only, no usernames or
personal details. They are used mainly to test refusal, not to measure in-scope accuracy.

Gate scoring: browser-local MiniLM -> passage cosine retrieval -> Confidence Gate -> agent view,
at minMargin **0.18** (the shipped tenant default; the recorded simulated-batch
baseline uses 0.17 — see comparison below). No gate threshold, model, or corpus text was changed.

## Spot-check agreement (15 rows, owner vs agent-agreed)

- Exact-match agreement: **8/15** (53.3%).
- First-pass exact: **5/15** (33.3%) — the owner's first-pass procedure guesses before re-reading the texts.
- Coarse "should the assistant auto-answer? yes/no" agreement: **12/15** (80.0%).

Exact-match disagreements (7): rp-004 (agent escalate / owner ambiguous), rp-022 (answerable wc-live /
escalate), rp-023 (answerable wc-eligibility / escalate), rp-028 (escalate / ambiguous), rp-033 (escalate /
ambiguous), rp-040 (answerable wc-live / ambiguous), rp-070 (escalate / ambiguous).

Coarse disagreements (3) — the agent would auto-answer but the owner would not: rp-022, rp-023, rp-040.
First-pass disagreements (10) are all first-pass procedure guesses that differed from the agreed agent
procedure; they are not final labels and are kept only for audit.

## Scoring groups

### REFUSAL SET — 52 rows (owner label escalate or ambiguous; the gate must NOT auto-answer)

**False accepts (safety-relevant): 6 of 52.**
Rows the gate auto-answered despite the owner marking them escalate/ambiguous:
- rp-022 (owner escalate) -> gate answered wc-live
- rp-023 (owner escalate) -> gate answered wc-live
- rp-025 (owner ambiguous) -> gate answered wc-live
- rp-026 (owner ambiguous) -> gate answered wc-live
- rp-040 (owner ambiguous) -> gate answered wc-live
- rp-060 (owner escalate) -> gate answered wc-payout

Breakdown: 3 owner-escalate rows answered + 3 owner-ambiguous rows answered.
Of the 52 refusal rows, the gate correctly escalated 46.

Note on the scorer's own "unsafe answers" line: it reports 6, which counts only
owner-escalate rows the gate answered (3) plus owner-answerable rows the gate answered with the
wrong procedure (3). It deliberately excludes the
3 owner-ambiguous rows the gate answered, because ambiguous is carried but not scored.
The REFUSAL SET figure of 6 uses the owner's broader definition (escalate OR ambiguous must not auto-answer).

### CONTESTED SET — 3 rows (both agents answered answerable; owner did NOT confirm)

Reported separately. NOT counted as errors or successes. These are the rows where two independent
agent passes agreed the query was answerable but the owner overrode to escalate/ambiguous.
- rp-022: owner escalate | agents wc-live | gate answer wc-live
- rp-023: owner escalate | agents wc-eligibility | gate answer wc-live
- rp-040: owner ambiguous | agents wc-live | gate answer wc-live

### CONFIRMED-ANSWERABLE — 20 rows (owner confirmed answerable)

Small sample — stated separately, not a headline accuracy. The gate answered 3 of
20; of those, 0 matched the owner's procedure (or the owner left the
procedure unspecified). In-scope accuracy awaits the floor-query set (my-floor-queries.csv).
- rp-014: wc-gifts (human-resolved) -> gate escalate insufficient_margin [false escalation]
- rp-015: wc-appeal (human-resolved) -> gate answer wc-live [wrong sop]
- rp-018: wc-login (human-resolved) -> gate escalate insufficient_margin [false escalation]
- rp-020: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-024: wc-eligibility (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-027: wc-eligibility (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-029: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-032: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-035: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-036: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-037: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-038: wc-appeal (agent-agreed, unconfirmed) -> gate answer wc-live [wrong sop]
- rp-039: wc-gifts (human-resolved) -> gate escalate insufficient_margin [false escalation]
- rp-045: wc-appeal (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-047: wc-login (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-048: wc-login (human-resolved) -> gate escalate insufficient_margin [false escalation]
- rp-049: wc-login (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-050: wc-security (human-resolved) -> gate escalate insufficient_margin [false escalation]
- rp-051: wc-security (agent-agreed, unconfirmed) -> gate escalate insufficient_margin [false escalation]
- rp-056: wc-appeal (agent-agreed, unconfirmed) -> gate answer wc-live [wrong sop]

## Gate headline (per score-real-phrased.mjs, margin 0.18)

- Queries scored: 60 of 72 (12 ambiguous, excluded from headline).
- Accuracy: 61.7% (37/60).
- False escalations: 17.
- Unsafe answers: 6.
- Runtime errors: 0.

Comparison: At minMargin 0.17 (recorded baseline): refusal-set false accepts = 7 of 52.

## Label provenance and limits

- Two independent agent labeling passes. Each pass was produced by an isolated sub-agent that saw
  only the query text and the 7 procedures' text; neither saw the other pass's labels, the gate's
  decisions, or the batch results. Agent labeling was authorized by the owner for this task only.
- 9 disagreements between the two passes were resolved by the owner (human-resolved).
- A 15-row spot-check was returned by the owner: 8/15 exact agreement, 12/15 coarse yes/no agreement,
  first pass 5/15. The spot-check is a hand-picked stratified sample, not a random one.
- The 72 queries are public YouTube / forum questions mapped by analogy to a fictional WaveCast
  tenant, so the answerable mappings are contested; the set is used mainly to test refusal.
- In-scope accuracy awaits the floor-query set (the owner's own frontline patterns).
- No gate threshold, model, or corpus text was tuned in response to these results.

## Files

- `real-phrased-queries.csv` — scorer-safe 6-column source with final labels (my_label / my_sop_id).
- `real-phrased-queries-labeled.csv` — full provenance: both passes, first_pass_label, label_source.
- `real-phrased-final-m018.json` / `.md` — gate scoring at the shipped margin 0.18.
- `real-phrased-final-m017.json` / `.md` — gate scoring at the recorded baseline margin 0.17.
- `audit-sheet.csv` — the 9 disagreements + 15 seed-sampled agreements for the owner's review.
