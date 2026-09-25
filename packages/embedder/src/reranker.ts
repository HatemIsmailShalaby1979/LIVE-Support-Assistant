/**
 * Cross-encoder reranking.
 *
 * A bi-encoder embeds the query and the passage separately and compares vectors,
 * which is fast but loses every interaction between the two. A cross-encoder
 * reads them together and scores relevance directly — far more discriminating,
 * far too slow to run over a whole corpus. So it runs on a shortlist: retrieve
 * broadly with cosine, then rerank the top candidates.
 *
 * The current evaluation reranks the top 20 passages rather than the five
 * procedure-level candidates. It remains an evaluation component rather than
 * the shipped path: on the current corpus it lowers the precision-qualified
 * auto-answer rate and raises p95 latency beyond the 80 ms budget.
 */

import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
} from '@huggingface/transformers';

import { CROSS_ENCODER_RERANKER, type RerankerSpec } from './model.js';

/** Query-passage relevance scorer. */
export interface Reranker {
  readonly modelId: string;
  readonly revision: string;
  /** Relevance in [0,1] for each passage, in input order. */
  score(query: string, passages: readonly string[]): Promise<number[]>;
}

export interface RerankerOptions {
  readonly cacheDir?: string;
  readonly allowRemoteModels?: boolean;
}

/** Logistic function, turning the cross-encoder's single logit into [0,1]. */
function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

/**
 * Load the pinned cross-encoder.
 *
 * @param spec Reranker to load. Defaults to the MS MARCO MiniLM cross-encoder.
 * @param options Cache and remote-model controls.
 * @returns A reranker bound to `spec`.
 */
export async function createReranker(
  spec: RerankerSpec = CROSS_ENCODER_RERANKER,
  options: RerankerOptions = {},
): Promise<Reranker> {
  if (options.cacheDir !== undefined) {
    env.cacheDir = options.cacheDir;
  }

  if (options.allowRemoteModels !== undefined) {
    env.allowRemoteModels = options.allowRemoteModels;
  }

  const tokenizer = await AutoTokenizer.from_pretrained(spec.id, {
    revision: spec.revision,
  });

  const model = await AutoModelForSequenceClassification.from_pretrained(spec.id, {
    revision: spec.revision,
    dtype: spec.dtype,
  });

  return {
    modelId: spec.id,
    revision: spec.revision,

    async score(query: string, passages: readonly string[]): Promise<number[]> {
      if (passages.length === 0) {
        return [];
      }

      const queries = passages.map(() => query);

      const inputs = await tokenizer(queries, {
        text_pair: [...passages],
        padding: true,
        truncation: true,
      });

      const output = await model(inputs);
      const logits = output.logits.tolist() as number[][];

      return logits.map((row) => sigmoid(row[0] ?? 0));
    },
  };
}
