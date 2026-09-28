import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SIMULATED = join(ROOT, 'tooling/eval/simulated-tenant');
const FRAMES = join(HERE, 'frames');
const AUDIO = join(HERE, 'audio');
const VITE = join(ROOT, 'apps/web/node_modules/vite/bin/vite.js');
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const TICKET_IDS = [
  'SIM-TICKET-00002',
  'SIM-TICKET-00123',
  'SIM-TICKET-00132',
  'SIM-TICKET-00272',
];
const BENCHMARK_FILE = 'phase5-deployed-run-0aec9773442c4282.json';
const HOLDOUT_FILE = 'phase5-holdout-seed-20260929-margin-017.json';
const RESULT_TIMEOUT_MS = 6 * 60 * 1000;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function requireFile(file) {
  if (!existsSync(file)) throw new Error(`Required file not found: ${file}`);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not reserve a local TCP port.');
  }
  const { port } = address;
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  return port;
}

async function waitForHttp(url, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function openCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;

  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', () => reject(new Error('Chrome CDP websocket failed to open.')), {
      once: true,
    });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      request.reject(new Error(`${request.method}: ${message.error.message}`));
    } else {
      request.resolve(message.result ?? {});
    }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Chrome CDP websocket closed.'));
    }
    pending.clear();
  });

  function send(method, params = {}, timeoutMs = 20_000) {
    const id = ++nextId;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`Timed out waiting for Chrome CDP method ${method}.`));
      }, timeoutMs);
      pending.set(id, { method, resolve: resolveRequest, reject: rejectRequest, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return { socket, send };
}

function renderPresentation(payload) {
  const { result, benchmark, holdout, sceneDurations, benchmarkFile } = payload;
  const rows = new Map(result.perTicket.map((row) => [row.ticket.ticketId, row]));
  const scenes = [
    { type: 'ticket', id: 'SIM-TICKET-00002', title: 'Scenario 1 · clear purchase question' },
    { type: 'ticket', id: 'SIM-TICKET-00123', title: 'Scenario 2 · mixed-language, typo, frustration' },
    { type: 'benchmark', title: 'The recurring failure · documented 500-ticket run' },
    { type: 'ticket', id: 'SIM-TICKET-00132', title: 'Scenario 3 · no matching procedure' },
    { type: 'ticket', id: 'SIM-TICKET-00272', title: 'Scenario 4 · contradictory policy' },
  ];

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 18% 10%, #163b4d, #09151f 48%, #070d14); color: #edf5f7; font: 17px/1.45 "Segoe UI", Arial, sans-serif; }
    main { min-height: 100vh; max-width: 1240px; margin: 0 auto; padding: 34px 42px; display: flex; flex-direction: column; gap: 22px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid #24404c; padding-bottom: 19px; }
    .eyebrow { color: #7bd6cf; font-size: 13px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 7px 0 0; font-size: 29px; letter-spacing: -.02em; }
    .sim-tag { white-space: nowrap; border: 1px solid #e9b867; color: #ffd995; border-radius: 999px; padding: 9px 15px; font-weight: 800; letter-spacing: .08em; font-size: 13px; }
    .counter { color: #a8c2cb; font-size: 14px; font-weight: 700; }
    h2 { font-size: 34px; line-height: 1.15; margin: 0; }
    .grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; flex: 1; min-height: 0; }
    .panel { background: rgba(17, 35, 47, .93); border: 1px solid #294957; border-radius: 18px; padding: 24px 27px; box-shadow: 0 18px 48px #0004; }
    .label { color: #83aab6; text-transform: uppercase; letter-spacing: .12em; font-size: 12px; font-weight: 800; margin-bottom: 11px; }
    .message { font-size: 24px; line-height: 1.45; color: #f2f7f8; }
    .meta { color: #9bb4bd; margin-top: 16px; font-size: 14px; }
    .decision { font-size: 27px; font-weight: 800; margin: 4px 0 10px; }
    .answer { color: #80dfb5; } .escalate { color: #ffd17b; } .unsafe { color: #ff9c8d; }
    .detail { color: #c2d4da; }
    .evidence { margin-top: 18px; padding-top: 15px; border-top: 1px solid #294957; color: #b4cad1; font-size: 14px; }
    .benchmark-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 26px; }
    .metric { background: #0b1c27; border: 1px solid #294957; border-radius: 14px; padding: 21px 18px; }
    .metric strong { display: block; font-size: 34px; color: #f0f7f8; }
    .metric span { color: #94b0ba; font-size: 13px; }
    .source { margin-top: 17px; color: #9bb4bd; font-size: 13px; }
    footer { display: flex; justify-content: space-between; gap: 24px; color: #86a2ad; border-top: 1px solid #24404c; padding-top: 13px; font-size: 12px; }
    .progress { height: 4px; background: #17303c; border-radius: 5px; overflow: hidden; }
    .progress > span { display:block; height:100%; width:0; background: linear-gradient(90deg,#56c8c1,#91e0ac); }
    @media (max-width: 850px) { main { padding: 20px; } .grid { grid-template-columns:1fr; } .benchmark-grid { grid-template-columns:repeat(2,1fr); } h2 {font-size:27px;} }
  `;

  const root = document.createElement('main');
  const header = document.createElement('header');
  const heading = document.createElement('div');
  heading.innerHTML = '<div class="eyebrow">Local decision-path evaluation</div><h1>LIVE Support Assistant</h1>';
  const simTag = document.createElement('div');
  simTag.className = 'sim-tag';
  simTag.textContent = 'SIMULATED DATA · NO CUSTOMER TRAFFIC';
  header.append(heading, simTag);

  const counter = document.createElement('div');
  counter.className = 'counter';
  const title = document.createElement('h2');
  const grid = document.createElement('section');
  grid.className = 'grid';
  const left = document.createElement('article');
  left.className = 'panel';
  const right = document.createElement('article');
  right.className = 'panel';
  const footer = document.createElement('footer');
  const progress = document.createElement('div');
  progress.className = 'progress';
  const progressFill = document.createElement('span');
  progress.append(progressFill);
  footer.textContent = 'On-device MiniLM → passage retrieval → confidence gate → agent view';
  const footerTag = document.createElement('span');
  footerTag.textContent = 'data_mode: "simulated"';
  footer.append(footerTag);
  const bottom = document.createElement('div');
  bottom.append(progress, footer);
  root.append(header, counter, title, grid, bottom);
  grid.append(left, right);
  document.body.replaceChildren(style, root);

  const idToName = new Map(payload.sops.map((sop) => [sop.id, sop.slug ?? sop.title ?? sop.id]));
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };

  function render(index) {
    const scene = scenes[index];
    counter.textContent = `${String(index + 1).padStart(2, '0')} / 05 · RECORDED RESULT`;
    title.textContent = scene.title;
    progressFill.style.width = `${((index + 1) / scenes.length) * 100}%`;
    left.replaceChildren();
    right.replaceChildren();

    if (scene.type === 'benchmark') {
      left.append(node('div', 'label', 'Historical deployed-path batch · 2026-09-28'));
      left.append(node('div', 'message', 'Same 500-ticket simulated batch. The dominant miss was a refusal when the gate lacked confidence.'));
      left.append(node('p', 'meta', 'Separate from the four-ticket local browser run shown in the other scenes.'));
      right.append(node('div', 'label', 'Recorded evidence · development Supabase project'));
      const cards = node('div', 'benchmark-grid');
      const values = [
        [`${benchmark.totals.correct}/500`, `${(benchmark.totals.accuracy * 100).toFixed(1)}% correct expected outcomes`],
        [benchmark.totals.falseEscalations, 'false escalations'],
        [benchmark.totals.unsafeAnswers, 'unsafe answers'],
        [benchmark.totals.runtimeErrors, 'runtime errors'],
      ];
      for (const [value, caption] of values) {
        const card = node('div', 'metric');
        card.append(node('strong', '', value), node('span', '', caption));
        cards.append(card);
      }
      right.append(cards);
      right.append(node('p', 'source', `SIMULATED DATA · ${benchmark.batch.tickets} tickets · source: ${benchmarkFile} · not production-customer evidence`));
      right.append(node('p', 'source', `Independent holdout: ${holdout.totals.correct}/500 (${(holdout.totals.accuracy * 100).toFixed(1)}%) correct expected outcomes at the 0.17 test margin.`));
      return;
    }

    const row = rows.get(scene.id);
    if (!row) throw new Error(`The completed result is missing ${scene.id}.`);
    const ticket = row.ticket;
    const actualIsAnswer = row.actual.decision === 'answer';
    const label = row.correct ? 'Expected disposition' : 'False escalation';
    left.append(node('div', 'label', `Customer message · ${ticket.channel} · ${ticket.language}`));
    left.append(node('div', 'message', ticket.message));
    left.append(node('p', 'meta', `${ticket.ticketId} · ${ticket.category ?? 'category unavailable'} · priority ${ticket.priority ?? 'not set'}`));
    right.append(node('div', 'label', 'Confidence-gate result'));
    right.append(node('div', `decision ${actualIsAnswer ? 'answer' : 'escalate'}`, actualIsAnswer
      ? `Answer · ${idToName.get(row.actual.sopId) ?? row.actual.sopId}`
      : `Escalate · ${row.actual.reason}`));
    right.append(node('div', 'detail', `${label}: expected ${row.expected.decision}${row.expected.sopId ? ` · ${idToName.get(row.expected.sopId) ?? row.expected.sopId}` : ''}`));
    const top = row.candidates?.slice(0, 2) ?? [];
    if (top.length) {
      const evidence = node('div', 'evidence');
      evidence.textContent = `Top candidates: ${top.map((candidate) => `${idToName.get(candidate.sopId) ?? candidate.sopId} ${candidate.score.toFixed(3)}`).join('  ·  ')}`;
      right.append(evidence);
    }
    right.append(node('p', 'meta', `${row.latencyMs.toFixed(1)} ms decision latency · ${row.correct ? 'correct for the batch label' : 'not the expected disposition'}`));
    if (scene.id === 'SIM-TICKET-00272') {
      right.append(node('p', 'source', 'Separate deployed publishing check: contradictory policy bundle refused with HTTP 422 before it can reach a device.'));
    }
  }

  // The scene is selected explicitly by the capture driver, one call per frame,
  // rather than by a requestAnimationFrame clock. A self-timing rAF loop stops
  // silently if a frame callback throws, which froze this presentation on scene
  // three for 46 of 72 frames and was only visible by hashing the PNGs.
  const state = {
    startedAt: new Date().toISOString(),
    data_mode: 'simulated',
    sceneCount: scenes.length,
    sceneDurations,
    index: -1,
    renderedScenes: [],
    errors: [],
  };

  function show(index) {
    if (!Number.isInteger(index) || index < 0 || index >= scenes.length) {
      throw new Error(`Scene index out of range: ${String(index)}`);
    }
    try {
      render(index);
    } catch (error) {
      state.errors.push({ index, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    state.index = index;
    if (!state.renderedScenes.includes(index)) state.renderedScenes.push(index);
    return { index, title: scenes[index].title };
  }

  window.__VIDEO_PRESENTATION__ = state;
  window.__VIDEO_SHOW__ = show;
  show(0);
}

async function main() {
  requireFile(VITE);
  requireFile(join(SIMULATED, 'demo-tickets.json'));
  requireFile(join(SIMULATED, 'corpus.json'));
  requireFile(join(SIMULATED, BENCHMARK_FILE));
  requireFile(join(SIMULATED, HOLDOUT_FILE));
  const chromePath = CHROME_CANDIDATES.find(existsSync);
  if (!chromePath) throw new Error('Google Chrome was not found in either standard Windows install path.');

  const benchmark = JSON.parse(await readFile(join(SIMULATED, BENCHMARK_FILE), 'utf8'));
  const holdout = JSON.parse(await readFile(join(SIMULATED, HOLDOUT_FILE), 'utf8'));
  const corpus = JSON.parse(await readFile(join(SIMULATED, 'corpus.json'), 'utf8'));
  if (benchmark.data_mode !== 'simulated' || holdout.data_mode !== 'simulated'
    || corpus.data_mode !== 'simulated' || benchmark.batch.tickets !== 500) {
    throw new Error('The browser capture inputs must be explicitly simulated and the benchmark must contain 500 tickets.');
  }
  if (benchmark.totals.correct !== 361 || benchmark.totals.falseEscalations !== 138
    || benchmark.totals.unsafeAnswers !== 1 || benchmark.totals.runtimeErrors !== 0
    || holdout.totals.correct !== 379) {
    throw new Error('A source benchmark no longer matches the figures in the reviewed narration.');
  }

  const port = await reservePort();
  const cdpPort = await reservePort();
  const profile = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'sop-video-capture-')),
  );
  const vite = spawn(process.execPath, [
    VITE, ROOT, '--config', join(ROOT, 'apps/web/vite.config.ts'),
    '--port', String(port), '--host', '127.0.0.1', '--strictPort',
  ], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  let chrome;
  let cdp;

  try {
    const runnerUrl = `http://127.0.0.1:${port}/tooling/eval/simulated-tenant/chaos-runner.html`;
    const pageUrl = `${runnerUrl}?batch=demo-tickets.json&corpus=corpus.json&minMargin=0.18`;
    await waitForHttp(runnerUrl, vite);
    chrome = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      '--window-size=1280,760',
      'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    const version = await (async () => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (chrome.exitCode !== null) throw new Error(`Chrome exited (code ${chrome.exitCode}).`);
        try {
          return await fetchJson(`http://127.0.0.1:${cdpPort}/json/version`);
        } catch {
          await sleep(250);
        }
      }
      throw new Error('Timed out waiting for Chrome DevTools Protocol.');
    })();
    const deadline = Date.now() + 10_000;
    let page;
    while (!page && Date.now() < deadline) {
      const targets = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
      page = targets.find((target) => target.type === 'page');
      if (!page) await sleep(100);
    }
    if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target.');
    cdp = await openCdp(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const pageErrors = [];
    cdp.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails ?? {};
        pageErrors.push(details.exception?.description ?? details.text ?? 'unknown page exception');
      }
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: pageUrl });
    console.log('Running the real four-ticket browser evaluation…');

    let result;
    let previousStatus = '';
    const resultDeadline = Date.now() + RESULT_TIMEOUT_MS;
    while (Date.now() < resultDeadline) {
      const evaluated = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          state: window.__SIMULATION_STATE__ ?? null,
          result: window.__SIMULATION_RESULT__ ?? null
        })`,
        returnByValue: true,
      });
      const value = evaluated.result?.value;
      if (typeof value === 'string') {
        const state = JSON.parse(value);
        const status = state.state?.status ?? 'initializing';
        if (status !== previousStatus) {
          console.log(`Browser status: ${status}${state.state?.detail ? ` — ${state.state.detail}` : ''}`);
          previousStatus = status;
        }
        if (status === 'failed') {
          throw new Error(`The simulated browser evaluation failed: ${state.state.detail ?? 'unknown error'}`);
        }
        if (state.result) {
          result = state.result;
          break;
        }
      }
      await sleep(500);
    }
    if (!result) throw new Error(`The simulated browser evaluation did not complete within ${RESULT_TIMEOUT_MS / 1000} seconds.`);
    if (result.data_mode !== 'simulated' || result.batch?.tickets !== 4
      || result.perTicket?.length !== 4
      || result.totals?.correct !== 3 || result.totals?.falseEscalations !== 1
      || result.totals?.unsafeAnswers !== 0 || result.totals?.runtimeErrors !== 0) {
      throw new Error('The browser output does not match the reviewed four-ticket simulated result.');
    }
    for (const ticketId of TICKET_IDS) {
      if (!result.perTicket.some((row) => row.ticket.ticketId === ticketId && row.data_mode === 'simulated')) {
        throw new Error(`The browser output is missing a simulated ticket: ${ticketId}`);
      }
    }
    console.log('Browser evaluation verified: 4 tickets, 3 correct dispositions, 1 false escalation, 0 unsafe answers, 0 runtime errors.');

    const ffprobe = process.env.FFPROBE ?? 'ffprobe';
    const { execFileSync } = await import('node:child_process');
    const getDuration = (file) => Number(execFileSync(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
    ], { encoding: 'utf8' }).trim());
    const sceneDurations = [4, 5, 6, 7, 8].map((index) => getDuration(join(AUDIO, `seg${String(index).padStart(2, '0')}.mp3`)));
    const presentationMs = Math.ceil(sceneDurations.reduce((sum, duration) => sum + duration, 0) * 1000);
    const frameCount = Math.ceil(presentationMs / 1000);
    const payload = {
      result,
      benchmark,
      holdout,
      sceneDurations,
      benchmarkFile: BENCHMARK_FILE,
      sops: corpus.sops,
    };
    const installExpression = `(${renderPresentation.toString()})(${JSON.stringify(payload)})`;
    await cdp.send('Runtime.evaluate', {
      expression: installExpression,
      awaitPromise: true,
      returnByValue: true,
    });

    await mkdir(FRAMES, { recursive: true });
    for (const file of await readdir(FRAMES)) {
      if (/^frame-\d{6}\.png$/.test(file)) await rm(join(FRAMES, file));
    }
    // One frame per second of presentation, each with its scene chosen from the
    // narration durations, so the footage cannot drift out of step with the audio.
    const sceneBounds = [];
    let accumulated = 0;
    for (const duration of sceneDurations) {
      accumulated += duration;
      sceneBounds.push(accumulated);
    }
    const sceneForFrame = (frame) => {
      const elapsed = frame + 0.5;
      for (let i = 0; i < sceneBounds.length; i += 1) {
        if (elapsed < sceneBounds[i]) return i;
      }
      return sceneBounds.length - 1;
    };
    for (let frame = 0; frame < frameCount; frame += 1) {
      const scene = sceneForFrame(frame);
      const shown = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(window.__VIDEO_SHOW__(${scene}))`,
        returnByValue: true,
      });
      if (shown.exceptionDetails) {
        const details = shown.exceptionDetails;
        throw new Error(
          `Rendering presentation scene ${scene} failed: ${details.exception?.description ?? details.text}`,
        );
      }
      await sleep(150);
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(join(FRAMES, `frame-${String(frame).padStart(6, '0')}.png`), Buffer.from(screenshot.data, 'base64'));
      if ((frame + 1) % 10 === 0 || frame + 1 === frameCount) {
        console.log(`Captured presentation frame ${frame + 1}/${frameCount}.`);
      }
    }

    const presentation = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__VIDEO_PRESENTATION__)',
      returnByValue: true,
    });
    const presentationState = JSON.parse(presentation.result?.value ?? '{}');
    const expectedScenes = sceneDurations.length;
    if (pageErrors.length > 0) {
      throw new Error(`The presentation page raised ${pageErrors.length} exception(s): ${pageErrors.join(' | ')}`);
    }
    if (presentationState.renderedScenes?.length !== expectedScenes) {
      throw new Error(
        `The presentation rendered ${presentationState.renderedScenes?.length ?? 0} of ${expectedScenes} scenes; ` +
          `a captured video would repeat a scene. Rendered: ${JSON.stringify(presentationState.renderedScenes)}` +
          `; errors: ${JSON.stringify(presentationState.errors ?? [])}`,
      );
    }
    console.log(`Presentation scenes rendered: ${presentationState.renderedScenes.join(', ')} (all ${expectedScenes}).`);

    const meta = {
      data_mode: 'simulated',
      capture: 'headless Chrome, local browser decision path',
      evaluation: {
        batch: result.sourceBatch,
        corpus: result.sourceCorpus,
        tickets: result.batch.tickets,
        correct: result.totals.correct,
        falseEscalations: result.totals.falseEscalations,
        unsafeAnswers: result.totals.unsafeAnswers,
        runtimeErrors: result.totals.runtimeErrors,
      },
      historicalBenchmark: {
        source: `tooling/eval/simulated-tenant/${BENCHMARK_FILE}`,
        data_mode: 'simulated',
        evaluatedAt: benchmark.evaluatedAt,
        tickets: benchmark.batch.tickets,
        correct: benchmark.totals.correct,
        falseEscalations: benchmark.totals.falseEscalations,
        unsafeAnswers: benchmark.totals.unsafeAnswers,
        runtimeErrors: benchmark.totals.runtimeErrors,
      },
      frames: frameCount,
      framesPerSecond: 1,
      width: 1280,
      height: 720,
      presentationSeconds: frameCount,
      scenesRendered: presentationState.renderedScenes,
      sceneDurationsSeconds: sceneDurations.map((duration) => Number(duration.toFixed(3))),
      dashboardInjectedAfterEvaluation: true,
      chromeVersion: version.Browser,
      capturedAt: new Date().toISOString(),
    };
    await writeFile(join(HERE, 'demo-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`Captured ${frameCount} frames (${frameCount}s presentation) to ${FRAMES}.`);
    console.log('The results dashboard is a capture-only view built from the completed, simulated browser output.');
  } finally {
    cdp?.socket.close();
    for (const child of [chrome, vite]) {
      if (child && child.exitCode === null) {
        child.kill();
        await new Promise((resolveClose) => child.once('close', resolveClose));
      }
    }
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
