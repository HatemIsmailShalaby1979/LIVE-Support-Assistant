/**
 * The Supabase client, and the environment contract it depends on.
 *
 * This is the first module in the application that can reach a server. Until it
 * existed, `apps/web` contained no network call of any kind: it loaded a
 * checked-in corpus, ran a local model, and wrote to localStorage. Nothing in
 * the product could know a tenant existed.
 *
 * Two deliberate choices:
 *
 * 1. The client is created lazily and throws on missing configuration, rather
 *    than defaulting to something plausible. A silently-unconfigured client
 *    fails later, in a request, with a message about the network instead of a
 *    message about configuration.
 *
 * 2. The schema is named once, here. Every RPC lives in `app`, and that schema
 *    has to be listed in the project's exposed schemas or PostgREST returns 404
 *    for functions that exist and work. `supabase/config.toml` covers
 *    `supabase start` only — a hosted project keeps this setting in its own API
 *    configuration, and the two must be kept in step by hand.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (typeof url !== 'string' || url === '' || typeof publishableKey !== 'string' || publishableKey === '') {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set. ' +
      'Copy .env.example to .env.local and fill them in; Vite only exposes ' +
      'variables prefixed with VITE_, and it inlines them at build time.',
  );
}

let client: SupabaseClient | null = null;

/** The one client for the app. Safe to call from anywhere. */
export function supabase(): SupabaseClient {
  if (client === null) {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Every RPC lives in `app`, never in `public`.
 *
 * `app` is exposed for reads and writes through PostgREST, and RLS plus the
 * function grants in migration 0013 are what actually bound a caller — not this
 * namespace choice.
 */
export const APP_SCHEMA = 'app';

/** The tenant the server attributes to this session, or null when it has none. */
export async function currentTenant(): Promise<string | null> {
  const { data, error } = await supabase().schema(APP_SCHEMA).rpc('current_tenant');
  if (error) {
    throw new Error(`current_tenant failed: ${error.message}`);
  }
  return typeof data === 'string' ? data : null;
}

/** The role the server attributes to this session, or null when it has none. */
export async function currentRole(): Promise<string | null> {
  const { data, error } = await supabase().schema(APP_SCHEMA).rpc('current_role');
  if (error) {
    throw new Error(`current_role failed: ${error.message}`);
  }
  return typeof data === 'string' ? data : null;
}
