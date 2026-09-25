/**
 * @sop/embedder — local, pinned text embedding and reranking.
 */

export {
  BGE_SMALL_EN_V1_5,
  CROSS_ENCODER_RERANKER,
  EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  E5_SMALL_V2,
  MINILM_L6_V2,
} from './model.js';
export type { EmbeddingModelSpec, QuantizationDtype, RerankerSpec } from './model.js';
export { createEmbedder } from './embedder.js';
export type { Embedder, EmbedderOptions } from './embedder.js';
export { createReranker } from './reranker.js';
export type { Reranker, RerankerOptions } from './reranker.js';
