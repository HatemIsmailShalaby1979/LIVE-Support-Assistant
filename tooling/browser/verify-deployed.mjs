#!/usr/bin/env node
/**
 * Stranger-path verification against the DEPLOYED public URL.
 *
 * The local browser harness (verify-signin.mjs) proves the app against a dev
 * server. This one proves the thing a stranger actually meets: the public URL,
 * a clean profile, the demo sign-in, a bundle published for the enrolled device,
 * one query, and the hosted telemetry/escalation record it leaves behind.
 *
 * It provisions its own publisher/editor/corpus per run (unique markers, so a
 * check can never pass on another run's leftovers) and reuses the stable demo
 * agent for the browser sign-in. Drives headless Chrome over CDP directly —
 * no Puppeteer, no Playwright, no new dependency.
 *
 * Usage:
 *   TARGET_URL=https://<deployed> DEMO_EMAIL=demo@alpha.example DEMO_PASSWORD=... pnpm run verify:deployed
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from the
 * environment or .env.local.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = process.env.TARGET_URL ?? '';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? '';
if (!TARGET || !DEMO_EMAIL || !DEMO_PASSWORD) { process.stderr.write('need TARGET_URL, DEMO_EMAIL, DEMO_PASSWORD\n'); process.exit(2); }

function readEnvFile() {
  const v = {};
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) v[m[1]] = m[2];
  }
  return v;
}
const fileEnv = readEnvFile();
const env = (n) => process.env[n] ?? fileEnv[n] ?? '';
const supabaseUrl = env('SUPABASE_URL');
const pub = env('SUPABASE_PUBLISHABLE_KEY');
const sec = env('SUPABASE_SECRET_KEY');
const TENANT = process.env.TENANT_ID ?? '11111111-1111-1111-1111-111111111111';
const RUN_START = new Date().toISOString();
const marker = `DEPLOYED${randomUUID().slice(0, 8).replace(/-/g, '')}`;

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
].find((c) => existsSync(c));
if (!chrome) { process.stderr.write('no Chrome found\n'); process.exit(2); }

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}
const adminH = { apikey: sec, Authorization: `Bearer ${sec}`, 'Content-Type': 'application/json' };

async function provision(email, password, tenant, role, display) {
  const list = await (await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminH })).json();
  const ex = (list?.users ?? []).find((u) => u?.email === email);
  let id;
  const meta = { tenant_id: tenant, app_role: role };
  if (ex) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${ex.id}`, { method: 'PUT', headers: adminH, body: JSON.stringify({ email_confirm: true, password, app_metadata: meta }) });
    id = ex.id;
  } else {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, { method: 'POST', headers: adminH, body: JSON.stringify({ email, password, email_confirm: true, app_metadata: meta }) });
    if (!created.ok) throw new Error(`provision ${email}: ${await created.text()}`);
    id = (await created.json()).id;
  }
  await fetch(`${supabaseUrl}/rest/v1/users`, { method: 'POST', headers: { ...adminH, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id, tenant_id: tenant, display_name: display, role }) });
  const s = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: pub, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const b = await s.json();
  if (!b?.access_token) throw new Error(`sign-in ${email}: ${JSON.stringify(b).slice(0, 120)}`);
  return { id, token: b.access_token };
}

process.stdout.write('==> provisioning demo + publisher + editor\n');
await provision(DEMO_EMAIL, DEMO_PASSWORD, TENANT, 'agent', 'Public demo agent');
const publisher = await provision(`deploysh-pub-${marker}@alpha.example`, `Dp-${randomUUID()}`, TENANT, 'ops_manager', 'Deploy publisher');
const editor = await provision(`deploysh-ed-${marker}@alpha.example`, `De-${randomUUID()}`, TENANT, 'sop_editor', 'Deploy editor');

// ---- CDP browser ----
const CDP_PORT = 9333;
const userDataDir = resolve(process.env.TEMP ?? '.', `sop-deploy-${randomUUID().slice(0, 8)}`);
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => browser.kill());
const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const p = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
  if (p) break;
  await sleep(400);
}
const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
const failedReqs = [];
const reqUrls = new Map();
socket.addEventListener('message', (event) => {
  const m = JSON.parse(event.data);
  if (m.id !== undefined && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? 'exception');
  if (m.method === 'Network.requestWillBeSent') reqUrls.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed') failedReqs.push(`${m.params.errorText} <${reqUrls.get(m.params.requestId) ?? m.params.requestId}>`);
});
function send(method, params = {}, sessionId) {
  nextId += 1; const id = nextId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'eval failed');
  return r.result.value;
};
const waitForCondition = async (expression, label, timeoutMs = 60_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { if (await evaluate(`Boolean(${expression})`)) return true; await sleep(500); }
  process.stderr.write(`    timed out waiting for ${label}\n`); return false;
};

// ---- 1. signed-out stranger ----
await send('Page.navigate', { url: TARGET }, sessionId);
check('public URL opens with the sign-in form', await waitForCondition(`document.querySelector('input[name="email"]')`, 'sign-in form'));
check('stranger sees no query box', (await evaluate(`document.querySelector('textarea') === null`)) === true);

// ---- 2. wrong password ----
await evaluate(`(() => { const set = (s, v) => { const i = document.querySelector(s); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; d.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('input[name="email"]', ${JSON.stringify(DEMO_EMAIL)}); set('input[name="password"]', 'wrong-password'); document.querySelector('form').requestSubmit(); return true; })()`);
check('wrong password is refused', await waitForCondition(`document.querySelector('[role="alert"]')`, 'refusal'));
check('stranger stays signed out', (await evaluate(`document.querySelector('[data-testid="session-bar"]') === null`)) === true);

// ---- 3. demo sign-in ----
await evaluate(`(() => { const i = document.querySelector('input[name="password"]'); const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; d.call(i, ${JSON.stringify(DEMO_PASSWORD)}); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); return true; })()`);
check('demo password signs in', await waitForCondition(`document.querySelector('[data-testid="session-bar"]')`, 'session bar', 60_000));
const tenantText = await evaluate(`document.querySelector('[data-testid="session-tenant"]')?.textContent ?? ''`);
const roleText = await evaluate(`document.querySelector('[data-testid="session-role"]')?.textContent ?? ''`);
check('server-reported tenant on screen', tenantText.includes(TENANT), tenantText.trim());
check('server-reported role is agent', roleText.trim() === 'agent', roleText.trim());

// ---- 4. activate: fresh device has no bundle ----
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Load model and build index')?.click()`);
const settled = await waitForCondition(`(() => { const t = document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''; return t !== '' && !t.includes('not loaded yet'); })()`, 'bundle state to settle', 300_000);
check('app reports its bundle state', settled);
const before = await evaluate(`document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''`);
check('fresh device is told no bundle is serving', before.includes('No bundle is serving'), before.trim());

// ---- 5. author + publish from Node, retry in browser ----
const procA = `Deployed refund ${marker}`;
const procB = `Deployed scheduling ${marker}`;
for (const [title, summary, reply, kw] of [
  [procA, 'Refunds are issued within fourteen days of purchase, no questions asked, straight to the original payment method.', 'You can get a refund within fourteen days of purchase.', ['refund']],
  [procB, 'Going live works best between six and nine in the evening when the audience peaks and the connection is steadiest.', 'Try going live between six and nine in the evening.', ['live']],
]) {
  const r = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, { method: 'POST', headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, status: 'published', category: 'probe', summary, suggestedReply: reply, escalationRequired: false, triggerKeywords: kw }) });
  if (!r.ok) throw new Error(`author ${title}: ${await r.text()}`);
}
let pubRes = await fetch(`${supabaseUrl}/functions/v1/publish-bundle`, { method: 'POST', headers: { Authorization: `Bearer ${publisher.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
let pubBody = await pubRes.json();
const unreadable = /procedure "([^"]+)" has a body this server did not write/.exec(pubBody?.error ?? '');
if (!pubRes.ok && unreadable) {
  const list = await (await fetch(`${supabaseUrl}/rest/v1/sops?select=id,title&title=eq.${encodeURIComponent(unreadable[1])}`, { headers: adminH })).json();
  const row = (Array.isArray(list) ? list : [])[0];
  if (row) {
    await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, { method: 'POST', headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sopId: row.id, title: row.title, status: 'retired', category: 'probe', summary: 'retired by deploy harness', suggestedReply: '-', escalationRequired: false, triggerKeywords: [] }) });
    pubRes = await fetch(`${supabaseUrl}/functions/v1/publish-bundle`, { method: 'POST', headers: { Authorization: `Bearer ${publisher.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    pubBody = await pubRes.json();
  }
}
check('bundle published through the edge function', pubRes.ok, pubRes.ok ? `bundle ${pubBody.bundleVersion}, ${pubBody.sopCount} procedures` : pubBody.error);
await evaluate(`[...document.querySelectorAll('button')].find((b) => /Retry model load|Load model and build index/.test(b.textContent.trim()))?.click()`);
check('app serves the published bundle', await waitForCondition(`(() => { const t = document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''; return t.includes('Serving bundle'); })()`, 'serving state', 300_000));
const servedText = await evaluate(`document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''`);
const servedCount = Number(/(\d+)\s+procedure\(s\)/.exec(servedText)?.[1] ?? 'NaN');
check('served count matches the server', servedCount === pubBody.sopCount, `${servedText.trim()} (server: ${pubBody.sopCount})`);

// ---- 6. one supported query (only once the index is ready, not merely the bundle) ----
check('index is ready to ask', await waitForCondition(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Find Answer')`, 'Find Answer button', 300_000));
const question = `When will I get my refund for my purchase ${marker}`;
await evaluate(`(() => { const i = document.querySelector('textarea[placeholder^="Paste the customer"]'); const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; d.call(i, ${JSON.stringify(question)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Find Answer')?.click()`);
const decided = await waitForCondition(`[...document.querySelectorAll('h2,h3')].some((h) => /Matched Procedure|Escalated to a human/.test(h.textContent))`, 'a decision', 180_000);
check('query produces an answer or an escalation', decided);
const isAnswer = await evaluate(`[...document.querySelectorAll('h2')].some((h) => /Matched Procedure/.test(h.textContent))`);
process.stdout.write(`  info  outcome: ${isAnswer ? 'safe answer' : 'content-free escalation'}\n`);
if (!isAnswer) {
  const refusal = await evaluate(`document.body.innerText`);
  check('escalation carries no procedure text', !refusal.includes('fourteen days') && !refusal.includes('six and nine'), refusal.slice(0, 80));
}

// ---- 7. hosted record ----
let landed = false;
for (let i = 0; i < 24 && !landed; i += 1) {
  if (!isAnswer) {
    const r = await fetch(`${supabaseUrl}/rest/v1/escalations?select=id&evidence->>queryText=eq.${encodeURIComponent(question)}`, { headers: adminH });
    const rows = await r.json();
    landed = Array.isArray(rows) && rows.length > 0;
  } else {
    const r = await fetch(`${supabaseUrl}/rest/v1/telemetry_events?select=id&occurred_at=gte.${encodeURIComponent(RUN_START)}&payload->>outcome=eq.answered`, { headers: adminH });
    const rows = await r.json();
    landed = Array.isArray(rows) && rows.length > 0;
  }
  if (!landed) await sleep(2500);
}
check(isAnswer ? 'answered telemetry reached the hosted runtime' : 'escalation reached the hosted runtime', landed);

// ---- 8. sign out, console, timestamp ----
// The global-logout request aborts in headless Chrome during the transition;
// what matters is proven, not assumed: the pre-sign-out refresh token must be
// dead afterwards.
const oldRefresh = await evaluate(`(() => { for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && /sb-.*-auth-token/.test(k)) { try { return JSON.parse(localStorage.getItem(k)).refresh_token ?? ''; } catch { return ''; } } } return ''; })()`);
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sign out')?.click()`);
check('sign-out returns to the form', await waitForCondition(`document.querySelector('input[name="email"]')`, 'form return'));
check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 200));
process.stdout.write(`  info  failed requests observed: ${failedReqs.length > 0 ? failedReqs.join(' | ').slice(0, 300) : 'none'}\n`);
if (oldRefresh !== '') {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const rq = createRequire(resolve(root, 'apps/web/package.json'));
  const { createClient } = await import(pathToFileURL(rq.resolve('@supabase/supabase-js')).href);
  const probe = createClient(supabaseUrl, pub, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: refreshErr } = await probe.auth.refreshSession({ refresh_token: oldRefresh });
  check('pre-sign-out refresh token is dead afterwards', refreshErr !== null, refreshErr ? 'revoked on the server' : 'STILL USABLE — global logout did not revoke it');
} else {
  check('pre-sign-out refresh token is dead afterwards', false, 'no token found in page storage to test');
}
process.stdout.write(`  info  timestamp: ${new Date().toISOString()}\n`);

const passed = checks.filter((c) => c.ok).length;
process.stdout.write(`\n${passed} of ${checks.length} checks passed\n${passed === checks.length ? 'DEPLOYED STRANGER PATH OK' : 'DEPLOYED STRANGER PATH FAILED'}\n`);
browser.kill();
process.exit(passed === checks.length ? 0 : 1);
