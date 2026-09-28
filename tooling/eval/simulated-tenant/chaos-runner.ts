import {
  buildAgentView,
  DEFAULT_GATE_CONFIG,
  evaluateGate,
} from '../../../packages/core/dist/index.js';
import {
  CROSS_ENCODER_RERANKER,
  EMBEDDING_MODEL,
  createEmbedder,
  createReranker,
} from '../../../packages/embedder/dist/index.js';
import {
  buildCorpusPassages,
  searchTopK,
  searchTopKPassages,
} from '../../../packages/vector-store/dist/index.js';
import { labelQuery, type ExpectedOutcome } from './expected-outcome';
import type batchType from './chaos-500.json';
import type corpusType from './corpus.json';

type Batch = typeof batchType;
type Corpus = typeof corpusType;
type Ticket = Batch['tickets'][number];
type Expected = { decision: ExpectedOutcome; sopId: string | null };
type EvaluationRow = {
  data_mode: 'simulated';
  ticket: Ticket;
  expected: Ticket['expected'];
  /** The batch's own label, carried unchanged. */
  expectedOutcome: ExpectedOutcome;
  /** The label-fixed outcome scored against. Equal to `expected.decision` unless the label fix fires. */
  expectedOutcomeAfter: ExpectedOutcome;
  labelTruncated: boolean;
  labelReason: string;
  reclassified: boolean;
  actual: { decision: 'answer'; sopId: string } | { decision: 'escalate'; reason: string };
  correct: boolean;
  failureCategory: string | null;
  correctAfter: boolean;
  failureCategoryAfter: string | null;
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
/**
 * Opt-in cross-encoder reranking. Off by default: the shipped path is the
 * bi-encoder only, and this switch exists to measure the difference, not to
 * change the product. The shortlist size matches the evaluation in
 * `tooling/eval/semantic-eval.mjs`.
 */
const rerankEnabled = searchParams.get('rerank') === '1';
const RERANK_CANDIDATES = 20;
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
  expected: Expected,
  actual: EvaluationRow['actual'],
  correct: boolean,
): string | null {
  if (correct) return null;
  if (actual.decision === 'escalate') return 'false_escalation';
  if (expected.decision === 'escalate') return 'unsafe_answer_on_escalation_case';
  return 'wrong_sop_answer';
}

/** Whether the assistant's decision satisfies an expected outcome and procedure. */
function isCorrect(expected: Expected, actual: EvaluationRow['actual']): boolean {
  return actual.decision === expected.decision
    && (actual.decision === 'escalate' || actual.sopId === expected.sopId);
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

  const keywordsBySop = new Map(corpus.sops.map((sop) => [sop.id, sop.triggerKeywords]));

  setStatus('loading pinned MiniLM in the browser');
  const loadStarted = performance.now();
  const embedder = await createEmbedder(EMBEDDING_MODEL);
  const modelLoadMs = performance.now() - loadStarted;

  let reranker: Awaited<ReturnType<typeof createReranker>> | null = null;
  let rerankLoadMs = 0;
  if (rerankEnabled) {
    setStatus('loading the pinned cross-encoder');
    const rerankStarted = performance.now();
    reranker = await createReranker(CROSS_ENCODER_RERANKER);
    rerankLoadMs = performance.now() - rerankStarted;
  }

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
  const rerankLatencyMs: number[] = [];

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
    const label = labelQuery({
      message: inputText,
      language: ticket.language,
      expectedDecision: ticket.expected.decision,
      procedureKeywords: keywordsBySop.get(ticket.expected.sopId ?? '') ?? [],
    });
    const expectedAfter: Expected = {
      decision: label.expectedOutcome,
      sopId: ticket.expected.sopId,
    };
    const started = performance.now();

    try {
      const vector = await embedder.embedQuery(inputText);
      let candidates;
      if (reranker === null) {
        candidates = searchTopK(vector, activeEntries, 5);
      } else {
        const shortlist = searchTopKPassages(vector, activeEntries, RERANK_CANDIDATES);
        const rerankStarted = performance.now();
        const scores = await reranker.score(
          inputText,
          shortlist.map((candidate) => candidate.evidence[0] ?? ''),
        );
        rerankLatencyMs.push(performance.now() - rerankStarted);
        const rankedPassages = shortlist
          .map((candidate, position) => ({
            sopId: candidate.sopId,
            score: scores[position] ?? 0,
            evidence: candidate.evidence,
          }))
          .sort((left, right) => right.score - left.score);
        const bestPerProcedure = new Map<string, (typeof rankedPassages)[number]>();
        for (const candidate of rankedPassages) {
          if (!bestPerProcedure.has(candidate.sopId)) {
            bestPerProcedure.set(candidate.sopId, candidate);
          }
        }
        candidates = [...bestPerProcedure.values()].slice(0, DEFAULT_GATE_CONFIG.topK);
      }
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
      const correct = isCorrect(ticket.expected, actual);
      const correctAfter = isCorrect(expectedAfter, actual);
      rows.push({
        data_mode: 'simulated',
        ticket,
        expected: ticket.expected,
        expectedOutcome: ticket.expected.decision,
        expectedOutcomeAfter: label.expectedOutcome,
        labelTruncated: label.truncated,
        labelReason: label.reason,
        reclassified: label.reclassified,
        actual,
        correct,
        failureCategory: classifyFailure(ticket.expected, actual, correct),
        correctAfter,
        failureCategoryAfter: classifyFailure(expectedAfter, actual, correctAfter),
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
        expectedOutcome: ticket.expected.decision,
        expectedOutcomeAfter: label.expectedOutcome,
        labelTruncated: label.truncated,
        labelReason: label.reason,
        reclassified: label.reclassified,
        actual: { decision: 'escalate', reason: 'evaluation_error' },
        correct: false,
        failureCategory: 'runtime_error',
        correctAfter: false,
        failureCategoryAfter: 'runtime_error',
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
  const summarize = (selected: readonly EvaluationRow[], phase: 'before' | 'after') => {
    const correctOf = (row: EvaluationRow) => phase === 'before' ? row.correct : row.correctAfter;
    const categoryOf = (row: EvaluationRow) => phase === 'before' ? row.failureCategory : row.failureCategoryAfter;
    const correct = selected.filter(correctOf).length;
    return {
      tickets: selected.length,
      correct,
      accuracy: selected.length === 0 ? 0 : correct / selected.length,
      falseEscalations: selected.filter((row) => categoryOf(row) === 'false_escalation').length,
      unsafeAnswers: selected.filter((row) =>
        categoryOf(row) === 'unsafe_answer_on_escalation_case' || categoryOf(row) === 'wrong_sop_answer',
      ).length,
      runtimeErrors: selected.filter((row) => categoryOf(row) === 'runtime_error').length,
    };
  };
  const byCohort = (cohort: 'all' | 'chaos' | 'baseline', phase: 'before' | 'after' = 'before') =>
    summarize(
      cohort === 'all' ? rows : rows.filter((row) => row.ticket.isChaos === (cohort === 'chaos')),
      phase,
    );
  const techniqueOf = (row: EvaluationRow) => row.ticket.chaosMutation?.type ?? 'baseline';
  const byTechnique = Object.fromEntries(
    [...new Set(rows.map(techniqueOf))].sort().map((technique) => {
      const selected = rows.filter((row) => techniqueOf(row) === technique);
      return [technique, {
        tickets: selected.length,
        before: summarize(selected, 'before'),
        after: summarize(selected, 'after'),
        reclassified: selected.filter((row) => row.reclassified).length,
      }];
    }),
  );
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
      path: rerankEnabled
        ? 'browser-local MiniLM embedQuery → cosine shortlist (top 20 passages) → cross-encoder rerank → procedure collapse → evaluateGate → buildAgentView'
        : 'browser-local MiniLM embedQuery → passage cosine searchTopK → evaluateGate → buildAgentView',
      modelId: embedder.modelId,
      modelRevision: embedder.revision,
      dtype: embedder.dtype,
      thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
      minMargin,
      topK: DEFAULT_GATE_CONFIG.topK,
      modelLoadMs,
      indexBuildMs,
      rerank: rerankEnabled
        ? {
            enabled: true,
            modelId: reranker?.modelId ?? CROSS_ENCODER_RERANKER.id,
            modelRevision: reranker?.revision ?? CROSS_ENCODER_RERANKER.revision,
            dtype: CROSS_ENCODER_RERANKER.dtype,
            shortlist: RERANK_CANDIDATES,
            loadMs: rerankLoadMs,
            latencyMs: rerankLatencyMs.length === 0
              ? null
              : {
                  mean: rerankLatencyMs.reduce((sum, value) => sum + value, 0) / rerankLatencyMs.length,
                  median: percentile(rerankLatencyMs, 0.5),
                  p95: percentile(rerankLatencyMs, 0.95),
                  max: Math.max(...rerankLatencyMs),
                },
          }
        : { enabled: false },
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
    labelFix: {
      rule: 'a truncated query is expected to escalate when it has fewer than four words or no surviving procedure trigger keyword; the keyword test is language-scoped',
      truncatedDetected: rows.filter((row) => row.labelTruncated).length,
      reclassified: rows.filter((row) => row.reclassified).length,
      reclassifiedTicketIds: rows.filter((row) => row.reclassified).map((row) => row.ticket.ticketId),
      before: byCohort('all', 'before'),
      after: byCohort('all', 'after'),
      byTechnique,
    },
    cohorts: { chaos: byCohort('chaos'), baseline: byCohort('baseline') },
    cohortsAfter: { chaos: byCohort('chaos', 'after'), baseline: byCohort('baseline', 'after') },
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
