/**
 * IndexedDB bundle store — the web and Tauri-webview persistence half of the
 * sync engine.
 *
 * The atomic-swap guarantee lives in the shape of the store, not in extra code:
 * the active bundle is a single record written by a single `put` inside a single
 * transaction. A reader therefore sees either the previous bundle or the new
 * one, never a half-written mixture — which is the property §14 called the hard
 * part of Phase 6 when the store was still in memory.
 */

import type { BundleStore, InstalledBundle } from './install.js';

const DB_NAME = 'sop-bundles';
const DB_VERSION = 1;
const STORE_NAME = 'active';
const RECORD_KEY = 'bundle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
  });
}

export class IdbBundleStore implements BundleStore {
  private readonly db: Promise<IDBDatabase>;

  constructor() {
    this.db = openDb();
  }

  async active(): Promise<InstalledBundle | null> {
    const db = await this.db;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const bundle = await requestToPromise(
      tx.objectStore(STORE_NAME).get(RECORD_KEY) as IDBRequest<InstalledBundle | undefined>,
    );

    return bundle ?? null;
  }

  async commit(bundle: InstalledBundle): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await requestToPromise(tx.objectStore(STORE_NAME).put(bundle, RECORD_KEY));
  }
}
