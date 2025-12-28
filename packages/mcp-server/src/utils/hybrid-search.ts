/**
 * Hybrid Search combining BM25 (lexical) and Semantic Similarity
 *
 * Uses a weighted combination of:
 * - BM25 for exact/partial keyword matches (40%)
 * - Cosine similarity on embeddings for semantic matches (60%)
 *
 * This allows finding tools even when the query uses different
 * words than the tool description (e.g., "shrink output" → compress).
 */

import { createBM25Index, type BM25Result } from "./bm25.js";
import {
  computeEmbedding,
  computeEmbeddings,
  cosineSimilarity,
} from "./embeddings.js";

/**
 * Configuration options for hybrid search
 */
export interface HybridSearchOptions {
  /** Weight for BM25 lexical matching (default: 0.4) */
  bm25Weight?: number;
  /** Weight for semantic similarity (default: 0.6) */
  semanticWeight?: number;
  /** Minimum semantic similarity for semantic-only matches (default: 0.5) */
  semanticThreshold?: number;
}

/**
 * Result from hybrid search with both scores
 */
export interface HybridSearchResult<T> {
  /** The matched item */
  item: T;
  /** Combined score (weighted BM25 + semantic) */
  score: number;
  /** Raw BM25 score */
  bm25Score: number;
  /** Semantic similarity score (0-1) */
  semanticScore: number;
  /** Terms that matched in BM25 */
  matchedTerms: string[];
}

/**
 * Hybrid search index interface
 */
export interface HybridSearchIndex<T> {
  /** Search using hybrid BM25 + semantic */
  search: (query: string) => Promise<HybridSearchResult<T>[]>;
  /** Search using BM25 only (synchronous, always available) */
  searchBM25Only: (query: string) => BM25Result<T>[];
  /** Precompute embeddings for all items (call during idle time) */
  precomputeEmbeddings: () => Promise<void>;
  /** Check if semantic search is ready */
  isSemanticReady: () => boolean;
}

/**
 * Create a hybrid search index combining BM25 and semantic similarity
 *
 * @param items - Array of items to index
 * @param getSearchableText - Function to extract text from each item
 * @param options - Search configuration options
 * @returns Hybrid search index
 *
 * @example
 * ```typescript
 * const tools = [
 *   { name: "compress", description: "Compress and reduce output" },
 *   { name: "analyze", description: "Analyze build errors" }
 * ];
 *
 * const index = createHybridSearchIndex(
 *   tools,
 *   (tool) => `${tool.name} ${tool.description}`
 * );
 *
 * // BM25 match
 * await index.search("compress"); // finds "compress" tool
 *
 * // Semantic match (no keyword overlap)
 * await index.search("shrink output"); // also finds "compress" tool!
 * ```
 */
export function createHybridSearchIndex<T>(
  items: T[],
  getSearchableText: (item: T) => string,
  options?: HybridSearchOptions
): HybridSearchIndex<T> {
  const bm25Weight = options?.bm25Weight ?? 0.4;
  const semanticWeight = options?.semanticWeight ?? 0.6;
  const semanticThreshold = options?.semanticThreshold ?? 0.5;

  // BM25 index (synchronous, always available)
  const bm25Index = createBM25Index(items, getSearchableText);

  // Item embeddings (lazy computed)
  let itemEmbeddings: number[][] | null = null;
  let embeddingsPromise: Promise<void> | null = null;

  /**
   * Ensure embeddings are computed
   */
  async function ensureEmbeddings(): Promise<number[][]> {
    if (itemEmbeddings) return itemEmbeddings;

    if (!embeddingsPromise) {
      embeddingsPromise = (async () => {
        const texts = items.map(getSearchableText);
        itemEmbeddings = await computeEmbeddings(texts);
      })();
    }

    await embeddingsPromise;
    return itemEmbeddings!;
  }

  return {
    async search(query: string): Promise<HybridSearchResult<T>[]> {
      // Get BM25 results first (always available)
      const bm25Results = bm25Index.search(query);

      // Try to compute semantic scores
      let queryEmbedding: number[] | null = null;
      let embeddings: number[][] | null = null;

      try {
        embeddings = await ensureEmbeddings();
        queryEmbedding = await computeEmbedding(query);
      } catch {
        // Semantic search failed, fall back to BM25 only
        return bm25Results.map((r) => ({
          item: r.item,
          score: r.score,
          bm25Score: r.score,
          semanticScore: 0,
          matchedTerms: r.matchedTerms,
        }));
      }

      // Build item index map for O(1) lookup
      const itemIndexMap = new Map<T, number>();
      items.forEach((item, idx) => itemIndexMap.set(item, idx));

      // Normalize BM25 scores to 0-1 range
      const maxBM25 = Math.max(...bm25Results.map((r) => r.score), 0.001);

      // Combine BM25 results with semantic scores
      const results: HybridSearchResult<T>[] = [];
      const processedItems = new Set<T>();

      for (const bm25Result of bm25Results) {
        const idx = itemIndexMap.get(bm25Result.item);
        if (idx === undefined || !embeddings || !queryEmbedding) continue;

        const itemEmbedding = embeddings[idx];
        if (!itemEmbedding) continue;

        const semanticScore = cosineSimilarity(queryEmbedding, itemEmbedding);
        const normalizedBM25 = bm25Result.score / maxBM25;

        results.push({
          item: bm25Result.item,
          score: normalizedBM25 * bm25Weight + semanticScore * semanticWeight,
          bm25Score: bm25Result.score,
          semanticScore,
          matchedTerms: bm25Result.matchedTerms,
        });

        processedItems.add(bm25Result.item);
      }

      // Add items that only match semantically (no BM25 match)
      if (embeddings && queryEmbedding) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item || processedItems.has(item)) continue;

          const itemEmbedding = embeddings[i];
          if (!itemEmbedding) continue;

          const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);

          // Only include if above semantic threshold
          if (similarity >= semanticThreshold) {
            results.push({
              item,
              score: similarity * semanticWeight,
              bm25Score: 0,
              semanticScore: similarity,
              matchedTerms: [],
            });
          }
        }
      }

      // Sort by combined score (highest first)
      return results.sort((a, b) => b.score - a.score);
    },

    searchBM25Only(query: string): BM25Result<T>[] {
      return bm25Index.search(query);
    },

    async precomputeEmbeddings(): Promise<void> {
      await ensureEmbeddings();
    },

    isSemanticReady(): boolean {
      return itemEmbeddings !== null;
    },
  };
}
