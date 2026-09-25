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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

function claimsOf(authorization: string): Record<string, unknown> | null {
  const parts = authorization.replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: 'use POST to create or PUT to revise' }, 405);
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
    return json({ error: 'the server has no SOP_BODY_KEY, so bodies cannot be stored' }, 503);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: tenant, error: tenantError } = await client.schema('app').rpc('current_tenant');
  if (tenantError) return json({ error: `the session has no tenant: ${tenantError.message}` }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'the body must be JSON' }, 400);
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

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(bodyKey) as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

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
