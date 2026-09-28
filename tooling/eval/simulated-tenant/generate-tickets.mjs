#!/usr/bin/env node
/**
 * Deterministic synthetic WaveCast ticket generator.
 *
 * No external ticket rows are read. The generated ticket message is the only
 * field passed to the shipped text-query decision path; all other ticket fields
 * remain harness-side labels.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

const DEFAULT_COUNT = 50;
const DEFAULT_CHAOS_RATE = 0;
const DEFAULT_SEED = 20260928;
const CATEGORIES = [
  { key: 'gifts_purchases', label: 'Gifts and purchases', sopId: 'wc-gifts', quota: 12, queue: 'payments' },
  { key: 'creator_payouts', label: 'Creator payouts', sopId: 'wc-payout', quota: 9, queue: 'payments' },
  { key: 'routine_account_access', label: 'Account access', sopId: 'wc-login', quota: 6, queue: 'account' },
  { key: 'account_security', label: 'Account security', sopId: 'wc-security', quota: 2, queue: 'account-security' },
  { key: 'live_technical', label: 'LIVE technical support', sopId: 'wc-live', quota: 7, queue: 'live-support' },
  { key: 'content_restrictions', label: 'Content and restrictions', sopId: 'wc-appeal', quota: 6, queue: 'trust-safety' },
  { key: 'creator_eligibility', label: 'Creator eligibility', sopId: 'wc-eligibility', quota: 4, queue: 'creator-support' },
  { key: 'other', label: 'Other / ambiguous', sopId: null, quota: 4, queue: 'triage' },
];
const LANGUAGES = [
  { code: 'en', weight: 65 },
  { code: 'es', weight: 20 },
  { code: 'pt-BR', weight: 10 },
  { code: 'fr', weight: 5 },
];
const CHANNELS = [
  { value: 'in_app_chat', weight: 55 },
  { value: 'email_web_form', weight: 30 },
  { value: 'social_dm', weight: 10 },
  { value: 'callback_request', weight: 5 },
];

const MESSAGES = {
  gifts_purchases: {
    en: [
      ['Coin purchase completed but balance not updated', 'I bought Coins last night to send a Gift. Receipt says completed, but my balance still looks the same.'],
      ['Question about a Coin charge', 'There are two charges for one Coin purchase on my statement. I can provide the receipt reference if needed.'],
    ],
    es: [
      ['Compra de monedas pendiente', 'Compré monedas para enviar un regalo, pero el saldo no se actualizó. El recibo aparece como completado.'],
    ],
    'pt-BR': [
      ['Saldo de moedas não atualizou', 'Comprei moedas ontem para enviar um presente. O recibo está concluído, mas o saldo não mudou.'],
    ],
    fr: [
      ['Achat de pièces non crédité', 'J’ai acheté des pièces hier pour envoyer un cadeau. Le reçu indique que le paiement est terminé, mais le solde ne change pas.'],
    ],
  },
  creator_payouts: {
    en: [
      ['Processed payout not received', 'My payout says processed, but I do not see it in the bank account yet. It was marked processed three business days ago.'],
      ['When should the payout arrive?', 'Could you check the normal payout timing? The status changed to processed earlier this week.'],
    ],
    es: [
      ['No recibí el pago', 'El pago figura como procesado, pero todavía no aparece en mi cuenta. Han pasado tres días hábiles.'],
    ],
    'pt-BR': [
      ['Pagamento processado não chegou', 'O status do saque está como processado, mas o valor ainda não apareceu na conta. Faz três dias úteis.'],
    ],
    fr: [
      ['Virement indiqué comme traité', 'Mon versement est indiqué comme traité, mais il n’apparaît pas encore sur mon compte. Cela fait trois jours ouvrés.'],
    ],
  },
  routine_account_access: {
    en: [
      ['Recovery code not arriving', 'Changed phones and now the recovery code is not arriving. I tried the reset once and checked the inbox.'],
      ['Password reset loop', 'The app keeps sending me back to sign in after I reset the password. Can you point me to the right recovery step?'],
    ],
    es: [
      ['No llega el código de recuperación', 'Cambié de teléfono y no recibo el código para recuperar la cuenta. Ya revisé el correo.'],
    ],
    'pt-BR': [
      ['Código de recuperação não chega', 'Troquei de celular e o código de recuperação não chega. Já conferi o e-mail e pedi uma vez.'],
    ],
    fr: [
      ['Code de récupération absent', 'J’ai changé de téléphone et je ne reçois pas le code de récupération. J’ai déjà vérifié ma boîte mail.'],
    ],
  },
  account_security: {
    en: [
      ['Possible account takeover', 'I did not make the recent sign-in and the recovery email changed. Please help secure the account.'],
    ],
    es: [
      ['Posible acceso no autorizado', 'No reconozco el inicio de sesión reciente y cambió el correo de recuperación. Necesito ayuda para proteger la cuenta.'],
    ],
    'pt-BR': [
      ['Possível invasão da conta', 'Não reconheço o acesso recente e o e-mail de recuperação foi alterado. Preciso proteger a conta.'],
    ],
    fr: [
      ['Connexion inconnue au compte', 'Je ne reconnais pas la dernière connexion et l’adresse de récupération a changé. Il faut sécuriser le compte.'],
    ],
  },
  live_technical: {
    en: [
      ['LIVE stream disconnects', 'My scheduled LIVE drops after about thirty seconds. The connection seems steady and the app is up to date.'],
      ['Audio drops during broadcast', 'The stream starts, then viewers say the audio cuts out. It happened twice during tonight’s broadcast.'],
    ],
    es: [
      ['La transmisión se desconecta', 'Mi LIVE programado se corta después de unos segundos. La conexión parece estable y la app está actualizada.'],
    ],
    'pt-BR': [
      ['A live cai durante a transmissão', 'Minha live cai depois de alguns segundos. A conexão parece estável e o aplicativo está atualizado.'],
    ],
    fr: [
      ['La diffusion LIVE se coupe', 'Mon LIVE programmé se déconnecte après quelques secondes. La connexion semble stable et l’application est à jour.'],
    ],
  },
  content_restrictions: {
    en: [
      ['Appeal a LIVE restriction', 'My broadcast was removed and LIVE is now restricted. The in-app notice says it is a guideline action; I would like to appeal.'],
    ],
    es: [
      ['Apelar una restricción de LIVE', 'Retiraron mi transmisión y ahora tengo una restricción. Quiero apelar la decisión desde el aviso.'],
    ],
    'pt-BR': [
      ['Recurso de restrição na live', 'Minha transmissão foi removida e o acesso à live foi limitado. Quero contestar a decisão.'],
    ],
    fr: [
      ['Contester une restriction LIVE', 'Ma diffusion a été retirée et mon accès au LIVE est limité. Je souhaite faire appel de la décision.'],
    ],
  },
  creator_eligibility: {
    en: [
      ['LIVE access not appearing', 'I meet the age and follower requirements shown in the help page, but the LIVE control is still missing.'],
    ],
    es: [
      ['No aparece el acceso a LIVE', 'Cumplo los requisitos de edad y seguidores indicados, pero todavía no aparece el control de LIVE.'],
    ],
    'pt-BR': [
      ['A opção de live não aparece', 'Atendo aos requisitos de idade e seguidores, mas a opção de iniciar uma live não aparece.'],
    ],
    fr: [
      ['Accès au LIVE non disponible', 'Je remplis les critères d’âge et d’abonnés indiqués, mais le bouton LIVE n’apparaît pas.'],
    ],
  },
  other: {
    en: [
      ['Transfer balance between accounts?', 'Can I move a creator balance between two accounts after I closed one of them? I cannot find this in the help pages.'],
    ],
    es: [
      ['Transferir saldo entre cuentas', '¿Puedo mover el saldo de creador a otra cuenta después de cerrar la anterior? No encuentro esa opción.'],
    ],
    'pt-BR': [
      ['Transferir saldo entre contas', 'Posso transferir o saldo de criador para outra conta depois de fechar a anterior? Não encontrei essa informação.'],
    ],
    fr: [
      ['Transférer un solde entre comptes', 'Puis-je transférer le solde de créateur vers un autre compte après avoir fermé le précédent ?'],
    ],
  },
};

function parseArgs(argv) {
  const args = {
    count: DEFAULT_COUNT,
    chaosRate: DEFAULT_CHAOS_RATE,
    seed: DEFAULT_SEED,
    out: 'tooling/eval/simulated-tenant/sample-50.json',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--count=')) args.count = Number(value.slice('--count='.length));
    else if (value === '--count') args.count = Number(argv[++index]);
    else if (value.startsWith('--chaos-rate=')) args.chaosRate = Number(value.slice('--chaos-rate='.length));
    else if (value === '--chaos-rate') args.chaosRate = Number(argv[++index]);
    else if (value.startsWith('--seed=')) args.seed = Number(value.slice('--seed='.length));
    else if (value === '--seed') args.seed = Number(argv[++index]);
    else if (value.startsWith('--out=')) args.out = value.slice('--out='.length);
    else if (value === '--out') args.out = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isSafeInteger(args.count) || args.count < 1 || args.count > 100_000) {
    throw new Error('--count must be an integer from 1 to 100000');
  }
  if (!Number.isSafeInteger(args.seed) || args.seed < 0 || args.seed > 0xffffffff) {
    throw new Error('--seed must be an unsigned 32-bit integer');
  }
  if (!Number.isFinite(args.chaosRate) || args.chaosRate < 0 || args.chaosRate > 1) {
    throw new Error('--chaos-rate must be a number between 0 and 1');
  }
  return args;
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function weightedPick(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let value = random() * total;
  for (const item of items) {
    value -= item.weight;
    if (value < 0) return item;
  }
  return items.at(-1);
}

function ticketTime(sequence, random) {
  const day = Math.floor(sequence / 50);
  const eveningPeak = random() < 0.65;
  const hour = eveningPeak ? 17 + Math.floor(random() * 7) : 8 + Math.floor(random() * 9);
  const minute = Math.floor(random() * 60);
  const second = Math.floor(random() * 60);
  const date = new Date(Date.UTC(2026, 8, 21 + day, hour, minute, second));
  return date.toISOString();
}

function expectedFor(category) {
  if (category.sopId === null) {
    return { decision: 'escalate', reason: 'no_supported_procedure', sopId: null };
  }
  if (category.sopId === 'wc-security') {
    return { decision: 'escalate', reason: 'specialist_review_required', sopId: category.sopId };
  }
  if (category.sopId === 'wc-appeal') {
    return { decision: 'escalate', reason: 'specialist_review_required', sopId: category.sopId };
  }
  return { decision: 'answer', reason: null, sopId: category.sopId };
}

function ticketFor(category, sequence, random) {
  const language = weightedPick(LANGUAGES, random);
  const channel = weightedPick(CHANNELS, random);
  const messageOptions = MESSAGES[category.key][language.code] ?? MESSAGES[category.key].en;
  const [subject, message] = pick(messageOptions, random);
  const expected = expectedFor(category);
  const priority = category.key === 'account_security'
    ? 'P1'
    : category.key === 'other'
      ? 'P3'
      : category.key === 'creator_eligibility'
        ? 'P3'
        : 'P2';
  const status = weightedPick([
    { value: 'open', weight: 50 },
    { value: 'pending_customer', weight: 15 },
    { value: 'pending_internal', weight: 20 },
    { value: 'resolved', weight: 15 },
  ], random).value;

  return {
    data_mode: 'simulated',
    ticketId: `SIM-TICKET-${String(sequence).padStart(5, '0')}`,
    customerRef: `SIM-CREATOR-${String(1 + Math.floor(random() * 9000)).padStart(4, '0')}`,
    createdAt: ticketTime(sequence, random),
    channel: channel.value,
    language: language.code,
    category: category.label,
    queue: category.queue,
    priority,
    subject,
    message,
    status,
    reopenCount: 0,
    handoffCount: 0,
    tags: [category.key],
    expected,
    chaosTags: [],
    isChaos: false,
  };
}

function buildCategories(count) {
  const totalQuota = CATEGORIES.reduce((sum, category) => sum + category.quota, 0);
  const scaled = CATEGORIES.map((category) => {
    const exact = (category.quota / totalQuota) * count;
    return { ...category, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remainder = count - scaled.reduce((sum, category) => sum + category.count, 0);
  const ranked = [...scaled].sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remainder; index += 1) ranked[index].count += 1;
  return scaled.flatMap((category) => Array.from({ length: category.count }, () => category));
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

const CHAOS_TYPES = [
  'near_duplicate',
  'missing_fields',
  'wrong_fields',
  'mixed_language_typos_sarcasm',
  'off_hours_volume_spike',
  'reopened_ticket',
  'agent_handoff',
  'wrong_category_tag',
  'contradicting_sops',
  'no_correct_answer',
];

function addChaos(tickets, rate, random) {
  const count = Math.round(tickets.length * rate);
  const chosen = shuffle([...tickets], random).slice(0, count);
  const types = shuffle([...CHAOS_TYPES], random);
  const originals = new Map(chosen.map((ticket) => [ticket.ticketId, structuredClone(ticket)]));
  const baseRecords = new Map(tickets.map((ticket) => [ticket.ticketId, structuredClone(ticket)]));
  const spikeDate = '2026-09-27';

  for (let index = 0; index < chosen.length; index += 1) {
    const ticket = chosen[index];
    const type = types[index % types.length];
    const original = originals.get(ticket.ticketId);
    if (original === undefined) throw new Error(`Missing original ticket ${ticket.ticketId}`);
    const mutation = { type, details: {} };
    ticket.isChaos = true;
    ticket.chaosTags = [type];
    ticket.chaosMutation = mutation;
    ticket.groundTruth = {
      expected: structuredClone(original.expected),
      category: original.category,
      queue: original.queue,
      language: original.language,
      channel: original.channel,
      priority: original.priority,
      status: original.status,
      message: original.message,
    };

    switch (type) {
      case 'near_duplicate': {
        const parent = pick(
          [...baseRecords.values()].filter((candidate) => candidate.ticketId !== ticket.ticketId),
          random,
        );
        ticket.subject = parent.subject;
        ticket.message = `${parent.message} Just following up on this — same issue.`;
        ticket.language = parent.language;
        ticket.category = parent.category;
        ticket.queue = parent.queue;
        ticket.priority = parent.priority;
        ticket.tags = [...parent.tags];
        ticket.expected = structuredClone(parent.expected);
        ticket.duplicateOf = parent.ticketId;
        mutation.details.duplicateOf = parent.ticketId;
        break;
      }
      case 'missing_fields': {
        const field = pick(['category', 'language', 'channel', 'priority'], random);
        delete ticket[field];
        mutation.details.missingField = field;
        break;
      }
      case 'wrong_fields': {
        const field = pick(['language', 'channel', 'priority', 'status'], random);
        const incorrect = {
          language: 'de',
          channel: 'internal_pager',
          priority: 'P0',
          status: 'closed_by_unknown_agent',
        }[field];
        ticket[field] = incorrect;
        mutation.details.wrongField = field;
        mutation.details.injectedValue = incorrect;
        break;
      }
      case 'mixed_language_typos_sarcasm': {
        const prefix = pick([
          'Sure, because waiting another week is just brilliant 🙃. ',
          'I already tried twice, gracias — this is getting ridiculous. ',
          'Já tentei isso. Same problem, no change. ',
          'Super, encore une réponse automatique… anyway, I need help. ',
        ], random);
        ticket.message = `${prefix}${ticket.message.replace(/account/gi, 'acount').replace(/payout/gi, 'payuot')}`;
        ticket.language = pick(['en', 'es', 'pt-BR', 'fr'], random);
        mutation.details.addedTone = 'sarcastic or frustrated; sentiment is synthetic';
        mutation.details.typosInjected = true;
        mutation.details.languageFieldMayDisagree = true;
        break;
      }
      case 'off_hours_volume_spike': {
        const minute = Math.floor(random() * 15);
        const second = Math.floor(random() * 60);
        ticket.createdAt = `${spikeDate}T02:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`;
        mutation.details.spikeWindow = `${spikeDate}T02:00Z–02:14Z`;
        mutation.details.batchCountInWindow = 'see generated-batch-spike summary';
        break;
      }
      case 'reopened_ticket': {
        ticket.status = pick(['open', 'pending_internal'], random);
        ticket.reopenCount = 1 + Math.floor(random() * 3);
        ticket.reopenedAt = ticket.createdAt;
        mutation.details.reopenCount = ticket.reopenCount;
        break;
      }
      case 'agent_handoff': {
        ticket.handoffCount = 2 + Math.floor(random() * 3);
        ticket.handoffHistory = Array.from({ length: ticket.handoffCount }, (_, handoffIndex) => ({
          data_mode: 'simulated',
          sequence: handoffIndex + 1,
          fromQueue: pick(['general', 'payments', 'creator-support'], random),
          toQueue: pick(['payments', 'trust-safety', 'live-support', 'account'], random),
          reason: pick(['wrong initial route', 'specialist review needed', 'shift change'], random),
        }));
        mutation.details.handoffCount = ticket.handoffCount;
        break;
      }
      case 'wrong_category_tag': {
        const incorrect = pick(CATEGORIES.filter((category) => category.label !== ticket.category), random);
        ticket.category = incorrect.label;
        ticket.queue = incorrect.queue;
        ticket.tags = [incorrect.key];
        mutation.details.injectedCategory = incorrect.label;
        mutation.details.injectedTag = incorrect.key;
        break;
      }
      case 'contradicting_sops': {
        const payout = pick(
          [...baseRecords.values()].filter((candidate) =>
            candidate.ticketId !== ticket.ticketId && candidate.category === 'Creator payouts',
          ),
          random,
        );
        ticket.subject = payout.subject;
        ticket.message = payout.message;
        ticket.language = payout.language;
        ticket.category = payout.category;
        ticket.queue = payout.queue;
        ticket.priority = payout.priority;
        ticket.tags = [...payout.tags];
        ticket.expected = { decision: 'escalate', reason: 'conflicting_procedure_guidance', sopId: null };
        ticket.testEnvironment = {
          data_mode: 'simulated',
          additionalSops: [{
            data_mode: 'simulated',
            id: 'wc-payout-conflict',
            title: 'Creator Payout Timing — Conflicting Legacy Guide',
            category: 'Creator payouts',
            triggerKeywords: ['payout', 'deposit', 'withdraw', 'balance'],
            summary: 'A creator payout marked processed arrives in one business day. Do not use the two-to-five-business-day estimate; this guide conflicts with the standard payout procedure and requires a lead to determine which rule is current. Un pago al creador marcado como procesado llega en un día hábil. Esta guía contradice el plazo estándar de dos a cinco días hábiles y requiere que un responsable confirme qué regla está vigente. Um saque marcado como processado chega em um dia útil. Este guia contradiz o prazo padrão de dois a cinco dias úteis e exige que uma liderança confirme qual regra está em vigor. Un versement marqué comme traité arrive en un jour ouvré. Ce guide contredit le délai standard de deux à cinq jours ouvrés et nécessite qu’un responsable confirme la règle en vigueur.',
            suggestedReply: 'The published payout guidance conflicts. I am escalating this question for a lead to confirm the current timing.',
            escalationRequired: true,
            escalationReason: 'Two active simulated procedures give contradictory payout deadlines.',
          }],
        };
        mutation.details.sourceTicketId = payout.ticketId;
        mutation.details.conflictSopId = 'wc-payout-conflict';
        mutation.details.expectedHandling = 'escalate until a human resolves the policy conflict';
        break;
      }
      case 'no_correct_answer': {
        ticket.subject = 'Can a closed account payout be redirected during an audit hold?';
        ticket.message = 'My account is closed and the payout is held for an audit. Can support redirect the balance to a different creator account, or tell me the result of the review? The help pages do not cover this.';
        ticket.category = 'Other / ambiguous';
        ticket.queue = 'triage';
        ticket.tags = ['other'];
        ticket.expected = { decision: 'escalate', reason: 'no_supported_procedure', sopId: null };
        mutation.details.expectedHandling = 'escalate; no supplied procedure supports a safe answer';
        break;
      }
      default:
        throw new Error(`Unsupported chaos type ${type}`);
    }
  }

  const spikeTickets = tickets.filter((ticket) =>
    ticket.createdAt.startsWith(`${spikeDate}T02:`),
  );
  for (const ticket of spikeTickets) {
    if (ticket.chaosMutation?.type === 'off_hours_volume_spike') {
      ticket.chaosMutation.details.batchCountInWindow = spikeTickets.length;
    }
  }

  return { chaosTicketCount: count, spikeTicketCount: spikeTickets.length };
}

const args = parseArgs(process.argv.slice(2));
const random = makeRandom(args.seed);
const corpusFile = JSON.parse(readFileSync(resolve(here, 'corpus.json'), 'utf8'));
const tickets = shuffle(
  buildCategories(args.count).map((category, index) => ticketFor(category, index + 1, random)),
  random,
);
const chaosSummary = addChaos(tickets, args.chaosRate, random);
const statusDistribution = Object.fromEntries(
  Object.entries(Object.groupBy(tickets, (ticket) => ticket.status))
    .map(([status, records]) => [status, records.length]),
);
const chaosTypeDistribution = Object.fromEntries(
  Object.entries(Object.groupBy(tickets.filter((ticket) => ticket.isChaos), (ticket) => ticket.chaosMutation.type))
    .map(([type, records]) => [type, records.length]),
);

const output = {
  data_mode: 'simulated',
  generatedBy: 'generate-tickets.mjs',
  seed: args.seed,
  chaosRateConfigured: args.chaosRate,
  chaosRateActual: tickets.length === 0 ? 0 : chaosSummary.chaosTicketCount / tickets.length,
  ticketCount: tickets.length,
  client: 'WaveCast Creator Care (fictional)',
  corpusSource: 'Fictional simulated SOPs in corpus.json',
  productInputField: 'message',
  datasetSourcePolicy: 'Public dataset schemas only; no external ticket rows or message text used.',
  sopCount: corpusFile.sops.length,
  chaosSummary,
  chaosTypeDistribution,
  statusDistribution,
  tickets,
};
const outputPath = resolve(root, args.out);
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`SIMULATED DATA | data_mode: "simulated" | tickets=${tickets.length} | seed=${args.seed} | chaos_rate=${output.chaosRateActual}`);
console.log(`Wrote ${args.out}`);
