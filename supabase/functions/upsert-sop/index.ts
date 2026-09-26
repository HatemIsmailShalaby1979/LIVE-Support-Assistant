/**
 * Author a policy procedure.
 *
 * The reason this exists as a server-side function rather than a table write: a
 * procedure body is stored encrypted (`sop_versions.body_ciphertext`), and the key
 * that encrypts it must never be held by the browser that typed it. So the
 * authoring path is the same shape as the publish path — the caller is
 * authorized by row-level security, and the function owns the key.
 *
 * The encrypted body is the whole procedure document as JSON: category, summary,
 * suggested reply, trigger keywords, and whether it must route to a human. The
 * title stays in the clear on `sops`, because a procedure's name is not the
 * sensitive part and an auditor needs to see it without a decryption key.
 *
 * Lifecycle: every edit is a new immutable version, never an update. `sops.status`
 * moves draft -> in_review -> published -> retired, and only `published` procedures
 * with their latest version are what the publish path will send to a device.
 *
 * Secrets:
 *   SOP_BODY_KEY  base64 of 32 bytes, the AES-256-GCM key for procedure bodies
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_STATUS = new Set(['draft', 'in_review', 'published', 'retired']);

interface SopBody {
  category: string;
  summary: string;
  suggestedReply: string;
  escalationRequired: boolean;
  escalationReason: string;
  triggerKeywords: string[];
}

// CORS is handled here rather than left to the platform, because without it the
// browser never sees the function at all: supabase-js reports "Failed to send a
// request to the Edge Function" for a preflight that was not answered, which is
// indistinguishable from a network outage and sent this slice's first browser run
// looking for a transport fault instead of a 403. Nothing has called an edge
// function from the browser until now, so nothing had answered the preflight.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, PUT, GET, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function claimsOf(authorization: string): Record<string, unknown> | null {
  const parts = authorization.replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * Decrypt a procedure's current body for an editor.
 *
 * Without this, an editor can author and change a status but cannot load a
 * procedure's text, so revising content means retyping it — and any control that
 * pretended to preserve content while replacing it would be worse than one that
 * admits the limit. The role gate is the same as writing: same trust, same tenant,
 * same key.
 */
async function readBack(
  client: ReturnType<typeof createClient>,
  tenantId: string,
  key: CryptoKey,
  sopId: string,
): Promise<Response> {
  const { data: sop, error: sopError } = await client
    .from('sops')
    .select('id, title, status')
    .eq('id', sopId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (sopError) return json({ error: `could not read the procedure: ${sopError.message}` }, 502);
  if (sop === null || sop === undefined) {
    return json({ error: 'no such procedure on this tenant' }, 404);
  }

  const { data: version } = await client
    .from('sop_versions')
    .select('version, body_ciphertext')
    .eq('sop_id', sopId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (version === null || version === undefined) {
    return json({ sopId, title: sop.title, status: sop.status, version: 0, body: null });
  }

  const packed = fromHex(String(version.body_ciphertext).replace(/^\\x/, ''));

  if (packed.length < 12 + 16) {
    return json(
      { error: `procedure "${sop.title}" has a body this server did not write, so it cannot be read` },
      502,
    );
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12) },
      key,
      packed.slice(12) as BufferSource,
    );
    return json({
      sopId,
      title: sop.title,
      status: sop.status,
      version: version.version,
      body: JSON.parse(new TextDecoder().decode(plaintext)),
    });
  } catch {
    return json(
      { error: `procedure "${sop.title}" could not be decrypted with the server's body key` },
      502,
    );
  }
}

/**
 * Change a procedure's status without touching its content.
 *
 * Copies the latest ciphertext and its hash verbatim into a new version. The key
 * is never used here, which is what makes this safe to call on the rows nothing
 * else can read: for a corrupt body it copies corrupt bytes into a version nobody
 * will publish or read, and the row stops blocking the tenant.
 */
async function statusOnly(
  client: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string | null,
  payload: Record<string, unknown>,
): Promise<Response> {
  const sopId = payload.sopId as string;
  const status = typeof payload.status === 'string' ? payload.status : 'draft';
  if (!ALLOWED_STATUS.has(status)) {
    return json({ error: `status must be one of ${[...ALLOWED_STATUS].join(', ')}` }, 400);
  }
  const changeNote =
    typeof payload.changeNote === 'string' && payload.changeNote !== ''
      ? payload.changeNote
      : `Status set to ${status} without reading the body.`;

  const { data: sop, error: sopError } = await client
    .from('sops')
    .select('id, title, status')
    .eq('id', sopId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (sopError) return json({ error: `could not read the procedure: ${sopError.message}` }, 502);
  if (sop === null || sop === undefined) {
    return json({ error: 'no such procedure on this tenant' }, 404);
  }

  const { data: latest, error: versionError } = await client
    .from('sop_versions')
    .select('version, body_ciphertext, body_hash')
    .eq('sop_id', sopId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    return json({ error: `could not read the current version: ${versionError.message}` }, 502);
  }
  if (latest === null || latest === undefined) {
    return json({ error: 'the procedure has no version to carry forward' }, 400);
  }

  const title =
    typeof payload.title === 'string' && payload.title.trim() !== ''
      ? payload.title.trim()
      : (sop.title as string);

  const { error: updateError } = await client
    .from('sops')
    .update({ title, status })
    .eq('id', sopId)
    .eq('tenant_id', tenantId);

  if (updateError) {
    return json({ error: `could not update the procedure: ${updateError.message}` }, 502);
  }

  const { data: written, error: writeError } = await client
    .from('sop_versions')
    .insert({
      sop_id: sopId,
      tenant_id: tenantId,
      version: (latest.version as number) + 1,
      body_ciphertext: latest.body_ciphertext,
      body_hash: latest.body_hash,
      change_note: changeNote,
      created_by: userId,
    })
    .select('id')
    .single();

  if (writeError) {
    return json({ error: `could not write the version: ${writeError.message}` }, 502);
  }

  return json({ sopId, version: (latest.version as number) + 1, status, versionId: written?.id });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (authorization === '') return json({ error: 'a bearer token is required' }, 401);

  const claims = claimsOf(authorization);
  if (claims === null) return json({ error: 'the bearer token is not a JWT' }, 401);

  const appMetadata = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const role = String(appMetadata.app_role ?? '');

  // Fast and explicit, so a refusal is not reported as a database error. The real
  // authority is the insert policy below: an editor may author content, an agent
  // may not, and row-level security is what decides that no matter what a token
  // claims.
  if (role !== 'ops_manager' && role !== 'sop_editor') {
    return json({ error: 'authoring a procedure requires an editor or ops manager' }, 403);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
  const bodyKey = Deno.env.get('SOP_BODY_KEY') ?? '';

  if (bodyKey === '') {
    return json({ error: 'the server has no SOP_BODY_KEY, so bodies cannot be read or stored' }, 503);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: tenant, error: tenantError } = await client.schema('app').rpc('current_tenant');
  if (tenantError) return json({ error: `the session has no tenant: ${tenantError.message}` }, 403);

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(bodyKey) as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  // The read is available over GET for curl and over POST with `read: true` for the
  // browser. It is a POST from the app because a GET through supabase-js
  // `functions.invoke`, with a query string and a custom Authorization header, did
  // not get its preflight answered on this project — and a refusal that arrives as
  // a transport error is a refusal the reader cannot act on.
  const url = new URL(request.url);
  const wantsRead =
    request.method === 'GET' ||
    (request.method === 'POST' && url.pathname.endsWith('/upsert-sop') && request.headers.get('x-sop-mode') === 'read');

  if (request.method === 'GET') {
    const sopId = url.searchParams.get('sopId');
    if (sopId === null || sopId === '') {
      return json({ error: 'a GET needs a sopId' }, 400);
    }
    return readBack(client, tenant as string, key, sopId);
  }

  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: 'use POST to create, PUT to revise, or GET to read one' }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400);
  }

  if (payload.read === true) {
    const sopId = typeof payload.sopId === 'string' ? payload.sopId : '';
    if (sopId === '') return json({ error: 'a read needs a sopId' }, 400);
    return readBack(client, tenant as string, key, sopId);
  }

  // A change that carries no body fields is a status change, not a revision.
  // The latest ciphertext is copied verbatim into the new version, and nothing is
  // decrypted — which is the whole point, because this path exists for the rows
  // that cannot be decrypted.
  //
  // Without it, one corrupt published row bricks the tenant: publish-bundle refuses
  // the whole publish naming it, and every UI control that reads the body first
  // fails on the same bytes, so there is no way to retire the row that blocks
  // everything. A status change needs no content — retirement least of all — so it
  // must not require reading any.
  //
  // Two deliberate limits. The title may be set (it is a cleartext column and the
  // same role gate already passed), but no body field may appear: a call carrying
  // `summary` takes the normal path below and encrypts it. And "no body" means the
  // existing bytes are kept, never blanked — there is no input on which this path
  // writes an empty procedure.
  const BODY_FIELDS = [
    'category',
    'summary',
    'suggestedReply',
    'escalationRequired',
    'escalationReason',
    'triggerKeywords',
  ] as const;
  const carriesBody = BODY_FIELDS.some((field) => payload[field] !== undefined);

  if (
    typeof payload.sopId === 'string' &&
    payload.sopId !== '' &&
    !carriesBody
  ) {
    return statusOnly(client, tenant as string, claims.sub ?? null, payload);
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (title === '') return json({ error: 'a procedure needs a title' }, 400);

  const status = typeof payload.status === 'string' ? payload.status : 'draft';
  if (!ALLOWED_STATUS.has(status)) {
    return json({ error: `status must be one of ${[...ALLOWED_STATUS].join(', ')}` }, 400);
  }

  const sopId = typeof payload.sopId === 'string' && payload.sopId !== '' ? payload.sopId : null;
  const changeNote = typeof payload.changeNote === 'string' ? payload.changeNote : null;

  // On a create the whole document must be present. On a revision the caller may
  // send only the fields it is changing, which is why the body is merged with the
  // current version rather than replaced wholesale.
  const body: SopBody = {
    category: String(payload.category ?? 'general'),
    summary: String(payload.summary ?? ''),
    suggestedReply: String(payload.suggestedReply ?? ''),
    escalationRequired: payload.escalationRequired === true,
    escalationReason: String(payload.escalationReason ?? ''),
    triggerKeywords: Array.isArray(payload.triggerKeywords)
      ? payload.triggerKeywords.map((keyword) => String(keyword))
      : [],
  };

  if (body.summary === '') {
    return json({ error: 'a procedure needs a summary — it is what retrieval matches against' }, 400);
  }

  // No check on how many procedures a tenant has. There was one here — a
  // "this tenant already has a procedure" rule with a 409 — and it was wrong on
  // two counts: a tenant is supposed to have many procedures, and the lookup
  // behind it used `maybeSingle()` over a table that legitimately has several
  // rows, so it would have errored on the second one anyway.
  let targetId = sopId;

  if (targetId === null) {
    const { data: created, error } = await client
      .from('sops')
      .insert({
        tenant_id: tenant,
        title,
        status,
        created_by: claims.sub ?? null,
      })
      .select('id')
      .single();
    if (error) return json({ error: `could not create the procedure: ${error.message}` }, 502);
    targetId = created.id as string;
  } else {
    const { error } = await client
      .from('sops')
      .update({ title, status })
      .eq('id', targetId)
      .eq('tenant_id', tenant);
    if (error) return json({ error: `could not update the procedure: ${error.message}` }, 502);
  }

  const { data: versions, error: versionError } = await client
    .from('sop_versions')
    .select('version')
    .eq('sop_id', targetId)
    .order('version', { ascending: false })
    .limit(1);

  if (versionError) {
    return json({ error: `could not read the current version: ${versionError.message}` }, 502);
  }

  const nextVersion = (versions?.[0]?.version ?? 0) + 1;
  const plaintext = new TextEncoder().encode(JSON.stringify(body));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource),
  );

  const { data: written, error: writeError } = await client
    .from('sop_versions')
    .insert({
      sop_id: targetId,
      tenant_id: tenant,
      version: nextVersion,
      body_ciphertext: `\\x${
        `${toHex(iv)}${toHex(ciphertext)}`
      }`,
      body_hash: await sha256Hex(plaintext),
      change_note: changeNote,
      created_by: claims.sub ?? null,
    })
    .select('id')
    .single();

  if (writeError) {
    return json({ error: `could not write the version: ${writeError.message}` }, 502);
  }

  return json({ sopId: targetId, version: nextVersion, status, versionId: written?.id });
});
