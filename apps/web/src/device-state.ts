import { IdbBundleStore, IdbIdentityStore } from '@sop/sync';

/**
 * What this browser is holding on behalf of a tenant, and how to let go of it.
 *
 * The reason this module exists: signing out ended the *session* and nothing else.
 * Three things survived it, all of them tenant data sitting in plain storage on a
 * machine the next person will use:
 *
 * 1. the active bundle — a tenant's decrypted procedure corpus, in IndexedDB;
 * 2. the device identity — and it is tenant-coupled, because the KEK salt is derived
 *    from the tenant id, so a cached identity for another tenant cannot unwrap
 *    anything here. Keeping it only produces a `key_unwrap_failed` that reads like a
 *    crypto fault rather than a stale key;
 * 3. the telemetry queue — **customer query text**, in `localStorage`.
 *
 * So sign-out has to wipe, and the wipe has to be one call with one meaning. It lives
 * here rather than in `auth.ts` so the auth module does not have to know that the
 * sync engine and the telemetry queue exist, and so the list of things to wipe is
 * reviewable in one file: a security control nobody can see is a control nobody
 * maintains.
 *
 * Wiping is deliberately not best-effort-per-item. If one store refuses to clear, the
 * caller is told, because "signed out successfully" while a tenant's policy is still
 * on disk is the exact failure this closes.
 */

export interface WipeResult {
  readonly cleared: readonly string[];
  readonly failed: readonly { readonly what: string; readonly reason: string }[];
}

/**
 * Discard every tenant-scoped artefact this browser holds.
 *
 * Ordering is not important for correctness — none of these depend on another — but
 * the bundle goes first, because it is the one that would be *served* if the process
 * died halfway through.
 */
export async function wipeDeviceState(): Promise<WipeResult> {
  const cleared: string[] = [];
  const failed: { what: string; reason: string }[] = [];

  const steps: { what: string; run: () => Promise<unknown> }[] = [
    { what: 'policy bundle', run: async () => new IdbBundleStore().clear() },
    { what: 'device identity', run: async () => new IdbIdentityStore().clear() },
    { what: 'telemetry queue', run: async () => clearTelemetryQueue() },
  ];

  for (const step of steps) {
    try {
      await step.run();
      cleared.push(step.what);
    } catch (error) {
      failed.push({
        what: step.what,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { cleared, failed };
}

/**
 * Drop the queued telemetry.
 *
 * The key is written here rather than imported so that the queue's own key change
 * cannot silently orphan the records a sign-out is meant to remove. If someone
 * renames the key, this line stops matching the thing it is meant to delete — which
 * is a visible, testable failure instead of a quiet leak.
 */
const TELEMETRY_KEYS = ['sop-telemetry-queue-v2'];

function clearTelemetryQueue(): void {
  for (const key of TELEMETRY_KEYS) {
    localStorage.removeItem(key);
  }
}

/** The keys this module deletes, so a test can prove it knows about all of them. */
export function telemetryStorageKeys(): readonly string[] {
  return TELEMETRY_KEYS;
}
