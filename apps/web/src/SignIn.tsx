/**
 * The sign-in surface.
 *
 * Exists because, until now, nothing in this product had ever been signed into.
 * Every probe authenticated programmatically; a human had no way in, and the
 * telemetry the app was careful about shipping was reaching a tenant that no
 * person had identified themselves to.
 *
 * Password rather than magic link, and that is a trade-off rather than a
 * preference: a magic link is the better answer for this product, but it needs
 * working outbound email, and a fresh Supabase project's default SMTP will only
 * deliver to the project's own team members. So password is what can be proven
 * today, and the shape here is deliberately the one that a magic-link flow can
 * replace without touching the app shell.
 */

import { useState } from 'react';

import type { AuthState, Identity } from './auth';

interface SignInProps {
    readonly auth: AuthState;
    readonly signIn: (email: string, password: string) => Promise<void>;
    readonly signOut: () => Promise<void>;
    /**
     * Set when sign-out ended the session but could not release everything this
     * device holds. It is shown on the signed-out screen on purpose: the next person
     * to use the machine should be told, not left to find out.
     */
    readonly wipeFailure?: string;
  }

  export function SignInGate({ auth, signIn, signOut, wipeFailure }: SignInProps) {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.status === 'starting') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking your session…</p>
      </main>
    );
  }

  if (auth.status === 'signed-in') {
    return <SessionBar identity={auth.identity} onSignOut={signOut} />;
  }

  if (auth.status === 'failed') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-lg font-semibold text-gray-900">Could not resolve your session</h1>
          <p className="mt-2 text-sm text-gray-600">{auth.detail}</p>
        </div>
      </main>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : String(signInError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
  {wipeFailure !== undefined && wipeFailure !== '' && (
        <p
          data-testid="wipe-failure"
          role="alert"
          className="w-full max-w-sm text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2"
        >
          {wipeFailure}
        </p>
      )}

      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-600">
            Your tenant and role come from the server, not from this form.
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </label>

        {error !== '' && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-gray-900 text-white text-sm font-medium rounded px-3 py-2 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

export function SessionBar({
  identity,
  onSignOut,
}: {
  identity: Identity;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div
      data-testid="session-bar"
      className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 text-xs text-gray-600 min-w-0">
        <span className="font-medium text-gray-900 truncate">{identity.email}</span>
        <span data-testid="session-tenant" className="truncate">
          tenant {identity.tenantId ?? 'unresolved'}
        </span>
        <span data-testid="session-role" className="shrink-0">
          {identity.role ?? 'no role'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="shrink-0 text-xs font-medium text-gray-600 hover:text-gray-900"
      >
        Sign out
      </button>
    </div>
  );
}
