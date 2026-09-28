#!/usr/bin/env node
/**
 * Build the dual-pass label dataset and the human audit sheet for the 72 public
 * queries in real-phrased-queries.csv.
 *
 * Inputs: the two independent labeling passes (PASS1, PASS2) produced by two
 * isolated sub-agents, each seeing only the query text and the 7 procedures'
 * text. Neither saw the other's labels, the gate's decisions, or the batch.
 *
 * Outputs:
 *   - real-phrased-queries-labeled.csv : all 72 rows + pass1/pass2 columns,
 *     my_label / my_sop_id left EMPTY (owner fills them later), label_source empty.
 *   - audit-sheet.csv : (a) every disagreement, (b) 15 random agreements
 *     (fixed seed 20260928), with both agent labels+reasons side by side and
 *     blank columns (my_label, my_sop_id, my_reason) for the owner's decision.
 *
 * No final labels are set in this step.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

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

function csvQuote(v) {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const p1 = parsePass(PASS1);
const p2 = parsePass(PASS2);
if (p1.size !== 72 || p2.size !== 72) {
  throw new Error(`pass size wrong: p1=${p1.size} p2=${p2.size}`);
}

// ---- original rows ----
const raw = readFileSync(resolve(here, 'real-phrased-queries.csv'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() !== '');
function parseCSV(line) {
  const o = []; let c = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch;
  }
  o.push(c); return o;
}
const origHeader = parseCSV(raw[0]);
const origRows = new Map();
for (let i = 1; i < raw.length; i += 1) {
  const f = parseCSV(raw[i]);
  origRows.set(f[0], { query: f[1], source_type: f[2], my_label: f[3], my_sop_id: f[4], notes: f[5] || '' });
}
if (origRows.size !== 72) throw new Error(`original rows=${origRows.size}`);

// ---- agreement + build labeled dataset ----
const labeled = [];
let labelAgree = 0;
let bothAnswerable = 0;
let sopAgree = 0;
const disagreements = [];
const agreements = [];
for (let i = 1; i <= 72; i += 1) {
  const id = `rp-${String(i).padStart(3, '0')}`;
  const a = p1.get(id); const b = p2.get(id); const o = origRows.get(id);
  if (!a || !b || !o) throw new Error(`missing ${id}`);
  const row = {
    id, query: o.query, source_type: o.source_type,
    my_label: '', my_sop_id: '', notes: o.notes,
    label_pass1: a.label, sop_pass1: a.sop, reason_pass1: a.reason,
    label_pass2: b.label, sop_pass2: b.sop, reason_pass2: b.reason,
    label_source: '',
  };
  labeled.push(row);
  const sameLabel = a.label === b.label;
  if (sameLabel) labelAgree += 1;
  const answerableBoth = a.label === 'answerable' && b.label === 'answerable';
  let fullAgree = sameLabel;
  if (answerableBoth) {
    bothAnswerable += 1;
    const sameSop = a.sop === b.sop;
    if (sameSop) sopAgree += 1;
    if (!sameSop) fullAgree = false;
  }
  if (fullAgree) agreements.push(id); else disagreements.push(id);
}

// ---- audit sheet ----
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260928;
const rng = mulberry32(SEED);
const pool = agreements.slice();
for (let i = pool.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rng() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sampled = pool.slice(0, 15);

const auditIds = [...disagreements, ...sampled];
const auditHeader = ['query_id', 'query', 'label_pass1', 'sop_pass1', 'reason_pass1',
  'label_pass2', 'sop_pass2', 'reason_pass2', 'my_label', 'my_sop_id', 'my_reason'];
const auditLines = [auditHeader.map(csvQuote).join(',')];
for (const id of auditIds) {
  const r = labeled.find((x) => x.id === id);
  auditLines.push([
    r.id, r.query, r.label_pass1, r.sop_pass1, r.reason_pass1,
    r.label_pass2, r.sop_pass2, r.reason_pass2, '', '', '',
  ].map(csvQuote).join(','));
}

// ---- write outputs ----
const labeledHeader = ['id', 'query', 'source_type', 'my_label', 'my_sop_id', 'notes',
  'label_pass1', 'sop_pass1', 'reason_pass1', 'label_pass2', 'sop_pass2', 'reason_pass2', 'label_source'];
const labeledLines = [labeledHeader.map(csvQuote).join(',')];
for (const r of labeled) {
  labeledLines.push([
    r.id, r.query, r.source_type, r.my_label, r.my_sop_id, r.notes,
    r.label_pass1, r.sop_pass1, r.reason_pass1, r.label_pass2, r.sop_pass2, r.reason_pass2, r.label_source,
  ].map(csvQuote).join(','));
}
writeFileSync(resolve(here, 'real-phrased-queries-labeled.csv'), labeledLines.join('\r\n') + '\r\n');
writeFileSync(resolve(here, 'audit-sheet.csv'), auditLines.join('\r\n') + '\r\n');

// ---- report ----
process.stdout.write(`${JSON.stringify({
  data_mode: 'simulated-public',
  total: 72,
  labelAgreement: `${labelAgree}/72`,
  labelAgreementPct: Math.round((labelAgree / 72) * 1000) / 10,
  bothAnswerable: bothAnswerable,
  procedureAgreementAmongAnswerable: `${sopAgree}/${bothAnswerable}`,
  disagreements: disagreements.length,
  disagreementIds: disagreements,
  agreements: agreements.length,
  sampledAgreements: sampled.length,
  seed: SEED,
  auditSheetRows: auditIds.length,
}, null, 2)}\n`);
