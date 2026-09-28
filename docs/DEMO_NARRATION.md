# Demo narration (TTS script)

A three-minute voice-over script for the five-minute local demo. Read the spoken text
verbatim; the on-screen action tells you what to show. Every spoken number also appears
in the `README.md` claims table, so the voice and the written evidence agree.

- Total runtime: **3 minutes 2 seconds** of speech, measured from the rendered audio
  (`tooling/video/audio/`, 13 segments, 182.06 s).
- Constraint: each spoken block is 40 words or fewer (longest block: 37 words). No spoken
  jargon (no "margin", "bi-encoder", "reranker", "embedding"). Write "answered" / "sent to
  a person" instead.
- The positioning line is quoted exactly as it appears in `README.md`.
- Rendered into `tooling/video/demo-video.mp4` (182.155 s) by `tooling/video/capture-demo.mjs`
  and `tooling/video/assemble-video.py`. Regeneration steps and the Windows-only constraint
  are in `tooling/eval/simulated-tenant/screen-recording-instructions.md`.

---

## Segment 1 — Title and positioning
**On-screen:** Title card: "Live Support Assistant — decision path demo".
**Spoken (19 words):**
Validated on a simulated tenant; safety-first by design; ready for a shadow-mode pilot.
Not production-proven: no real customer traffic.

## Segment 2 — What this is
**On-screen:** Terminal running the local harness; the four-ticket table appears.
**Spoken (34 words):**
This runs the shipped decision path on your own computer. It reads a question, checks it
against seven support procedures, and either answers or sends it to a person. All data here
is simulated.

## Segment 3 — The scale behind it
**On-screen:** Pinned 500-ticket batch summary; "47 distinct messages, 7 procedures, four languages".
**Spoken (30 words):**
Behind this small demo sits a test of five hundred tickets, written in four languages.
Forty-seven distinct messages cover seven procedures. The numbers you will hear come from
that test.

## Segment 4 — Scenario one: a clear question
**On-screen:** Row 1, `SIM-TICKET-00002`, gate decision "answers from wc-gifts".
**Spoken (28 words):**
First, a clear question about a purchase. The path is confident, so it answers and names
the procedure it used. A clean case ends with a clean answer.

## Segment 5 — Scenario two: a messy question
**On-screen:** Row 2, `SIM-TICKET-00123`, gate decision "escalates".
**Spoken (37 words):**
Next, the same question, but angry, with a typo and a word in another language. The right
procedure is still first, yet the gap is too small. The path stays quiet and sends it to a
person.

## Segment 6 — The main failure mode
**On-screen:** Highlight "138 false escalations" in the README claims table.
**Spoken (32 words):**
This quiet refusal is the usual failure. Across the five hundred tickets, one hundred and
thirty-eight were sent to a person for too little confidence. Most misses are refusals, not
wrong answers.

## Segment 7 — Scenario three: no matching procedure
**On-screen:** Row 3, `SIM-TICKET-00132`, gate decision "escalates".
**Spoken (32 words):**
Third, a question no procedure covers: a closed account, a payout on hold. Nothing fits, so
the path sends it to a person without guessing. A confident silence beats a wrong answer.

## Segment 8 — Scenario four: contradictory rules
**On-screen:** Row 4, `SIM-TICKET-00272`; then the publish-block note (HTTP 422).
**Spoken (36 words):**
Last, two rules in the same category disagree on a payout window. The path escalates it
locally. On the published path, a bundle with that clash is now refused before it can ever
reach a user.

## Segment 9 — The one unsafe case
**On-screen:** README claims table row: "1 unsafe" on the deployed path.
**Spoken (37 words):**
On the full deployed test of five hundred tickets, three hundred and sixty-one matched the
expected outcome: seventy-two point two percent. There was one unsafe answer and zero runtime
errors. That case led to the publish block.

## Segment 10 — The non-English gap
**On-screen:** README claims table, Tier 2 "Non-English gap" and "In-scope recall at 48 procedures".
**Spoken (35 words):**
The gap is real. On a larger corpus, in-scope answers in other languages fell to twenty-seven
point eight percent, eighty-four of three hundred and two. English stayed near sixty-two
percent. This is measured, not hidden.

## Segment 11 — Repeatability
**On-screen:** README claims table, "identical decisions on all 500 tickets".
**Spoken (31 words):**
The path is deterministic. Run the same five hundred tickets twice and every decision matches.
Three hundred and seventy-nine matched the expected outcome: seventy-five point eight percent,
at the lower bar.

## Segment 12 — Limits
**On-screen:** DEMO.md "Limits" section.
**Spoken (23 words):**
This four-ticket demo is a tour, not a score. Three of four were correct, one was a false
refusal, and none were unsafe.

## Segment 13 — Closing positioning
**On-screen:** Title card returns.
**Spoken (19 words):**
Validated on a simulated tenant; safety-first by design; ready for a shadow-mode pilot.
Not production-proven: no real customer traffic.
