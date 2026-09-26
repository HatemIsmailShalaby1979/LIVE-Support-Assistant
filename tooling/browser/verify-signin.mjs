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
async function provisionEditor(role = 'sop_editor', email = 'signin-editor@alpha.example') {
  const password = `Se-${randomUUID()}`;
  const list = await (
    await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })
  ).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  const metadata = { tenant_id: TENANT, app_role: role };

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
    if (!created.ok) throw new Error(`could not provision the ${role}: ${await created.text()}`);
    userId = (await created.json()).id;
  }

  await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      tenant_id: TENANT,
      display_name: `Sign-in ${role}`,
      role,
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
    const details = message.params.exceptionDetails;
    consoleErrors.push(
      [
        details.exception?.description ?? details.text ?? 'exception',
        details.url === undefined ? '' : ` @ ${details.url}`,
      ].join(''),
    );
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

  /**
   * Wait for a condition. **Returns a boolean, never the value it waited for.**
   *
   * The name says so, because the earlier name did not and the coercion below is
   * silent: `if (await evaluate('Boolean(...)')) return true` discards whatever the
   * expression produced. Writing `const text = await waitFor(...)` therefore yielded
   * `true`, and a following `.includes` on a boolean returns `false` without throwing
   * — a check that passes or fails for the wrong reason rather than one that breaks.
   * If you want the value, use `waitForText`.
   */
  const waitForCondition = async (expression, label, timeoutMs = 30_000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await evaluate(`Boolean(${expression})`)) return true;
      await sleep(250);
    }
    process.stderr.write(`    timed out waiting for ${label}\n`);
    return false;
  };

  /** Wait for an expression to become truthy and return its text. Use this to get a value. */
  const waitForText = async (expression, label, timeoutMs = 30_000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const value = await evaluate(`(${expression})`);
      if (value !== null && value !== undefined && value !== false && value !== '') {
        return String(value);
      }
      await sleep(250);
    }
    process.stderr.write(`    timed out waiting for ${label}\n`);
    return '';
  };

  // ------------------------------------------------ driving the app as a person --
  //
  // These live *inside* the try block on purpose. `evaluate` and `waitForCondition` are
  // declared with `const` in this block, so anything declared at module level that
  // closes over them fails with "evaluate is not defined" — which is exactly what a
  // module-level helper did here, and it cost a run to find out.

  async function sessionRole() {
    const text = await evaluate(`document.querySelector('[data-testid="session-role"]')?.textContent ?? ''`);
    return text.trim();
  }

  async function signInAs(email, password) {
    await evaluate(`
      (() => {
        const set = (selector, value) => {
          const input = document.querySelector(selector);
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('input[name="email"]', ${JSON.stringify(email)});
        set('input[name="password"]', ${JSON.stringify(password)});
        document.querySelector('form').requestSubmit();
        return true;
      })()
    `);
    await waitForCondition(`document.querySelector('[data-testid="session-bar"]')`, `the ${email} session`, 30_000);
  }

  async function signOut() {
    await evaluate(`
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Sign out')
        ?.click()
    `);
    await waitForCondition(
      `document.querySelector('[data-testid="session-bar"]') === null`,
      'the session to end',
      30_000,
    );
  }

  async function clickTab(label) {
    await evaluate(`
      [...document.querySelectorAll('[role="tab"]')]
        .find((t) => t.textContent.trim() === ${JSON.stringify(label)})
        ?.click()
    `);
  }

  async function setInputValue(testId, value) {
    await evaluate(`
      (() => {
        const input = document.querySelector('[data-testid="${testId}"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
  }

  async function ask(question) {
    await evaluate(`
      (() => {
        const input = document.querySelector('textarea[placeholder^="Paste the customer"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(question)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await evaluate(`
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Find Answer')
        ?.click()
    `);
  }

  // ---------------------------------------------------------------- 1. the gate --


  await send('Page.navigate', { url: `http://127.0.0.1:${DEV_PORT}/` }, sessionId);

  const formAppeared = await waitForCondition(
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

  const refused = await waitForCondition(
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

  const signedIn = await waitForCondition(
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
  const appVisible = await waitForCondition(
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
  const settled = await waitForCondition(
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

  const served = await waitForCondition(
    `(() => { const text = document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''; return text.includes('Serving bundle'); })()`,
    'the app to serve the newly published bundle',
    120_000,
  );
  check('the app then serves the bundle the server published', served);

  const bundleText = await evaluate(
    `document.querySelector('[data-testid="bundle-state"]')?.textContent ?? ''`,
  );
  // The count is parsed and compared as a number, never matched as a substring. The
  // earlier `!bundleText.includes('5 procedure')` was a proxy for "not the repository
  // file" that broke the moment the tenant genuinely had fifteen procedures, because
  // "5 procedure" is a substring of "15 procedure(s)". A literal count is also wrong
  // in the other direction: interpolating 1 would match "21 procedure(s)". Comparing
  // the parsed integer to the number the server reported is the claim itself.
  const servedCount = Number(/(\d+)\s+procedure\(s\)/.exec(bundleText)?.[1] ?? 'NaN');
  check(
    'and it is that bundle\'s procedures, in the number the server published',
    servedCount === published.sopCount,
    `${bundleText.trim()} (the server said ${published.sopCount})`,
  );
  check(
    'and it names the version the server assigned',
    bundleText.includes(`bundle ${published.bundleVersion}`),
    bundleText.trim(),
  );

  // ------------------------------------------------- the Command Center --

  // A frontline agent must not be offered a screen it cannot use. RLS already refuses
  // every verb on it, and the point of gating the tab is that a control the server
  // will always reject should not be sitting on screen for someone to press. The
  // refusal itself is still worth asserting, so it is checked against the server
  // with an agent's own token rather than through a control that is now hidden.
  const agentTabs = await evaluate(
    `[...document.querySelectorAll('[data-testid^="tab-"]')].map((t) => t.dataset.testid).join(',')`,
  );
  check('a frontline agent is offered only the Ask tab', agentTabs === 'tab-ask', agentTabs);

  const refusedPrincipal = await provisionEditor('agent', 'signin-refused@alpha.example');
  const agentRead = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refusedPrincipal.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true, sopId: '00000000-0000-0000-0000-000000000000' }),
  });
  const agentReadBody = await agentRead.json();
  check(
    'and an agent asking the server for a procedure body is refused, by name',
    agentRead.status === 403 && /editor|ops manager/i.test(String(agentReadBody?.error ?? '')),
    `${agentRead.status} ${String(agentReadBody?.error ?? '').slice(0, 60)}`,
  );

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

  // The list itself, and reading a body back, are the editor's business. Both are
  // proven below, once the editor is signed in — the browser is an agent at this
  // point, and it is no longer offered the screen at all.

  // Now sign in as an editor, which is the person this screen is for.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Sign out')
      ?.click()
  `);
  await waitForCondition(`document.querySelector('input[name="email"]')`, 'the form to return');

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
  await waitForCondition(
    `document.querySelector('[data-testid="session-bar"]')`,
    'the editor session',
    30_000,
  );

  const editorRole = await evaluate(
    `document.querySelector('[data-testid="session-role"]')?.textContent ?? ''`,
  );
  check('the editor is signed in, and the server says so', editorRole.trim() === 'sop_editor', editorRole.trim());

  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Command Center')?.click()`);
  const commandCentre = await waitForCondition(
    `document.querySelector('[data-testid="command-center"]')`,
    'the Command Center',
    30_000,
  );
  check('the Command Center is reachable from the signed-in app', commandCentre);

  // The editor is the role this screen is for, so the list assertions live here now
  // rather than in the agent phase where the tab is not offered at all.
  const rowAppeared = await waitForCondition(
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
    rows.slice(0, 90),
  );

  // ------------------------------------------------ revising a procedure --

  // Read-back is the gap the status dropdown used to paper over: a version has to
  // carry the body forward, and only the server can supply it. So the screen loads
  // the current text, an editor changes it, and the new version has to contain the
  // change rather than a placeholder.
  const editMarker = `REVISED-IN-THE-BROWSER-${Math.random().toString(36).slice(2, 8)}`;

  // Wait for the button, do not click and then wait. The list loads asynchronously
  // after the tab opens, so clicking immediately hit a page that had not rendered it
  // yet — `?.click()` swallowed the miss and the run then timed out waiting for a
  // form that was never requested. That is the third time this shape has cost a run,
  // and the fix is always the same: wait for the thing you are about to touch.
  const editButton = `[...document.querySelectorAll('button')].find((b) => b.dataset.testid === 'cc-edit-${authoredBody.sopId}')`;
  const buttonThere = await waitForCondition(
    editButton,
    'the authored procedure to appear in the editor list',
    30_000,
  );
  check('the editor can see the procedure it authored, ready to revise', buttonThere === true);

  // The split is deliberate and worth pinning: the title is a column on `sops`, in
  // the clear so an auditor can read a procedure's name without a key, and the rest
  // of the draft is inside the encrypted body. A client that expects `title` in the
  // body hands the form `undefined` and React tears the panel down — which is
  // exactly what happened before this check existed.
  const shapeProbe = await (
    await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true, sopId: authoredBody.sopId }),
    })
  ).json();
  const encryptedFields = [
    'category',
    'summary',
    'suggestedReply',
    'escalationRequired',
    'escalationReason',
    'triggerKeywords',
  ];
  check(
    'the read splits the draft the way the schema does — title in the clear, the rest encrypted',
    typeof shapeProbe?.title === 'string' &&
      shapeProbe.title.length > 0 &&
      encryptedFields.every((field) => Object.hasOwn(shapeProbe?.body ?? {}, field)) &&
      !Object.hasOwn(shapeProbe?.body ?? {}, 'title'),
    `title=${JSON.stringify(shapeProbe?.title ?? null)} body keys: ${Object.keys(shapeProbe?.body ?? {}).join(',')}`,
  );

  await evaluate(`${editButton}?.click()`);

  const loaded = await waitForCondition(
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

  // The revision has to change the text. Writing the original summary back would
  // produce a second version and satisfy every other check while proving nothing
  // about the content actually moving.
  await evaluate(`
    (() => {
      const input = document.querySelector('[data-testid="cc-summary"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(`${editMarker}: revised from the Command Center`)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);

  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Save and publish status')
      ?.click()
  `);

  const saved = await waitForCondition(
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
  // would pass every check above. It goes over the same POST contract the app uses,
  // not the GET, so this proves the path the product actually takes.
  const editorReadBack = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true, sopId: authoredBody.sopId }),
  });
  const readBack = await editorReadBack.json();
  check(
    'the server stored the revised text, not a placeholder',
    editorReadBack.ok &&
      String(readBack?.body?.summary ?? '').startsWith(editMarker) &&
      !String(readBack?.body?.summary ?? '').includes(marker),
    JSON.stringify(readBack?.body?.summary ?? readBack?.error ?? '').slice(0, 70),
  );

  // ---------------------------------------------- 4. the escalation console --

  // The other half of the Command Center, and the reason the agent view is
  // content-free on a refusal: the person who gets the escalation is the only one
  // who sees the query and the candidates, so the handover has to arrive somewhere.
  // Proven with a real refusal produced by a real agent query rather than a fixture
  // row inserted behind the app — one run covering agent, handover, and closure.
  await signOut();
  const agentSession = await provisionEditor('agent', 'signin-agent@alpha.example');
  // Provisioned before the agent asks, so its token can be used to watch for the row.
  // The console is a snapshot taken when it opens, and the agent's escalation is
  // written by a flush that is still in flight when the refusal appears — so without
  // this wait the queue read races the write, and an empty queue is indistinguishable
  // from a handover that never happened. Polling the table directly is deterministic,
  // and the lead reading it back in the browser afterwards is still what proves the
  // screen works.
  const leadSession = await provisionEditor('team_lead', 'signin-lead@alpha.example');
  await signInAs('signin-agent@alpha.example', agentSession.password);
  check(
    'the agent is signed in again, and the server says who it is',
    (await sessionRole()) === 'agent',
    await sessionRole(),
  );

  const queueTabs = await evaluate(
    `[...document.querySelectorAll('[data-testid^="tab-"]')].map((t) => t.dataset.testid).join(',')`,
  );
  check('an agent is offered no queue either', queueTabs === 'tab-ask', queueTabs);

  // The model is loaded per session, and this is a fresh one — the component
  // remounts on sign-out, so the agent has to activate it the way a person would.
  // Skipping this is what made the queue check below pass on an escalation left over
  // from an earlier run rather than one this run caused.
  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Load model and build index')
      ?.click()
  `);
  const agentReady = await waitForCondition(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Find Answer')`,
    'the agent model to load and the index to build',
    180_000,
  );
  check('the agent can ask a question at all', agentReady === true);

  // Unique per run, so the queue assertion below cannot be satisfied by an
  // escalation an earlier run left behind. A check that passes on history is worse
  // than no check.
  const outOfScope = `appeal a content violation ${Math.random().toString(36).slice(2, 8)}`;
  await ask(outOfScope);

  const gateRefused = await waitForCondition(
    `[...document.querySelectorAll('h3')].some((h) => /escalated to a human/i.test(h.textContent))`,
    'the gate to refuse the query',
    120_000,
  );
  check('an out-of-scope query is escalated rather than answered', gateRefused);

  // Wait for the record to exist in the tenant before moving to the other side of the
  // handover. An agent's session ends the moment we sign out, and the flush is
  // asynchronous, so the queue was being read while the write was still in flight.
  let landed = false;
  for (let attempt = 0; attempt < 20 && !landed; attempt += 1) {
    const probe = await fetch(
      `${supabaseUrl}/rest/v1/escalations?select=id&order=query_occurred_at&limit=1`,
      { headers: { apikey: publishableKey, Authorization: `Bearer ${leadSession.token}` } },
    );
    const rows = await probe.json();
    landed = Array.isArray(rows) && rows.length > 0;
    if (!landed) await sleep(1_000);
  }
  check('and the record reaches the database the team lead reads from', landed);

  // The refusal must not carry procedure content. That boundary is the whole reason
  // the console has to exist, so it is asserted here rather than assumed from the
  // gate suite.
  const refusalText = await evaluate(`document.body.innerText`);
  check(
    'and the refusal carries no procedure text and no candidate passage',
    !refusalText.includes(editMarker) && !refusalText.includes(marker),
    refusalText.slice(0, 70),
  );

  // Now the other side of the handover.
  await signOut();
  await signInAs('signin-lead@alpha.example', leadSession.password);
  check('the team lead signs in, and the server says so', (await sessionRole()) === 'team_lead', await sessionRole());

  const leadTabs = await evaluate(
    `[...document.querySelectorAll('[data-testid^="tab-"]')].map((t) => t.dataset.testid).join(',')`,
  );
  check(
    'a team lead is offered the queue, and not the authoring screen',
    leadTabs.includes('tab-escalations') && !leadTabs.includes('tab-command'),
    leadTabs,
  );

  await clickTab('Escalations');
  const consoleUp = await waitForCondition(
    `document.querySelector('[data-testid="escalation-console"]')`,
    'the escalation console',
    30_000,
  );
  check('the console opens', consoleUp === true);

  // The two waiting helpers return different types on purpose, and that difference
  // is what their names exist to communicate. Asserted once, so a future change that
  // collapses them is caught here rather than by a check that quietly stops meaning
  // what it says.
  check(
    'the two wait helpers are distinguishable by return type',
    (await waitForText(`1 + 1`, 'arithmetic')) === '2' &&
      (await waitForCondition(`1 + 1 === 2`, 'a true condition')) === true &&
      (await waitForCondition(`1 + 1 === 3`, 'a false condition', 500)) === false,
  );

  // The console reads once when it opens, and the agent's escalation is written by a
  // flush that may still be in flight. So the queue is a snapshot, and a person
  // watching a queue presses Refresh — polling here is the same act, not a retry of
  // a flaky assertion. Without it this check passed or failed on a race rather than
  // on the product.
  let queueText = '';
  for (let attempt = 0; attempt < 10 && !queueText.includes(outOfScope); attempt += 1) {
    await evaluate(`document.querySelector('[data-testid="ec-refresh"]')?.click()`);
    queueText = await waitForText(
      `document.querySelector('[data-testid="escalation-console"]')?.innerText ?? ''`,
      'a refused query to appear in the queue',
      5_000,
    );
  }
  check(
    'the escalation the agent just caused is waiting for a person',
    queueText.includes(outOfScope),
    queueText.slice(0, 70),
  );

  const rowId = await evaluate(
    `document.querySelector('[data-testid^="ec-row-"]')?.dataset.testid?.replace('ec-row-', '') ?? ''`,
  );
  await setInputValue(`ec-note-${rowId}`, 'Told them to file the appeal form; 10 working days.');

  await evaluate(`document.querySelector('[data-testid="ec-claim-${rowId}"]')?.click()`);
  const taken = await waitForCondition(
    `document.querySelector('[data-testid="ec-status-${rowId}"]')?.textContent?.trim() === 'assigned'`,
    'the escalation to be taken',
    30_000,
  );
  check('a team lead can take an escalation', taken === true);

  await evaluate(`document.querySelector('[data-testid="ec-resolve-${rowId}"]')?.click()`);
  const closed = await waitForCondition(
    `document.querySelector('[data-testid="ec-status-${rowId}"]')?.textContent?.trim() === 'resolved'`,
    'the escalation to be resolved',
    30_000,
  );
  check('and resolve it', closed === true);

  const resolutionText = await evaluate(
    `document.querySelector('[data-testid="ec-row-${rowId}"]')?.innerText ?? ''`,
  );
  check(
    'and the note the lead typed is what the record carries',
    resolutionText.includes('10 working days'),
    resolutionText.slice(0, 70),
  );

  // ------------------------------------------------------------ 5. signing out --

  await evaluate(`
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Sign out')
      ?.click()
  `);

  const signedOut = await waitForCondition(
    `document.querySelector('input[name="email"]')`,
    'the sign-in form to return',
  );
  check('signing out returns the visitor to the form', signedOut);

  // Signing out has to release what this browser holds for the tenant, not just end
  // the session. Asserted against the actual storage rather than through the UI,
  // because this is a property of the device, not of the screen: the next person to
  // use this machine reads these stores, not this page.
  const wiped = await evaluate(`
    (async () => {
      const readBundle = await new Promise((resolve) => {
        const request = indexedDB.open('sop-bundles');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('active')) return resolve('no-store');
          const tx = db.transaction('active', 'readonly').objectStore('active').get('bundle');
          tx.onsuccess = () => resolve(tx.result === undefined ? 'empty' : 'present');
          tx.onerror = () => resolve('error');
        };
        request.onerror = () => resolve('open-failed');
      });
      return JSON.stringify({
        bundle: readBundle,
        telemetry: localStorage.getItem('sop-telemetry-queue-v2') === null ? 'absent' : 'present',
      });
    })()
  `);
  const wipeState = JSON.parse(wiped);
  check(
    'and the device no longer holds a bundle or queued telemetry for that tenant',
    wipeState.bundle === 'empty' && wipeState.telemetry === 'absent',
    wiped,
  );

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
