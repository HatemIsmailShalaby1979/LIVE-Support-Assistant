# SIMULATED DATA screen-recording instructions

This records one synthetic ticket in the deployed-path evaluation harness. It
does not record or use a real customer ticket; there is no design partner. The browser
targets the public Vercel app and the development Supabase project; describe the
result as deployed-path validation, not production-customer evidence.

## Before recording

- Confirm `.env.local` has the development Supabase URL and keys used by the
  evaluation harness. The script reads these values without printing them.
- Close unrelated browser windows and hide notifications. Use a local recording
  destination; do not publish the video without reviewing it for credentials,
  browser profile details, or other private information.
- The run creates an isolated tenant, two synthetic users, a synthetic policy
  bundle, and tagged evaluation telemetry in the development database. Those
  rows are intentionally retained for audit and carry `data_mode: "simulated"`.

## Record one messy ticket

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
