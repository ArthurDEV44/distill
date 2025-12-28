/**
 * Hybrid Search Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHybridSearchIndex } from "./hybrid-search.js";

// Mock the embeddings module for fast tests
vi.mock("./embeddings.js", () => {
  // Simple mock embeddings based on word overlap
  const mockEmbedding = (text: string): number[] => {
    const words = text.toLowerCase().split(/\s+/);
    const dim = 384;
    const embedding = new Array(dim).fill(0);

    // Create deterministic embedding based on words
    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const idx = (word.charCodeAt(i) * (i + 1)) % dim;
        embedding[idx] += 0.1;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum: number, x: number) => sum + x * x, 0)
    );
    if (magnitude > 0) {
      for (let i = 0; i < dim; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  };

  return {
    computeEmbedding: vi.fn(async (text: string) => mockEmbedding(text)),
    computeEmbeddings: vi.fn(async (texts: string[]) =>
      texts.map((t) => mockEmbedding(t))
    ),
    cosineSimilarity: vi.fn((a: number[], b: number[]) => {
      if (a.length !== b.length) return 0;
      let dot = 0;
      for (let i = 0; i < a.length; i++) {
        dot += (a[i] ?? 0) * (b[i] ?? 0);
      }
      return dot;
    }),
  };
});

interface TestItem {
  name: string;
  description: string;
}

describe("Hybrid Search", () => {
  const testItems: TestItem[] = [
    { name: "compress", description: "Compress and reduce output size" },
    { name: "analyze", description: "Analyze build errors and warnings" },
    { name: "summarize", description: "Summarize log files" },
    { name: "optimize", description: "Optimize token usage" },
  ];

  const getSearchableText = (item: TestItem) =>
    `${item.name} ${item.description}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createHybridSearchIndex", () => {
    it("should create an index with all methods", () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);

      expect(index.search).toBeDefined();
      expect(index.searchBM25Only).toBeDefined();
      expect(index.precomputeEmbeddings).toBeDefined();
      expect(index.isSemanticReady).toBeDefined();
    });

    it("should start with semantic not ready", () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      expect(index.isSemanticReady()).toBe(false);
    });
  });

  describe("searchBM25Only", () => {
    it("should return BM25 results synchronously", () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = index.searchBM25Only("compress");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.item.name).toBe("compress");
    });

    it("should return empty array for no matches", () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = index.searchBM25Only("nonexistent");

      expect(results).toHaveLength(0);
    });
  });

  describe("search (hybrid)", () => {
    it("should return results with both BM25 and semantic scores", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = await index.search("compress output");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("bm25Score");
      expect(results[0]).toHaveProperty("semanticScore");
      expect(results[0]).toHaveProperty("score");
      expect(results[0]).toHaveProperty("matchedTerms");
    });

    it("should find exact keyword matches", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = await index.search("compress");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.item.name).toBe("compress");
      expect(results[0]!.bm25Score).toBeGreaterThan(0);
    });

    it("should sort results by combined score", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = await index.search("compress reduce");

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it("should handle empty query", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = await index.search("");

      // Empty query might return all items with semantic similarity
      // or no results depending on implementation
      expect(Array.isArray(results)).toBe(true);
    });

    it("should use custom weights", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText, {
        bm25Weight: 0.8,
        semanticWeight: 0.2,
      });

      const results = await index.search("compress");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("precomputeEmbeddings", () => {
    it("should mark semantic as ready after precomputing", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);

      expect(index.isSemanticReady()).toBe(false);
      await index.precomputeEmbeddings();
      expect(index.isSemanticReady()).toBe(true);
    });

    it("should only compute embeddings once", async () => {
      const { computeEmbeddings } = await import("./embeddings.js");
      const index = createHybridSearchIndex(testItems, getSearchableText);

      await index.precomputeEmbeddings();
      await index.precomputeEmbeddings();

      expect(computeEmbeddings).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty items array", async () => {
      const index = createHybridSearchIndex([], getSearchableText);

      const bm25Results = index.searchBM25Only("test");
      expect(bm25Results).toHaveLength(0);

      const hybridResults = await index.search("test");
      expect(hybridResults).toHaveLength(0);
    });

    it("should handle single item", async () => {
      const singleItem = [{ name: "test", description: "Test item" }];
      const index = createHybridSearchIndex(singleItem, getSearchableText);

      const results = await index.search("test");
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("score composition", () => {
    it("should combine BM25 and semantic scores", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText, {
        bm25Weight: 0.4,
        semanticWeight: 0.6,
      });

      const results = await index.search("compress");
      const firstResult = results[0];

      if (firstResult && firstResult.bm25Score > 0) {
        // If there's a BM25 match, score should be combination
        expect(firstResult.score).toBeGreaterThan(0);
      }
    });

    it("should include matched terms from BM25", async () => {
      const index = createHybridSearchIndex(testItems, getSearchableText);
      const results = await index.search("compress output");

      const compressResult = results.find((r) => r.item.name === "compress");
      if (compressResult) {
        expect(compressResult.matchedTerms.length).toBeGreaterThan(0);
      }
    });
  });
});
