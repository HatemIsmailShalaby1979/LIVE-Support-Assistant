/**
 * The bundle client: identity, fetch, install, and whatever is currently serving.
 *
 * This is the join between the transport the last three slices built and the
 * application that answers queries. Until now the two had never met — the app
 * loaded a checked-in JSON file out of the repository and the transport was proven
 * only by probes. So this file is the thing that makes the product use its own
 * sync engine.
 *
 * The rule it exists to enforce: **the corpus the app searches is the corpus that
 * was signed for this tenant.** Not a fallback, not a bundled copy, not a default.
 * If no bundle is installed, the app says it has none. Silently serving a
 * repository file when the tenant's published bundle is missing is the same
 * failure as telemetry that never left the browser: a product that appears to work
 * for a tenant it has not actually been given anything.
 *
 * The flow, in order, and the order matters:
 *
 *   1. Load the device identity, or mint one. The private key is non-extractable
 *      and lives in IndexedDB; it survives reloads, which is the whole point.
 *   2. Register the device, or re-register if the server no longer knows it — a
 *      reinstalled app must not be silently unable to decrypt anything.
 *   3. Fetch this device's bundle and install it through the real pipeline.
 *   4. Read back whatever is active, which may be a previous version when the
 *      fetch failed. Serving the previous bundle is correct; serving nothing
 *      silently is not.
 */

import type { SopDocument } from '@sop/core';
import {
  IdbBundleStore,
  IdbIdentityStore,
  installBundle,
  newDeviceIdentity,
  type DeviceIdentity,
  type SignedBundle,
} from '@sop/sync';

import { currentTenant, supabase } from './supabase';

const APP_SCHEMA = 'app';

export type BundleState =
  | { readonly status: 'unavailable'; readonly detail: string }
  | {
      readonly status: 'ready';
      readonly bundleVersion: number;
      readonly sops: readonly SopDocument[];
      readonly installedNow: boolean;
    };

function required(name: string): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `${name} is not set. The browser needs the tenant's public halves to verify a ` +
        'bundle and derive the shared secret; they are public material, not secrets.',
    );
  }
  return value;
}

async function registerDevice(
  userId: string,
  tenantId: string,
  publicKeyBase64: string,
  platform: 'web',
): Promise<string> {
  const client = supabase();

  // Filtered by user as well as tenant and platform. Without the user filter this
  // adopted *somebody else's* device row — the tenant's seed registers a device
  // for a different user — and then re-keyed it. The re-key silently did nothing,
  // because row-level security filters rows rather than raising: the update
  // matched nothing visible and reported success. So the app believed it had a
  // device whose public key it did not hold, and the publisher wrapped a bundle
  // for a key nobody could unwrap.
  const { data: existing, error: lookupError } = await client
    .from('device_registrations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`could not look up this device: ${lookupError.message}`);
  }

  if (existing === null || existing === undefined) {
    const { data: inserted, error } = await client
      .from('device_registrations')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        platform,
        public_key: publicKeyBase64,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) {
      throw new Error(`could not register this device: ${error.message}`);
    }
    return inserted.id as string;
  }

  // `.select()` after the update so the affected rows come back: without it a
  // re-key that RLS filtered to zero rows is indistinguishable from one that
  // worked, which is exactly the confusion this replaced.
  const { data: updated, error: updateError } = await client
    .from('device_registrations')
    .update({ public_key: publicKeyBase64 })
    .eq('id', existing.id)
    .select('id');

  if (updateError) {
    throw new Error(`could not re-key this device: ${updateError.message}`);
  }

  if (updated === null || updated === undefined || updated.length === 0) {
    throw new Error(
      `this device is registered but not re-keyable from here, so it cannot be used ` +
        'to receive bundles',
    );
  }

  return existing.id as string;
}

async function loadOrMintIdentity(platform: 'web'): Promise<DeviceIdentity> {
  const store = new IdbIdentityStore();
  const existing = await store.load();

  const publicKeyBase64 = required('VITE_TENANT_SIGNING_PUBLIC_KEY');
  const serverWrapping = required('VITE_SERVER_WRAPPING_PUBLIC_KEY');

  if (existing !== null) {
    return existing;
  }

  const { data: session } = await supabase().auth.getSession();
  const userId = session.session?.user.id;
  if (userId === undefined) {
    throw new Error('no session, so there is no user to register a device for');
  }

  // Read from the server rather than from the token. device_registrations.tenant_id
  // is NOT NULL, and the value has to be the tenant the platform attributes to
  // this session — not a number read out of a JWT by the page.
  const tenantId = await currentTenant();
  if (tenantId === null) {
    throw new Error('this session has no tenant, so no device can be registered for it');
  }

  // The id is provisional until the server assigns one, so the identity is saved
  // only after registration succeeds. Saving first would leave a stored identity
  // pointing at a device that does not exist.
  const minted = await newDeviceIdentity(userId, publicKeyBase64, serverWrapping);
  const deviceId = await registerDevice(userId, tenantId, minted.devicePublicKeyBase64, platform);

  const identity: DeviceIdentity = { ...minted.identity, deviceId };
  await store.save(identity);
  return identity;
}

/**
 * Fetch, install, and report what is now serving.
 *
 * Never throws for an ordinary condition — no bundle yet, a fetch that failed, a
 * rejected install. Each of those is a state the UI has to be able to name, and a
 * thrown error would collapse them all into "something went wrong".
 */
export async function syncBundle(platform: 'web' = 'web'): Promise<BundleState> {
  const store = new IdbBundleStore();

  let identity: DeviceIdentity;
  try {
    identity = await loadOrMintIdentity(platform);
  } catch (error) {
    return { status: 'unavailable', detail: message(error) };
  }

  const { data: fetched, error: fetchError } = await supabase()
    .schema(APP_SCHEMA)
    .rpc('bundle_for_device', { p_device_id: identity.deviceId });

  let installedNow = false;

  if (fetchError === null && fetched !== null && fetched !== undefined) {
    const outcome = await installBundle(fetched as unknown as SignedBundle, identity, store);
    if (outcome.outcome === 'installed') {
      installedNow = true;
    } else if (outcome.outcome === 'rejected' && outcome.reason !== 'not_monotonic') {
      // not_monotonic is the ordinary case: we already have this or a newer
      // bundle. Anything else is worth saying out loud.
      return { status: 'unavailable', detail: `the server's bundle was refused: ${outcome.reason}` };
    }
  }

  const active = await store.active();

  if (active === null) {
    return {
      status: 'unavailable',
      detail:
        fetchError === null
          ? 'no policy bundle has been published for this tenant yet'
          : `could not fetch this tenant's bundle: ${fetchError.message}`,
    };
  }

  return {
    status: 'ready',
    bundleVersion: active.manifest.bundleVersion,
    sops: active.sops,
    installedNow,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
