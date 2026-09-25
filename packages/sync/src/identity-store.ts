/**
 * Device identity persistence.
 *
 * The gap this closes: a device's private key lived in memory for the length of
 * a process. That is fine for a test and wrong for a browser, where a reload
 * would produce a device with no key, unable to unwrap the bundle it had already
 * been sent, and unable to tell the difference between "new device" and "me".
 *
 * Two properties make the stored key safe to keep, and both are load-bearing:
 *
 * 1. The private key is **non-extractable** (see `generateDeviceKeyPair`). A
 *    CryptoKey can be structured-cloned into IndexedDB and the browser re-wraps it
 *    under the origin's protection, so the key survives a reload without any
 *    script on the page — including this one — ever being able to read it out.
 *
 * 2. The store holds exactly one record and replaces it in a single transaction,
 *    so a half-written identity cannot be observed. The same discipline as the
 *    bundle store: an identity is a unit, and a torn one is worse than none.
 *
 * The kek salt is *not* stored. It is derived from the tenant id, which is inside
 * the signed manifest, so there is nothing to keep in step and nothing to
 * invalidate.
 */

import { fromBase64, generateDeviceKeyPair, importWrappingPublicKey, toBase64 } from './crypto.js';

/** Everything a device needs to install a bundle, and nothing more. */
export interface DeviceIdentity {
  /** Server-assigned, from the device registry. */
  readonly deviceId: string;
  readonly devicePrivateKey: CryptoKey;
  /** The tenant's manifest-signing public key. */
  readonly tenantSigningPublicKey: CryptoKey;
  /** The server's X25519 public key, used to derive the shared secret. */
  readonly serverWrappingPublicKey: CryptoKey;
}

export interface IdentityStore {
  load(): Promise<DeviceIdentity | null>;
  save(identity: DeviceIdentity): Promise<void>;
  clear(): Promise<void>;
}

interface StoredIdentity {
  readonly deviceId: string;
  readonly devicePrivateKey: CryptoKey;
  readonly tenantSigningPublicKey: CryptoKey;
  readonly serverWrappingPublicKey: CryptoKey;
}

function toStored(identity: DeviceIdentity): StoredIdentity {
  return {
    deviceId: identity.deviceId,
    devicePrivateKey: identity.devicePrivateKey,
    tenantSigningPublicKey: identity.tenantSigningPublicKey,
    serverWrappingPublicKey: identity.serverWrappingPublicKey,
  };
}

function fromStored(stored: StoredIdentity | undefined | null): DeviceIdentity | null {
  if (stored === undefined || stored === null) {
    return null;
  }
  return {
    deviceId: stored.deviceId,
    devicePrivateKey: stored.devicePrivateKey,
    tenantSigningPublicKey: stored.tenantSigningPublicKey,
    serverWrappingPublicKey: stored.serverWrappingPublicKey,
  };
}

export class MemoryIdentityStore implements IdentityStore {
  private stored: StoredIdentity | null = null;

  async load(): Promise<DeviceIdentity | null> {
    return fromStored(this.stored);
  }

  async save(identity: DeviceIdentity): Promise<void> {
    this.stored = toStored(identity);
  }

  async clear(): Promise<void> {
    this.stored = null;
  }
}

const DB_NAME = 'sop-device-identity';
const STORE_NAME = 'identity';
const RECORD_KEY = 'current';

/**
 * IndexedDB-backed identity store. One database, one object store, one record.
 *
 * A `put` of a single record is already atomic in IndexedDB, so there is no
 * window in which half an identity is visible — the same reason the bundle store
 * keeps exactly one record rather than a collection.
 */
export class IdbIdentityStore implements IdentityStore {
  // Declared rather than a constructor parameter property, because the package
  // compiles with `erasableSyntaxOnly`: a parameter property emits code, and
  // leaving nothing behind is the point of that flag.
  private readonly factory: IDBFactory;

  constructor(factory?: IDBFactory) {
    this.factory = factory ?? indexedDB;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolveOpen, rejectOpen) => {
      const request = this.factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => rejectOpen(request.error ?? new Error('could not open the identity database'));
    });
  }

  private async run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolveWork, rejectWork) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolveWork(request.result);
        request.onerror = () => rejectWork(request.error ?? new Error('identity request failed'));
        tx.onabort = () => rejectWork(tx.error ?? new Error('identity transaction aborted'));
      });
    } finally {
      db.close();
    }
  }

  async load(): Promise<DeviceIdentity | null> {
    return fromStored(await this.run<StoredIdentity | undefined>('readonly', (store) => store.get(RECORD_KEY)));
  }

  async save(identity: DeviceIdentity): Promise<void> {
    await this.run('readwrite', (store) => store.put(toStored(identity), RECORD_KEY));
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (store) => store.delete(RECORD_KEY));
  }
}

/**
 * Mint a new device identity.
 *
 * @param deviceId Server-assigned id for this device.
 * @param tenantSigningPublicKeyBase64 The tenant's Ed25519 verify key.
 * @param serverWrappingPublicKeyBase64 The server's X25519 public key.
 * @returns An identity whose private key cannot be exported.
 */
export async function newDeviceIdentity(
  deviceId: string,
  tenantSigningPublicKeyBase64: string,
  serverWrappingPublicKeyBase64: string,
): Promise<{ identity: DeviceIdentity; devicePublicKeyBase64: string }> {
  const pair = await generateDeviceKeyPair();
  return {
    identity: {
      deviceId,
      devicePrivateKey: pair.privateKey,
      tenantSigningPublicKey: await importSigningPublicKey(tenantSigningPublicKeyBase64),
      serverWrappingPublicKey: await importWrappingPublicKey(serverWrappingPublicKeyBase64),
    },
    // The public half is extractable even though the private half is not, which
    // is the only reason a non-extractable keypair is usable at all.
    devicePublicKeyBase64: await exportDevicePublicKey(pair.publicKey),
  };
}

async function exportDevicePublicKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

async function importSigningPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(base64) as BufferSource,
    { name: 'Ed25519' },
    true,
    ['verify'],
  );
}
