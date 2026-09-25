import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildAgentView,
  buildEscalationRecord,
  DEFAULT_GATE_CONFIG,
  evaluateGate,
  type AgentView,
  type EscalationRecord,
  type SopDocument,
} from '@sop/core';
import { EMBEDDING_MODEL } from '@sop/embedder/model';
import { buildCorpusPassages, searchTopK, type VectorEntry } from '@sop/vector-store';
import { TelemetryQueue, type QueryTelemetryEvent } from './telemetry';
import { SupabaseTransport } from './transport';
import { useIdentity } from './auth';
import { SignInGate, SessionBar } from './SignIn';
import { CommandCenter } from './CommandCenter';
import { canAuthorProcedures } from './roles';
import { syncBundle, type BundleState } from './bundle-client';

/** The one sentence the telemetry panel shows. Never claims more than happened. */
function deliveryText(delivery: DeliveryState, queued: number): string {
  switch (delivery.state) {
    case 'idle':
      return `${queued} item(s) waiting to send.`;
    case 'sending':
      return `Sending ${queued} item(s) to the tenant…`;
    case 'delivered':
      return delivery.remaining === 0
        ? `Delivered ${delivery.sent} item(s) to the tenant.`
        : `Delivered ${delivery.sent} item(s); ${delivery.remaining} still waiting.`;
    case 'failed':
      return `${delivery.failed} item(s) not delivered; ${delivery.remaining} retained and will retry.`;
  }
}



/**
 * What the telemetry panel says about delivery.
 *
 * Previously the queue had no destination and the UI said "Local only", which was
 * true and useless. The states below are the four things that can actually have
 * happened, including the one that matters most: it failed, and here is what is
 * still waiting.
 */
type DeliveryState =
  | { readonly state: 'idle'; readonly sent: number }
  | { readonly state: 'sending'; readonly sent: number }
  | {
      readonly state: 'delivered';
      readonly sent: number;
      readonly remaining: number;
    }
  | {
      readonly state: 'failed';
      readonly sent: number;
      readonly failed: number;
      readonly remaining: number;
      readonly detail?: string;
    };
const BUNDLE_VERSION = 1;
const DEFAULT_MIN_MARGIN = DEFAULT_GATE_CONFIG.minMargin;

type IndexStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface Index {
  readonly entries: readonly VectorEntry[];
  readonly embedQuery: (text: string) => Promise<Float32Array>;
}

interface LoadProgress {
  readonly label: string;
  readonly loaded: number;
  readonly total: number;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [index, setIndex] = useState<Index | null>(null);
  const [status, setStatus] = useState<IndexStatus>('idle');
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<AgentView | null>(null);
  const [escalation, setEscalation] = useState<EscalationRecord | null>(null);
  const [suggestedReply, setSuggestedReply] = useState('');
  const [minMargin, setMinMargin] = useState(DEFAULT_MIN_MARGIN);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [latencyMs, setLatencyMs] = useState(0);
  const [queue] = useState(() => new TelemetryQueue());
  const [transport] = useState(() => new SupabaseTransport());
  const [bundleState, setBundleState] = useState<BundleState>({ status: 'unavailable', detail: 'not loaded yet' });
  const [surface, setSurface] = useState<'ask' | 'command'>('ask');
  const bundleVersion =
    bundleState.status === 'ready' ? bundleState.bundleVersion : BUNDLE_VERSION;
  const [delivery, setDelivery] = useState<DeliveryState>({ state: 'idle', sent: 0 });


  // The corpus the app searches is the bundle that was signed for this tenant.
  // Empty until one is installed, which is honest: a search over nothing returns
  // nothing, rather than quietly answering from procedures this tenant never got.
  const EMPTY_CORPUS: readonly SopDocument[] = [];
  const activeCorpus: readonly SopDocument[] =
    bundleState.status === 'ready' ? bundleState.sops : EMPTY_CORPUS;

  const [queued, setQueued] = useState(() => queue.pending);
  const [copyStatus, setCopyStatus] = useState('');
  const activeLoad = useRef(0);
  const activeQuery = useRef(0);
  const queryInFlight = useRef(false);

  useEffect(() => {
    return () => {
      activeLoad.current += 1;
      activeQuery.current += 1;
    };
  }, []);

  const clearDecision = useCallback(() => {
    setView(null);
    setEscalation(null);
    setSuggestedReply('');
    setHasSearched(false);
    setQueryError('');
    setCopyStatus('');
  }, []);

  const loadIndex = useCallback(async () => {
    const attempt = ++activeLoad.current;
    activeQuery.current += 1;
    queryInFlight.current = false;
    setIndex(null);
    setView(null);
    setEscalation(null);
    setSuggestedReply('');
    setHasSearched(false);
    setSearching(false);
    setQueryError('');
    setLoadError('');
    setLoadProgress({ label: 'Checking for a policy bundle', loaded: 0, total: 0 });
    setStatus('loading');

    try {
      // The corpus comes from the bundle that was signed for this tenant, and
      // from nothing else. There is deliberately no fallback to a file in this
      // repository: silently serving procedures the tenant was never given is the
      // same failure as telemetry that never left the browser — a product that
      // appears to work for a tenant it has not actually been given anything.
      const bundle = await syncBundle();
      setBundleState(bundle);

      if (attempt !== activeLoad.current) {
        return;
      }

      if (bundle.status === 'unavailable') {
        setStatus('failed');
        setLoadError(bundle.detail);
        setLoadProgress(null);
        return;
      }

      const { createEmbedder } = await import('@sop/embedder');
      if (attempt !== activeLoad.current) {
        return;
      }

      const embedder = await createEmbedder(EMBEDDING_MODEL, {
        onProgress(progress) {
          if (attempt !== activeLoad.current) {
            return;
          }

          if (progress.status === 'progress_total') {
            setLoadProgress({
              label: 'Downloading model files',
              loaded: progress.loaded,
              total: progress.total,
            });
          } else if (progress.status === 'initiate' || progress.status === 'download') {
            setLoadProgress({ label: `Loading ${progress.file}`, loaded: 0, total: 0 });
          } else if (progress.status === 'ready') {
            setLoadProgress({ label: 'Building policy index', loaded: 0, total: 0 });
          }
        },
      });

      if (attempt !== activeLoad.current) {
        return;
      }

      const passages = buildCorpusPassages(bundle.sops);
      const vectors = await embedder.embedPassages(passages.map((passage) => passage.text));
      const entries = passages.map((passage, position) => {
        const vector = vectors[position];
        if (vector === undefined) {
          throw new Error(`embedding index is missing passage ${position}`);
        }
        return { sopId: passage.sopId, vector, text: passage.text };
      });

      if (attempt !== activeLoad.current) {
        return;
      }

      setIndex({ entries, embedQuery: (text: string) => embedder.embedQuery(text) });
      setLoadProgress(null);
      setStatus('ready');
    } catch (error) {
      if (attempt === activeLoad.current) {
        setIndex(null);
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoadProgress(null);
        setStatus('failed');
      }
    }
  }, []);

  /**
   * Deliver what the queue is holding, and report what actually happened.
   *
   * The queue retains everything and the flush is what empties it, so this is
   * the only place the UI learns whether a decision reached the server. A
   * failure is not an error state to apologise for: the records stay queued
   * under the queue's backoff and the label says so, which is the honest
   * version of what used to read "Local only" forever.
   */
  const flush = useCallback(async () => {
    if (queue.pending === 0) {
      setDelivery({ state: 'idle', sent: 0 });
      return;
    }

    setDelivery({ state: 'sending', sent: 0 });
    try {
      const result = await queue.flush(transport);
      setQueued(queue.pending);
      setDelivery({
        state: result.failed > 0 ? 'failed' : 'delivered',
        sent: result.eventsSent + result.escalationsSent,
        failed: result.failed,
        remaining: result.remaining,
      });
    } catch (error) {
      setQueued(queue.pending);
      setDelivery({
        state: 'failed',
        sent: 0,
        failed: queue.pending,
        remaining: queue.pending,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [queue, transport]);
  const findAnswer = useCallback(async () => {
    if (index === null || queryInFlight.current) {
      return;
    }

    const queryText = inputText.trim();
    if (queryText.length === 0) {
      return;
    }

    const attempt = ++activeQuery.current;
    queryInFlight.current = true;
    setHasSearched(true);
    setView(null);
    setEscalation(null);
    setSuggestedReply('');
    setQueryError('');
    setCopyStatus('');
    setSearching(true);

    const started = performance.now();
    try {
      const vector = await index.embedQuery(queryText);
      if (attempt !== activeQuery.current) {
        return;
      }

      const candidates = searchTopK(vector, index.entries, 5);
      const decision = evaluateGate(candidates, {
        thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
        minMargin,
        topK: DEFAULT_GATE_CONFIG.topK,
      });
      const queryEventId = crypto.randomUUID();
      const queryOccurredAt = new Date().toISOString();
      const escalationId = crypto.randomUUID();
      const nextView = buildAgentView(decision, activeCorpus, bundleVersion, escalationId);

      setView(nextView);
      setLatencyMs(performance.now() - started);

      const event: QueryTelemetryEvent = {
        id: queryEventId,
        deviceId: null,
        userPseudonym: 'agent-console',
        eventType: 'query',
        bundleVersion: BUNDLE_VERSION,
        occurredAt: queryOccurredAt,
        payload: {
          outcome: nextView.kind === 'answer' ? 'answered' : 'escalated',
          sopId: nextView.kind === 'answer' ? nextView.sop.id : null,
          score: nextView.kind === 'answer' ? nextView.score : null,
          margin: nextView.kind === 'answer' ? nextView.margin : null,
          gateReason: nextView.kind === 'escalation' ? nextView.reason : null,
          thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
          minMargin,
          topCandidates: decision.evidence.map((candidate) => ({
            sopId: candidate.sopId,
            score: candidate.score,
            passage: candidate.evidence[0] ?? '',
          })),
        },
      };
      const record = nextView.kind === 'escalation'
        ? buildEscalationRecord(nextView.reason, decision, {
            escalationId,
            queryEventId,
            queryOccurredAt,
            queryText,
            bundleVersion: BUNDLE_VERSION,
            modelId: EMBEDDING_MODEL.id,
            modelRevision: EMBEDDING_MODEL.revision,
            parameters: {
              thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
              minMargin,
            },
          })
        : null;
      queue.enqueueDecision(event, record);

      if (nextView.kind === 'answer') {
        setSuggestedReply(nextView.sop.suggestedReply);
      } else {
        setEscalation(record);
      }

      setQueued(queue.pending);
      void flush();
    } catch (error) {
      if (attempt === activeQuery.current) {
        setView(null);
        setEscalation(null);
        setSuggestedReply('');
        setQueryError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (attempt === activeQuery.current) {
        queryInFlight.current = false;
        setSearching(false);
      }
    }
  }, [index, inputText, minMargin, queue, flush, activeCorpus, bundleVersion]);


  const copyToClipboard = useCallback(async () => {
    if (navigator.clipboard === undefined) {
      setCopyStatus('Clipboard access is unavailable in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(suggestedReply);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Clipboard access was denied.');
    }
  }, [suggestedReply]);

  const sopTitle = (sopId: string) =>
    activeCorpus.find((document) => document.id === sopId)?.title ?? sopId;
  const { auth, signIn, signOut } = useIdentity();

  // A signed-out visitor gets the sign-in form and nothing else — not a
  // disabled search box. The alternative, letting the page render and failing at
  // flush time, is a product that appears to work for a user it has not identified.
  if (auth.status !== 'signed-in') {
    return <SignInGate auth={auth} signIn={signIn} signOut={signOut} />;
  }

  const sessionBar = <SessionBar identity={auth.identity} onSignOut={signOut} />;
  const role = auth.identity?.role ?? null;
  const canAuthor = canAuthorProcedures(role);

  return (
    <div className="min-h-screen bg-gray-50">
      {sessionBar}
      <header className="bg-blue-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">LIVE Support Assistant — Explainable SOP Engine</h1>
          <p className="text-blue-100 text-sm mt-1">
            On-device semantic search · deterministic confidence gate · no generative model
          </p>
        </div>
      </header>
      <nav aria-label="Workspace" className="max-w-7xl mx-auto px-4 pt-3">
        {/* The tabs are gated by the same role lists the database enforces, from
            `./roles`. A frontline agent is not offered a Command Center it cannot
            use: a tab that renders and then fails is a product that appears to work
            for a user it has not identified. RLS still refuses regardless — this only
            decides what is offered, never what is allowed. */}
        <div className="inline-flex rounded border border-gray-300 bg-white text-sm" role="tablist">
          <button
            type="button"
            role="tab"
            data-testid="tab-ask"
            aria-selected={surface === 'ask'}
            onClick={() => setSurface('ask')}
            className={`px-3 py-1.5 rounded-l ${surface === 'ask' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          >
            Ask
          </button>
          {canAuthor ? (
            <button
              type="button"
              role="tab"
              data-testid="tab-command"
              aria-selected={surface === 'command'}
              onClick={() => setSurface('command')}
              className={`px-3 py-1.5 ${surface === 'command' ? 'bg-gray-900 text-white' : 'text-gray-600'} ${
                'rounded-r'
              }`}
            >
              Command Center
            </button>
          ) : null}
        </div>
      </nav>

      {surface === 'command' && canAuthor ? (
        <main className="max-w-4xl mx-auto px-4 py-8">
          <CommandCenter onPublished={() => void loadIndex()} />
        </main>
      ) : (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div
          data-testid="bundle-state"
          className="mb-4 text-xs text-gray-500 border border-gray-200 rounded px-3 py-2"
        >
          {bundleState.status === 'ready'
            ? `Serving bundle ${bundleState.bundleVersion} — ${bundleState.sops.length} procedure(s), signed for this tenant.`
            : `No bundle is serving: ${bundleState.detail}`}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Customer Message</h2>
                <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                  bundle v{BUNDLE_VERSION}
                </span>
              </div>

              <textarea
                className="w-full h-40 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Paste the customer's message here..."
                value={inputText}
                disabled={searching}
                onChange={(event) => {
                  setInputText(event.target.value);
                  clearDecision();
                }}
              />

              <button
                onClick={() => void (status === 'ready' ? findAnswer() : loadIndex())}
                disabled={
                  status === 'loading' ||
                  searching ||
                  (status === 'ready' && inputText.trim().length === 0)
                }
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                {status === 'loading'
                  ? 'Loading model…'
                  : searching
                    ? 'Searching…'
                    : status === 'ready'
                      ? 'Find Answer'
                      : status === 'failed'
                        ? 'Retry model load'
                        : 'Load model and build index'}
              </button>

              {status === 'idle' && (
                <p className="mt-3 text-sm text-gray-500">
                  Search starts only after this button. First use contacts Hugging Face for the
                  pinned MiniLM model and jsDelivr for the ONNX runtime. These files total roughly
                  50 MB before compression; browser caching can avoid a repeat transfer.
                </p>
              )}

              {status === 'loading' && (
                <div className="mt-3" aria-live="polite">
                  <p className="text-sm text-gray-500">
                    {loadProgress?.label ?? 'Preparing semantic search'} ({EMBEDDING_MODEL.id})
                  </p>
                  {loadProgress !== null && loadProgress.total > 0 && (
                    <>
                      <progress
                        className="w-full mt-2"
                        value={loadProgress.loaded}
                        max={loadProgress.total}
                      >
                        {Math.round((loadProgress.loaded / loadProgress.total) * 100)}%
                      </progress>
                      <p className="mt-1 text-xs text-gray-500">
                        {Math.round((loadProgress.loaded / loadProgress.total) * 100)}% downloaded
                      </p>
                    </>
                  )}
                </div>
              )}

              {status === 'failed' && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  Model failed to load: {loadError}. Retry is available without a page reload.
                </p>
              )}

              {queryError !== '' && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  Search failed: {queryError}
                </p>
              )}

              <div className="mt-5 pt-4 border-t border-gray-100">
                <label className="flex items-center justify-between text-sm text-gray-700">
                  <span className="font-medium">Confidence margin</span>
                  <span className="font-mono">{minMargin.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.01}
                  value={minMargin}
                  disabled={searching}
                  onChange={(event) => {
                    setMinMargin(Number(event.target.value));
                    clearDecision();
                  }}
                  className="w-full mt-2 disabled:cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Prototype control only. Tenant loading, calibration, and audit persistence are
                  not connected yet. Raising the margin answers less and escalates more.
                </p>
              </div>

              {(queued > 0 || queue.hasOverflowed || delivery.state !== 'idle') && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
                  <span
                    className={
                      queue.hasOverflowed || delivery.state === 'failed'
                        ? 'text-xs text-amber-700 font-medium'
                        : 'text-xs text-gray-500'
                    }
                  >
                    {queue.hasOverflowed ? 'Telemetry overflow — oldest events shed. ' : ''}
                    {deliveryText(delivery, queued)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void flush()}
                    disabled={queued === 0 || delivery.state === 'sending'}
                    className="shrink-0 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded disabled:opacity-50"
                  >
                    {delivery.state === 'sending' ? 'Sending…' : 'Sync now'}
                  </button>
                </div>
              )}
            </div>

            {view?.kind === 'answer' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Matched Procedure</h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    {view.sop.category}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{view.sop.title}</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="text-gray-700 whitespace-pre-wrap">{view.sop.summary}</p>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-500 font-mono">
                  <span>score {view.score.toFixed(4)}</span>
                  <span>margin {view.margin.toFixed(4)}</span>
                  <span>{latencyMs.toFixed(0)} ms on device</span>
                </div>
              </div>
            )}

            {view?.kind === 'escalation' && (
              <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-lg">
                <h3 className="text-lg font-medium text-amber-900">Escalated to a human</h3>
                <p className="mt-2 text-amber-800">{view.message}</p>
                <div className="mt-3 text-xs text-amber-700 font-mono space-y-1">
                  <p>reason: {view.reason}</p>
                  <p>escalation: {view.escalationId}</p>
                  <p>bundle v{view.bundleVersion}</p>
                </div>
                <p className="mt-3 text-xs text-amber-700">
                  No procedure is shown, by design. This panel omits the query text and near-miss
                  passages; the prototype retains the full escalation record on this device.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {view?.kind === 'answer' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Suggested Reply</h2>
                <textarea
                  className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  value={suggestedReply}
                  onChange={(event) => {
                    setSuggestedReply(event.target.value);
                    setCopyStatus('');
                  }}
                />
                <button
                  onClick={() => void copyToClipboard()}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  Copy to Clipboard
                </button>
                {copyStatus !== '' && (
                  <p className="mt-2 text-sm text-gray-600" role="status">
                    {copyStatus}
                  </p>
                )}
              </div>
            )}

            {view?.kind === 'answer' && (
              <div
                className={`rounded-lg shadow-md p-6 ${view.sop.escalationRequired ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-800">Escalation Status</h2>
                  <span
                    className={`px-4 py-2 text-sm font-bold rounded-full ${view.sop.escalationRequired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}
                  >
                    {view.sop.escalationRequired ? 'Escalation Needed' : 'No Escalation Required'}
                  </span>
                </div>
                {view.sop.escalationRequired ? (
                  <div>
                    <p className="text-red-700 font-medium mb-2">Reason:</p>
                    <p className="text-red-600 bg-white p-3 rounded border border-red-200">
                      {view.sop.escalationReason}
                    </p>
                  </div>
                ) : (
                  <p className="text-green-700">
                    This inquiry can be resolved with the suggested reply above.
                  </p>
                )}
              </div>
            )}

            {view?.kind === 'answer' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Why this answer</h2>
                <p className="text-xs text-gray-500 mb-4">
                  The passages the score came from. This is what the audit trail records.
                </p>
                <ol className="space-y-3">
                  {view.evidence.map((entry, position) => (
                    <li key={entry.sopId} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">
                          {position + 1}. {sopTitle(entry.sopId)}
                        </span>
                        <span className="font-mono text-xs text-gray-500">
                          {entry.score.toFixed(4)}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-600 border-l-2 border-gray-200 pl-3">
                        {entry.passage}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {escalation !== null && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Escalation record</h2>
                <p className="text-xs text-gray-500 mb-3">
                  This panel shows routing metadata only. Query text and candidate passages remain
                  in the locally stored record.
                </p>
                <dl className="text-xs font-mono text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <dt>reason</dt>
                    <dd>{escalation.evidence.reason}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>candidates</dt>
                    <dd>{escalation.evidence.candidates.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>min margin</dt>
                    <dd>{escalation.evidence.minMargin.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>model</dt>
                    <dd>{escalation.evidence.modelRevision.slice(0, 12)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-gray-400">
                  Retained locally. No Command Centre transport is configured, so nothing is
                  presented as delivered.
                </p>
              </div>
            )}

            {!hasSearched && status === 'ready' && (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-600">
                  Enter a customer message and click "Find Answer". Matching runs entirely on this
                  device.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      )}

      <footer className="bg-gray-100 border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>
            Explainable SOP Escalation Engine — React + Vite + TypeScript + Tailwind,
            transformers.js on the edge, deterministic gate. No generative model in the answering
            path.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
