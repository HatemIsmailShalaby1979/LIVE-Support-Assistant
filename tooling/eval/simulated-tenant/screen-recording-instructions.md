# SIMULATED DATA screen-recording instructions

There are two flows worth recording, and they need different things:

| Flow | Needs credentials? | What it shows |
| --- | --- | --- |
| **Local decision path** (recommended) | No | The shipped retrieval + gate + agent view on four tickets, including the contradiction case |
| **Deployed path** | Yes — development Supabase project | Sign-in, bundle delivery, browser model and gate, tagged ingest against a hosted database |

Neither records or uses a real customer ticket; there is no design partner.

## Flow 1 — local decision path (no account)

This is the same flow as `docs/DEMO.md`. Setup first:

```bash
pnpm install
pnpm -r run build
```

**Record the browser page, not the driver.** `run-chaos-evaluation.mjs` always launches Chrome
with `--headless=new` and has no visible or pause mode, so it cannot be recorded. Serve the
repository root with Vite directly and open the harness page in a normal browser:

```bash
node apps/web/node_modules/vite/bin/vite.js . \
  --config apps/web/vite.config.ts \
  --port 5173 --host 127.0.0.1 --strictPort
```

(`pnpm dev` is not usable — `turbo run dev` fails on this host with `All pipe instances are busy.
(os error 231)`.) Then open, in the browser you are recording:

```
http://127.0.0.1:5173/tooling/eval/simulated-tenant/chaos-runner.html?batch=demo-tickets.json&corpus=corpus.json&minMargin=0.18
```

The page shows the model loading, then per-ticket progress, then a summary of the four tickets:
one clean, one messy, one that should escalate and the contradiction case. First run downloads the
pinned MiniLM weights (~22 MB); the query text is embedded locally and never leaves the machine.

If you want a written report as well, run the driver separately in a second terminal — it writes
`<label>.md` and `.json` tagged `data_mode: "simulated"`:

```bash
SIMULATION_RUN_LABEL=demo-recording SIMULATION_MIN_MARGIN=0.18 \
SIMULATION_BATCH=demo-tickets.json SIMULATION_CORPUS=corpus.json \
node tooling/eval/simulated-tenant/run-chaos-evaluation.mjs
```

**What to narrate, in order:** the gate answered the clean gifts ticket; it escalated the messy
payout ticket (a false escalation); it escalated the no-procedure ticket; and it escalated the
contradiction ticket locally — while noting that the deployed run answered that last one at a
margin of 0.180757. Do not present the local result as proof the contradiction case is safe.

Keep the recording destination local. Review it for credentials, browser profile details, or other
private information before publishing.

## Flow 2 — deployed path (development Supabase project)

- Confirm `.env.local` has the development Supabase URL and keys used by the
  evaluation harness. The script reads these values without printing them.
- Close unrelated browser windows and hide notifications.
- The run creates an isolated tenant, two synthetic users, a synthetic policy
  bundle, and tagged evaluation telemetry in the development database. Those
  rows are intentionally retained for audit and carry `data_mode: "simulated"`.

### Record one messy ticket

From PowerShell at the repository root:

```powershell
$env:SIMULATION_TICKET_TYPE = "near_duplicate"
$env:SIMULATION_VISIBLE = "1"
$env:SIMULATION_PAUSE_FOR_RECORDING = "1"
try {
  pnpm run eval:simulated:deployed
} finally {
  Remove-Item Env:SIMULATION_TICKET_TYPE
  Remove-Item Env:SIMULATION_VISIBLE
  Remove-Item Env:SIMULATION_PAUSE_FOR_RECORDING
}
```

The harness prepares the tenant, signs into the visible browser, installs its
tagged policy bundle, and loads the model before pausing before the query. When
the terminal says the browser is ready, start the recorder and press Enter in
the terminal. The selected synthetic ticket is then submitted and its answer or
escalation appears in the app. The visible suggested reply is tagged
`[data_mode: "simulated"]`.

Stop the recording when the terminal says the one-ticket result is visible,
then press Enter again to close the isolated browser. The harness writes
`phase5-deployed-run-<id>.json` and `.md` in this directory after the browser
closes; both reports are tagged as simulated. The script checks the hosted
telemetry tags and ticket mapping before it succeeds.

The two Enter checkpoints were exercised in visible-browser mode with a
synthetic near-duplicate ticket (`phase5-deployed-run-5c77413c866f4b10`). That
smoke run is only proof the recording controls work; its 1/1 accuracy is not a
batch accuracy result.

To record a different chaos example, replace `near_duplicate` with one of
`wrong_category_tag`, `off_hours_volume_spike`, `missing_fields`,
`contradicting_sops`, `wrong_fields`, `no_correct_answer`, `agent_handoff`,
`mixed_language_typos_sarcasm`, or `reopened_ticket`. Each recording run gets
its own tenant and run ID. Do not use a real customer example as a selector; there is no design partner or
input.
