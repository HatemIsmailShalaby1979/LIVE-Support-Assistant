/**
 * The pinned embedding and reranking models.
 *
 * Everything that determines a score is recorded here, because a change to any
 * one of these fields changes every vector the Confidence Gate will ever compare
 * against a threshold. Policy bundles carry the same values and a client refuses
 * to serve search when its loaded model does not match the bundle manifest.
 *
 * Prefixes and pooling are not cosmetic. `bge` and `e5` are retrieval-trained and
 * score differently — sometimes much worse — when the query instruction or the
 * `query:` / `passage:` prefixes are omitted, and `bge` pools on the CLS token
 * rather than the mean. Getting either wrong silently degrades recall, so each
 * spec carries its own.
 */

/** Quantisation builds published by the ONNX exports we pin. */
export type QuantizationDtype =
  | 'q8'
  | 'auto'
  | 'fp32'
  | 'fp16'
  | 'int8'
  | 'uint8'
  | 'q4'
  | 'bnb4'
  | 'q4f16'
  | 'q2'
  | 'q2f16'
  | 'q1'
  | 'q1f16';

/** A bi-encoder used to build the passage index and to embed queries. */
export interface EmbeddingModelSpec {
  readonly id: string;
  /** Commit sha, not a branch: `main` would silently re-pin the corpus. */
  readonly revision: string;
  readonly dtype: QuantizationDtype;
  /** Vector width. A change here invalidates every stored vector. */
  readonly dimensions: number;
  readonly pooling: 'mean' | 'cls';
  /** Unit-length output makes cosine similarity a plain dot product. */
  readonly normalize: boolean;
  readonly queryPrefix: string;
  readonly passagePrefix: string;
  readonly note: string;
}

/** A cross-encoder that scores a query against a passage jointly. */
export interface RerankerSpec {
  readonly id: string;
  readonly revision: string;
  readonly dtype: QuantizationDtype;
  readonly note: string;
}

/** The Phase 0/1 baseline: a sentence-similarity model, not retrieval-trained. */
export const MINILM_L6_V2: EmbeddingModelSpec = {
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8',
  dimensions: 384,
  pooling: 'mean',
  normalize: true,
  queryPrefix: '',
  passagePrefix: '',
  note: 'sentence-similarity model',
};

/** Retrieval-trained; needs the query instruction prefix, pools on CLS. */
export const BGE_SMALL_EN_V1_5: EmbeddingModelSpec = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  dtype: 'q8',
  dimensions: 384,
  pooling: 'cls',
  normalize: true,
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
  passagePrefix: '',
  note: 'retrieval-trained, CLS pooling, query instruction',
};

/** Retrieval-trained; requires both prefixes or scores collapse. */
export const E5_SMALL_V2: EmbeddingModelSpec = {
  id: 'Xenova/e5-small-v2',
  revision: '02af79985278377e65c724a76275707cb0333c70',
  dtype: 'q8',
  dimensions: 384,
  pooling: 'mean',
  normalize: true,
  queryPrefix: 'query: ',
  passagePrefix: 'passage: ',
  note: 'retrieval-trained, requires query:/passage: prefixes',
};

/** MS MARCO passage-ranking cross-encoder, used to rerank retrieved candidates. */
export const CROSS_ENCODER_RERANKER: RerankerSpec = {
  id: 'Xenova/ms-marco-MiniLM-L-6-v2',
  revision: 'a09144355adeed5f58c8ed011d209bf8ee5a1fec',
  dtype: 'q8',
  note: 'cross-encoder trained on MS MARCO passage ranking',
};

/** Candidates considered for the retrieval stage. */
export const EMBEDDING_MODELS: readonly EmbeddingModelSpec[] = [
  MINILM_L6_V2,
  BGE_SMALL_EN_V1_5,
  E5_SMALL_V2,
];

/**
 * Default model for the shipped path.
 *
 * Set by measurement, not by reputation. On the completed current corpus, BGE
 * has slightly higher recall@1 than MiniLM (80% versus 78%), but both auto-answer
 * 8/50 queries at the measured precision bar; E5 auto-answers 1/50. MiniLM stays
 * as the incumbent on the tie. This five-procedure result is not a tenant model
 * decision and must be re-run on representative tenant data.
 */
export const EMBEDDING_MODEL: EmbeddingModelSpec = MINILM_L6_V2;
