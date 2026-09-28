#!/usr/bin/env node
/**
 * Build the deployed-vs-local parity batch: 40 tagged tickets drawn from the
 * approved batch plus the six real-phrased false accepts.
 *
 * Every ticket is copied verbatim from an existing, already-tagged source — the
 * pinned `chaos-500.json` or `real-phrased-queries.csv`. No message text, label
 * or expected outcome is authored here; the only new fields are `parityClass` and
 * `paritySource`, which exist so the parity report can group the rows.
 *
 * Deterministic; no randomness. Writes `parity-40.json`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, name), 'utf8'));

/** Minimal RFC4180-ish parser: handles quoted fields containing commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; } else { quoted = false; }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (char === '\r') continue;
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((entry) => entry.some((value) => value.length > 0));
  return body.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index] ?? ''])));
}

const batch = load('chaos-500.json');
const byId = new Map(batch.tickets.map((ticket) => [ticket.ticketId, ticket]));

/** The composition: 34 from the approved batch, 6 from the real-phrased set. */
const BASELINE_CLEAN = 12;
const MIXED = 7;
const NO_CORRECT = 7;
const NEAR_DUPLICATE = 7;

function take(predicate, count) {
  return batch.tickets.filter(predicate).slice(0, count);
}

const picks = [
  ['contradiction', [byId.get('SIM-TICKET-00272')]],
  ['clean', take((ticket) => !ticket.isChaos && ticket.language === 'en' && ticket.expected.decision === 'answer', BASELINE_CLEAN)],
  ['messy', take((ticket) => ticket.chaosMutation?.type === 'mixed_language_typos_sarcasm', MIXED)],
  ['escalation', take((ticket) => ticket.chaosMutation?.type === 'no_correct_answer', NO_CORRECT)],
  ['near-duplicate', take((ticket) => ticket.chaosMutation?.type === 'near_duplicate', NEAR_DUPLICATE)],
];

const tickets = [];
for (const [parityClass, list] of picks) {
  for (const ticket of list) {
    if (ticket === undefined) throw new Error(`a selected ticket is missing for class ${parityClass}`);
    tickets.push({ ...ticket, parityClass, paritySource: 'chaos-500.json' });
  }
}

const REAL_PHRASED_IDS = ['rp-022', 'rp-023', 'rp-025', 'rp-026', 'rp-040', 'rp-060'];
const realPhrased = parseCsv(readFileSync(resolve(here, 'real-phrased-queries.csv'), 'utf8'));
for (const id of REAL_PHRASED_IDS) {
  const row = realPhrased.find((entry) => entry.id === id);
  if (row === undefined) throw new Error(`real-phrased row ${id} is missing`);
  if (!['escalate', 'ambiguous'].includes(row.my_label)) {
    throw new Error(`real-phrased row ${id} is expected to be a refusal row, found ${row.my_label}`);
  }
  tickets.push({
    data_mode: 'simulated',
    ticketId: `PARITY-${id.toUpperCase()}`,
    customerRef: 'SIM-CREATOR-0000',
    createdAt: '2026-09-26T00:00:00.000Z',
    channel: 'email_web_form',
    language: 'en',
    category: 'Other / ambiguous',
    queue: 'triage',
    priority: 'P3',
    subject: row.query.slice(0, 60),
    message: row.query,
    status: 'open',
    reopenCount: 0,
    handoffCount: 0,
    tags: ['other'],
    expected: { decision: 'escalate', reason: `owner_label_${row.my_label}`, sopId: null },
    chaosTags: [],
    isChaos: false,
    parityClass: 'real-phrased-false-accept',
    paritySource: 'real-phrased-queries.csv',
    parityOwnerLabel: row.my_label,
  });
}

const ids = new Set(tickets.map((ticket) => ticket.ticketId));
if (ids.size !== tickets.length) throw new Error('parity batch has duplicate ticket ids');

const chaosTickets = tickets.filter((ticket) => ticket.isChaos).length;
const chaosTypes = {};
for (const ticket of tickets) {
  const key = ticket.chaosMutation?.type ?? 'baseline';
  chaosTypes[key] = (chaosTypes[key] ?? 0) + 1;
}
const parityClasses = {};
for (const ticket of tickets) parityClasses[ticket.parityClass] = (parityClasses[ticket.parityClass] ?? 0) + 1;

const out = {
  data_mode: 'simulated',
  generatedBy: 'build-parity-batch.mjs — every ticket copied verbatim from chaos-500.json or real-phrased-queries.csv; no label authored here',
  seed: batch.seed,
  ticketCount: tickets.length,
  chaosRateConfigured: chaosTickets / tickets.length,
  chaosRateActual: chaosTickets / tickets.length,
  client: batch.client,
  corpusSource: batch.corpusSource,
  productInputField: batch.productInputField,
  datasetSourcePolicy: batch.datasetSourcePolicy,
  sopCount: batch.sopCount,
  chaosSummary: { chaosTicketCount: chaosTickets },
  chaosTypeDistribution: chaosTypes,
  parityClassDistribution: parityClasses,
  tickets,
};

writeFileSync(resolve(here, 'parity-40.json'), `${JSON.stringify(out, null, 2)}\n`);

/**
 * A second file without the contradictory ticket.
 *
 * The deployed path cannot publish a corpus that contains the injected
 * `wc-payout-conflict` procedure: the publish edge function refuses it with HTTP
 * 422 ("publication blocked: the tenant corpus contains contradictory
 * procedures"). That refusal is itself a result, but it stops the deployed run
 * before it writes a report, so the parity comparison needs a variant the
 * deployed path can actually serve. This file is the same 40 tickets minus
 * SIM-TICKET-00272; nothing else changes.
 */
const withoutConflict = tickets.filter((ticket) => ticket.ticketId !== 'SIM-TICKET-00272');
const deployedTickets = withoutConflict.filter((ticket) => ticket.parityClass !== 'contradiction');
const out39 = {
  ...out,
  generatedBy: `${out.generatedBy}; parity-39.json is parity-40.json minus SIM-TICKET-00272, which the deployed publish path refuses to serve`,
  ticketCount: deployedTickets.length,
  chaosRateConfigured: deployedTickets.filter((ticket) => ticket.isChaos).length / deployedTickets.length,
  chaosRateActual: deployedTickets.filter((ticket) => ticket.isChaos).length / deployedTickets.length,
  chaosSummary: { chaosTicketCount: deployedTickets.filter((ticket) => ticket.isChaos).length },
  tickets: deployedTickets,
};
writeFileSync(resolve(here, 'parity-39.json'), `${JSON.stringify(out39, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  tickets: tickets.length,
  chaosTickets,
  chaosTypes,
  parityClasses,
  escalateExpected: tickets.filter((ticket) => ticket.expected.decision === 'escalate').length,
  answerExpected: tickets.filter((ticket) => ticket.expected.decision === 'answer').length,
  deployedRunnableTickets: deployedTickets.length,
}, null, 2)}\n`);
