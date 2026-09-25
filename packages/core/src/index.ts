/**
 * @sop/core — domain types and the deterministic decision path shared by every
 * platform shell.
 *
 * Relative imports carry explicit `.js` extensions so the emitted ESM resolves
 * under bare Node (the eval harness) as well as under bundlers (Vite, Metro).
 */

export {
  DEFAULT_GATE_CONFIG,
  LEGACY_GATE_CONFIG,
  LEGACY_REQUIRED_MATCHES,
} from './types.js';

export type {
  ConfidenceGateConfig,
  GateAccepted,
  GateBlocked,
  GateBlockReason,
  GateDecision,
  GateParameters,
  MatchCandidate,
  SopDocument,
} from './types.js';

export { evaluateGate } from './gate.js';
export { scoreByKeywords } from './scoring/keyword.js';

export { buildAgentView } from './agent-view.js';
export type {
  AgentView,
  AnswerView,
  BundleContext,
  EscalationReason,
  EscalationView,
  EvidenceEntry,
} from './agent-view.js';

export { buildEscalationRecord, isBlockReason } from './escalation.js';
export type {
  EscalationCandidate,
  EscalationEvidence,
  EscalationInput,
  EscalationRecord,
} from './escalation.js';
