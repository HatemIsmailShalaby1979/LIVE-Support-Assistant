/**
 * An in-memory {@link BundleStore}.
 *
 * Exists so the protocol can be exercised without a browser or a device, and so
 * Phase 6's IndexedDB and SQLite adapters have a reference for the contract. The
 * atomicity that matters — a reader sees either the old bundle or the new one,
 * never a half-written mixture — is trivial here and is the hard part there.
 */

import type { BundleStore, InstalledBundle } from './install.js';

export class MemoryBundleStore implements BundleStore {
  #active: InstalledBundle | null = null;

  /** Counts commits, so a test can prove a rejection wrote nothing. */
  #commits = 0;

  /** Awaited by every method, so the store can be made slow on purpose. */
  #latencyMs = 0;

  constructor(options: { latencyMs?: number } = {}) {
    this.#latencyMs = options.latencyMs ?? 0;
  }

  async active(): Promise<InstalledBundle | null> {
    await this.#delay();

    return this.#active;
  }

  async commit(bundle: InstalledBundle): Promise<void> {
    await this.#delay();
    this.#active = bundle;
    this.#commits += 1;
  }

  /**
   * Discard the active bundle and reset the commit count.
   *
   * A sign-out calls this. The count is reset with it so a later test cannot read a
   * commit that happened before the wipe as though it happened after.
   */
  async clear(): Promise<void> {
    await this.#delay();
    this.#active = null;
    this.#commits = 0;
  }

  /** Number of successful commits. Used to prove rejections are side-effect free. */
  get commits(): number {
    return this.#commits;
  }

  async #delay(): Promise<void> {
    if (this.#latencyMs <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, this.#latencyMs);
    });
  }
}
