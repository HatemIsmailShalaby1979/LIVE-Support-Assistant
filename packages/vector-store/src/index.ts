/**
 * @sop/vector-store — deterministic cosine retrieval over an in-memory matrix.
 */

export { cosineSimilarity, dot, magnitude, searchTopK, searchTopKPassages } from './cosine.js';
export type { VectorEntry } from './cosine.js';
export { buildCorpusPassages, buildPassages } from './chunk.js';
export type { Passage, PassageField } from './chunk.js';
