/**
 * Embeddings Utilities using Transformers.js
 *
 * Provides local embedding computation using the all-MiniLM-L6-v2 model.
 * Model is loaded lazily on first use to avoid startup overhead.
 */

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbeddingPipeline = (text: string, options?: Record<string, unknown>) => Promise<{ data: Float32Array }>;

// Lazy-loaded pipeline singleton
let extractor: EmbeddingPipeline | null = null;
let loadingPromise: Promise<EmbeddingPipeline> | null = null;

/**
 * Get or initialize the embedding pipeline (lazy loaded)
 *
 * The model is downloaded and cached on first use (~23MB quantized).
 * Subsequent calls return the cached pipeline instantly.
 */
export async function getEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (extractor) return extractor;

  if (!loadingPromise) {
    loadingPromise = (async () => {
      // Dynamic import to avoid type complexity at module level
      const { pipeline } = await import("@huggingface/transformers");
      const pipe = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
      });
      // Cast to our simplified type
      return pipe as unknown as EmbeddingPipeline;
    })();
  }

  extractor = await loadingPromise;
  return extractor;
}

/**
 * Compute embedding for a single text
 *
 * @param text - Text to embed
 * @returns 384-dimensional normalized embedding vector
 */
export async function computeEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Compute embeddings for multiple texts
 *
 * @param texts - Array of texts to embed
 * @returns Array of 384-dimensional normalized embedding vectors
 */
export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();
  const results: number[][] = [];

  for (const text of texts) {
    const output = await pipe(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data));
  }

  return results;
}

/**
 * Cosine similarity between two normalized vectors
 *
 * Since vectors are normalized, dot product equals cosine similarity.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score between -1 and 1 (higher = more similar)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
}

/**
 * Check if embeddings pipeline is ready (model loaded)
 */
export function isEmbeddingsReady(): boolean {
  return extractor !== null;
}

/**
 * Get embedding dimension for the current model
 */
export function getEmbeddingDimension(): number {
  return EMBEDDING_DIM;
}

/**
 * Reset the embedding pipeline (for testing)
 */
export function resetEmbeddingPipeline(): void {
  extractor = null;
  loadingPromise = null;
}
