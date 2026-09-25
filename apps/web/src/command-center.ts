/**
 * The Command Center client.
 *
 * The contract before the screen: what a procedure looks like from a browser, and
 * the four things a tenant can do to its own policy. Both mutation paths go
 * through an edge function, never to a table directly, because the procedure body
 * is stored encrypted and the key that decrypts it must not be reachable from a
 * page that accepted the text.
 *
 * One limit is deliberate and visible rather than hidden. A stored body cannot be
 * read back — the browser has no key — so this client can list what exists, author
 * a new procedure, and change a status, but it cannot load a procedure's text for
 * editing. Revising content means the editor supplies the full text again. That is
 * a real gap, not a design choice, and it is the first thing to fix after this
 * slice: it needs a server path that decrypts to an authorised editor, which is a
 * privilege question rather than a plumbing one.
 */

import { SUPABASE_URL, supabase } from './supabase';

export type ProcedureStatus = 'draft' | 'in_review' | 'published' | 'retired';

export const PROCEDURE_STATUSES: readonly ProcedureStatus[] = [
  'draft',
  'in_review',
  'published',
  'retired',
];

export interface ProcedureSummary {
  readonly id: string;
  readonly title: string;
  readonly status: ProcedureStatus;
  /** Latest version number, 0 when the procedure has never been revised. */
  readonly version: number;
}

/** What a person types. The browser never sees a key, and never stores plaintext. */
export interface ProcedureDraft {
  readonly title: string;
  readonly category: string;
  readonly summary: string;
  readonly suggestedReply: string;
  readonly escalationRequired: boolean;
  readonly escalationReason: string;
  readonly triggerKeywords: readonly string[];
}

export interface SaveResult {
  readonly sopId: string;
  readonly version: number;
  readonly status: ProcedureStatus;
}

export interface PublishResult {
  readonly bundleVersion: number;
  readonly wrappedFor: number;
}

async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
  accessToken: string,
  supabaseUrl: string,
): Promise<T> {
  // Plain fetch rather than `supabase.functions.invoke`, for one reason: invoke
  // reports "Edge Function returned a non-2xx status code" and drops the response
  // body, so a refusal reaches the screen as a generic string. The functions name
  // the procedure and the cause precisely, and a message that says neither is not
  // actionable — it sends the reader to the wrong system.
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const reason =
      parsed !== null && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `the server returned ${response.status}`;
    throw new Error(reason);
  }

  return parsed as T;
}

/**
 * A session's own access token, for the edge functions.
 *
 * The Supabase client attaches this automatically to `functions.invoke`, so this is
 * a belt-and-braces read: a function that refuses a caller must refuse it for a
 * real reason, and a request without a token is a 401 we would rather see as one.
 */
async function accessToken(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (token === undefined) {
    throw new Error('no session, so there is nothing to do as this user');
  }
  return token;
}

/** A procedure loaded back from the server, ready to be edited. */
export interface LoadedProcedure {
  readonly sopId: string;
  readonly title: string;
  readonly status: ProcedureStatus;
  readonly version: number;
  readonly draft: ProcedureDraft;
}

export async function listProcedures(): Promise<ProcedureSummary[]> {
  // The embedded versions come back over the foreign key, so the version number
  // costs no extra round trip. RLS scopes it to the caller's own tenant, and a
  // frontline agent may not read this table at all — which is the correct answer,
  // so an empty list is reported as an empty list rather than as a failure.
  const { data, error } = await supabase()
    .from('sops')
    .select('id, title, status, sop_versions(version)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`could not list procedures: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const versions = (row.sop_versions ?? []) as unknown as { version: number }[];
    const version = versions.reduce((highest, entry) => Math.max(highest, entry.version), 0);
    return {
      id: String(row.id),
      title: String(row.title),
      status: String(row.status) as ProcedureStatus,
      version,
    };
  });
}

/**
 * Load a procedure's current text so it can be revised.
 *
 * This is the path the earlier version of this client did not have, and its
 * absence had a visible cost: a status change had to send a placeholder body,
 * because there was no way to know what the real one was. Anything that changes a
 * row has to carry the content forward, and only the server can supply it.
 */
export async function readProcedure(sopId: string): Promise<LoadedProcedure> {
  return callFunction<LoadedProcedure>('upsert-sop', { read: true, sopId }, await accessToken(), SUPABASE_URL);
}

export async function saveProcedure(
  draft: ProcedureDraft,
  options: { sopId?: string; status?: ProcedureStatus; changeNote?: string } = {},
): Promise<SaveResult> {
  return callFunction<SaveResult>(
    'upsert-sop',
    {
      ...draft,
      sopId: options.sopId,
      status: options.status ?? 'draft',
      changeNote: options.changeNote,
    },
    await accessToken(),
    SUPABASE_URL,
  );
}

export async function publishBundle(): Promise<PublishResult> {
  return callFunction<PublishResult>('publish-bundle', {}, await accessToken(), SUPABASE_URL);
}
