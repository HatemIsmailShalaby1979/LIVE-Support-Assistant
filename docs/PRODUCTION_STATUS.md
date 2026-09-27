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

**Money.** There are zero paying users and zero revenue.

**Limits.** There is no public sign-up, a new device only receives procedures
after a fresh bundle is published, the authoring screen is not enabled from this
address, and the address itself is an auto-generated deployment name.
