# Production Readiness Execution Prompt

Copy the prompt below into a coding agent working in this repository.

---

## Prompt

You are the implementation agent for `live-support-assistant`.

Ship the smallest real SaaS path today: one hosted Supabase project, one authentication flow, one deployed public URL, and one stranger-clickable user journey. Preserve working behavior and do not expand the product.

### Mission

Turn the existing `apps/web` prototype into the thinnest honest hosted experience:

1. A stranger can open one public URL.
2. The stranger can authenticate through one documented flow.
3. The authenticated app can load usable SOP content through the hosted runtime.
4. The stranger can submit one supported query.
5. The UI returns either a safe answer or a content-free escalation.
6. The app sends the resulting telemetry or escalation through authenticated transport.
7. The hosted record is verified.

Do not call the result production-ready unless the live path is proven with real hosted evidence.

### Non-negotiable scope

Implement only what is required for the mission above.

Do not add:

- payments, billing, subscriptions, or revenue features;
- a second hosting, auth, database, or deployment provider;
- mobile packaging or installer signing;
- a broad UI redesign or new product features;
- multi-tenant administration beyond what is required to prove tenant isolation;
- analytics expansion beyond the existing telemetry and escalation contracts;
- mocks, fake hosted responses, invented credentials, or invented URLs.

### Execution order

#### 1. Inspect before changing

Read `AGENTS.md`, the current README, `.env.example`, the relevant `apps/web` code, existing Supabase migrations, RLS tests, transport seams, and verification scripts.

Treat existing migrations, RLS policies, domain types, and documented contracts as the source of truth. Preserve the existing confidence gate, manual-review boundary, encrypted bundle behavior, queue ordering, and safe-answer serialization.

Before implementation, write down the smallest set of missing pieces needed to connect the current web path to one hosted Supabase project.

#### 2. Establish one hosted Supabase runtime

Use one real hosted Supabase project and the repository’s existing schema and RLS model.

- Apply the existing migrations without weakening RLS or append-only guarantees.
- Configure only the environment variables required by the current client/server boundary.
- Use the existing auth claims and tenant model.
- Keep secrets out of source control, logs, client bundles, and the final report.
- Do not use `supabase config push` against a hosted project if the repository ledger forbids it; use the documented safe migration/apply path instead.

If project access, credentials, or required approvals are missing, stop at that exact boundary and report the missing input. Do not substitute local PostgreSQL, a local dev server, a mock transport, or an invented deployment.

#### 3. Implement one auth flow

Choose the smallest flow compatible with the existing app and hosted project: email/password sign-in with a pre-provisioned test user, or email/password sign-up plus sign-in if the hosted project permits it.

The UI must visibly handle:

- signed-out state;
- authentication loading;
- invalid credentials or auth failure;
- signed-in session restoration;
- sign-out;
- retry after recoverable failure.

Do not build social login, password reset, profile management, or role administration unless the current path cannot work without one of them.

#### 4. Connect the thinnest authenticated runtime path

Reuse existing interfaces wherever possible. Implement only the transport needed to:

- identify the authenticated user and tenant;
- retrieve the usable SOP/bundle data required by the current query flow;
- submit telemetry for the query;
- submit an escalation for a refused query;
- preserve the existing local queue semantics when the network is unavailable;
- expose clear loading, error, retry, and signed-out states.

The client must never display procedure text, candidate passages, or suggested replies for a manual-review or confidence-gate escalation. Do not bypass the existing gate to make the demo appear successful.

#### 5. Deploy one public URL

Use the repository’s existing deployment-compatible setup and one deployment target. Record the exact deployed URL.

The URL must work from a clean browser session without local setup. Do not claim success from a localhost URL, preview URL that requires credentials, or deployment that has not been opened and exercised.

#### 6. Verify the stranger path in a real browser

Run a clean-browser verification against the deployed URL:

1. Open the public URL while signed out.
2. Confirm unauthenticated behavior is rejected or redirected appropriately.
3. Complete the documented authentication flow.
4. Confirm the authenticated tenant/session is loaded.
5. Submit one supported query.
6. Observe a safe answer or a content-free escalation.
7. Confirm the hosted Supabase runtime receives the relevant telemetry or escalation.
8. Confirm a second tenant cannot read or write the first tenant’s protected data, using the existing RLS test approach or an equivalent hosted proof.
9. Record browser console errors, failed requests, and the exact test timestamp.

Use real hosted observations. A local test, source inspection, or successful build is supporting evidence only; it is not proof of the live path.

#### 7. Write one status page

Create exactly one new Markdown page outside the README at:

`docs/PRODUCTION_STATUS.md`

Write it in plain English for a recruiter, HR reader, investor, or technically curious stranger. Keep it to one page. It must contain only:

- what the product does;
- the single strongest number proving the deployed path works;
- the live URL as a Markdown link;
- the auth method in one sentence;
- a candid statement that paying users and revenue are zero unless verified otherwise;
- a short limitations sentence covering anything not actually shipped.

Use one proof number, not a dashboard of metrics. Prefer the strongest directly verified hosted result, such as `1 authenticated query reached the hosted runtime and produced a verified telemetry/escalation record`. Do not count local tests as the proof number.

Do not claim paying users, revenue, signed installers, mobile support, or general production readiness unless directly verified and explicitly in scope.

#### 8. Update the build ledger

Update the repository ledger in `AGENTS.md` only with measured facts from this work:

- hosted project/runtime status;
- auth flow;
- exact deployed URL;
- verification command or browser procedure;
- proof number;
- remaining limitations and blockers.

Do not rewrite historical phase records or inflate any existing claim.

#### 9. Report completion honestly

Return a concise report with exactly these fields:

- `Status`: shipped, partially shipped, or blocked;
- `Live URL`: exact public URL, or `none`;
- `Auth`: the one flow used;
- `Proof number`: one measured hosted result, or `not available`;
- `Verified`: the browser and hosted checks completed;
- `Changed`: files and behavior changed;
- `Blocked by`: exact missing credential, approval, infrastructure, or defect, if any;
- `Remaining limitations`: no more than five items.

If any acceptance criterion below is false, use `partially shipped` or `blocked`; never use `shipped`.

### Acceptance criteria

The task is complete only when all of these are true:

- A stranger can open the URL without local setup.
- A stranger can complete the documented auth flow.
- An authenticated query reaches the deployed application and hosted Supabase runtime.
- The UI produces a safe answer or content-free escalation.
- At least one hosted telemetry or escalation record is verified.
- Unauthenticated access is rejected or redirected.
- Cross-tenant access is denied in the tested path.
- `docs/PRODUCTION_STATUS.md` contains exactly one proof number and the live URL.
- No claim is made about paying users, revenue, signed installers, or unsupported platforms.
- No unrelated product scope was added.

### Stop conditions

Stop and report the exact blocker if any of the following is unavailable:

- hosted Supabase project access;
- required Supabase or deployment credentials;
- permission to apply migrations or configure auth;
- permission to deploy the public URL;
- a usable test identity or approved auth flow;
- a way to verify at least one hosted record.

Never hide a blocker behind a mock, local substitute, placeholder URL, or unsupported claim.

---

## Expected agent output

The agent must leave the repository with the smallest working hosted path, one new status page at `docs/PRODUCTION_STATUS.md`, and an evidence-based completion report. If the hosted path cannot be completed, it must leave the repository unchanged except for truthful documentation of the blocker and must say exactly what external input is required.
