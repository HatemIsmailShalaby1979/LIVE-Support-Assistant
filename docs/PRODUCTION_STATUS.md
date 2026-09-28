# LIVE Support Assistant — production status

**What it does.** LIVE Support Assistant answers frontline support questions from
a tenant's own procedures. It searches on the device, and a deterministic
confidence gate either returns a sourced answer or hands the question to a human
with no procedure text shown. There is no generative model in the answering path.

**Proof it works.** One authenticated query, asked from a clean browser with no
local setup, reached the hosted backend and left a verified escalation record in
the tenant's database.

**Live (sign-in required).** [https://dist-omega-black-31.vercel.app/](https://dist-omega-black-31.vercel.app/)
— a genuine sign-in form renders to anonymous visitors; there is no guest account, so
this is not an open demo. A recruiter without an account should watch a screen
recording / GIF of the verified path rather than click through.

**Signing in.** Sign in with email and password as a pre-provisioned demo user;
your tenant and role are assigned by the server, not chosen in the form.

**Commercial status.** No billing integration is present. The last documented
business status (2026-09-26) was zero paying users and zero revenue; the app's
database cannot independently verify current commercial activity.

**Backend snapshot — 2026-09-28 02:27 UTC. `data_mode: "simulated"`** The live
Vercel bundle currently targets the prototype's development Supabase database,
which contains demo/probe accounts and fixture content. Read-only aggregate
counts: 29 auth accounts, 22 with a sign-in in the last 30 days, 26
app-mapped users, 11 stored query telemetry rows, 2 tenants, and 20 procedures
(16 published, 4 retired). These are actual database row counts, but they are
not real-customer adoption or usage metrics; the query count is not a validated
lifetime total.

**SIMULATED DATA — deployed-path evaluation.** The public app was exercised
with 500 fictional WaveCast tickets in isolated, visibly tagged tenants against
the development Supabase project. The React confidence control was verified at
the test-only 0.17 margin. Results: 361/500 expected dispositions (72.2%), 138
false escalations, one unsafe answer on a contradictory synthetic payout case,
and zero runtime errors. This is a deployed UI/bundle/model/ingest path test,
not a production-customer accuracy or adoption measure. The audited run
(`0aec9773442c4282`) has tagged query, escalation, SOP-version, profile, and
device records; the detailed report is under
`tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.md`.
The failure-rate target remains unmet; no product threshold or code was
changed.

**SIMULATED DATA — label fix and conflict lint, 2026-09-28.** A labelling
correction added an `expectedOutcome` field to every query in the batch. The
rule lives in code (`tooling/eval/simulated-tenant/expected-outcome.ts`): a
truncated query — one cut before any procedure keyword or meaning survived — is
expected to escalate rather than counted as a false escalation. Rescored on the
same 500-ticket local path at the same evaluation-only 0.17 margin, the
correction reclassified **0** queries, because the batch contains no truncated
query (shortest message: 14 words). Before and after are therefore identical:
362/500 (72.4%), 138 false escalations, 0 unsafe answers. The deployed path was
not re-run, because the expected-decision counts did not change. Separately, a
report-only conflict lint (`tooling/conflicts/lint-procedure-conflicts.mjs`)
scans a corpus for same-category procedures whose numeric policy values
disagree; it reports 0 conflicts on the clean corpus and 1 (the payout-window
conflict) when the conflicting procedure is present, exiting non-zero. Nothing
in shipped code uses it yet — the two candidate fixes are awaiting a decision in
`docs/decisions/conflicting-procedures.md`. There is no design partner, and none
is referenced.

**Limits.** There is no public sign-up, a new device only receives procedures
after a fresh bundle is published, the authoring screen is not enabled from this
address, and the address itself is an auto-generated deployment name.
