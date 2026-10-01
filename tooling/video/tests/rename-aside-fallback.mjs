// tooling/video/tests/rename-aside-fallback.mjs
//
// Exercise the rename-aside fallback in capture-demo.mjs's stale-frame cleanup.
//
// capture-demo.mjs (lines 501-520) loops over tooling/video/frames/, calls
// fs/promises.rm on each frame-NNNNNN.png, and if rm throws (the host's
// safe-delete shim routes fs/promises.rm through a vendor trash binary that
// has been seen to ETIMEDOUT / EBUSY under Windows process-pool exhaustion),
// renames the stale file aside to
// os.tmpdir()/live-support-assistant-capture-removed/ so the run does not
// abort and stale frames cannot leak into the assembled video.
//
// This test mirrors that exact logic. Scenario A injects a mock rm that
// throws, then runs the cleanup loop on a planted stale frame, and asserts
// that the file ends up in the os.tmpdir() sidecar. Scenario B then probes
// whether the REAL shimmed rm on this host falls over when the file is
// made read-only -- the real shim is not guaranteed to fail (it may move
// the file to the Recycle Bin regardless of the read-only attribute), so
// scenario B reports its outcome honestly rather than asserting a pass.

import { chmod, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REMOVED_DIR = join(tmpdir(), 'live-support-assistant-capture-removed');

// Mirror the cleanup loop verbatim from capture-demo.mjs (lines 510-520).
// The rm argument is injectable so scenario A can force a failure without
// depending on the host shim's behaviour.
async function cleanupStaleFrames(framesDir, rmImpl) {
  for (const file of await readdir(framesDir)) {
    if (!/^frame-\d{6}\.png$/.test(file)) continue;
    const target = join(framesDir, file);
    try {
      await rmImpl(target);
    } catch (err) {
      await mkdir(REMOVED_DIR, { recursive: true });
      await rename(target, join(REMOVED_DIR, file));
      console.warn(`Stale frame ${file} moved aside (rm failed: ${err && err.message ? err.message : err})`);
    }
  }
}

async function plant(rootDir, name) {
  const framesDir = join(rootDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const path = join(framesDir, name);
  await writeFile(path, 'stale-bytes');
  return { framesDir, path };
}

async function teardown(rootDir, name) {
  await rm(rootDir, { recursive: true, force: true }).catch(() => {});
  await rm(join(REMOVED_DIR, name), { force: true }).catch(() => {});
}

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

// --- Scenario A: forced-failure rm (mock throws) ---
{
  const root = join(tmpdir(), `lsa-rename-aside-A-${Date.now()}`);
  const { framesDir, path } = await plant(root, 'frame-000099.png');
  const failingRm = async () => {
    throw new Error('forced rm failure (test mock)');
  };
  await cleanupStaleFrames(framesDir, failingRm);
  const movedTo = join(REMOVED_DIR, 'frame-000099.png');
  assert(existsSync(movedTo), `A: sidecar should contain the file at ${movedTo}`);
  assert(!existsSync(path), `A: frames dir should no longer contain ${path}`);
  await teardown(root, 'frame-000099.png');
}

// --- Scenario B: real rm on a read-only frame ---
// Probes whether the host's shimmed rm actually falls over. Reports outcome;
// does not assert pass/fail because the shim may bypass read-only by moving
// to the Recycle Bin.
{
  const root = join(tmpdir(), `lsa-rename-aside-B-${Date.now()}`);
  const { framesDir, path } = await plant(root, 'frame-000100.png');
  await chmod(path, 0o444); // read-only
  let outcome;
  try {
    await cleanupStaleFrames(framesDir, rm); // REAL rm (the shim)
    const stillInFrames = existsSync(path);
    const inSidecar = existsSync(join(REMOVED_DIR, 'frame-000100.png'));
    if (inSidecar && !stillInFrames) outcome = 'real-rm-fell-to-fallback';
    else if (!stillInFrames && !inSidecar) outcome = 'real-rm-succeeded-readonly';
    else outcome = `unexpected: stillInFrames=${stillInFrames} inSidecar=${inSidecar}`;
  } catch (e) {
    outcome = `cleanup-threw: ${e && e.message ? e.message : e}`;
  }
  await chmod(path, 0o644).catch(() => {});
  await teardown(root, 'frame-000100.png');
  console.log(`B (real rm, read-only frame): ${outcome}`);
}

if (failures.length) {
  console.error('FAIL:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('OK: forced-failure rm exercises the rename-aside fallback (scenario A).');
