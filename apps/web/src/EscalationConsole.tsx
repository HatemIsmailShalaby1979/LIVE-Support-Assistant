import { useCallback, useEffect, useState } from 'react';
import { explainReason, listEscalations, updateEscalation, type Escalation } from './escalations';
import { canWorkEscalations } from './roles';

/**
 * The queue of queries the gate refused, and the place a human resolves them.
 *
 * Four states are named rather than implied: loading, **nothing waiting**, refused
 * to read, and failed. An empty queue says so in words. It must not look like a
 * broken query, because to a team lead the difference between "no escalations" and
 * "the queue is broken" is the difference between a quiet day and an incident.
 */
export function EscalationConsole({ role }: { role: string | null }): React.ReactElement {
  const [queue, setQueue] = useState<Escalation[] | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const canWork = canWorkEscalations(role);

  // The effect only starts the request. Clearing the previous failure is a
  // user-initiated act, and doing it here would set state during render and cascade
  // a second pass.
  const run = useCallback(() => {
    void listEscalations()
      .then(setQueue)
      .catch((error: unknown) => {
        setQueue(null);
        setFailure(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const refresh = () => {
    setFailure('');
    run();
  };

  const move = (escalation: Escalation, status: 'assigned' | 'resolved') => {
    setBusy(escalation.id);
    setFailure('');
    void updateEscalation(escalation.id, { status, resolution: notes[escalation.id] ?? '' })
      .then(run)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(null));
  };

  return (
    <section data-testid="escalation-console" className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Escalations</h2>
          <p className="text-sm text-gray-600">
            Queries the gate would not answer. Each one is a customer waiting on a person.
          </p>
        </div>
        <button
          type="button"
          data-testid="ec-refresh"
          onClick={refresh}
          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
        >
          Refresh
        </button>
      </header>

      {failure !== '' && (
        <p
          data-testid="ec-error"
          role="alert"
          className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2"
        >
          {failure}
        </p>
      )}

      {queue === null && failure === '' && (
        <p className="text-sm text-gray-600" role="status">
          Loading the queue…
        </p>
      )}

      {queue !== null && queue.length === 0 && (
        <p data-testid="ec-empty" className="text-sm text-gray-600">
          Nothing is waiting. Every query this tenant asked has been answered or sent
          somewhere else.
        </p>
      )}

      {queue !== null && queue.length > 0 && (
        <ol className="space-y-3">
          {queue.map((escalation) => (
            <li
              key={escalation.id}
              data-testid={`ec-row-${escalation.id}`}
              className="border border-gray-200 rounded p-3 bg-white"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-gray-900">
                  {escalation.queryText || '(no query text recorded)'}
                </p>
                <span
                  data-testid={`ec-status-${escalation.id}`}
                  className="text-xs uppercase tracking-wide text-gray-500"
                >
                  {escalation.status}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-600">{explainReason(escalation.reason)}</p>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                <div>
                  <dt className="inline font-medium">Asked </dt>
                  <dd className="inline">{new Date(escalation.occurredAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Bundle </dt>
                  <dd className="inline">{escalation.bundleVersion ?? 'unknown'}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Candidates </dt>
                  <dd className="inline">{escalation.candidates.length}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Assigned </dt>
                  <dd className="inline">{escalation.assignedTo ?? 'nobody'}</dd>
                </div>
              </dl>

              {escalation.candidates.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-600 cursor-pointer">
                    What the gate was choosing between
                  </summary>
                  <ul className="mt-1 space-y-1 text-xs text-gray-700">
                    {escalation.candidates.map((candidate) => (
                      <li key={candidate.sopId}>
                        <span className="font-mono">{candidate.score.toFixed(3)}</span>{' '}
                        {candidate.passage}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {escalation.resolution !== null && escalation.resolution !== '' && (
                <p data-testid={`ec-resolution-${escalation.id}`} className="mt-2 text-sm text-gray-700">
                  <span className="font-medium">Resolution: </span>
                  {escalation.resolution}
                </p>
              )}

              {canWork && escalation.status !== 'resolved' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`ec-note-${escalation.id}`}>
                    Resolution note
                  </label>
                  <input
                    id={`ec-note-${escalation.id}`}
                    data-testid={`ec-note-${escalation.id}`}
                    value={notes[escalation.id] ?? ''}
                    onChange={(event) => setNotes({ ...notes, [escalation.id]: event.target.value })}
                    placeholder="What did you tell the customer?"
                    className="flex-1 min-w-48 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  {escalation.status === 'open' && (
                    <button
                      type="button"
                      data-testid={`ec-claim-${escalation.id}`}
                      disabled={busy !== null}
                      onClick={() => move(escalation, 'assigned')}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                    >
                      {busy === escalation.id ? 'Saving…' : 'Take it'}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`ec-resolve-${escalation.id}`}
                    disabled={busy !== null}
                    onClick={() => move(escalation, 'resolved')}
                    className="text-xs border border-gray-900 rounded px-2 py-1 bg-gray-900 text-white disabled:opacity-50"
                  >
                    {busy === escalation.id ? 'Saving…' : 'Resolve'}
                  </button>
                </div>
              )}

              {!canWork && escalation.status !== 'resolved' && (
                <p data-testid={`ec-readonly-${escalation.id}`} className="mt-2 text-xs text-gray-500">
                  Read only. Resolving an escalation is a team lead&apos;s or ops
                  manager&apos;s action.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
