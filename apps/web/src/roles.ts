/**
 * What each role may do, as the database decides it.
 *
 * This exists because the alternative was a list of role names written into a
 * component, and a component that offers a control the server will refuse is a
 * screen that renders and then fails. That is the same failure this project has
 * already made twice in telemetry: a page that appears to work for a user it has
 * not identified.
 *
 * Every list here is transcribed from a policy, and the source is named on each one
 * so a future change to the schema has somewhere to be mirrored from. **These
 * functions decide what is offered, never what is allowed.** Row-level security is
 * still the authority; a stale list here hides a control, it does not grant one.
 */

/** Authoring, and therefore the whole Command Center. From `app.upsert_sop`'s role gate. */
const AUTHORING_ROLES: readonly string[] = ['sop_editor', 'ops_manager'];

/** Reading `escalations`. From the `escalations_select` policy in migration 0013. */
const ESCALATION_READ_ROLES: readonly string[] = ['ops_manager', 'team_lead', 'auditor'];

/** Moving an escalation through its workflow. From `escalations_update` in migration 0005. */
const ESCALATION_WORKFLOW_ROLES: readonly string[] = ['ops_manager', 'team_lead'];

const includes = (roles: readonly string[], role: string | null | undefined): boolean =>
  role !== null && role !== undefined && roles.includes(role);

/**
 * Whether the Command Center is worth offering.
 *
 * `auditor` can read the `sops` table, so a list would load, but it cannot author
 * or read back a body. Offering it a screen whose every action fails would be the
 * defect this module exists to prevent, so the tab goes to the roles that can
 * actually do something on it.
 */
export function canAuthorProcedures(role: string | null | undefined): boolean {
  return includes(AUTHORING_ROLES, role);
}

/** Whether the escalation queue is worth offering. */
export function canReadEscalations(role: string | null | undefined): boolean {
  return includes(ESCALATION_READ_ROLES, role);
}

/**
 * Whether this role may move an escalation through its workflow.
 *
 * An `auditor` reads the queue and is told why they cannot act on it, rather than
 * being shown buttons that would fail.
 */
export function canWorkEscalations(role: string | null | undefined): boolean {
  return includes(ESCALATION_WORKFLOW_ROLES, role);
}
