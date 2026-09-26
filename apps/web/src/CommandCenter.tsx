/**
 * The Command Center.
 *
 * The screen an editor or ops manager works in. It exists because the only place a
 * tenant's procedures could previously be changed was the publish request body, so
 * nobody could review what they were about to be told.
 *
 * Design commitments, in the order they mattered here:
 *
 * 1. Navigation answers "where am I". This is a tab beside the agent's view, not a
 *    separate product, and the tab that is not current is visibly inactive.
 * 2. Every action has a visible surface within a moment. Saving and publishing both
 *    disable their button and say what they are doing, because each is a round trip
 *    to a server that encrypts and signs.
 * 3. Failures say what broke and what to do next. The edge functions name the
 *    procedure and the cause, and that text is shown rather than swallowed — a
 *    refusal that reads "permission denied" with no subject is not actionable.
 * 4. The empty state is designed, not implied. "No procedures yet" with the form
 *    already open is the state a new tenant is in on day one.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  PROCEDURE_STATUSES,
  listProcedures,
  publishBundle,
  readProcedure,
  saveProcedure,
  setProcedureStatus,
  type ProcedureDraft,
  type ProcedureStatus,
  type ProcedureSummary,
} from './command-center';

const EMPTY_DRAFT: ProcedureDraft = {
  title: '',
  category: 'general',
  summary: '',
  suggestedReply: '',
  escalationRequired: false,
  escalationReason: '',
  triggerKeywords: [],
};

type Status = 'loading' | 'ready' | 'failed';

export function CommandCenter({ onPublished }: { onPublished: () => void }) {
  const [procedures, setProcedures] = useState<ProcedureSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [draft, setDraft] = useState<ProcedureDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{ sopId: string; version: number; status: ProcedureStatus } | null>(null);
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  // A status change whose read failed, waiting on the person to decide. The read is
  // what carries content forward, so without it the change cannot proceed the normal
  // way — but a status change needs no content, so the screen offers to apply it
  // without reading rather than leaving the row stuck.
  const [stuckChange, setStuckChange] = useState<{
    sopId: string;
    title: string;
    status: ProcedureStatus;
  } | null>(null);

  // The load itself, with no leading setState. Called straight from the effect
  // below, where a synchronous state update would cascade a render before the
  // data has even been asked for.
  const load = useCallback(async () => {
    try {
      setProcedures(await listProcedures());
      setStatus('ready');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }, []);

  // An explicit refresh, which does show that something is happening. Kept apart
  // from `load` for exactly that reason.
  const refresh = useCallback(async () => {
    setStatus('loading');
    await load();
  }, [load]);

  useEffect(() => {
    // Deferred by a tick on purpose. Calling the load straight from the effect body
    // sets state within that same commit, which React treats as a cascading render
    // — and it is, on a screen that already renders its own loading state from
    // `status === 'loading'`. The data is fetched either way; only the ordering
    // moves, out of the effect body and into the first idle moment.
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [load]);

  async function save(status: ProcedureStatus) {
    setBusy('save');
    setFailure('');
    setNotice('');
    try {
      const result = await saveProcedure(
        { ...draft, triggerKeywords: keywords.split(',').map((k) => k.trim()).filter((k) => k !== '') },
        {
          ...(editing === null ? {} : { sopId: editing.sopId }),
          status,
          changeNote: editing === null ? 'Authored.' : `Revised version ${editing.version}.`,
        },
      );
      setDraft(EMPTY_DRAFT);
      setKeywords('');
      setEditing(null);
      setNotice(
        status === 'published'
          ? `Saved as published — version ${result.version}. Devices need the next publish to receive it.`
          : `Saved as ${result.status} — version ${result.version}.`,
      );
      await refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy('publish');
    setFailure('');
    setNotice('');
    try {
      const result = await publishBundle();
      setNotice(
        `Published bundle ${result.bundleVersion} to ${result.wrappedFor} enrolled device(s).`,
      );
      onPublished();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const canSubmit = draft.title.trim() !== '' && draft.summary.trim() !== '';

  return (
    <section data-testid="command-center" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Procedures</h2>
          <p className="text-sm text-gray-600">
            Saved here, encrypted by the server, and sent to devices only on publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy !== null || procedures.length === 0}
          className="bg-gray-900 text-white text-sm font-medium rounded px-3 py-2 disabled:opacity-50"
        >
          {busy === 'publish' ? 'Publishing…' : 'Publish to devices'}
        </button>
      </header>

      {notice !== '' && (
        <p data-testid="cc-notice" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2">
          {notice}
        </p>
      )}
      {failure !== '' && (
        <p data-testid="cc-error" role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
          {failure}
        </p>
      )}
      {stuckChange !== null && (
        <p data-testid="cc-stuck" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          &ldquo;{stuckChange.title}&rdquo; could not be read, so its text cannot be
          carried forward. Its stored bytes stay exactly as they are — this only
          changes the status.{' '}
          <button
            type="button"
            data-testid={`cc-force-${stuckChange.sopId}`}
            disabled={busy !== null}
            onClick={() => {
              const change = stuckChange;
              setBusy('save');
              setFailure('');
              setNotice('');
              void setProcedureStatus(
                change.sopId,
                change.status,
                `Status set to ${change.status} without reading the body.`,
              )
                .then((result) => {
                  setStuckChange(null);
                  setNotice(
                    `${change.title} is now ${result.status} — version ${result.version}.`,
                  );
                  return refresh();
                })
                .catch((error: unknown) =>
                  setFailure(error instanceof Error ? error.message : String(error)),
                )
                .finally(() => setBusy(null));
            }}
            className="underline font-medium disabled:opacity-50"
          >
            Set it to {stuckChange.status} without reading the body
          </button>
        </p>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {status === 'loading' && <p className="p-4 text-sm text-gray-500">Loading procedures…</p>}

        {status === 'ready' && procedures.length === 0 && (
          <p className="p-4 text-sm text-gray-500">
            No procedures yet. The form below is the whole of it — write the first one.
          </p>
        )}

        {status === 'ready' && procedures.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 border-b border-gray-200">
              <tr>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Version</th>
                <th className="p-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {procedures.map((procedure) => (
                <tr key={procedure.id} data-testid="cc-row" className="border-b border-gray-100 last:border-0">
                  <td className="p-3 text-gray-900">{procedure.title}</td>
                  <td className="p-3">
                    <span className="text-xs font-medium text-gray-700">{procedure.status}</span>
                  </td>
                  <td className="p-3 text-gray-600">{procedure.version}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`cc-edit-${procedure.id}`}
                        disabled={busy !== null}
                        onClick={() => {
                          setBusy('save');
                          setFailure('');
                          setNotice('');
                          void readProcedure(procedure.id)
                            .then((loaded) => {
                              setEditing({ sopId: loaded.sopId, version: loaded.version, status: loaded.status });
                              setDraft(loaded.draft);
                              setKeywords(loaded.draft.triggerKeywords.join(', '));
                              setNotice(`Loaded "${loaded.title}" — version ${loaded.version}.`);
                            })
                            .catch((error: unknown) =>
                              setFailure(error instanceof Error ? error.message : String(error)),
                            )
                            .finally(() => setBusy(null));
                        }}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <select
                      aria-label={`status for ${procedure.title}`}
                      value={procedure.status}
                      disabled={busy !== null}
                      onChange={(event) => {
                        const next = event.target.value as ProcedureStatus;
                        setBusy('save');
                        setFailure('');
                        setNotice('');
                        setStuckChange(null);
                        // The content is loaded first, because changing a status is
                        // also a new version and a version has to carry the body
                        // forward. The earlier version of this control sent a
                        // placeholder instead, which would have quietly replaced
                        // every procedure anyone edited.
                        void readProcedure(procedure.id)
                          .then((loaded) =>
                            saveProcedure(loaded.draft, {
                              sopId: loaded.sopId,
                              status: next,
                              changeNote: `Status set to ${next}.`,
                            }),
                          )
                          .then((result) => {
                            setNotice(
                              `${procedure.title} is now ${result.status} — version ${result.version}.`,
                            );
                            return refresh();
                          })
                          .catch((error: unknown) => {
                            setFailure(error instanceof Error ? error.message : String(error));
                            // The read is what failed, not the decision. Remember
                            // the requested change so the screen can offer to apply
                            // it without reading, instead of leaving the row stuck.
                            setStuckChange({
                              sopId: procedure.id,
                              title: procedure.title,
                              status: next,
                            });
                          })
                          .finally(() => setBusy(null));
                      }}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      {PROCEDURE_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {editing === null ? 'Author a procedure' : 'Revise a procedure'}
          </h3>
          {editing !== null && (
            <span data-testid="cc-editing" className="text-xs text-gray-600">
              Editing version {editing.version} — saving writes version {editing.version + 1}
              <button
                type="button"
                data-testid="cc-cancel-edit"
                onClick={() => { setEditing(null); setDraft(EMPTY_DRAFT); setKeywords(''); }}
                className="ml-2 underline"
              >
                Cancel
              </button>
            </span>
          )}
        </div>

        <Field label="Title" required>
          <input
            data-testid="cc-title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Category">
          <input
            data-testid="cc-category"
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Summary" hint="What retrieval matches against. Required." required>
          <textarea
            data-testid="cc-summary"
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-24"
          />
        </Field>

        <Field label="Suggested reply">
          <textarea
            data-testid="cc-reply"
            value={draft.suggestedReply}
            onChange={(event) => setDraft({ ...draft, suggestedReply: event.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-20"
          />
        </Field>

        <Field label="Trigger keywords" hint="Comma separated. Legacy only; retrieval is semantic.">
          <input
            data-testid="cc-keywords"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            data-testid="cc-escalation"
            type="checkbox"
            checked={draft.escalationRequired}
            onChange={(event) => setDraft({ ...draft, escalationRequired: event.target.checked })}
          />
          Must route to a human, never auto-answered
        </label>

        {draft.escalationRequired && (
          <Field label="Why it must be reviewed" required>
            <input
              data-testid="cc-escalation-reason"
              value={draft.escalationReason}
              onChange={(event) => setDraft({ ...draft, escalationReason: event.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </Field>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            data-testid="cc-save-draft"
            type="button"
            onClick={() => void save(editing === null ? 'draft' : editing.status)}
            disabled={!canSubmit || busy !== null}
            className="border border-gray-300 text-gray-800 text-sm font-medium rounded px-3 py-2 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : editing === null ? 'Save as draft' : 'Save revision'}
          </button>
          <button
            data-testid="cc-save-published"
            type="button"
            onClick={() => void save('published')}
            disabled={!canSubmit || busy !== null}
            className="bg-blue-600 text-white text-sm font-medium rounded px-3 py-2 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save and publish status'}
          </button>
        </div>

        {!canSubmit && (
          <p className="text-xs text-gray-500">A title and a summary are needed before saving.</p>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">
        {label}
        {required ? ' *' : ''}
      </span>
      {hint !== undefined && <span className="block text-xs text-gray-500">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
