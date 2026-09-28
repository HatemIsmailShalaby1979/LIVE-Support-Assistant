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

// Contradiction escalation coverage. The brief asks for escalation queries of three
// kinds — no procedure, safety, and contradiction. The first two come from the
// message parts. The third needs a *conflicting* procedure, which the corpus cannot
// carry: requirement 1 makes every corpus procedure pass the conflict lint. As the
// approved 500-ticket batch does, the conflicting procedure is therefore injected into
// the ticket's own test environment, so the corpus stays lint-clean while the ticket
// still presents two active procedures that disagree.
const CONTRADICTION_SOP = {
  data_mode: 'simulated',
  id: 'sc-payout-timing-legacy',
  title: 'Payout Timing — Conflicting Legacy Guide',
  category: 'Creator payouts',
  triggerKeywords: ['payout', 'processed', 'bank', 'arrive'],
  summary: 'A creator payout marked processed arrives on the next business day. Do not use the multi-day estimate in the standard payout procedure; this legacy guide conflicts with it and a lead must confirm which rule is current. Un pago marcado como procesado llega el siguiente día hábil; esta guía contradice el plazo estándar y un responsable debe confirmar qué regla rige. Um saque marcado como processado chega no próximo dia útil; este guia contradiz o prazo padrão e uma liderança deve confirmar qual regra vale.',
  suggestedReply: 'The published payout guidance conflicts. I am escalating this for a lead to confirm the current timing.',
  escalationRequired: true,
  escalationReason: 'Two active simulated procedures give contradictory payout timing.',
};

const contradictionMessages = [
  { lang: 'en', text: 'your help page says payouts take days but an agent told me one day, which is right' },
  { lang: 'en', text: 'two different answers on payout timing, the guide and the chat disagree' },
  { lang: 'en', text: 'which payout timing rule is current, the help page contradicts what support said' },
  { lang: 'es', text: 'la pagina de ayuda y el agente dan plazos distintos para el pago, cual vale' },
  { lang: 'pt', text: 'a pagina de ajuda e o atendente dao prazos diferentes para o saque, qual vale' },
  { lang: 'es', text: 'dos respuestas distintas sobre el plazo del pago, la guia se contradice' },
];

for (const m of contradictionMessages) {
  tickets.push({
    ticketId: `SCALE-${String(tickets.length + 1).padStart(4, '0')}`,
    subject: m.text.trim().split(/\s+/).slice(0, 6).join(' '),
    message: m.text,
    language: m.lang,
    isChaos: true,
    chaosMutation: { type: 'contradicting_sops' },
    expected: { decision: 'escalate', sopId: null, reason: 'conflicting_procedure_guidance' },
    testEnvironment: { data_mode: 'simulated', additionalSops: [CONTRADICTION_SOP] },
  });
}

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
  messages: tickets.length,
  distinctMessages: new Set(tickets.map((t) => t.message.trim().toLowerCase())).size,
  answerable: tickets.filter((t) => t.expected.decision === 'answer').length,
  escalate: tickets.filter((t) => t.expected.decision === 'escalate').length,
  languages: [...new Set(tickets.map((t) => t.language))].sort(),
  chaosTickets,
  chaosTypes,
}, null, 2)}\n`);
