/**
 * SQLite bundle store — the Expo (and Tauri native storage) persistence half of
 * the sync engine.
 *
 * The adapter is written against a minimal driver interface rather than the
 * `expo-sqlite` package directly, so the same class runs under expo-sqlite,
 * `tauri-plugin-sql`, or any test double, and so this package keeps zero
 * platform dependencies. The caller injects the driver.
 *
 * Atomicity: the active bundle is one row, replaced by one `INSERT OR REPLACE`.
 * A concurrent reader sees the old row or the new one — never a mixture — which
 * is the same guarantee the IndexedDB store gives by single-record transaction.
 */

import type { BundleStore, InstalledBundle } from './install.js';

/** The subset of the expo-sqlite database API the store needs. */
export interface SqliteDriver {
  runAsync(sql: string, params?: readonly unknown[]): Promise<void>;
  getAllAsync<T = unknown>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
}

interface ActiveRow {
  readonly manifest: string;
  readonly sops: string;
  readonly installedAt: string;
}

const SCHEMA = `
create table if not exists active_bundle (
  id           integer primary key check (id = 1),
  manifest     text not null,
  sops         text not null,
  installed_at text not null
);
`;

export class SqliteBundleStore implements BundleStore {
  private readonly db: SqliteDriver;
  private readonly ready: Promise<void>;

  constructor(db: SqliteDriver) {
    this.db = db;
    this.ready = db.runAsync(SCHEMA);
  }

  async active(): Promise<InstalledBundle | null> {
    await this.ready;

    const rows = await this.db.getAllAsync<ActiveRow>(
      'select manifest, sops, installed_at from active_bundle where id = 1',
    );

    const row = rows[0];

    if (row === undefined) {
      return null;
    }

    const manifest = JSON.parse(row.manifest) as InstalledBundle['manifest'];

    return {
      manifest,
      sops: JSON.parse(row.sops) as InstalledBundle['sops'],
      // Reconstructed; both live inside the signed manifest as well.
      tenantId: manifest.tenantId,
      bundleVersion: manifest.bundleVersion,
      installedAt: row.installedAt,
    };
  }

  async commit(bundle: InstalledBundle): Promise<void> {
    await this.ready;

    await this.db.runAsync(
      `insert or replace into active_bundle (id, manifest, sops, installed_at)
       values (1, ?, ?, ?)`,
      [JSON.stringify(bundle.manifest), JSON.stringify(bundle.sops), bundle.installedAt],
    );
  }
}
