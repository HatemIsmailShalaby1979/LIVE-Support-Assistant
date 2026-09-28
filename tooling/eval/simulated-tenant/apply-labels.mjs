#!/usr/bin/env node
/**
 * Apply the operator's final labels to the 72 public (simulated-public) queries.
 *
 * Inputs:
 *   - real-phrased-queries.csv : the source rows (id, query, source_type,
 *     my_label, my_sop_id, notes). Currently my_label / my_sop_id are empty.
 *   - PASS1 / PASS2 : the two independent agent labeling passes (frozen blocks,
 *     each produced by an isolated sub-agent that saw only the query text and
 *     the 7 procedures; neither saw the other's labels, the gate, or the batch).
 *   - humanFinal : the owner's decisions for the 9 disagreements and the 15
 *     spot-check rows (returned after the dual-pass labeling).
 *   - firstPass : the owner's FIRST-PASS answers for the 15 spot-check rows,
 *     preserved verbatim for audit (kept, never deleted).
 *
 * Outputs:
 *   - real-phrased-queries.csv : the SAME 6-column header the scorer requires
 *     (id, query, source_type, my_label, my_sop_id, notes) with my_label /
 *     my_sop_id now filled. This is what score-real-phrased.mjs consumes.
 *   - real-phrased-queries-labeled.csv : the rich companion, all pass columns
 *     plus first_pass_label and label_source, for provenance.
 *
 * No gate, threshold, model, or corpus text is changed. Labeling only.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const PASS1 = `
rp-001 | escalate |  | YouTube channel review/monetization not covered by any procedure
rp-002 | escalate |  | identity verification not covered by any procedure
rp-003 | escalate |  | AdSense signup issue not covered by any procedure
rp-004 | escalate |  | view/watch-time metrics not covered by any procedure
rp-005 | escalate |  | monetization application error not covered
rp-006 | ambiguous |  | "investigate my channel" gives no detail to pick a procedure
rp-007 | escalate |  | YPP monetization review not covered by any procedure
rp-008 | escalate |  | demonetization and search visibility not covered
rp-009 | escalate |  | AdSense account access not covered by login procedure
rp-010 | escalate |  | AdSense linking error not covered
rp-011 | escalate |  | monetization problem not covered by any procedure
rp-012 | escalate |  | earnings/monetization access not covered
rp-013 | ambiguous |  | "one-time purchases" too vague to pick a procedure
rp-014 | answerable | wc-gifts | superchat refund maps to purchase/refund review
rp-015 | answerable | wc-appeal | live streaming disabled is a LIVE restriction appeal
rp-016 | escalate |  | live chat visibility not covered by any procedure
rp-017 | escalate |  | analytics watch-time accuracy not covered
rp-018 | escalate |  | phone/identity verification not covered
rp-019 | escalate |  | subscriber live notification not covered by streaming procedure
rp-020 | answerable | wc-appeal | "flagged by mistake" is a content action dispute
rp-021 | ambiguous |  | "some problem my channel" lacks detail to decide
rp-022 | answerable | wc-live | microphone failing during livestream is a technical streaming issue
rp-023 | answerable | wc-eligibility | enabling live streaming maps to eligibility requirements
rp-024 | answerable | wc-eligibility | request to go live maps to LIVE eligibility access
rp-025 | ambiguous |  | "live stream on mobile" too vague to assign a procedure
rp-026 | ambiguous |  | "live streaming issues" could be technical, eligibility, or restriction
rp-027 | answerable | wc-eligibility | permission for live streaming maps to eligibility
rp-028 | escalate |  | community feature toggle not covered
rp-029 | answerable | wc-appeal | video removed is a content action appeal
rp-030 | escalate |  | advanced feature block not covered by any procedure
rp-031 | escalate |  | policy violation history request not covered
rp-032 | answerable | wc-appeal | channel reinstatement is an appeal of an account action
rp-033 | escalate |  | expired warning still showing is a display issue not covered
rp-034 | ambiguous |  | "harassment" alone is too vague to decide
rp-035 | answerable | wc-appeal | terminated channel review is an appeal
rp-036 | answerable | wc-appeal | removed channel is an appeal of an action
rp-037 | answerable | wc-appeal | live disabled is a LIVE restriction appeal
rp-038 | answerable | wc-appeal | live streaming banned is a restriction appeal
rp-039 | answerable | wc-gifts | gifted memberships relate to gifts procedure
rp-040 | answerable | wc-live | duplicate stream key/auto-start is a technical streaming issue
rp-041 | escalate |  | monetization paused not covered
rp-042 | escalate |  | monetization rejection FAQs not covered
rp-043 | escalate |  | monetization review process not covered
rp-044 | escalate |  | AdSense disabled for invalid traffic not covered
rp-045 | answerable | wc-appeal | strikes and appeals maps to content/restriction appeal
rp-046 | escalate |  | monetization icon guide not covered
rp-047 | answerable | wc-login | signing-in help maps to login recovery
rp-048 | answerable | wc-login | forgot email is login recovery
rp-049 | answerable | wc-login | cannot access account maps to login recovery
rp-050 | answerable | wc-security | hacked channel is suspected account takeover
rp-051 | answerable | wc-security | securing channel maps to account security
rp-052 | escalate |  | videos changed to private not covered
rp-053 | escalate |  | third-party upload issues not covered
rp-054 | escalate |  | brand account move not covered
rp-055 | escalate |  | re-enable hidden channel not covered
rp-056 | answerable | wc-appeal | rejoining after termination is an appeal
rp-057 | escalate |  | intermediate/advanced feature access not covered
rp-058 | escalate |  | feature access info not covered
rp-059 | escalate |  | posts not getting views not covered
rp-060 | escalate |  | TikTok monetization not covered
rp-061 | ambiguous |  | "report a problem" too vague to assign a procedure
rp-062 | escalate |  | removing followers not covered
rp-063 | escalate |  | blocking users not covered
rp-064 | escalate |  | TikTok verification not covered
rp-065 | escalate |  | download content not covered
rp-066 | escalate |  | TikTok ad purchases not covered by gifts procedure
rp-067 | escalate |  | YouTube TV double billing not covered
rp-068 | escalate |  | YouTube Premium access restore not covered
rp-069 | escalate |  | YouTube Premium ads not covered
rp-070 | escalate |  | cancel premium not covered
rp-071 | escalate |  | AdSense suspension not covered
rp-072 | escalate |  | AdSense verification failure not covered
`;

const PASS2 = `
rp-001 | escalate |  | YPP monetization review not covered by any WaveCast procedure
rp-002 | escalate |  | identity verification not covered by any procedure
rp-003 | escalate |  | AdSense signup issue not covered by any procedure
rp-004 | escalate |  | view-count metrics not covered by any procedure
rp-005 | escalate |  | monetization application errors not covered by any procedure
rp-006 | ambiguous |  | "investigate my channel" too vague to map to a procedure
rp-007 | escalate |  | YPP monetization pending not covered by any procedure
rp-008 | escalate |  | demonetization/search visibility not covered by any procedure
rp-009 | escalate |  | old AdSense account access not covered by any procedure
rp-010 | escalate |  | AdSense linking error not covered by any procedure
rp-011 | escalate |  | generic monetization problem not covered by any procedure
rp-012 | escalate |  | earnings/monetization access not covered by any procedure
rp-013 | answerable | wc-gifts | one-time purchase maps to Coin purchase/refund procedure
rp-014 | answerable | wc-gifts | Superchat refund is a purchase refund reviewed by Payments
rp-015 | answerable | wc-appeal | disabled LIVE is a LIVE restriction dispute/appeal
rp-016 | escalate |  | live-chat visibility not covered by any procedure
rp-017 | escalate |  | analytics watch-time accuracy not covered by any procedure
rp-018 | answerable | wc-login | phone verification failure is routine login recovery
rp-019 | ambiguous |  | live subscriber notifications not clearly a stream/eligibility issue
rp-020 | answerable | wc-appeal | "flagged by mistake" disputes a content action
rp-021 | ambiguous |  | "some problem my channel" lacks enough detail
rp-022 | answerable | wc-live | mobile mic/stream enablement is a technical streaming issue
rp-023 | answerable | wc-eligibility | enabling LIVE is an eligibility question
rp-024 | answerable | wc-eligibility | requesting LIVE access is an eligibility question
rp-025 | answerable | wc-live | mobile live stream is a technical streaming context
rp-026 | answerable | wc-live | live streaming issues are technical stream problems
rp-027 | answerable | wc-eligibility | permission for LIVE is an eligibility question
rp-028 | escalate |  | community tab status not covered by any procedure
rp-029 | answerable | wc-appeal | removed video is a content-action dispute
rp-030 | escalate |  | advanced-feature block is not a LIVE/content appeal
rp-031 | escalate |  | policy-violation history not covered by any procedure
rp-032 | answerable | wc-appeal | channel reinstatement is a content-action appeal
rp-033 | escalate |  | dashboard warning display not covered by any procedure
rp-034 | escalate |  | harassment involves safety, route away from standard procedures
rp-035 | answerable | wc-appeal | terminated channel review is a content-action appeal
rp-036 | answerable | wc-appeal | removed channel is a content-action appeal
rp-037 | answerable | wc-appeal | disabled LIVE is a LIVE restriction appeal
rp-038 | answerable | wc-appeal | banned live streaming is a LIVE restriction appeal
rp-039 | answerable | wc-gifts | gifted memberships relate to Gifts procedure
rp-040 | answerable | wc-live | stream-key conflict is a LIVE technical issue
rp-041 | escalate |  | monetization pause not covered by any procedure
rp-042 | escalate |  | monetization rejection FAQs not covered by any procedure
rp-043 | escalate |  | monetization review mechanics not covered by any procedure
rp-044 | escalate |  | AdSense invalid-traffic disable not covered by any procedure
rp-045 | answerable | wc-appeal | strikes and appeals map to content/restriction appeal
rp-046 | escalate |  | monetization icon guide not covered by any procedure
rp-047 | answerable | wc-login | signing-in help is routine login recovery
rp-048 | answerable | wc-login | forgot email is routine login recovery
rp-049 | answerable | wc-login | cannot access account is routine login recovery
rp-050 | answerable | wc-security | hacked channel is suspected account takeover
rp-051 | answerable | wc-security | securing channel maps to account security review
rp-052 | answerable | wc-appeal | videos changed to private is a content action
rp-053 | escalate |  | third-party upload tooling not covered by any procedure
rp-054 | escalate |  | brand-account transfer not covered by any procedure
rp-055 | answerable | wc-appeal | re-enabling hidden channel is a restriction appeal
rp-056 | answerable | wc-appeal | rejoining after termination is a content-action appeal
rp-057 | escalate |  | intermediate/advanced features not LIVE eligibility
rp-058 | escalate |  | general feature access not covered by any procedure
rp-059 | escalate |  | post view counts not covered by any procedure
rp-060 | escalate |  | TikTok monetization not covered by any WaveCast procedure
rp-061 | ambiguous |  | "report a problem" lacks specifics to map
rp-062 | escalate |  | removing followers not covered by any procedure
rp-063 | escalate |  | blocking users not covered by any procedure
rp-064 | escalate |  | TikTok verified accounts not covered by any procedure
rp-065 | escalate |  | content download not covered by any procedure
rp-066 | escalate |  | TikTok ad purchases not covered by any procedure
rp-067 | answerable | wc-gifts | double billing is a duplicate-charge Payments review
rp-068 | escalate |  | Premium address confirmation not covered by any procedure
rp-069 | escalate |  | Premium ads on Chromecast not covered by any procedure
rp-070 | escalate |  | cancelling Premium not covered by any procedure
rp-071 | escalate |  | AdSense suspension not covered by any procedure
rp-072 | escalate |  | AdSense verification failure not covered by any procedure
`;

// Owner FINAL decisions: 9 disagreements resolved earlier + 15 spot-check finals.
const humanFinal = {
  'rp-013': { label: 'ambiguous', sop: '' },
  'rp-018': { label: 'answerable', sop: 'wc-login' },
  'rp-019': { label: 'escalate', sop: '' },
  'rp-025': { label: 'ambiguous', sop: '' },
  'rp-026': { label: 'ambiguous', sop: '' },
  'rp-034': { label: 'escalate', sop: '' },
  'rp-052': { label: 'ambiguous', sop: '' },
  'rp-055': { label: 'escalate', sop: '' },
  'rp-067': { label: 'escalate', sop: '' },
  'rp-014': { label: 'answerable', sop: 'wc-gifts' },
  'rp-015': { label: 'answerable', sop: 'wc-appeal' },
  'rp-039': { label: 'answerable', sop: 'wc-gifts' },
  'rp-048': { label: 'answerable', sop: 'wc-login' },
  'rp-050': { label: 'answerable', sop: 'wc-security' },
  'rp-022': { label: 'escalate', sop: '' },
  'rp-023': { label: 'escalate', sop: '' },
  'rp-040': { label: 'ambiguous', sop: '' },
  'rp-004': { label: 'ambiguous', sop: '' },
  'rp-011': { label: 'escalate', sop: '' },
  'rp-028': { label: 'ambiguous', sop: '' },
  'rp-033': { label: 'ambiguous', sop: '' },
  'rp-063': { label: 'escalate', sop: '' },
  'rp-066': { label: 'escalate', sop: '' },
  'rp-070': { label: 'ambiguous', sop: '' },
};

// Owner FIRST-PASS answers for the 15 spot-check rows (preserved verbatim).
const firstPass = {
  'rp-014': 'gifts',
  'rp-015': 'appeal',
  'rp-022': 'login',
  'rp-023': 'appeal',
  'rp-039': 'gifts',
  'rp-048': 'login',
  'rp-050': 'security',
  'rp-040': 'appeal',
  'rp-004': 'live',
  'rp-011': 'live',
  'rp-028': 'appeal',
  'rp-033': 'login',
  'rp-063': 'appeal',
  'rp-066': 'payout',
  'rp-070': 'appeal',
};

// first-pass shorthand -> procedure id, for the coarse first-pass comparison.
const SHORT_TO_SOP = {
  gifts: 'wc-gifts',
  appeal: 'wc-appeal',
  login: 'wc-login',
  security: 'wc-security',
  live: 'wc-live',
  payout: 'wc-payout',
};

function parsePass(text) {
  const map = new Map();
  for (const line of text.trim().split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('rp-')) continue;
    const parts = t.split('|').map((p) => p.trim());
    const [id, label, sop, ...rest] = parts;
    map.set(id, { label, sop: sop || '', reason: rest.join('|').trim() });
  }
  return map;
}

function parseCSVLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

function csvQuote(v) {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const p1 = parsePass(PASS1);
const p2 = parsePass(PASS2);
if (p1.size !== 72 || p2.size !== 72) throw new Error(`pass size wrong: p1=${p1.size} p2=${p2.size}`);

const raw = readFileSync(resolve(here, 'real-phrased-queries.csv'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() !== '');
const origHeader = parseCSVLine(raw[0]);
if (origHeader.map((c) => c.trim().toLowerCase()).join(',') !== 'id,query,source_type,my_label,my_sop_id,notes') {
  throw new Error(`unexpected source header: ${origHeader.join(',')}`);
}
const origRows = new Map();
for (let i = 1; i < raw.length; i += 1) {
  const f = parseCSVLine(raw[i]);
  if (f.length < 6 || f[0] === '') continue;
  origRows.set(f[0], { query: f[1], source_type: f[2], notes: f[5] || '' });
}
if (origRows.size !== 72) throw new Error(`original rows=${origRows.size}`);

// ---- build final rows + scorer-safe source ----
const labeled = [];
const sourceRows = [];
let humanResolved = 0;
let agentAgreed = 0;
for (let i = 1; i <= 72; i += 1) {
  const id = `rp-${String(i).padStart(3, '0')}`;
  const a = p1.get(id);
  const b = p2.get(id);
  const o = origRows.get(id);
  if (!a || !b || !o) throw new Error(`missing ${id}`);

  let myLabel;
  let mySop;
  let labelSource;
  let firstPassLabel = '';
  if (Object.prototype.hasOwnProperty.call(humanFinal, id)) {
    myLabel = humanFinal[id].label;
    mySop = humanFinal[id].sop;
    labelSource = 'human-resolved';
    firstPassLabel = firstPass[id] ?? '';
    humanResolved += 1;
  } else {
    if (a.label !== b.label) throw new Error(`unexpected agent disagreement on ${id} with no human decision`);
    myLabel = a.label;
    mySop = a.sop;
    labelSource = 'agent-agreed, unconfirmed';
    agentAgreed += 1;
  }

  labeled.push({
    id, query: o.query, source_type: o.source_type,
    my_label: myLabel, my_sop_id: mySop, notes: o.notes,
    label_pass1: a.label, sop_pass1: a.sop, reason_pass1: a.reason,
    label_pass2: b.label, sop_pass2: b.sop, reason_pass2: b.reason,
    first_pass_label: firstPassLabel, label_source: labelSource,
  });
  sourceRows.push({ id, query: o.query, source_type: o.source_type, my_label: myLabel, my_sop_id: mySop, notes: o.notes });
}

// ---- spot-check agreement report ----
const spotIds = Object.keys(firstPass).sort();
const agreedLabel = (id) => (p1.get(id).label === p2.get(id).label
  ? { label: p1.get(id).label, sop: p1.get(id).sop || p2.get(id).sop }
  : { label: 'DISAGREE', sop: '' });

let exact = 0;
let firstPassExact = 0;
let coarse = 0;
const exactDisagreements = [];
const firstPassDisagreements = [];
const coarseDisagreements = [];
for (const id of spotIds) {
  const ag = agreedLabel(id);
  const fin = humanFinal[id];
  const agAnswerable = ag.label === 'answerable';
  const finAnswerable = fin.label === 'answerable';
  const isExact = ag.label === fin.label && (ag.label !== 'answerable' || ag.sop === fin.sop);
  if (isExact) exact += 1; else exactDisagreements.push({ id, agent: `${ag.label}${ag.sop ? ' ' + ag.sop : ''}`, owner: `${fin.label}${fin.sop ? ' ' + fin.sop : ''}` });
  const fpSop = SHORT_TO_SOP[firstPass[id]] ?? '';
  const isFpExact = agAnswerable && finAnswerable ? (fpSop === ag.sop) : (fpSop === '' && !agAnswerable);
  // first-pass exact = owner first-pass procedure matches the agent-agreed procedure (answerable rows),
  // or owner first-pass also implies escalate (no sop) when agent escalated.
  const fpExactFine = agAnswerable ? (fpSop === ag.sop) : (fpSop === '');
  if (fpExactFine) firstPassExact += 1; else firstPassDisagreements.push({ id, agent: `${ag.label}${ag.sop ? ' ' + ag.sop : ''}`, firstPass: `${firstPass[id]}${fpSop ? ' ' + fpSop : ''}` });
  const isCoarse = agAnswerable === finAnswerable;
  if (isCoarse) coarse += 1; else coarseDisagreements.push({ id, agentAutoAnswer: agAnswerable ? 'yes' : 'no', ownerAutoAnswer: finAnswerable ? 'yes' : 'no' });
}

// ---- label-based scoring groups (gate decisions added after the scorer runs) ----
const refusalSet = [];
const contestedSet = [];
const confirmedAnswerable = [];
for (const r of labeled) {
  const agentsAnswerable = r.label_pass1 === 'answerable' && r.label_pass2 === 'answerable';
  if (r.my_label === 'answerable') {
    confirmedAnswerable.push(r.id);
  } else if (r.my_label === 'escalate' || r.my_label === 'ambiguous') {
    refusalSet.push(r.id);
    if (agentsAnswerable) contestedSet.push(r.id);
  }
}

// ---- write outputs ----
const sourceHeader = ['id', 'query', 'source_type', 'my_label', 'my_sop_id', 'notes'];
const sourceLines = [sourceHeader.map(csvQuote).join(',')];
for (const r of sourceRows) {
  sourceLines.push([r.id, r.query, r.source_type, r.my_label, r.my_sop_id, r.notes].map(csvQuote).join(','));
}
writeFileSync(resolve(here, 'real-phrased-queries.csv'), sourceLines.join('\r\n') + '\r\n');

const labeledHeader = ['id', 'query', 'source_type', 'my_label', 'my_sop_id', 'notes',
  'label_pass1', 'sop_pass1', 'reason_pass1', 'label_pass2', 'sop_pass2', 'reason_pass2',
  'first_pass_label', 'label_source'];
const labeledLines = [labeledHeader.map(csvQuote).join(',')];
for (const r of labeled) {
  labeledLines.push([
    r.id, r.query, r.source_type, r.my_label, r.my_sop_id, r.notes,
    r.label_pass1, r.sop_pass1, r.reason_pass1, r.label_pass2, r.sop_pass2, r.reason_pass2,
    r.first_pass_label, r.label_source,
  ].map(csvQuote).join(','));
}
writeFileSync(resolve(here, 'real-phrased-queries-labeled.csv'), labeledLines.join('\r\n') + '\r\n');

const report = {
  total: 72,
  labelSource: { humanResolved, agentAgreed },
  spotCheck: {
    n: spotIds.length,
    exact, exactPct: Math.round((exact / spotIds.length) * 1000) / 10,
    firstPassExact, firstPassExactPct: Math.round((firstPassExact / spotIds.length) * 1000) / 10,
    coarse, coarsePct: Math.round((coarse / spotIds.length) * 1000) / 10,
    exactDisagreements,
    firstPassDisagreements,
    coarseDisagreements,
  },
  groups: {
    refusalSet: refusalSet.length,
    contestedSet: contestedSet.length,
    confirmedAnswerable: confirmedAnswerable.length,
    refusalIds: refusalSet,
    contestedIds: contestedSet,
    confirmedIds: confirmedAnswerable,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
