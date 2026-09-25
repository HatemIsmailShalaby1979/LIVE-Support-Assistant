#!/usr/bin/env node
/**
 * Drive a real browser through a real sign-in.
 *
 * Typechecking a sign-in form proves it compiles. It does not prove a person can
 * use it, and for this slice that distinction is the whole point: until now every
 * authentication in this project happened inside a Node script, so nothing had
 * ever been signed into from a browser.
 *
 * Headless Chrome over the DevTools Protocol — no Puppeteer, no Playwright, and no
 * new dependency. Node's built-in WebSocket is enough, which matters because the
 * alternative was adding a browser-automation package to a workspace whose
 * dependency gate currently has 36 advisories and no appetite for more.
 *
 * What it proves:
 *
 *   1. The app boots, and an unauthenticated visitor is shown the sign-in form
 *      rather than a search box they cannot use.
 *   2. A wrong password is refused, and the page stays signed out.
 *   3. The right password signs in, and the tenant and role the *server* reports
 *      are the ones on screen.
 *   4. Signing out returns the visitor to the form.
 *
 * Usage:
 *   node tooling/browser/verify-signin.mjs
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const DEV_PORT = 5199;
const CDP_PORT = 9222;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const fileEnv = { ...readEnvFile(resolve(root, '.env.local')) };
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';

const supabaseUrl = env('SUPABASE_URL');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');

if (supabaseUrl === '' || publishableKey === '' || secretKey === '') {
  process.stderr.write('need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY\n');
  process.exit(2);
}

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (chrome === undefined) {
  process.stderr.write('no Chrome installation found; cannot verify the browser path\n');
  process.exit(2);
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

// ------------------------------------------------------------ a test principal --

const TEST_EMAIL = 'signin-verification@alpha.example';
const TEST_PASSWORD = `Sv-${randomUUID()}`;
const TENANT = '11111111-1111-1111-1111-111111111111';

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

const list = await (await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })).json();
const existing = (list?.users ?? []).find((user) => user?.email === TEST_EMAIL);
let userId = existing?.id ?? null;

const metadata = { tenant_id: TENANT, app_role: 'agent' };

if (existing) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ email_confirm: true, password: TEST_PASSWORD, app_metadata: metadata }),
  });
} else {
  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: metadata,
    }),
  });
  if (!created.ok) {
    process.stderr.write(`could not provision the sign-in principal: ${await created.text()}\n`);
    process.exit(1);
  }
  userId = (await created.json()).id;
}

await fetch(`${supabaseUrl}/rest/v1/users`, {
  method: 'POST',
  headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({
    id: userId,
    tenant_id: TENANT,
    display_name: 'Sign-in Verification',
    role: 'agent',
  }),
});

// ------------------------------------------------------------------- the browser --

process.stdout.write('==> starting the dev server\n');

const server = spawn(
  'node',
  [
    resolve(root, 'apps/web/node_modules/vite/bin/vite.js'),
    '--port',
    String(DEV_PORT),
    // Explicit, because Vite binds to `localhost`, which resolves to ::1 first on
    // Windows — and a 127.0.0.1 probe then never reaches a server that is plainly
    // up, which reads as "the dev server never came up".
    '--host',
    '127.0.0.1',
    '--strictPort',
  ],
  {
    cwd: resolve(root, 'apps/web'),
    env: {
      ...process.env,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => (serverLog += chunk.toString()));
server.stderr.on('data', (chunk) => (serverLog += chunk.toString()));

process.stdout.write('==> launching headless Chrome\n');

const userDataDir = resolve(process.env.TEMP ?? '.', `sop-cdp-${randomUUID().slice(0, 8)}`);
const browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

function cleanup() {
  browser.kill();
  server.kill();
}

process.on('exit', cleanup);

try {
  // Wait for both to be listening. Polled rather than parsed: a dev server's
  // output format is not a contract, and a listening port is.
  const deadline = Date.now() + 90_000;
  let devUp = false;
  let cdpUp = false;

  while (Date.now() < deadline && (!devUp || !cdpUp)) {
    if (!devUp) {
      try {
        execFileSync('netstat', ['-an'], { stdio: 'pipe' });
        const probe = await fetch(`http://127.0.0.1:${DEV_PORT}/`).catch(() => null);
        devUp = probe !== null;
      } catch {
        devUp = false;
      }
    }
    if (!cdpUp) {
      const probe = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
      cdpUp = probe !== null;
    }
    if (!devUp && !cdpUp) await sleep(400);
  }

  if (!devUp) throw new Error(`the dev server never came up:\n${serverLog.slice(-600)}`);
  if (!cdpUp) throw new Error('Chrome never opened its debugging port');

  const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolveCall, rejectCall } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCall(new Error(message.error.message));
      else resolveCall(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(message.params.exceptionDetails.text ?? 'exception');
    }
  });

  function send(method, params = {}, sessionId) {
    nextId += 1;
    const id = nextId;
    return new Promise((resolveCall, rejectCall) => {
      pending.set(id, { resolveCall, rejectCall });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const evaluate = async (expression) => {
    const result = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'evaluation failed');
    }
    return result.result.value;
  };

  const waitFor = async (expression, label, timeoutMs = 30_000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await evaluate(`Boolean(${expression})`)) return true;
      await sleep(250);
    }
    process.stderr.write(`    timed out waiting for ${label}\n`);
    return false;
  };

  // ---------------------------------------------------------------- 1. the gate --

  await send('Page.navigate', { url: `http://127.0.0.1:${DEV_PORT}/` }, sessionId);

  const formAppeared = await waitFor(
    `document.querySelector('input[name="email"]')`,
    'the sign-in form',
  );
  check('an unauthenticated visitor is shown the sign-in form', formAppeared);

  const noSearch = await evaluate(
    `document.querySelector('input[type="text"], textarea') === null`,
  );
  check('and is not shown a search box they cannot use', noSearch === true);

  // ------------------------------------------------------ 2. a wrong password --

  await evaluate(`
    (() => {
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('input[name="email"]', ${JSON.stringify(TEST_EMAIL)});
      set('input[name="password"]', 'definitely-not-the-password');
      document.querySelector('form').requestSubmit();
      return true;
    })()
  `);

  const refused = await waitFor(
    `document.querySelector('[role="alert"]')`,
    'the refusal message',
  );
  check('a wrong password is refused', refused);
  check(
    'and the visitor stays signed out',
    (await evaluate(`document.querySelector('[data-testid="session-bar"]') === null`)) === true,
  );

  // -------------------------------------------------------- 3. the right one --

  await evaluate(`
    (() => {
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('input[name="password"]', ${JSON.stringify(TEST_PASSWORD)});
      document.querySelector('form').requestSubmit();
      return true;
    })()
  `);

  const signedIn = await waitFor(
    `document.querySelector('[data-testid="session-bar"]')`,
    'the session bar',
  );
  check('the right password signs in', signedIn);

  const tenantText = await evaluate(
    `document.querySelector('[data-testid="session-tenant"]')?.textContent ?? ''`,
  );
  const roleText = await evaluate(
    `document.querySelector('[data-testid="session-role"]')?.textContent ?? ''`,
  );
  check(
    'the tenant on screen is the one the server reported',
    tenantText.includes(TENANT),
    tenantText.trim(),
  );
  check('and so is the role', roleText.trim() === 'agent', roleText.trim());

  // The app's own query box. Chosen because it is unambiguously the agent
  // surface: an earlier version waited for `button[type="submit"]`, which the app
  // shell does not have, so the wait timed out on a page that was plainly
  // working — a false failure caused by the test, not the code.
  const appVisible = await waitFor(
    `document.querySelector('textarea')`,
    'the query box',
  );
  check('the application is reachable once signed in', appVisible);

  // ------------------------------------------------------------ 4. signing out --

  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Sign out')
      ?.click()
  `);

  const signedOut = await waitFor(
    `document.querySelector('input[name="email"]')`,
    'the sign-in form to return',
  );
  check('signing out returns the visitor to the form', signedOut);

  check(
    'the page reported no console errors',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '),
  );

  socket.close();
} catch (error) {
  check('the browser run completed', false, error instanceof Error ? error.message : String(error));
} finally {
  cleanup();
}

const passed = checks.filter((entry) => entry.ok).length;
process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
if (passed !== checks.length) {
  process.stderr.write(`\nBROWSER SIGN-IN FAILED\n\n${serverLog.slice(-1200)}\n`);
  process.exit(1);
}
process.stdout.write('\nBROWSER SIGN-IN OK\n');
