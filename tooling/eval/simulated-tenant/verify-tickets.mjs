#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const inputPath = process.argv[2] ?? 'tooling/eval/simulated-tenant/sample-50.json';
const data = JSON.parse(readFileSync(resolve(root, inputPath), 'utf8'));
const corpus = JSON.parse(readFileSync(resolve(here, 'corpus.json'), 'utf8'));
const failures = [];
const required = [
  'ticketId', 'customerRef', 'createdAt', 'channel', 'language', 'category',
  'queue', 'priority', 'subject', 'message', 'status', 'reopenCount',
  'handoffCount', 'tags', 'expected', 'chaosTags', 'isChaos',
];
const knownSops = new Set(corpus.sops.map((sop) => sop.id));
const emailLike = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phoneLike = /(?:\+?\d[\d().\s-]{7,}\d)/;
const expectedChaos = Math.round(data.ticketCount * data.chaosRateConfigured);
const allowedMissingFields = new Set(['category', 'language', 'channel', 'priority']);
function check(condition, message) {
  if (!condition) failures.push(message);
}

check(data.data_mode === 'simulated', 'batch data_mode must be simulated');
check(data.tickets.length === data.ticketCount, 'ticketCount must equal tickets.length');
check(Number.isFinite(data.chaosRateConfigured) && data.chaosRateConfigured >= 0 && data.chaosRateConfigured <= 1, 'configured chaos rate must be between 0 and 1');
check(data.chaosRateActual === (data.ticketCount === 0 ? 0 : expectedChaos / data.ticketCount), 'actual chaos rate does not match the configured rate');
check(data.tickets.filter((ticket) => ticket.isChaos).length === expectedChaos, 'chaos ticket count does not match the configured rate');
if (data.chaosRateConfigured === 0) {
  check(data.tickets.length === 50, 'baseline sample must contain exactly 50 tickets');
} else {
  check(data.ticketCount >= 1, 'chaos batch must not be empty');
}
check(new Set(data.tickets.map((ticket) => ticket.ticketId)).size === data.tickets.length, 'ticket IDs must be unique');
for (const [index, ticket] of data.tickets.entries()) {
  check(ticket.data_mode === 'simulated', `ticket ${index} missing simulated tag`);
  for (const field of required) {
    const omitted = !Object.hasOwn(ticket, field);
    const explicitlyInjected = ticket.isChaos === true
      && ticket.chaosMutation?.type === 'missing_fields'
      && ticket.chaosMutation.details.missingField === field;
    check(!omitted || explicitlyInjected, `ticket ${index} missing ${field} without a chaos annotation`);
  }
  check(ticket.isChaos === (Array.isArray(ticket.chaosTags) && ticket.chaosTags.length > 0), `ticket ${index} chaos flag/tag mismatch`);
  if (ticket.isChaos) {
    check(ticket.groundTruth?.expected !== undefined, `ticket ${index} chaos item missing its original expected label`);
    check(ticket.chaosMutation?.type === ticket.chaosTags[0], `ticket ${index} mutation and tag disagree`);
    if (ticket.chaosMutation?.type === 'missing_fields') {
      const absent = required.filter((field) => !Object.hasOwn(ticket, field));
      check(absent.length === 1 && absent[0] === ticket.chaosMutation.details.missingField, `ticket ${index} missing-field mutation does not match its annotation`);
    }
    if (ticket.chaosMutation?.type === 'near_duplicate') {
      check(data.tickets.some((candidate) => candidate.ticketId === ticket.duplicateOf), `ticket ${index} duplicate source is missing`);
    }
    if (ticket.chaosMutation?.type === 'contradicting_sops') {
      check(ticket.category === 'Creator payouts', `ticket ${index} SOP conflict must exercise a payout question`);
      check(ticket.expected?.reason === 'conflicting_procedure_guidance', `ticket ${index} SOP conflict expected label is wrong`);
      check(ticket.testEnvironment?.additionalSops?.length === 1, `ticket ${index} SOP conflict must inject exactly one conflicting procedure`);
    }
    if (ticket.chaosMutation?.type === 'no_correct_answer') {
      check(ticket.expected?.reason === 'no_supported_procedure' && ticket.expected.sopId === null, `ticket ${index} no-answer expected label is wrong`);
    }
  } else {
    check(!Object.hasOwn(ticket, 'groundTruth'), `ticket ${index} baseline item has a chaos ground-truth override`);
  }
  check(ticket.ticketId.startsWith('SIM-TICKET-'), `ticket ${index} ID not visibly synthetic`);
  check(ticket.customerRef.startsWith('SIM-CREATOR-'), `ticket ${index} account reference not visibly synthetic`);
  if (ticket.language !== undefined) {
    const injectedLanguage = ticket.chaosMutation?.type === 'wrong_fields' || ticket.chaosMutation?.type === 'mixed_language_typos_sarcasm';
    check(['en', 'es', 'pt-BR', 'fr'].includes(ticket.language) || (ticket.isChaos && injectedLanguage && ticket.language === 'de'), `ticket ${index} has unsupported language without a chaos annotation`);
  }
  if (ticket.channel !== undefined) {
    check(['in_app_chat', 'email_web_form', 'social_dm', 'callback_request'].includes(ticket.channel)
      || (ticket.isChaos && ticket.chaosMutation?.type === 'wrong_fields' && ticket.channel === 'internal_pager'),
    `ticket ${index} has invalid channel without a chaos annotation`);
  }
  if (ticket.priority !== undefined) {
    check(['P1', 'P2', 'P3'].includes(ticket.priority)
      || (ticket.isChaos && ticket.chaosMutation?.type === 'wrong_fields' && ticket.priority === 'P0'),
    `ticket ${index} has invalid priority without a chaos annotation`);
  }
  if (ticket.expected?.sopId !== null && ticket.expected?.sopId !== undefined) {
    check(knownSops.has(ticket.expected.sopId), `ticket ${index} points to unknown SOP`);
  }
  for (const handoff of ticket.handoffHistory ?? []) {
    check(handoff.data_mode === 'simulated', `ticket ${index} handoff history missing simulated tag`);
  }
  for (const sop of ticket.testEnvironment?.additionalSops ?? []) {
    check(sop.data_mode === 'simulated', `ticket ${index} injected SOP missing simulated tag`);
    check(!knownSops.has(sop.id), `ticket ${index} injected SOP id must not collide with the base corpus`);
  }
  check(!emailLike.test(`${ticket.subject}\n${ticket.message}`), `ticket ${index} contains an email-like string`);
  check(!phoneLike.test(`${ticket.subject}\n${ticket.message}`), `ticket ${index} contains a phone-like string`);
}
for (const sop of corpus.sops) {
  check(sop.data_mode === 'simulated', `SOP ${sop.id} missing simulated tag`);
}
if (failures.length > 0) {
  console.error(`SIMULATED DATA VALIDATION FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
const byCategory = Object.fromEntries(
  Object.entries(Object.groupBy(data.tickets, (ticket) => ticket.category))
    .map(([category, tickets]) => [category, tickets.length]),
);
const byChaosType = Object.fromEntries(
  Object.entries(Object.groupBy(data.tickets.filter((ticket) => ticket.isChaos), (ticket) => ticket.chaosMutation.type))
    .map(([type, tickets]) => [type, tickets.length]),
);
const malformed = data.tickets.filter((ticket) => ticket.isChaos && ticket.chaosMutation.type === 'missing_fields').length;
console.log('SIMULATED DATA VALIDATION OK');
console.log(JSON.stringify({
  data_mode: 'simulated',
  tickets: data.tickets.length,
  chaosRateConfigured: data.chaosRateConfigured,
  chaosRateActual: data.chaosRateActual,
  chaosTickets: expectedChaos,
  chaosTypes: byChaosType,
  categories: byCategory,
  explicitlyMissingFields: malformed,
  piiPatternFindings: 0,
  scope: 'Synthetic generation and pattern checks only; not external-dataset anonymization certification.',
}, null, 2));
