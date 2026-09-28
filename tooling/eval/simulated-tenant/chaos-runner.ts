import {
  buildAgentView,
  DEFAULT_GATE_CONFIG,
  evaluateGate,
} from '../../../packages/core/dist/index.js';
import { EMBEDDING_MODEL, createEmbedder } from '../../../packages/embedder/dist/index.js';
import { buildCorpusPassages, searchTopK } from '../../../packages/vector-store/dist/index.js';
import type batchType from './chaos-500.json';
import type corpusType from './corpus.json';

type Batch = typeof batchType;
type Corpus = typeof corpusType;
type Ticket = Batch['tickets'][number];
type EvaluationRow = {
  data_mode: 'simulated';
  ticket: Ticket;
  expected: Ticket['expected'];
  actual: { decision: 'answer'; sopId: string } | { decision: 'escalate'; reason: string };
  correct: boolean;
  failureCategory: string | null;
  latencyMs: number | null;
  candidates: { sopId: string; score: number; evidence: string }[];
  error?: string;
};

declare global {
  interface Window {
    __SIMULATION_STATE__?: { status: string; completed?: number; detail?: string };
    __SIMULATION_RESULT__?: Record<string, unknown>;
  }
}

const statusElement = document.querySelector<HTMLElement>('#status');
const progressElement = document.querySelector<HTMLProgressElement>('#progress');
const resultElement = document.querySelector<HTMLElement>('#result');
const searchParams = new URLSearchParams(window.location.search);
const requestedMargin = searchParams.get('minMargin');
const queryInputMode = searchParams.get('queryInput') ?? 'message';
const minMargin = requestedMargin === null
  ? DEFAULT_GATE_CONFIG.minMargin
  : Number(requestedMargin);
const assetPattern = /^[a-z0-9-]+\.json$/;

if (!Number.isFinite(minMargin) || minMargin < 0 || minMargin > 1) {
  throw new Error(`invalid simulated minMargin: ${requestedMargin}`);
}

async function loadAsset<T>(name: string): Promise<T> {
  if (!assetPattern.test(name)) {
    throw new Error(`invalid simulated input filename: ${name}`);
  }
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) {
    throw new Error(`could not load simulated input ${name}: HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  if (value === null || typeof value !== 'object') {
    throw new Error(`simulated input ${name} must be a JSON object`);
  }
  return value as T;
}

function setStatus(status: string, completed?: number, detail?: string): void {
  window.__SIMULATION_STATE__ = { status, completed, detail };
  if (statusElement !== null) {
    statusElement.textContent = `data_mode: "simulated" — ${status}${detail ? `: ${detail}` : ''}`;
  }
  if (progressElement !== null && completed !== undefined) {
    progressElement.value = completed;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyFailure(
  expected: Ticket['expected'],
  actual: EvaluationRow['actual'],
  correct: boolean,
): string | null {
  if (correct) return null;
  if (actual.decision === 'escalate') return 'false_escalation';
  if (expected.decision === 'escalate') return 'unsafe_answer_on_escalation_case';
  return 'wrong_sop_answer';
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

async function run(): Promise<void> {
  const batchName = searchParams.get('batch') ?? 'chaos-500.json';
  const corpusName = searchParams.get('corpus') ?? 'corpus.json';
  const [batch, corpus] = await Promise.all([
    loadAsset<Batch>(batchName),
    loadAsset<Corpus>(corpusName),
  ]);

  if (batch.data_mode !== 'simulated' || corpus.data_mode !== 'simulated') {
    throw new Error('the input batch and SOP corpus must both be explicitly simulated');
  }
  if (!Array.isArray(batch.tickets) || batch.tickets.length !== batch.ticketCount) {
    throw new Error('the simulated batch ticket count does not match its records');
  }
  if (!Array.isArray(corpus.sops) || corpus.sops.some((sop) => sop.data_mode !== 'simulated')) {
    throw new Error('every procedure in the simulated corpus must carry its simulated tag');
  }
  if (batch.ticketCount === 500 && batch.chaosRateConfigured !== 0.15) {
    throw new Error('the evaluation input is not the approved 500-ticket, 15% batch');
  }

  setStatus('loading pinned MiniLM in the browser');
  const loadStarted = performance.now();
  const embedder = await createEmbedder(EMBEDDING_MODEL);
  const modelLoadMs = performance.now() - loadStarted;

  setStatus('building the simulated policy index');
  const indexStarted = performance.now();
  const baseSops = corpus.sops;
  const basePassages = buildCorpusPassages(baseSops);
  const baseVectors = await embedder.embedPassages(basePassages.map((passage) => passage.text));
  const baseEntries = basePassages.map((passage, position) => {
    const vector = baseVectors[position];
    if (vector === undefined) throw new Error(`missing base passage vector ${position}`);
    return { sopId: passage.sopId, vector, text: passage.text };
  });
  const injectedSops = batch.tickets.flatMap((ticket) => ticket.testEnvironment?.additionalSops ?? []);
  const uniqueInjectedSops = [...new Map(injectedSops.map((sop) => [sop.id, sop])).values()];
  const injectedPassages = buildCorpusPassages(uniqueInjectedSops);
  const injectedVectors = await embedder.embedPassages(injectedPassages.map((passage) => passage.text));
  const injectedEntries = injectedPassages.map((passage, position) => {
    const vector = injectedVectors[position];
    if (vector === undefined) throw new Error(`missing injected passage vector ${position}`);
    return { sopId: passage.sopId, vector, text: passage.text };
  });
  const indexBuildMs = performance.now() - indexStarted;
  const injectedIds = new Set(uniqueInjectedSops.map((sop) => sop.id));
  const entriesWithInjectedSops = [...baseEntries, ...injectedEntries];
  const rows: EvaluationRow[] = [];
  const decisionLatencyMs: number[] = [];

  for (const [index, ticket] of batch.tickets.entries()) {
    const inputText = queryInputMode === 'subject-message'
      ? `${ticket.subject}\n${ticket.message}`.trim()
      : ticket.message.trim();
    const ticketInjectedIds = new Set(
      ticket.testEnvironment?.additionalSops?.map((sop) => sop.id) ?? [],
    );
    const activeSops = ticket.testEnvironment?.additionalSops?.length
      ? [...baseSops, ...ticket.testEnvironment.additionalSops]
      : baseSops;
    const activeEntries = ticket.testEnvironment?.additionalSops?.length
      ? entriesWithInjectedSops.filter((entry) =>
          !injectedIds.has(entry.sopId) || ticketInjectedIds.has(entry.sopId),
        )
      : baseEntries;
    const started = performance.now();

    try {
      const vector = await embedder.embedQuery(inputText);
      const candidates = searchTopK(vector, activeEntries, 5);
      const decision = evaluateGate(candidates, {
        thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
        minMargin,
        topK: DEFAULT_GATE_CONFIG.topK,
      });
      const agentView = buildAgentView(decision, activeSops, 1, `SIM-ESCALATION-${ticket.ticketId}`);
      const latencyMs = performance.now() - started;
      decisionLatencyMs.push(latencyMs);
      const actual: EvaluationRow['actual'] = agentView.kind === 'answer'
        ? { decision: 'answer', sopId: agentView.sop.id }
        : { decision: 'escalate', reason: agentView.reason };
      const correct = actual.decision === ticket.expected.decision
        && (actual.decision === 'escalate' || actual.sopId === ticket.expected.sopId);
      rows.push({
        data_mode: 'simulated',
        ticket,
        expected: ticket.expected,
        actual,
        correct,
        failureCategory: classifyFailure(ticket.expected, actual, correct),
        latencyMs,
        candidates: decision.evidence.map((candidate) => ({
          sopId: candidate.sopId,
          score: candidate.score,
          evidence: candidate.evidence[0] ?? '',
        })),
      });
    } catch (error) {
      rows.push({
        data_mode: 'simulated',
        ticket,
        expected: ticket.expected,
        actual: { decision: 'escalate', reason: 'evaluation_error' },
        correct: false,
        failureCategory: 'runtime_error',
        latencyMs: performance.now() - started,
        candidates: [],
        error: errorMessage(error),
      });
    }

    if ((index + 1) % 10 === 0 || index + 1 === batch.tickets.length) {
      setStatus(`evaluating ticket ${index + 1} of ${batch.tickets.length}`, index + 1);
    }
  }

  const failures = rows.filter((row) => !row.correct);
  const categoryCounts = Object.fromEntries(
    [...new Set(failures.map((row) => row.failureCategory).filter((value): value is string => value !== null))]
      .map((category) => [category, failures.filter((row) => row.failureCategory === category).length])
      .sort((left, right) => right[1] - left[1]),
  );
  const failureCauseCounts = Object.fromEntries(
    [...new Set(failures.map((row) => `${row.failureCategory}:${row.actual.decision === 'escalate' ? row.actual.reason : 'answered'}`))]
      .map((cause) => [cause, failures.filter((row) =>
        `${row.failureCategory}:${row.actual.decision === 'escalate' ? row.actual.reason : 'answered'}` === cause,
      ).length])
      .sort((left, right) => right[1] - left[1]),
  );
  const failuresByInputType = Object.fromEntries(
    [...new Set(failures.map((row) => row.ticket.chaosMutation?.type ?? 'baseline'))]
      .map((type) => [type, failures.filter((row) =>
        (row.ticket.chaosMutation?.type ?? 'baseline') === type,
      ).length])
      .sort((left, right) => right[1] - left[1]),
  );
  const byCohort = (cohort: 'all' | 'chaos' | 'baseline') => {
    const selected = cohort === 'all'
      ? rows
      : rows.filter((row) => row.ticket.isChaos === (cohort === 'chaos'));
    return {
      tickets: selected.length,
      correct: selected.filter((row) => row.correct).length,
      accuracy: selected.length === 0 ? 0 : selected.filter((row) => row.correct).length / selected.length,
      falseEscalations: selected.filter((row) => row.failureCategory === 'false_escalation').length,
      unsafeAnswers: selected.filter((row) =>
        row.failureCategory === 'unsafe_answer_on_escalation_case' || row.failureCategory === 'wrong_sop_answer',
      ).length,
      runtimeErrors: selected.filter((row) => row.failureCategory === 'runtime_error').length,
    };
  };
  const worstFailures = [...failures]
    .sort((left, right) => {
      const rank = (row: EvaluationRow) => row.failureCategory === 'runtime_error' ? 0
        : row.failureCategory === 'unsafe_answer_on_escalation_case' ? 1
          : row.failureCategory === 'wrong_sop_answer' ? 2 : 3;
      return rank(left) - rank(right) || (right.latencyMs ?? 0) - (left.latencyMs ?? 0);
    })
    .slice(0, 10);
  const result = {
    data_mode: 'simulated',
    evaluation: 'Local browser decision-path evaluation; no live tenant, hosted database, or telemetry transport used.',
    evaluatedAt: new Date().toISOString(),
    sourceBatch: `tooling/eval/simulated-tenant/${batchName}`,
    sourceCorpus: `tooling/eval/simulated-tenant/${corpusName}`,
    queryInputMode,
    batch: {
      tickets: batch.ticketCount,
      seed: batch.seed,
      chaosRateConfigured: batch.chaosRateConfigured,
      chaosRateActual: batch.chaosRateActual,
      chaosTickets: batch.chaosSummary.chaosTicketCount,
      chaosTypes: batch.chaosTypeDistribution,
    },
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
    totals: {
      ...byCohort('all'),
      failures: failures.length,
      failureRate: failures.length / rows.length,
      failureCategories: categoryCounts,
      failureCauses: failureCauseCounts,
      failuresByInputType,
      latencyMs: {
        mean: decisionLatencyMs.reduce((sum, value) => sum + value, 0) / decisionLatencyMs.length,
        median: percentile(decisionLatencyMs, 0.5),
        p95: percentile(decisionLatencyMs, 0.95),
        max: Math.max(...decisionLatencyMs),
      },
    },
    cohorts: { chaos: byCohort('chaos'), baseline: byCohort('baseline') },
    topFailures: worstFailures,
    perTicket: rows,
  };
  window.__SIMULATION_RESULT__ = result;
  if (resultElement !== null) {
    resultElement.textContent = JSON.stringify({
      data_mode: 'simulated',
      completed: rows.length,
      accuracy: result.totals.accuracy,
      failureCategories: categoryCounts,
    }, null, 2);
  }
  setStatus('complete', rows.length);
}

void run().catch((error: unknown) => {
  const detail = errorMessage(error);
  setStatus('failed', undefined, detail);
  if (resultElement !== null) resultElement.textContent = detail;
});
