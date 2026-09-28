#!/usr/bin/env node
/**
 * Build the scale-rung simulated tenant: a 48-procedure corpus and a 400+ distinct
 * -message batch, both tagged `data_mode: "simulated"`. Assembles from the compact
 * part modules, asserts the corpus passes the conflict lint, and writes
 * scale-rung-corpus.json and scale-rung-batch.json for the existing harness.
 *
 * No product code, gate, or threshold is touched. Deterministic; no randomness.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConflicts } from '../../conflicts/lint-procedure-conflicts.mjs';
import { proceduresA } from './scale-rung-proc-a.mjs';
import { proceduresB } from './scale-rung-proc-b.mjs';
import { proceduresC } from './scale-rung-proc-c.mjs';
import { proceduresD } from './scale-rung-proc-d.mjs';
import { messagesA } from './scale-rung-msgs-a.mjs';
import { messagesB } from './scale-rung-msgs-b.mjs';
import { messagesC } from './scale-rung-msgs-c.mjs';
import { messagesD } from './scale-rung-msgs-d.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const seed = 20260928;

const specs = [...proceduresA, ...proceduresB, ...proceduresC, ...proceduresD];
const messages = [...messagesA, ...messagesB, ...messagesC, ...messagesD];

if (specs.length < 40 || specs.length > 70) {
  throw new Error(`procedure count out of range: ${specs.length}`);
}
const ids = new Set(specs.map((s) => s.id));
if (ids.size !== specs.length) throw new Error('duplicate procedure id');

const sops = specs.map((s) => ({
  data_mode: 'simulated',
  id: s.id,
  title: s.title,
  category: s.category,
  triggerKeywords: s.kw,
  summary: `${s.en} ${s.es} ${s.pt}`,
  suggestedReply: s.reply,
  escalationRequired: s.esc === true,
  escalationReason: s.esc === true ? (s.escReason ?? 'Requires specialist review.') : '',
}));

const conflicts = findConflicts(sops);
if (conflicts.length > 0) {
  throw new Error(`corpus does not pass the conflict lint: ${JSON.stringify(conflicts, null, 2)}`);
}

const corpus = {
  data_mode: 'simulated',
  source: 'Fictional scale-rung WaveCast procedures authored for this evaluation; not operational policy.',
  sops,
};

const knownIds = new Set(sops.map((s) => s.id));
for (const m of messages) {
  if (m.sop !== null && !knownIds.has(m.sop)) throw new Error(`message references unknown sop ${m.sop}`);
}
const texts = new Set(messages.map((m) => m.text.trim().toLowerCase()));
const tickets = messages.map((m, index) => {
  const isChaos = m.chaos !== 'baseline';
  const words = m.text.trim().split(/\s+/);
  return {
    ticketId: `SCALE-${String(index + 1).padStart(4, '0')}`,
    subject: words.slice(0, 6).join(' '),
    message: m.text,
    language: m.lang,
    isChaos,
    ...(isChaos ? { chaosMutation: { type: m.chaos } } : {}),
    expected: m.expected === 'escalate'
      ? { decision: 'escalate', sopId: null, reason: 'no procedure covers this; specialist handling' }
      : { decision: 'answer', sopId: m.sop },
  };
});

const chaosTypes = {};
for (const t of tickets) {
  const type = t.chaosMutation?.type ?? 'baseline';
  chaosTypes[type] = (chaosTypes[type] ?? 0) + 1;
}
const chaosTickets = tickets.filter((t) => t.isChaos).length;

const batch = {
  data_mode: 'simulated',
  seed,
  ticketCount: tickets.length,
  chaosRateConfigured: Math.round((chaosTickets / tickets.length) * 1000) / 1000,
  chaosRateActual: Math.round((chaosTickets / tickets.length) * 1000) / 1000,
  chaosSummary: { chaosTicketCount: chaosTickets },
  chaosTypeDistribution: chaosTypes,
  tickets,
};

writeFileSync(resolve(here, 'scale-rung-corpus.json'), `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(resolve(here, 'scale-rung-batch.json'), `${JSON.stringify(batch, null, 2)}\n`);

const byCategory = {};
for (const s of sops) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
process.stdout.write(`${JSON.stringify({
  procedures: sops.length,
  categories: byCategory,
  conflicts: conflicts.length,
  messages: messages.length,
  distinctMessages: texts.size,
  answerable: messages.filter((m) => m.expected === 'answer').length,
  escalate: messages.filter((m) => m.expected === 'escalate').length,
  languages: [...new Set(messages.map((m) => m.lang))].sort(),
  chaosTickets,
  chaosTypes,
}, null, 2)}\n`);
