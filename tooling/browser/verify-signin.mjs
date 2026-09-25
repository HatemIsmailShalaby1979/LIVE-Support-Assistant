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

/**
 * An ops_manager session, so the harness can publish the way a person would —
 * through the edge function, never by writing to the database directly.
 */
async function provisionPublisher() {
  const password = `Sp-${randomUUID()}`;
  const email = 'signin-publisher@alpha.example';
  const list = await (
    await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })
  ).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  const metadata = { tenant_id: TENANT, app_role: 'ops_manager' };

  let userId = existing?.id ?? null;
  if (existing) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true, password, app_metadata: metadata }),
    });
  } else {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: metadata }),
    });
    if (!created.ok) throw new Error(`could not provision the publisher: ${await created.text()}`);
    userId = (await created.json()).id;
  }

  await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      tenant_id: TENANT,
      display_name: 'Sign-in Publisher',
      role: 'ops_manager',
    }),
  });

  const signIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await signIn.json();
  if (body?.access_token === undefined) {
    throw new Error(`could not sign the publisher in: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token };
}

/**
 * An editor session, for the Command Center path. Same shape as the publisher: a
 * real sign-in through the auth API, never a fabricated token.
 */
async function provisionEditor() {
  const password = `Se-${randomUUID()}`;
  const email = 'signin-editor@alpha.example';
  const list = await (
    await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })
  ).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  const metadata = { tenant_id: TENANT, app_role: 'sop_editor' };

  let userId = existing?.id ?? null;
  if (existing) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true, password, app_metadata: metadata }),
    });
  } else {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: metadata }),
    });
    if (!created.ok) throw new Error(`could not provision the editor: ${await created.text()}`);
    userId = (await created.json()).id;
  }

  await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      tenant_id: TENANT,
      display_name: 'Sign-in Editor',
      role: 'sop_editor',
    }),
  });

  const signIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await signIn.json();
  if (body?.access_token === undefined) {
    throw new Error(`could not sign the editor in: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token, password };
}

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
      // The public halves of the keys the publish function holds. Vite only
      // exposes VITE_-prefixed variables to the bundle, and the app needs these to
      // verify a signature and derive the shared secret. Without them it refused
      // to serve anything at all, which is the correct behaviour and was a useful
      // thing to see happen rather than assume.
      VITE_TENANT_SIGNING_PUBLIC_KEY: env('SOP_TENANT_SIGNING_PUBLIC_KEY'),
      VITE_SERVER_WRAPPING_PUBLIC_KEY: env('SOP_SERVER_WRAPPING_PUBLIC_KEY'),
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

  // The corpus has to come from the bundle that was signed for this tenant, and
  // from nothing else. The assertion is the count the tenant actually has: the
  // fixture tenant was seeded with one policy bundle holding one procedure, and a
  // silent fallback to the five-procedure file in the repository would show five.
  // The bundle sync is behind the explicit activation button, by design: the
  // model is not fetched until a person asks for it, and the Phase 4 record is
  // explicit that a page must not phone home before it is asked to. So the harness
  // has to click it like a person would.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Load model and build index')
      ?.click()
  `);

  // Wait for a *settled* state, not merely for the element to exist. The panel
  // renders immediately with "not loaded yet", so a presence check reads the
  // initial value and reports a failure for a sync that is still in flight. The
  // same class of error as waiting for a button that does not exist: the test,
  // not the code.
  const settled = await waitFor(
    `(() => { const text = document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''; return text !== '' && !text.includes('not loaded yet'); })()`,
    'the bundle state to settle',
    120_000,
  );
  check('the app reports what bundle it is serving', settled);

  // At this point the app has enrolled its own device and found no bundle — which
  // is the documented behaviour for a device that registers after publication, and
  // the reason the app says so rather than serving something. So the rest of the
  // loop is driven from here: publish for the enrolled devices, then let the app
  // try again.
  const beforePublish = await evaluate(
    `document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''`,
  );
  check(
    'a device with no published bundle is told so, not served something',
    beforePublish.includes('No bundle is serving'),
    beforePublish.trim(),
  );

  // An ops_manager publishes through the edge function, for whoever is enrolled.
  const publisher = await provisionPublisher();
  const publishResponse = await fetch(`${supabaseUrl}/functions/v1/publish-bundle`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${publisher.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sops: [
        {
          id: 'browser-sop-1',
          title: 'Browser published procedure',
          category: 'probe',
          body: 'A procedure that only exists because the server published it.',
          suggestedReply: 'No action.',
          escalationRequired: false,
          triggerKeywords: ['browser'],
          status: 'published',
        },
        {
          id: 'browser-sop-2',
          title: 'Second browser published procedure',
          category: 'probe',
          body: 'A second one, so the served count is distinguishable from the file in the repository.',
          suggestedReply: 'No action.',
          escalationRequired: false,
          triggerKeywords: ['browser', 'second'],
          status: 'published',
        },
      ],
    }),
  });
  const published = await publishResponse.json();
  check(
    'a published bundle goes out through the edge function',
    publishResponse.ok,
    publishResponse.ok ? `bundle ${published.bundleVersion}` : published.error,
  );

  // Let the app try again, the way a person would after new procedures are sent.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => /Retry model load|Load model and build index/.test(b.textContent.trim()))
      ?.click()
  `);

  const served = await waitFor(
    `(() => { const text = document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''; return text.includes('Serving bundle'); })()`,
    'the app to serve the newly published bundle',
    120_000,
  );
  check('the app then serves the bundle the server published', served);

  const bundleText = await evaluate(
    `document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''`,
  );
  check(
    'and it is that bundle\'s procedures, not the five in the repository file',
    bundleText.includes(`${published.sopCount} procedure(s)`) && !bundleText.includes('5 procedure'),
    `${bundleText.trim()} (the server said ${published.sopCount})`,
  );
  check(
    'and it names the version the server assigned',
    bundleText.includes(`bundle ${published.bundleVersion}`),
    bundleText.trim(),
  );

  // ------------------------------------------------- the Command Center --

  // A signed-in agent has no business in the Command Center, and the screen has to
  // prove it: the server refuses an agent's authoring attempt (probe:corpus
  // asserts that), and the list itself is a tenant-scoped read.
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Command Center')?.click()`);

  const commandCentre = await waitFor(
    `document.querySelector('[data-testid="command-center"]')`,
    'the Command Center',
    30_000,
  );
  check('the Command Center is reachable from the signed-in app', commandCentre);

  // An editor authors a procedure through the browser, and the server encrypts it.
  const editor = await provisionEditor();
  const marker = 'AUTHORED-IN-THE-BROWSER-2a7f';

  const authorAsEditor = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Refund window, set from the Command Center',
      status: 'published',
      category: 'Payments',
      summary: `${marker}: a procedure authored through the browser.`,
      suggestedReply: 'Fourteen days from the purchase.',
      escalationRequired: false,
      triggerKeywords: ['refund'],
    }),
  });
  const authoredBody = await authorAsEditor.json();
  check(
    'the server accepts a procedure authored through the Command Center path',
    authorAsEditor.ok,
    authorAsEditor.ok ? `sop ${authoredBody.sopId} version ${authoredBody.version}` : authoredBody.error,
  );

  // Now through the screen itself: the app's own list must show it.
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Command Center')?.click()`);
  await sleep(400);

  const rowAppeared = await waitFor(
    `document.querySelector('[data-testid="cc-row"]')`,
    'the procedure to appear in the list',
    30_000,
  );
  check('the authored procedure appears in the tenant list', rowAppeared);

  const rows = await evaluate(
    `[...document.querySelectorAll('[data-testid="cc-row"]')].map((r) => r.textContent).join(' || ')`,
  );
  check(
    'and the list shows what the server stored, not what the browser typed',
    rows.includes('Refund window, set from the Command Center'),
    rows,
  );

  // The browser is signed in as a frontline agent, and an agent must not be able to
  // read decrypted procedure text any more than it can author one. The screen has to
  // say so visibly rather than failing silently.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Edit')
      ?.click()
  `);

  const editRefused = await waitFor(
    `document.querySelector('[data-testid="cc-error"]')`,
    'the refusal to appear',
    30_000,
  );
  const refusalText = await evaluate(
    `document.querySelector('[data-testid="cc-error"]')?.textContent ?? ''`,
  );
  check(
    'an agent pressing Edit is refused, and the screen says why',
    editRefused && /editor|ops manager/i.test(refusalText),
    refusalText.trim().slice(0, 80),
  );

  // Now sign in as an editor, which is the person this screen is for.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Sign out')
      ?.click()
  `);
  await waitFor(`document.querySelector('input[name="email"]')`, 'the form to return');

  const editorSession = await provisionEditor();

  await evaluate(`
    (() => {
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('input[name="email"]', ${JSON.stringify('signin-editor@alpha.example')});
      set('input[name="password"]', ${JSON.stringify(editorSession.password)});
      document.querySelector('form').requestSubmit();
      return true;
    })()
  `);
  await waitFor(
    `document.querySelector('[data-testid="session-bar"]')`,
    'the editor session',
    30_000,
  );

  const editorRole = await evaluate(
    `document.querySelector('[data-testid="session-role"]')?.textContent ?? ''`,
  );
  check('the editor is signed in, and the server says so', editorRole.trim() === 'sop_editor', editorRole.trim());

  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Command Center')?.click()`);
  await waitFor(`document.querySelector('[data-testid="command-center"]')`, 'the Command Center');

  // ------------------------------------------------ revising a procedure --

  // Read-back is the gap the status dropdown used to paper over: a version has to
  // carry the body forward, and only the server can supply it. So the screen loads
  // the current text, an editor changes it, and the new version has to contain the
  // change rather than a placeholder.
  const editMarker = `REVISED-IN-THE-BROWSER-${Math.random().toString(36).slice(2, 8)}`;

  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Edit' && b.dataset.testid === 'cc-edit-${authoredBody.sopId}')
      ?.click()
  `);

  const loaded = await waitFor(
    `document.querySelector('[data-testid="cc-editing"]')`,
    'the procedure to load for editing',
    30_000,
  );
  check('a procedure can be loaded back for editing', loaded);

  const loadedSummary = await evaluate(
    `document.querySelector('[data-testid="cc-summary"]')?.value ?? ''`,
  );
  check(
    'and the form holds the text the server decrypted',
    loadedSummary.includes('AUTHORED-IN-THE-BROWSER'),
    loadedSummary.slice(0, 60),
  );

  await evaluate(`
    (() => {
      const input = document.querySelector('[data-testid="cc-summary"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(`${marker}`)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);

  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Save and publish status')
      ?.click()
  `);

  const saved = await waitFor(
    `[...document.querySelectorAll('[data-testid="cc-notice"]')].some((n) => /version/.test(n.textContent))`,
    'the revision to save',
    30_000,
  );
  check('a revision saves through the screen', saved);

  const notice = await evaluate(
    `[...document.querySelectorAll('[data-testid="cc-notice"]')].map((n) => n.textContent).join(' ')`,
  );
  check(
    'and it became a new version rather than overwriting the last',
    /version 2/.test(notice),
    notice.trim(),
  );

  // The decisive one: read the body back through the server and confirm the change
  // is what is stored. A screen that reported success while writing a placeholder
  // would pass every check above.
  const editorReadBack = await fetch(
    `${supabaseUrl}/functions/v1/upsert-sop?sopId=${authoredBody.sopId}`,
    { headers: { Authorization: `Bearer ${editor.token}` } },
  );
  const readBack = await editorReadBack.json();
  check(
    'the server stored the revised text, not a placeholder',
    editorReadBack.ok && readBack?.body?.summary === `${marker}`,
    JSON.stringify(readBack?.body?.summary ?? readBack?.error ?? '').slice(0, 70),
  );

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
