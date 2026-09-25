/**
 * Publish a policy bundle.
 *
 * This is the server half of the sync protocol, and the only reason it exists
 * separately from `packages/sync` is one thing: the tenant's manifest-signing
 * private key must never be reachable from a browser or a mobile app. Everything
 * else — canonical JSON, the KEK derivation, the wrap, the install pipeline — is
 * shared code, imported from the built package rather than reimplemented, because
 * two copies of a signing protocol is one copy too many.
 *
 * That is why the package is imported from `packages/sync/dist`: it compiles to
 * fully relative specifiers (`@sop/core` is a type-only import, so nothing bare
 * survives), which means Deno can load it without a bundler or an import map.
 *
 * Authorization is not decided here. The caller's own JWT is forwarded to
 * PostgREST, so `app.publish_policy_bundle` runs as the caller and row-level
 * security decides what they may publish. This function is a cryptography
 * service, not a privilege escalation: it holds the signing key, and it does not
 * get a say in who is allowed to use it.
 *
 * Secrets (set with `supabase secrets set`):
 *   TENANT_SIGNING_PRIVATE_KEY   PKCS#8, base64
 *   TENANT_SIGNING_PUBLIC_KEY    raw Ed25519, base64
 *   SERVER_WRAPPING_PRIVATE_KEY  PKCS#8, base64
 *   SERVER_WRAPPING_PUBLIC_KEY   raw X25519, base64
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importWrappingPublicKey, publishBundle } from '../../../packages/sync/dist/index.js';

const ALGORITHMS = { signing: { name: 'Ed25519' }, wrapping: { name: 'X25519' } };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Minimal claims read, and only to fail fast — never to grant anything. */
function claimsOf(authorization: string): Record<string, unknown> | null {
  const parts = authorization.replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'use POST' }, 405);
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization === '') {
    return json({ error: 'a bearer token is required' }, 401);
  }

  const claims = claimsOf(authorization);
  if (claims === null) {
    return json({ error: 'the bearer token is not a JWT' }, 401);
  }

  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;

  // Fast, explicit refusal for a role that obviously cannot publish. This is not
  // the authorization — row-level security is, and it is what actually rejected
  // the first version of this check. Without it an agent's publish attempt came
  // back as a 502 "bad gateway", which blames the wrong system entirely; the RLS
  // violation underneath was doing the real work and reporting as a gateway error.
  if (appMetadata.app_role !== 'ops_manager') {
    return json({ error: 'publishing a policy bundle requires the ops_manager role' }, 403);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

  // Forwarded verbatim. The RPC then runs as this caller, so RLS is what decides
  // whether they may publish — not a check in this file.
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: tenant, error: tenantError } = await client.schema('app').rpc('current_tenant');
  if (tenantError) {
    return json({ error: `the session has no tenant: ${tenantError.message}` }, 403);
  }

  let body: { sops?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400);
  }

  if (!Array.isArray(body.sops)) {
    return json({ error: 'the body must carry a sops array' }, 400);
  }

  const required = [
    'TENANT_SIGNING_PRIVATE_KEY',
    'TENANT_SIGNING_PUBLIC_KEY',
    'SERVER_WRAPPING_PRIVATE_KEY',
    'SERVER_WRAPPING_PUBLIC_KEY',
  ];
  const missing = required.filter((name) => (Deno.env.get(name) ?? '') === '');
  if (missing.length > 0) {
    // Said plainly, because the alternative is a signature failure on every
    // device that looks like a crypto bug.
    return json({ error: `the server is missing signing material: ${missing.join(', ')}` }, 503);
  }

  const signingPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(Deno.env.get('TENANT_SIGNING_PRIVATE_KEY') ?? ''),
    ALGORITHMS.signing,
    false,
    ['sign'],
  );
  const wrappingPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(Deno.env.get('SERVER_WRAPPING_PRIVATE_KEY') ?? ''),
    ALGORITHMS.wrapping,
    false,
    ['deriveBits'],
  );

  // The next version is read first, because the manifest is signed and the
  // signature covers the version: the publisher has to know it before it can sign.
  const { data: nextVersion, error: versionError } = await client
    .schema('app')
    .rpc('next_bundle_version', { p_tenant: tenant });

  if (versionError) {
    return json({ error: `could not read the next bundle version: ${versionError.message}` }, 502);
  }

  const { data: deviceRows, error: deviceError } = await client
    .schema('app')
    .rpc('enrolled_devices', { p_tenant: tenant });

  if (deviceError) {
    return json({ error: `could not read the device roster: ${deviceError.message}` }, 502);
  }

  const devices = [];
  for (const row of deviceRows ?? []) {
    try {
      devices.push({
        deviceId: row.device_id,
        publicKey: await importWrappingPublicKey(row.public_key),
      });
    } catch {
      // A device whose public key will not import is skipped rather than
      // failing the whole publish: it receives the next bundle it can read, and
      // skipping is visible as a count below.
      continue;
    }
  }

  if (devices.length === 0) {
    return json({ error: 'no enrolled device could be wrapped for' }, 409);
  }

  const model = {
    id: 'Xenova/all-MiniLM-L6-v2',
    revision: '751bff37182d3f1213fa05d7196b954e230abad9',
    quantization: 'q8',
    dimensions: 384,
    ...(typeof body.model === 'object' && body.model !== null ? (body.model as object) : {}),
  };

  const published = await publishBundle({
    tenantId: tenant as string,
    bundleVersion: Number(nextVersion),
    sops: body.sops as never,
    model: model as never,
    signingPrivateKey,
    wrappingPrivateKey,
    devices,
  });

  const deviceKeys = [...published.wrappedKeys.entries()].map(([deviceId, wrappedKey]) => ({
    deviceId,
    wrappedKey,
  }));

  const ciphertext = new Uint8Array(
    Uint8Array.from(atob(published.payloadCiphertext), (c) => c.charCodeAt(0)),
  );

  const { data: storedVersion, error: publishError } = await client.schema('app').rpc('publish_policy_bundle', {
    p_tenant: tenant,
    p_manifest: published.manifest,
    p_signature: published.signature,
    p_payload_ciphertext: `\\x${toHex(ciphertext)}`,
    p_device_keys: deviceKeys,
    // The publisher is the caller's own subject, never a value from the request
    // body: a client that could nominate its own publisher would forge an audit
    // row naming somebody else.
    p_published_by: claims.sub ?? null,
  });

  if (publishError) {
    return json({ error: `the database refused the bundle: ${publishError.message}` }, 502);
  }

  return json({
    bundleVersion: storedVersion,
    manifest: published.manifest,
    wrappedFor: devices.length,
  });
});

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
