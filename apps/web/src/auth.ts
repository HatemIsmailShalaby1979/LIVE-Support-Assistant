/**
 * Session state.
 *
 * The product previously had no notion of a signed-in user at all — it was a page
 * that loaded a corpus and answered queries. This is the smallest honest version
 * of identity: who is signed in, which tenant the server attributes them to, and
 * what role it gives them.
 *
 * Note where the tenant and role come from. Not from the token this file decodes
 * and not from anything the UI holds — from `app.current_tenant()` and
 * `app.current_role()`, which read the claims the server validated. A JWT is a
 * bearer credential; its contents are not authoritative, and decoding it to decide
 * what the user may do would be exactly the client-side trust boundary the
 * database was built to avoid.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { currentRole, currentTenant, supabase } from './supabase';

export interface Identity {
  readonly userId: string;
  readonly email: string;
  /** From the server, not from the token. */
  readonly tenantId: string | null;
  /** From the server, not from the token. */
  readonly role: string | null;
}

export type AuthState =
  | { readonly status: 'starting' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly identity: Identity }
  | { readonly status: 'failed'; readonly detail: string };

async function identify(session: Session): Promise<Identity> {
  // Both are allowed to fail: a user with a session but no tenant is a real state
  // (onboarding not finished) and the UI has to be able to say so.
  const [tenantId, role] = await Promise.all([
    currentTenant().catch(() => null),
    currentRole().catch(() => null),
  ]);

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    tenantId,
    role,
  };
}

/**
 * Subscribe to the session and resolve the server-side identity.
 *
 * The session itself comes from the Supabase client, which persists it and
 * refreshes it. Nothing here caches a decision across a sign-out.
 */
export function useIdentity(): {
  auth: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [auth, setAuth] = useState<AuthState>({ status: 'starting' });

  useEffect(() => {
    const client = supabase();

    const apply = (session: Session | null) => {
      if (session === null) {
        setAuth({ status: 'signed-out' });
        return;
      }
      identify(session)
        .then((identity) => setAuth({ status: 'signed-in', identity }))
        .catch((error: unknown) =>
          setAuth({
            status: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
    };

    void client.auth.getSession().then(({ data }) => apply(data.session));

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase reports invalid credentials without saying which half was wrong,
      // which is the correct behaviour and the reason this message is deliberately
      // unspecific.
      throw new Error('Those credentials were not accepted.');
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  return { auth, signIn, signOut };
}
