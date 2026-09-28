import {
  buildAgentView,
  DEFAULT_GATE_CONFIG,
  evaluateGate,
} from '../../../packages/core/dist/index.js';
import { EMBEDDING_MODEL, createEmbedder } from '../../../packages/embedder/dist/index.js';
import { buildCorpusPassages, searchTopK } from '../../../packages/vector-store/dist/index.js';
import type corpusType from './corpus.json';

type Corpus = typeof corpusType;

type QueryRow = {
  id: string;
  query: string;
  source_type: string;
  my_label: string;
  my_sop_id: string;
};

type Input = {
  data_mode: string;
  provenance: string;
  queries: QueryRow[];
};

declare global {
  interface Window {
    __REAL_PHRASED_STATE__?: { status: string; completed?: number; detail?: string };
    __REAL_PHRASED_RESULT__?: Record<string, unknown>;
  }
}

const statusElement = document.querySelector<HTMLElement>('#status');
const progressElement = document.querySelector<HTMLProgressElement>('#progress');
const resultElement = document.querySelector<HTMLElement>('#result');
const searchParams = new URLSearchParams(window.location.search);
const inputName = searchParams.get('input') ?? '_tmp_real-phrased-input.json';
const requestedMargin = searchParams.get('minMargin');
const minMargin = requestedMargin === null
  ? DEFAULT_GATE_CONFIG.minMargin
  : Number(requestedMargin);
const assetPattern = /^[a-z0-9_-]+\.json$/;

if (!assetPattern.test(inputName)) {
  throw new Error(`invalid real-phrased input filename: ${inputName}`);
}
if (!Number.isFinite(minMargin) || minMargin < 0 || minMargin > 1) {
  throw new Error(`invalid real-phrased minMargin: ${requestedMargin}`);
}

async function loadAsset<T>(name: string): Promise<T> {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) {
    throw new Error(`could not load ${name}: HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  if (value === null || typeof value !== 'object') {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as T;
}

function setStatus(status: string, completed?: number, detail?: string): void {
  window.__REAL_PHRASED_STATE__ = { status, completed, detail };
  if (statusElement !== null) {
    statusElement.textContent = `${status}${detail ? `: ${detail}` : ''}`;
  }
  if (progressElement !== null && completed !== undefined) {
    progressElement.value = completed;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function run(): Promise<void> {
  const [corpus, input] = await Promise.all([
    loadAsset<Corpus>('corpus.json'),
    loadAsset<Input>(inputName),
  ]);

  if (corpus.data_mode !== 'simulated') {
    throw new Error('the procedure corpus must be explicitly simulated');
  }
  if (!Array.isArray(input.queries) || input.queries.length === 0) {
    throw new Error('the real-phrased input carries no queries');
  }
  if (input.queries.some((row) => row.my_label.trim().length === 0)) {
    throw new Error('the real-phrased input carries an unlabelled query');
  }

  setStatus('loading pinned MiniLM in the browser');
  const loadStarted = performance.now();
  const embedder = await createEmbedder(EMBEDDING_MODEL);
  const modelLoadMs = performance.now() - loadStarted;

  setStatus('building the simulated policy index');
  const indexStarted = performance.now();
  const passages = buildCorpusPassages(corpus.sops);
  const vectors = await embedder.embedPassages(passages.map((passage) => passage.text));
  const entries = passages.map((passage, position) => {
    const vector = vectors[position];
    if (vector === undefined) throw new Error(`missing passage vector ${position}`);
    return { sopId: passage.sopId, vector, text: passage.text };
  });
  const indexBuildMs = performance.now() - indexStarted;

  const rows: Record<string, unknown>[] = [];
  for (const [index, row] of input.queries.entries()) {
    const started = performance.now();
    try {
      const vector = await embedder.embedQuery(row.query);
      const candidates = searchTopK(vector, entries, 5);
      const decision = evaluateGate(candidates, {
        thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
        minMargin,
        topK: DEFAULT_GATE_CONFIG.topK,
      });
      const agentView = buildAgentView(decision, corpus.sops, 1, `REAL-ESCALATION-${row.id}`);
      rows.push({
        id: row.id,
        source_type: row.source_type,
        my_label: row.my_label,
        my_sop_id: row.my_sop_id,
        actual: agentView.kind === 'answer'
          ? { decision: 'answer', sopId: agentView.sop.id }
          : { decision: 'escalate', reason: agentView.reason },
        latencyMs: performance.now() - started,
        candidates: decision.evidence.map((candidate) => ({
          sopId: candidate.sopId,
          score: candidate.score,
          evidence: candidate.evidence[0] ?? '',
        })),
      });
    } catch (error) {
      rows.push({
        id: row.id,
        source_type: row.source_type,
        my_label: row.my_label,
        my_sop_id: row.my_sop_id,
        actual: { decision: 'escalate', reason: 'evaluation_error' },
        latencyMs: performance.now() - started,
        candidates: [],
        error: errorMessage(error),
      });
    }
    if ((index + 1) % 5 === 0 || index + 1 === input.queries.length) {
      setStatus(`scoring query ${index + 1} of ${input.queries.length}`, index + 1);
    }
  }

  window.__REAL_PHRASED_RESULT__ = {
    data_mode: input.data_mode,
    provenance: input.provenance,
    implementation: {
      path: 'browser-local MiniLM embedQuery → passage cosine searchTopK → evaluateGate → buildAgentView',
      modelId: embedder.modelId,
      modelRevision: embedder.revision,
      dtype: embedder.dtype,
      thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
      minMargin,
      topK: DEFAULT_GATE_CONFIG.topK,
      modelLoadMs,
      indexBuildMs,
    },
    queries: rows,
  };
  if (resultElement !== null) {
    resultElement.textContent = JSON.stringify({ completed: rows.length }, null, 2);
  }
  setStatus('complete', rows.length);
}

void run().catch((error: unknown) => {
  const detail = errorMessage(error);
  setStatus('failed', undefined, detail);
  if (resultElement !== null) resultElement.textContent = detail;
});
