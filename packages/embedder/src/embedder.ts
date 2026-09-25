/**
 * On-device text embedding.
 *
 * The model runs locally through ONNX Runtime — WebAssembly in the browser, the
 * native runtime under Node — so a query never leaves the device. This module is
 * the only place in the system that knows which model is in use; everything
 * downstream sees vectors and nothing else.
 */

import { env, pipeline, type ProgressInfo } from '@huggingface/transformers';

import { EMBEDDING_MODEL, type EmbeddingModelSpec, type QuantizationDtype } from './model.js';

/** Text-to-vector interface shared by every platform shell. */
export interface Embedder {
  readonly spec: EmbeddingModelSpec;
  readonly modelId: string;
  readonly revision: string;
  readonly dtype: QuantizationDtype;
  readonly dimensions: number;
  /** Embed a query, applying the model's query prefix. */
  embedQuery(text: string): Promise<Float32Array>;
  /** Embed indexable passages, applying the model's passage prefix. */
  embedPassages(texts: readonly string[]): Promise<Float32Array[]>;
}

export interface EmbedderOptions {
  /** Directory for the model cache. Defaults to the library's own choice. */
  readonly cacheDir?: string;
  /**
   * Set false to run strictly from cache. Platform shells can use this once they
   * package the pinned model; the current web client leaves it true so an
   * explicit first-use action can populate the browser cache.
   */
  readonly allowRemoteModels?: boolean;
  readonly onProgress?: (progress: ProgressInfo) => void;
}

/**
 * Load the pinned model and return an embedder.
 *
 * Loading is the expensive step, so callers should hold one embedder for the
 * life of the app rather than constructing one per query.
 *
 * @param spec Model to load. Defaults to the measured default.
 * @param options Cache and remote-model controls.
 * @returns An embedder bound to `spec`.
 */
export async function createEmbedder(
  spec: EmbeddingModelSpec = EMBEDDING_MODEL,
  options: EmbedderOptions = {},
): Promise<Embedder> {
  if (options.cacheDir !== undefined) {
    env.cacheDir = options.cacheDir;
  }

  if (options.allowRemoteModels !== undefined) {
    env.allowRemoteModels = options.allowRemoteModels;
  }

  const extractor = await pipeline('feature-extraction', spec.id, {
    revision: spec.revision,
    dtype: spec.dtype,
    ...(options.onProgress === undefined
      ? {}
      : { progress_callback: options.onProgress }),
  });

  async function encode(texts: readonly string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const tensor = await extractor([...texts], {
      pooling: spec.pooling,
      normalize: spec.normalize,
    });

    const rows: unknown = tensor.tolist();
    if (!Array.isArray(rows)) {
      throw new Error('embedder returned a non-array tensor result');
    }

    return rows.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== spec.dimensions) {
        throw new Error(`embedder returned an invalid vector width at row ${rowIndex}`);
      }
      if (row.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`embedder returned a non-finite vector at row ${rowIndex}`);
      }
      return Float32Array.from(row as number[]);
    });
  }

  return {
    spec,
    modelId: spec.id,
    revision: spec.revision,
    dtype: spec.dtype,
    dimensions: spec.dimensions,

    async embedQuery(text: string): Promise<Float32Array> {
      const [vector] = await encode([`${spec.queryPrefix}${text}`]);

      if (vector === undefined) {
        throw new Error('embedder returned no vector for a single input');
      }

      return vector;
    },

    embedPassages(texts: readonly string[]): Promise<Float32Array[]> {
      return encode(texts.map((text) => `${spec.passagePrefix}${text}`));
    },
  };
}
