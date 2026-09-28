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
// Single source of truth for contradictory-procedure detection, shared with the
// lint CLI and the verification harnesses. A bundle whose corpus carries a
// same-category numeric conflict is blocked here, before it is signed.
import { lintCorpusForPublish } from '../../../tooling/conflicts/conflict-core.mjs';

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
    body = {};
  }

  // The corpus is read from the database, not from the request.
  //
  // A caller-supplied corpus is the last thing that should be authoritative: it
  // means the device's procedures are whatever the HTTP body happened to contain,
  // and a tenant cannot review what it is about to be told. So this function
  // assembles the corpus from the tenant's own published procedures, decrypting
  // each body with the key that only this side of the platform holds.
  const read = await readCorpus(client, tenant as string);
  if ('error' in read) {
    return json({ error: read.error }, 502);
  }
  const corpus = read.corpus;

  if (corpus.length === 0) {
    return json(
      { error: 'this tenant has no published procedure, so there is nothing to publish' },
      409,
    );
  }

  // Contradictory-policy guard (decision doc option (a)). The Confidence Gate
  // measures how decisive a match is, not whether the corpus agrees with itself,
  // so a same-category numeric conflict would be served to agents. We block the
  // publish before any signing happens and name the conflict precisely. This is
  // a publishing-process check only; the gate, thresholds and scoring are
  // untouched. `conflict-core.mjs` carries no node built-ins, so it loads in Deno.
  const conflictCheck = lintCorpusForPublish(corpus as unknown as Array<Record<string, unknown>>);
  if (!conflictCheck.ok) {
    return json(
      {
        error: 'publication blocked: the tenant corpus contains contradictory procedures',
        detail: conflictCheck.message,
        conflicts: conflictCheck.conflicts,
        data_mode: 'simulated',
      },
      422,
    );
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
    sops: corpus as never,
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
    // The procedure count, so a client can assert what it should be serving
    // without hard-coding a number. The tenant's published set moves as procedures
    // are authored, so an assertion that pins a count passes until anything else
    // touches the tenant, and then fails for a reason that has nothing to do with
    // what is being tested.
    sopCount: corpus.length,
    wrappedFor: devices.length,
  });
});

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Assemble the tenant's published procedures, decrypting each body.
 *
 * Only `published` procedures, and only each one's latest version — an older
 * version is history, not what agents should be told. A body that will not decrypt
 * fails the whole read rather than being skipped: a device that silently receives
 * a tenant's procedures minus one is worse than a publish that reports an error.
 * The failure names the procedure, because "the server could not read this
 * tenant's procedures" sends a reader to the wrong system entirely.
 */
async function readCorpus(
  client: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<{ corpus: unknown[] } | { error: string }> {
  const bodyKeyValue = Deno.env.get('SOP_BODY_KEY') ?? '';
  if (bodyKeyValue === '') return { error: 'the server has no SOP_BODY_KEY' };

  const { data: sops, error } = await client
    .from('sops')
    .select('id, title')
    .eq('tenant_id', tenantId)
    .eq('status', 'published');

  if (error) return { error: `could not read this tenant's procedures: ${error.message}` };

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(bodyKeyValue) as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const corpus: unknown[] = [];

  for (const sop of sops ?? []) {
    const { data: version } = await client
      .from('sop_versions')
      .select('body_ciphertext')
      .eq('sop_id', sop.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (version === null || version === undefined) {
      return { error: `procedure "${sop.title}" has no version to publish` };
    }

    // iv || ciphertext || tag, as written by upsert-sop. Anything shorter, or
    // anything that fails the authentication tag, is not a body this server wrote —
    // a fixture placeholder, typically. Named rather than skipped, because
    // publishing around it would ship a tenant fewer procedures than it believes.
    const packed = fromHex(String(version.body_ciphertext).replace(/^\\x/, ''));

    if (packed.length < 12 + 16) {
      return {
        error:
          `procedure "${sop.title}" has a body this server did not write, so it cannot be ` +
          'published. Every published procedure must have been authored through the server.',
      };
    }

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: packed.slice(0, 12) },
        key,
        packed.slice(12) as BufferSource,
      );
      corpus.push({
        id: sop.id,
        title: sop.title,
        ...JSON.parse(new TextDecoder().decode(plaintext)),
      });
    } catch {
      return { error: `procedure "${sop.title}" could not be decrypted with the server's body key` };
    }
  }

  return { corpus };
}
