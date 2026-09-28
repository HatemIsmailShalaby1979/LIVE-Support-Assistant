#!/usr/bin/env node
/**
 * Run the approved simulated batch through the deployed app and isolated,
 * explicitly tagged Supabase tenants. This is deployed-path validation against
 * the development Supabase project, not a production-readiness claim.
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from
 * the environment or the repository .env.local. It never prints credentials.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'tooling/eval/simulated-tenant');
const target = process.env.TARGET_URL ?? 'https://dist-omega-black-31.vercel.app/';
const targetUrl = new URL(target);
const allowedTarget = 'dist-omega-black-31.vercel.app';
if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== allowedTarget || targetUrl.pathname !== '/') {
  throw new Error(`refusing unapproved deployed target: ${targetUrl.origin}${targetUrl.pathname}`);
}

function readEnvFile() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const fileEnv = readEnvFile();
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';
const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
if (projectRef !== 'lxlokqtowvaesxjishqz') {
  throw new Error(`refusing to write outside the approved development Supabase project (${projectRef})`);
}
if (publishableKey === '' || secretKey === '') {
  throw new Error('need SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY');
}

const batchPath = resolve(dataDir, 'chaos-500.json');
const corpusPath = resolve(dataDir, 'corpus.json');
const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
if (
  batch.data_mode !== 'simulated' ||
  batch.ticketCount !== 500 ||
  batch.chaosRateConfigured !== 0.15 ||
  batch.tickets?.length !== 500 ||
  batch.tickets.some((ticket) => ticket.data_mode !== 'simulated') ||
  corpus.data_mode !== 'simulated' ||
  corpus.sops?.some((sop) => sop.data_mode !== 'simulated')
) {
  throw new Error('refusing untagged or unapproved simulation inputs');
}

const ticketIdSelection = process.env.SIMULATION_TICKET_ID;
const ticketTypeSelection = process.env.SIMULATION_TICKET_TYPE;
const visibleBrowser = process.env.SIMULATION_VISIBLE === '1';
const pauseForRecording = process.env.SIMULATION_PAUSE_FOR_RECORDING === '1';
if (ticketIdSelection && ticketTypeSelection) {
  throw new Error('choose only one of SIMULATION_TICKET_ID or SIMULATION_TICKET_TYPE');
}
if (pauseForRecording && (!visibleBrowser || (!ticketIdSelection && !ticketTypeSelection))) {
  throw new Error('SIMULATION_PAUSE_FOR_RECORDING requires a visible browser and exactly one selected ticket');
}
let selectedTickets = batch.tickets;
if (ticketIdSelection) {
  selectedTickets = batch.tickets.filter((ticket) => ticket.ticketId === ticketIdSelection);
  if (selectedTickets.length !== 1) throw new Error('SIMULATION_TICKET_ID must name one ticket in the approved batch');
}
if (ticketTypeSelection) {
  const ticket = batch.tickets.find((candidate) =>
    candidate.isChaos && candidate.chaosMutation?.type === ticketTypeSelection,
  );
  if (ticket === undefined) throw new Error('SIMULATION_TICKET_TYPE must name a chaos type present in the approved batch');
  selectedTickets = [ticket];
}
const conflictTickets = selectedTickets.filter((ticket) =>
  (ticket.testEnvironment?.additionalSops?.length ?? 0) > 0,
);
const baseTickets = selectedTickets.filter((ticket) =>
  (ticket.testEnvironment?.additionalSops?.length ?? 0) === 0,
);
if (baseTickets.length + conflictTickets.length !== selectedTickets.length) {
  throw new Error('the simulated batch split did not preserve every selected record');
}

const runId = randomUUID().replaceAll('-', '').slice(0, 16);
const reportBase = `phase5-deployed-run-${runId}`;
const reportPath = resolve(dataDir, `${reportBase}.json`);
const markdownPath = resolve(dataDir, `${reportBase}.md`);
const minMargin = 0.17;
const runStartedAt = new Date().toISOString();
const modeTag = 'simulated';

async function waitForRecordingEnter(message) {
  process.stdout.write(`${message}\n`);
  await new Promise((resolveInput) => process.stdin.once('data', resolveInput));
}

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (chromePath === undefined) throw new Error('Chrome is required for deployed-path validation');

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};
const publishHeaders = {
  apikey: publishableKey,
  'Content-Type': 'application/json',
};

async function responseJson(response, label) {
  const text = await response.text();
  let value;
  try {
    value = text === '' ? null : JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    const detail = typeof value?.error === 'string' ? value.error : JSON.stringify(value);
    throw new Error(`${label} returned HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }
  return value;
}

async function adminRequest(path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${supabaseUrl}/${path}`, {
    method,
    headers: { ...adminHeaders, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return responseJson(response, `${method} ${path}`);
}

async function provisionPrincipal(tenantId, role, displayName, runSuffix) {
  const email = `simulated-${runId}-${runSuffix}@example.com`;
  const password = `Sim-${randomUUID()}`;
  const appMetadata = { tenant_id: tenantId, app_role: role, data_mode: modeTag, simulation_run_id: runId };
  const created = await adminRequest('auth/v1/admin/users', 'POST', {
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: { data_mode: modeTag, simulation_run_id: runId },
  });
  const userId = created.id;
  if (typeof userId !== 'string') throw new Error(`Auth did not return a user id for ${displayName}`);

  await adminRequest('rest/v1/users', 'POST', {
    id: userId,
    tenant_id: tenantId,
    display_name: `SIMULATED DATA — ${displayName} — ${runId}`,
    role,
  }, { Prefer: 'return=minimal' });

  const signedIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: publishHeaders,
    body: JSON.stringify({ email, password }),
  });
  const session = await responseJson(signedIn, `sign in simulated ${role}`);
  if (typeof session?.access_token !== 'string') {
    throw new Error(`Auth issued no access token for simulated ${role}`);
  }
  return { email, password, token: session.access_token, userId };
}

async function provisionTenant(label) {
  const tenantRows = await adminRequest('rest/v1/tenants?select=id', 'POST', {
    name: `SIMULATED DATA | WaveCast Creator Care | ${label} | run ${runId}`,
    min_margin: minMargin,
  }, { Prefer: 'return=representation' });
  const tenantId = tenantRows?.[0]?.id;
  if (typeof tenantId !== 'string') throw new Error(`could not create SIMULATED DATA tenant ${label}`);
  const publisher = await provisionPrincipal(tenantId, 'ops_manager', `${label} Publisher`, `${label}-publisher`);
  const agent = await provisionPrincipal(tenantId, 'agent', `${label} Agent`, `${label}-agent`);
  return { tenantId, publisher, agent, label };
}

async function authorSop(publisher, sop) {
  const response = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publisher.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: sop.title,
      status: 'published',
      category: sop.category,
      summary: sop.summary,
      suggestedReply: `${sop.suggestedReply}\n\n[data_mode: "simulated"]`,
      escalationRequired: sop.escalationRequired,
      escalationReason: sop.escalationReason,
      triggerKeywords: sop.triggerKeywords,
      changeNote: `data_mode: simulated; run_id=${runId}; test-only synthetic policy corpus`,
    }),
  });
  return responseJson(response, `author simulated procedure ${sop.id}`);
}

async function publishBundle(publisher) {
  const response = await fetch(`${supabaseUrl}/functions/v1/publish-bundle`, {
    method: 'POST',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publisher.token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return responseJson(response, 'publish simulated policy bundle');
}

async function waitForRegisteredDevice(tenant) {
  const query = new URLSearchParams({
    select: 'id,tenant_id,user_id,platform,status',
    tenant_id: `eq.${tenant.tenantId}`,
    user_id: `eq.${tenant.agent.userId}`,
    platform: 'eq.web',
    status: 'eq.active',
    limit: '2',
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rows = await adminRequest(`rest/v1/device_registrations?${query.toString()}`);
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) throw new Error(`simulated agent has multiple active web devices in ${tenant.label}`);
    await sleep(250);
  }
  throw new Error(`deployed app did not enroll the SIMULATED DATA agent device for ${tenant.label}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('could not obtain an ephemeral port');
  const { port } = address;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function classifyFailure(expected, actual) {
  if (actual.decision === expected.decision &&
      (actual.decision === 'escalate' || actual.sopId === expected.sopId)) return null;
  if (actual.decision === 'escalate') return 'false_escalation';
  if (expected.decision === 'escalate') return 'unsafe_answer_on_escalation_case';
  return 'wrong_sop_answer';
}

async function runBrowserTenant(tenant, tickets, sops, conflictSop) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), `sop-simulated-deployed-${runId}-`));
  const browserArgs = [
    ...(visibleBrowser ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ];
  const browser = spawn(chromePath, [
    ...browserArgs,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let socket;
  let targetId;
  let sessionId;
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const instrumentedEvents = [];
  const instrumentedEscalations = [];
  let taggingPreflightPassed = false;

  const until = Date.now() + 60_000;
  let debuggerVersion;
  while (Date.now() < until) {
    debuggerVersion = await fetch(`http://127.0.0.1:${port}/json/version`)
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    if (debuggerVersion !== null) break;
    if (browser.exitCode !== null) throw new Error(`Chrome exited before its debugger opened (${browser.exitCode})`);
    await sleep(250);
  }
  if (debuggerVersion === null || debuggerVersion === undefined) {
    browser.kill();
    throw new Error('Chrome did not open its debugging endpoint');
  }

  try {
    socket = new WebSocket(debuggerVersion.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });

    function send(method, params = {}, currentSessionId = sessionId) {
      const id = ++nextId;
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolveCall, rejectCall });
        socket.send(JSON.stringify({
          id,
          method,
          params,
          ...(currentSessionId ? { sessionId: currentSessionId } : {}),
        }));
      });
    }

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && pending.has(message.id)) {
        const operation = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) operation.rejectCall(new Error(message.error.message));
        else operation.resolveCall(message.result);
        return;
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push(details.exception?.description ?? details.text ?? 'browser exception');
      }
    });

    const createdTarget = await send('Target.createTarget', { url: 'about:blank' }, undefined);
    targetId = createdTarget.targetId;
    const attached = await send('Target.attachToTarget', { targetId, flatten: true }, undefined);
    sessionId = attached.sessionId;
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    const tagScript = `(() => {
      const runId = ${JSON.stringify(runId)};
      const marker = ${JSON.stringify(modeTag)};
      const nativeFetch = window.fetch.bind(window);
      window.__SIMULATION_CURRENT_TICKET_ID__ = 'SIMULATED-INSTRUMENTATION-PREFLIGHT';
      window.__SIMULATION_FETCH_AUDIT__ = [];
      window.__SIMULATION_FETCH_ERRORS__ = [];
      window.__SIMULATION_DECISION_TIMES__ = [];
      window.__SIMULATION_PENDING_DECISION__ = null;
      window.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        const event = url.pathname.endsWith('/rest/v1/rpc/ingest_telemetry_event');
        const escalation = url.pathname.endsWith('/rest/v1/rpc/ingest_escalation');
        if (!event && !escalation) return nativeFetch(input, init);
        const key = event ? 'p_payload' : 'p_evidence';
        try {
          let bodyText = init.body;
          if (typeof bodyText !== 'string' && input instanceof Request) {
            bodyText = await input.clone().text();
          }
          const body = JSON.parse(typeof bodyText === 'string' ? bodyText : '');
          if (body[key] === null || typeof body[key] !== 'object' || Array.isArray(body[key])) {
            throw new Error(key + ' must be an object');
          }
          const ticketId = window.__SIMULATION_CURRENT_TICKET_ID__;
          body[key].data_mode = marker;
          body[key].simulation_run_id = runId;
          body[key].simulated_ticket_id = ticketId;
          window.__SIMULATION_FETCH_AUDIT__.push({
            endpoint: event ? 'event' : 'escalation',
            id: event ? body.p_id : body.p_escalation_id,
            data_mode: body[key].data_mode,
            simulation_run_id: body[key].simulation_run_id,
            simulated_ticket_id: body[key].simulated_ticket_id
          });
          return nativeFetch(input, { ...init, body: JSON.stringify(body) });
        } catch (error) {
          window.__SIMULATION_FETCH_ERRORS__.push(String(error));
          return Promise.reject(error);
        }
      };
      document.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (button?.textContent?.trim() === 'Find Answer') {
          window.__SIMULATION_PENDING_DECISION__ = {
            ticketId: window.__SIMULATION_CURRENT_TICKET_ID__,
            startedAt: performance.now()
          };
        }
      }, true);
      new MutationObserver(() => {
        const pending = window.__SIMULATION_PENDING_DECISION__;
        if (pending === null) return;
        const hasDecision = [...document.querySelectorAll('h2,h3')]
          .some((heading) => /Matched Procedure|Escalated to a human/.test(heading.textContent ?? ''));
        const ready = [...document.querySelectorAll('button')]
          .some((button) => button.textContent.trim() === 'Find Answer');
        if (hasDecision && ready) {
          window.__SIMULATION_DECISION_TIMES__.push({
            ticketId: pending.ticketId,
            latencyMs: performance.now() - pending.startedAt
          });
          window.__SIMULATION_PENDING_DECISION__ = null;
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    })();`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: tagScript });

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    }

    async function waitFor(expression, label, timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const ready = await evaluate(`Boolean(${expression})`).catch(() => false);
        if (ready) return true;
        await sleep(250);
      }
      throw new Error(`timed out waiting for ${label}`);
    }

    await send('Page.navigate', { url: target });
    await waitFor(`document.querySelector('input[name="email"]')`, 'sign-in page');
    await evaluate(`(() => {
      const tag = document.createElement('aside');
      tag.textContent = 'data_mode: "simulated" — isolated WaveCast evaluation; no customer data';
      tag.setAttribute('data-testid', 'simulation-banner');
      tag.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;border-radius:4px;padding:6px 10px;font:12px monospace';
      document.body.append(tag);
      const set = (selector, value) => {
        const element = document.querySelector(selector);
        const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('input[name="email"]', ${JSON.stringify(tenant.agent.email)});
      set('input[name="password"]', ${JSON.stringify(tenant.agent.password)});
      document.querySelector('form').requestSubmit();
    })()`);
    const banner = await evaluate(`document.querySelector('[data-testid="simulation-banner"]')?.textContent ?? ''`);
    if (!banner.includes('data_mode: "simulated"')) {
      throw new Error('the deployed browser view did not visibly label the exercise as simulated');
    }
    await waitFor(`document.querySelector('[data-testid="session-bar"]')`, 'simulated agent sign-in');
    const tenantText = await evaluate(`document.querySelector('[data-testid="session-tenant"]')?.textContent ?? ''`);
    if (!tenantText.includes(tenant.tenantId)) throw new Error('signed-in app did not report the isolated simulated tenant');

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Load model and build index');
      button?.click();
    })()`);
    await waitFor(`(document.querySelector('[data-testid="bundle-state"]')?.textContent ?? '').includes('No bundle is serving')`, 'initial no-bundle state');
    const registeredDevice = await waitForRegisteredDevice(tenant);

    const requestProbe = await evaluate(`Promise.all([
      fetch(${JSON.stringify(`${supabaseUrl}/rest/v1/rpc/ingest_telemetry_event`)}, {
        method: 'POST',
        headers: {
          apikey: ${JSON.stringify(publishableKey)},
          authorization: 'Bearer invalid-test-token',
          'content-type': 'application/json',
          'content-profile': 'app'
        },
        body: JSON.stringify({ p_payload: {} })
      }).then((response) => response.ok).catch(() => false),
      fetch(${JSON.stringify(`${supabaseUrl}/rest/v1/rpc/ingest_escalation`)}, {
        method: 'POST',
        headers: {
          apikey: ${JSON.stringify(publishableKey)},
          authorization: 'Bearer invalid-test-token',
          'content-type': 'application/json',
          'content-profile': 'app'
        },
        body: JSON.stringify({ p_evidence: {} })
      }).then((response) => response.ok).catch(() => false)
    ])`);
    const preflightAudit = await evaluate(`window.__SIMULATION_FETCH_AUDIT__ ?? []`);
    const preflightErrors = await evaluate(`window.__SIMULATION_FETCH_ERRORS__ ?? []`);
    taggingPreflightPassed =
      requestProbe?.every((success) => success === false) &&
      preflightAudit.length === 2 &&
      preflightAudit.every((entry) =>
        entry.data_mode === 'simulated' &&
        entry.simulation_run_id === runId &&
        entry.simulated_ticket_id === 'SIMULATED-INSTRUMENTATION-PREFLIGHT') &&
      preflightErrors.length === 0;
    if (!taggingPreflightPassed) {
      throw new Error(
        `simulation tagging preflight failed before any ticket write: ` +
        `responses=${JSON.stringify(requestProbe)}, audit=${preflightAudit.length}, ` +
        `errors=${preflightErrors.join(' | ')}`,
      );
    }

    for (const sop of sops) await authorSop(tenant.publisher, sop);
    if (conflictSop !== null) await authorSop(tenant.publisher, conflictSop);
    const published = await publishBundle(tenant.publisher);
    const expectedSopCount = sops.length + (conflictSop === null ? 0 : 1);
    if (published.sopCount !== expectedSopCount) {
      throw new Error(`published corpus count mismatch: expected ${expectedSopCount}, received ${published.sopCount}`);
    }

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Retry model load');
      button?.click();
    })()`);
    await waitFor(`(document.querySelector('[data-testid="bundle-state"]')?.textContent ?? '').includes('Serving bundle')`, 'published simulated bundle', 300_000);
    await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Find Answer')`, 'model and index ready', 300_000);
    const servedCount = await evaluate(`Number(/(\\d+)\\s+procedure\\(s\\)/.exec(document.querySelector('[data-testid="bundle-state"]')?.textContent ?? '')?.[1] ?? 'NaN')`);
    if (servedCount !== expectedSopCount) throw new Error('deployed app served a different SOP count than the signed bundle');

    const focusedMarginControl = await evaluate(`(() => {
      const slider = document.querySelector('input[type="range"]');
      slider.focus();
      return document.activeElement === slider;
    })()`);
    if (!focusedMarginControl) throw new Error('could not focus the evaluation-only confidence margin control');
    const pressKey = async (key, code, windowsVirtualKeyCode) => {
      const params = { key, code, windowsVirtualKeyCode };
      await send('Input.dispatchKeyEvent', { ...params, type: 'keyDown' });
      await send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
    };
    await pressKey('Home', 'Home', 36);
    for (let step = 0; step < Math.round(minMargin / 0.01); step += 1) {
      await pressKey('ArrowUp', 'ArrowUp', 38);
    }
    const marginState = await evaluate(`(() => {
      const slider = document.querySelector('input[type="range"]');
      return {
        value: Number(slider.value),
        displayed: slider.previousElementSibling?.querySelector('.font-mono')?.textContent?.trim() ?? '',
      };
    })()`);
    if (marginState.value !== minMargin || marginState.displayed !== minMargin.toFixed(2)) {
      throw new Error(`evaluation-only confidence margin was not applied in React state (control=${marginState.value}, display=${marginState.displayed})`);
    }

    if (pauseForRecording && visibleBrowser) {
      await waitForRecordingEnter('SIMULATED DATA — browser is ready. Start the screen recorder, then press Enter to run the selected ticket.');
    }

    const titleToId = new Map(sops.map((sop) => [sop.title, sop.id]));
    if (conflictSop !== null) titleToId.set(conflictSop.title, conflictSop.id);
    const rows = [];
    const decisionLatencies = [];

    for (const [index, ticket] of tickets.entries()) {
      await evaluate(`window.__SIMULATION_CURRENT_TICKET_ID__ = ${JSON.stringify(ticket.ticketId)}`);
      await evaluate(`(() => {
        const input = document.querySelector('textarea[placeholder^="Paste the customer"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        const setAndNotify = (value) => {
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        if (input.value === ${JSON.stringify(ticket.message)}) {
          setAndNotify(${JSON.stringify(`${ticket.message} `)});
        }
        setAndNotify(${JSON.stringify(ticket.message)});
      })()`);
      await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Find Answer')?.click()`);

      await waitFor(`(
        [...document.querySelectorAll('h2,h3')].some((heading) => /Matched Procedure|Escalated to a human/.test(heading.textContent ?? '')) &&
        [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Find Answer') &&
        (window.__SIMULATION_DECISION_TIMES__ ?? []).some((timing) => timing.ticketId === ${JSON.stringify(ticket.ticketId)})
      )`, `decision for ${ticket.ticketId}`, 120_000);

      const actual = await evaluate(`(() => {
        const headings = [...document.querySelectorAll('h2,h3')];
        const matched = headings.find((heading) => heading.textContent.includes('Matched Procedure'));
        if (matched) {
          const panel = matched.parentElement?.parentElement;
          const title = panel?.querySelector('h3')?.textContent?.trim() ?? '';
          const reply = [...document.querySelectorAll('textarea')]
            .find((textarea) => !textarea.placeholder.startsWith('Paste the customer'))?.value ?? '';
          return { decision: 'answer', title, simulatedReplyTag: reply.includes('[data_mode: "simulated"]') };
        }
        const escalation = headings.find((heading) => heading.textContent.includes('Escalated to a human'));
        if (escalation) {
          const panel = escalation.parentElement;
          const reason = [...(panel?.querySelectorAll('p') ?? [])]
            .map((paragraph) => paragraph.textContent ?? '')
            .find((text) => text.startsWith('reason:'))
            ?.replace(/^reason:\\s*/, '') ?? 'unknown';
          return { decision: 'escalate', reason };
        }
        return null;
      })()`);
      if (actual === null) throw new Error(`deployed UI did not expose a disposition for ${ticket.ticketId}`);
      if (actual.decision === 'answer' && actual.simulatedReplyTag !== true) {
        throw new Error(`synthetic suggested reply was not visibly tagged for ${ticket.ticketId}`);
      }
      const latencyMs = await evaluate(`(window.__SIMULATION_DECISION_TIMES__ ?? []).find((timing) => timing.ticketId === ${JSON.stringify(ticket.ticketId)})?.latencyMs ?? NaN`);
      if (!Number.isFinite(latencyMs)) throw new Error(`deployed UI did not expose measured browser decision latency for ${ticket.ticketId}`);

      const expected = ticket.expected;
      const actualResult = actual.decision === 'answer'
        ? { decision: 'answer', sopId: titleToId.get(actual.title) ?? `unmapped:${actual.title}` }
        : { decision: 'escalate', reason: actual.reason };
      const correct = actualResult.decision === expected.decision &&
        (actualResult.decision === 'escalate' || actualResult.sopId === expected.sopId);
      rows.push({
        data_mode: modeTag,
        simulation_run_id: runId,
        tenant_label: tenant.label,
        ticket,
        expected,
        actual: actualResult,
        correct,
        failureCategory: classifyFailure(expected, actualResult),
        latencyMs,
      });
      decisionLatencies.push(latencyMs);

      await waitFor(`(
        document.querySelector('[data-testid="delivery"]')?.textContent.includes('Delivered') &&
        !document.querySelector('[data-testid="delivery"]')?.textContent.includes('still waiting')
      )`, `tagged telemetry delivery for ${ticket.ticketId}`, 30_000);
      const ticketAudit = await evaluate(`(window.__SIMULATION_FETCH_AUDIT__ ?? []).filter((entry) => entry.simulated_ticket_id === ${JSON.stringify(ticket.ticketId)})`);
      const tagErrors = await evaluate(`window.__SIMULATION_FETCH_ERRORS__ ?? []`);
      const eventAudit = ticketAudit.filter((entry) => entry.endpoint === 'event');
      const escalationAudit = ticketAudit.filter((entry) => entry.endpoint === 'escalation');
      const expectedEscalation = actualResult.decision === 'escalate';
      if (
        eventAudit.length < 1 ||
        (expectedEscalation && escalationAudit.length < 1) ||
        eventAudit.some((entry) => entry.data_mode !== modeTag || entry.simulation_run_id !== runId) ||
        escalationAudit.some((entry) => entry.data_mode !== modeTag || entry.simulation_run_id !== runId) ||
        tagErrors.length > 0
      ) {
        throw new Error(`tag audit failed for synthetic ticket ${ticket.ticketId}; stopping before the next ticket`);
      }
      for (const entry of eventAudit) {
        instrumentedEvents.push({
          data_mode: modeTag,
          simulation_run_id: runId,
          id: entry.id,
          ticketId: entry.simulated_ticket_id,
        });
      }
      for (const entry of escalationAudit) {
        instrumentedEscalations.push({
          data_mode: modeTag,
          simulation_run_id: runId,
          id: entry.id,
          ticketId: entry.simulated_ticket_id,
        });
      }
      if ((index + 1) % 25 === 0 || index + 1 === tickets.length) {
        process.stdout.write(`    SIMULATED DATA — ${tenant.label}: ${index + 1}/${tickets.length} tickets evaluated and delivered\n`);
      }
      await sleep(800);
    }

    const requestInstrumentationErrors = await evaluate(`window.__SIMULATION_FETCH_ERRORS__ ?? []`);
    if (requestInstrumentationErrors.length > 0) {
      throw new Error(`simulation request tagging errors in ${tenant.label}: ${requestInstrumentationErrors.join(' | ')}`);
    }
    if (errors.length > 0) throw new Error(`browser errors in ${tenant.label}: ${errors.slice(0, 3).join(' | ')}`);
    return {
      tenantId: tenant.tenantId,
      label: tenant.label,
      publishedBundleVersion: published.bundleVersion,
      procedures: expectedSopCount,
      deviceId: registeredDevice.id,
      agentUserId: tenant.agent.userId,
      confirmedMinMargin: marginState.value,
      tickets: rows,
      latencyMs: {
        mean: decisionLatencies.reduce((sum, value) => sum + value, 0) / decisionLatencies.length,
        median: percentile(decisionLatencies, 0.5),
        p95: percentile(decisionLatencies, 0.95),
        max: Math.max(...decisionLatencies),
      },
      instrumentedEvents: [...instrumentedEvents],
      instrumentedEscalations: [...instrumentedEscalations],
      consoleErrors: errors,
      requestInstrumentationErrors,
      simulationTaggingPreflightPassed: taggingPreflightPassed,
    };
  } finally {
    if (pauseForRecording && visibleBrowser) {
      await waitForRecordingEnter('SIMULATED DATA — the one-ticket result is visible. Stop the recorder, then press Enter to close the isolated browser.');
    }
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    browser.kill();
    await Promise.race([
      new Promise((resolveClose) => browser.once('close', resolveClose)),
      sleep(5000),
    ]);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      process.stderr.write(`Could not clear isolated Chrome profile: ${String(error)}\n`);
    }
  }
}

async function queryTaggedRows(table, tenantId, jsonColumn) {
  const query = new URLSearchParams({
    select: `id,${jsonColumn}`,
    tenant_id: `eq.${tenantId}`,
    [`${jsonColumn}->>simulation_run_id`]: `eq.${runId}`,
    limit: '1000',
  });
  return adminRequest(`rest/v1/${table}?${query.toString()}`);
}

async function queryTenantRows(table, tenantId, select) {
  const query = new URLSearchParams({
    select,
    tenant_id: `eq.${tenantId}`,
    limit: '1000',
  });
  return adminRequest(`rest/v1/${table}?${query.toString()}`);
}

function summarize(rows) {
  const failures = rows.filter((row) => !row.correct);
  const counts = {};
  for (const row of failures) counts[row.failureCategory] = (counts[row.failureCategory] ?? 0) + 1;
  return {
    tickets: rows.length,
    correct: rows.length - failures.length,
    accuracy: rows.length === 0 ? 0 : (rows.length - failures.length) / rows.length,
    failures: failures.length,
    failureRate: rows.length === 0 ? 0 : failures.length / rows.length,
    failureCategories: Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1])),
    falseEscalations: failures.filter((row) => row.failureCategory === 'false_escalation').length,
    unsafeAnswers: failures.filter((row) =>
      row.failureCategory === 'unsafe_answer_on_escalation_case' || row.failureCategory === 'wrong_sop_answer',
    ).length,
    runtimeErrors: 0,
  };
}

process.stdout.write(`SIMULATED DATA — deployed-path evaluation ${runId}; target ${targetUrl.origin}; backend project ${projectRef} (development).\n`);
process.stdout.write('SIMULATED DATA — verifying the isolated tag injection before any ticket write.\n');

const conflictSop = conflictTickets[0]?.testEnvironment?.additionalSops?.[0] ?? null;
if (conflictTickets.length > 0 && (conflictSop === null || conflictSop.data_mode !== modeTag)) {
  throw new Error('the tagged contradictory policy fixture is missing');
}
const baseTenant = baseTickets.length > 0 ? await provisionTenant('baseline') : null;
const conflictTenant = conflictTickets.length > 0 ? await provisionTenant('conflict-policy') : null;
const baseResult = baseTenant === null
  ? null
  : await runBrowserTenant(baseTenant, baseTickets, corpus.sops, null);
const conflictResult = conflictTenant === null
  ? null
  : await runBrowserTenant(conflictTenant, conflictTickets, corpus.sops, conflictSop);
const tenantResults = [baseResult, conflictResult].filter((result) => result !== null);
const allRows = tenantResults.flatMap((result) => result.tickets);
allRows.sort((left, right) => left.ticket.ticketId.localeCompare(right.ticket.ticketId));

const eventRows = (await Promise.all(tenantResults.map((result) =>
  queryTaggedRows('telemetry_events', result.tenantId, 'payload'),
))).flat();
const escalationRows = (await Promise.all(tenantResults.map((result) =>
  queryTaggedRows('escalations', result.tenantId, 'evidence'),
))).flat();
const sopVersionRows = (await Promise.all(tenantResults.map((result) =>
  queryTenantRows('sop_versions', result.tenantId, 'sop_id,change_note'),
))).flat();
const profileRows = (await Promise.all(tenantResults.map((result) =>
  queryTenantRows('users', result.tenantId, 'id,display_name'),
))).flat();
const tenantRows = (await Promise.all(tenantResults.map((result) => {
  const query = new URLSearchParams({ select: 'id,name', id: `eq.${result.tenantId}` });
  return adminRequest(`rest/v1/tenants?${query.toString()}`);
}))).flat();
const bundleRows = (await Promise.all(tenantResults.map((result) =>
  queryTenantRows('policy_bundles', result.tenantId, 'id,bundle_version'),
))).flat();
const deviceRows = (await Promise.all(tenantResults.map((result) =>
  queryTenantRows('device_registrations', result.tenantId, 'id,tenant_id,user_id,platform,status'),
))).flat();
const wrongEventTags = eventRows.filter((row) =>
  row.payload?.data_mode !== modeTag ||
  row.payload?.simulation_run_id !== runId ||
  typeof row.payload?.simulated_ticket_id !== 'string',
);
const wrongEscalationTags = escalationRows.filter((row) =>
  row.evidence?.data_mode !== modeTag ||
  row.evidence?.simulation_run_id !== runId ||
  typeof row.evidence?.simulated_ticket_id !== 'string',
);
const wrongSopTags = sopVersionRows.filter((row) =>
  typeof row.change_note !== 'string' ||
  !row.change_note.includes(`data_mode: simulated; run_id=${runId};`),
);
const wrongProfileTags = profileRows.filter((row) =>
  typeof row.display_name !== 'string' || !row.display_name.startsWith('SIMULATED DATA —'),
);
const wrongTenantTags = tenantRows.filter((row) =>
  typeof row.name !== 'string' || !row.name.startsWith('SIMULATED DATA | WaveCast Creator Care |'),
);
const wrongDevices = tenantResults.flatMap((result) => {
  const rows = deviceRows.filter((row) => row.tenant_id === result.tenantId);
  return rows.length === 1 &&
    rows[0].id === result.deviceId &&
    rows[0].user_id === result.agentUserId &&
    rows[0].platform === 'web' &&
    rows[0].status === 'active'
    ? []
    : [{ tenantId: result.tenantId, count: rows.length }];
});
const expectedEscalations = allRows.filter((row) => row.actual.decision === 'escalate').length;
const expectedProcedures = tenantResults.reduce((total, result) => total + result.procedures, 0);
const expectedTicketIds = new Set(allRows.map((row) => row.ticket.ticketId));
const expectedEscalationTicketIds = new Set(
  allRows.filter((row) => row.actual.decision === 'escalate').map((row) => row.ticket.ticketId),
);
const actualEventTicketIds = eventRows.map((row) => row.payload?.simulated_ticket_id);
const actualEscalationTicketIds = escalationRows.map((row) => row.evidence?.simulated_ticket_id);
if (eventRows.length !== selectedTickets.length) {
  throw new Error(`hosted tagged event count mismatch: expected ${selectedTickets.length}, got ${eventRows.length}`);
}
if (escalationRows.length !== expectedEscalations) {
  throw new Error(`hosted tagged escalation count mismatch: expected ${expectedEscalations}, got ${escalationRows.length}`);
}
if (wrongEventTags.length > 0 || wrongEscalationTags.length > 0) {
  throw new Error(`hosted data_mode audit failed: ${wrongEventTags.length} event(s), ${wrongEscalationTags.length} escalation(s) untagged`);
}
if (
  sopVersionRows.length !== expectedProcedures ||
  wrongSopTags.length > 0 ||
  profileRows.length !== tenantResults.length * 2 ||
  wrongProfileTags.length > 0 ||
  tenantRows.length !== tenantResults.length ||
  wrongTenantTags.length > 0 ||
  bundleRows.length !== tenantResults.length ||
  wrongDevices.length > 0
) {
  throw new Error('hosted simulated tenant, profile, SOP-version, or bundle tag audit failed');
}
if (
  new Set(actualEventTicketIds).size !== selectedTickets.length ||
  actualEventTicketIds.some((id) => !expectedTicketIds.has(id)) ||
  new Set(actualEscalationTicketIds).size !== expectedEscalations ||
  actualEscalationTicketIds.some((id) => !expectedEscalationTicketIds.has(id))
) {
  throw new Error('hosted tagged rows do not map one-to-one to the synthetic tickets and escalations');
}
if (allRows.length !== selectedTickets.length || allRows.some((row) => row.data_mode !== modeTag)) {
  throw new Error('evaluation report lost a ticket or its data_mode tag');
}

const aggregate = summarize(allRows);
const baseline = JSON.parse(readFileSync(resolve(dataDir, 'phase5-stability-margin-017.json'), 'utf8'));
const baselineByTicket = new Map(baseline.perTicket.map((row) => [row.ticket.ticketId, row]));
const deployedVsLocalMismatches = allRows.flatMap((row) => {
  const local = baselineByTicket.get(row.ticket.ticketId);
  if (local === undefined) return [{ ticketId: row.ticket.ticketId, issue: 'missing from local baseline' }];
  const sameDecision = local.actual.decision === row.actual.decision;
  const sameAnswer = local.actual.decision !== 'answer' || local.actual.sopId === row.actual.sopId;
  const sameEscalation = local.actual.decision !== 'escalate' || local.actual.reason === row.actual.reason;
  return sameDecision && sameAnswer && sameEscalation
    ? []
    : [{
        ticketId: row.ticket.ticketId,
        local: local.actual,
        deployed: row.actual,
      }];
});
const batchSha256 = createHash('sha256').update(readFileSync(batchPath)).digest('hex');
const corpusSha256 = createHash('sha256').update(readFileSync(corpusPath)).digest('hex');
const safetyCounterexamples = allRows
  .filter((row) => row.failureCategory === 'unsafe_answer_on_escalation_case' || row.failureCategory === 'wrong_sop_answer')
  .map((row) => {
    const payload = eventRows.find((event) => event.payload?.simulated_ticket_id === row.ticket.ticketId)?.payload;
    if (payload === undefined) throw new Error(`missing tagged gate evidence for unsafe synthetic ticket ${row.ticket.ticketId}`);
    return {
      data_mode: modeTag,
      ticketId: row.ticket.ticketId,
      score: payload.score,
      margin: payload.margin,
      minMargin: payload.minMargin,
      thresholdAccept: payload.thresholdAccept,
      outcome: payload.outcome,
      gateReason: payload.gateReason,
      topCandidates: payload.topCandidates,
    };
  });
const report = {
  data_mode: modeTag,
  simulation_run_id: runId,
  evaluation: 'Deployed public Vercel application path backed by the development Supabase project; not production customer validation.',
  target: targetUrl.origin,
  backendProject: projectRef,
  evaluatedAt: new Date().toISOString(),
  runStartedAt,
  sourceBatch: 'tooling/eval/simulated-tenant/chaos-500.json',
  sourceCorpus: 'tooling/eval/simulated-tenant/corpus.json',
  batchSha256,
  corpusSha256,
  batch: {
    tickets: selectedTickets.length,
    seed: batch.seed,
    chaosRateConfigured: batch.chaosRateConfigured,
    chaosRateActual: selectedTickets.length === 0 ? 0 : selectedTickets.filter((ticket) => ticket.isChaos).length / selectedTickets.length,
    chaosTickets: selectedTickets.filter((ticket) => ticket.isChaos).length,
    approvedBatchTickets: batch.ticketCount,
    selectedTicketIds: selectedTickets.map((ticket) => ticket.ticketId),
  },
  selection: {
    data_mode: modeTag,
    ticketId: ticketIdSelection ?? null,
    chaosType: ticketTypeSelection ?? null,
    visibleBrowser,
  },
  implementation: {
    path: 'deployed React app → tenant-signed encrypted policy bundle → pinned on-device MiniLM → Confidence Gate → Supabase ingest functions',
    thresholdAccept: 0,
    minMargin,
    baselineMinMargin: baseline.implementation.minMargin,
    browserMarginVerifiedForEveryTenant: tenantResults.every((result) => result.confirmedMinMargin === minMargin),
    latencyMeasurement: 'browser-side time from Find Answer click to rendered disposition and ready controls',
  },
  tenants: [
    ...tenantResults.map((result) => ({
      data_mode: modeTag,
      id: result.tenantId,
      label: result.label,
      procedures: result.procedures,
    })),
  ],
  hostedDataAudit: {
    data_mode: modeTag,
    taggedQueryEvents: eventRows.length,
    taggedEscalations: escalationRows.length,
    taggedSopVersions: sopVersionRows.length - wrongSopTags.length,
    taggedAgentProfiles: profileRows.length - wrongProfileTags.length,
    taggedTenants: tenantRows.length - wrongTenantTags.length,
    tenantScopedBundles: bundleRows.length,
    untaggedQueryEvents: wrongEventTags.length,
    untaggedEscalations: wrongEscalationTags.length,
    untaggedSopVersions: wrongSopTags.length,
    untaggedAgentProfiles: wrongProfileTags.length,
    untaggedTenants: wrongTenantTags.length,
    taggingPreflight: tenantResults.every((result) => result.simulationTaggingPreflightPassed),
    enrolledSimulatedAgentDevices: deviceRows.length - wrongDevices.length,
  },
  totals: {
    ...aggregate,
    latencyMs: {
      mean: allRows.reduce((sum, row) => sum + row.latencyMs, 0) / allRows.length,
      median: percentile(allRows.map((row) => row.latencyMs), 0.5),
      p95: percentile(allRows.map((row) => row.latencyMs), 0.95),
      max: Math.max(...allRows.map((row) => row.latencyMs)),
    },
  },
  safetyCounterexamples,
  comparison: {
    sameBatch: selectedTickets.length === batch.ticketCount,
    sameInputBatchSha256AsBaseline: batchSha256 === baseline.batchSha256,
    sameCorpusSha256AsBaseline: corpusSha256 === baseline.corpusSha256,
    identicalPerTicketDecisionsToLocalBaseline: deployedVsLocalMismatches.length === 0,
    decisionMismatchesVsLocalBaseline: deployedVsLocalMismatches,
    localBaseline: {
      accuracy: baseline.totals.accuracy,
      failures: baseline.totals.failures,
      failureRate: baseline.totals.failureRate,
      falseEscalations: baseline.totals.falseEscalations,
      unsafeAnswers: baseline.totals.unsafeAnswers,
      minMargin: baseline.implementation.minMargin,
    },
  },
  browser: {
    consoleErrors: tenantResults.flatMap((result) => result.consoleErrors),
    requestInstrumentationErrors: tenantResults.flatMap((result) => result.requestInstrumentationErrors),
  },
  perTicket: allRows,
  topFailures: [...allRows.filter((row) => !row.correct)]
    .sort((left, right) => {
      const rank = (row) => row.failureCategory === 'runtime_error' ? 0
        : row.failureCategory === 'unsafe_answer_on_escalation_case' ? 1
          : row.failureCategory === 'wrong_sop_answer' ? 2 : 3;
      return rank(left) - rank(right) || right.latencyMs - left.latencyMs;
    })
    .slice(0, 10),
};

report.failureRateIsLowOrStable = false;
report.limitations = [
  'This is a deployed-path validation using the public static Vercel app and the development Supabase project, not a real production customer deployment.',
  'Both isolated tenants, users, synthetic SOPs, query telemetry, and escalation evidence remain in the development database and are visibly tagged data_mode: simulated.',
  'The batch uses the approved template-based synthetic messages; the holdout is another seed from the same generator, not independently authored customer language.',
  'The 0.17 margin is a test-only browser control. The shipped default remains 0.18; at 0.16 the approved batch produced two unsafe answers.',
  'The low-failure stopping criterion remains unmet. All outcome labels derive from synthetic batch expectations, not human-annotated outcomes.',
];

const reportBody = JSON.stringify(report, null, 2);
writeFileSync(reportPath, `${reportBody}\n`);
const markdown = [
  `# ${reportBase} — SIMULATED DATA deployed-path evaluation`,
  '',
  `**data_mode: "simulated" throughout.** The ${report.totals.tickets} WaveCast Creator Care ticket(s), their expected decisions, and isolated policy tenant(s) are fictional evaluation data.`,
  '',
  `This ran through the public app at ${report.target}, backed by Supabase project ${projectRef}, which is the development database. It is deployed-path evidence, not production customer or adoption evidence.`,
  '',
  `Batch: seed ${batch.seed}, ${selectedTickets.length} evaluated from the approved 500-ticket batch (${report.batch.chaosTickets} flagged in this selection); SHA-256 \`${report.batchSha256}\`.`,
  `Corpus SHA-256: \`${report.corpusSha256}\`. Evaluation-only margin: ${minMargin.toFixed(2)}; shipped default: 0.18.`,
  '',
  `Decision accuracy: **${(aggregate.accuracy * 100).toFixed(1)}%** (${aggregate.correct}/${aggregate.tickets}); failure rate: **${(aggregate.failureRate * 100).toFixed(1)}%** (${aggregate.failures}/${aggregate.tickets}).`,
  `False escalations: ${aggregate.falseEscalations}; unsafe/wrong-SOP answers: ${aggregate.unsafeAnswers}; runtime errors: ${aggregate.runtimeErrors}.`,
  safetyCounterexamples.length === 0
    ? 'Unsafe-answer gate evidence: none in this selection.'
    : `Unsafe-answer gate evidence: ${safetyCounterexamples.map((item) => `${item.ticketId} had margin ${Number(item.margin).toFixed(9)} against applied minMargin ${Number(item.minMargin).toFixed(2)}.`).join(' ')}`,
  `Browser click-to-render latency: mean ${report.totals.latencyMs.mean.toFixed(2)} ms; median ${report.totals.latencyMs.median.toFixed(2)} ms; p95 ${report.totals.latencyMs.p95.toFixed(2)} ms; max ${report.totals.latencyMs.max.toFixed(2)} ms.`,
  '',
  `Hosted tag audit: ${eventRows.length}/${selectedTickets.length} query events, ${escalationRows.length}/${expectedEscalations} escalations, ${sopVersionRows.length} SOP versions, ${profileRows.length} user profiles, and ${deviceRows.length} enrolled web devices are scoped to SIMULATED DATA tenants; untagged rows: ${wrongEventTags.length + wrongEscalationTags.length + wrongSopTags.length + wrongProfileTags.length + wrongTenantTags.length}.`,
  '',
  `Local comparison at margin ${baseline.implementation.minMargin.toFixed(2)}: batch input hash ${report.comparison.sameInputBatchSha256AsBaseline ? 'matches' : 'DIFFERS'}, corpus hash ${report.comparison.sameCorpusSha256AsBaseline ? 'matches' : 'DIFFERS'}, selected per-ticket outcomes ${deployedVsLocalMismatches.length === 0 ? 'identical' : `differ on ${deployedVsLocalMismatches.length} ticket(s)`}.`,
  '',
  `Local same-batch baseline at margin ${baseline.implementation.minMargin.toFixed(2)}: ${(baseline.totals.accuracy * 100).toFixed(1)}% (${baseline.totals.correct}/500), ${baseline.totals.failures} failures, ${baseline.totals.unsafeAnswers} unsafe answers. This deployed path is a separate environment comparison, not a paired app-code fix.`,
  '',
  '## Failure categories',
  '',
  ...Object.entries(aggregate.failureCategories).map(([category, count]) => `- ${category}: ${count}`),
  ...(Object.keys(aggregate.failureCategories).length === 0 ? ['- None.'] : []),
  '',
  '## Worst failures (all text below is synthetic)',
  '',
  ...(report.topFailures.length === 0 ? ['No failed tickets.'] : report.topFailures.flatMap((row, index) => [
    `### ${index + 1}. ${row.ticket.ticketId} — ${row.failureCategory}`,
    '',
    '**data_mode: "simulated"**',
    `- Expected: ${row.expected.decision}${row.expected.sopId ? ` (${row.expected.sopId})` : ''}`,
    `- Actual: ${row.actual.decision}${row.actual.sopId ? ` (${row.actual.sopId})` : ''}${row.actual.reason ? ` — ${row.actual.reason}` : ''}`,
    `- Message: ${row.ticket.message}`,
    '',
  ])),
  '## Interpretation',
  '',
  '**The low-failure criterion is not met.** This run measures the deployed UI, bundle, local model, gate, and tagged ingest path. It does not establish real-world correctness. There is no design partner, so no partner comparison was performed and none is claimed.',
  '',
  'All generated records remain isolated to the clearly named SIMULATED DATA tenants. No real tenant was used.',
].join('\n');
writeFileSync(markdownPath, `${markdown}\n`);
process.stdout.write(`${markdown}\n\nSaved ${reportPath} and ${markdownPath}\n`);
