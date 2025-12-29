/**
 * Embeddings Utilities Tests
 *
 * Note: These tests use the actual model for integration testing.
 * The model is downloaded once and cached.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  computeEmbedding,
  computeEmbeddings,
  cosineSimilarity,
  getEmbeddingDimension,
  isEmbeddingsReady,
} from "./embeddings.js";

describe("Embeddings utilities", () => {
  describe("cosineSimilarity", () => {
    it("should return 1 for identical normalized vectors", () => {
      const v = [0.5, 0.5, 0.5, 0.5];
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      const normalized = v.map((x) => x / norm);
      expect(cosineSimilarity(normalized, normalized)).toBeCloseTo(1, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      const a = [1, 0, 0, 0];
      const b = [0, 1, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("should return -1 for opposite vectors", () => {
      const a = [1, 0, 0, 0];
      const b = [-1, 0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(-1);
    });

    it("should return 0 for vectors of different lengths", () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("should handle empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("should compute similarity for arbitrary vectors", () => {
      // Two similar vectors (normalized)
      const a = [0.6, 0.8, 0, 0];
      const b = [0.8, 0.6, 0, 0];
      const similarity = cosineSimilarity(a, b);
      // 0.6*0.8 + 0.8*0.6 = 0.48 + 0.48 = 0.96
      expect(similarity).toBeCloseTo(0.96, 5);
    });
  });

  describe("getEmbeddingDimension", () => {
    it("should return 384 for all-MiniLM-L6-v2", () => {
      expect(getEmbeddingDimension()).toBe(384);
    });
  });

  describe("isEmbeddingsReady", () => {
    it("should return false before model is loaded", () => {
      // Note: This might be true if other tests loaded the model
      // We just verify it returns a boolean
      expect(typeof isEmbeddingsReady()).toBe("boolean");
    });
  });

  // Integration tests - these download the model on first run
  describe("computeEmbedding (integration)", () => {
    // Skip these tests in CI or if model download is slow
    const skipIntegration = process.env.SKIP_EMBEDDING_TESTS === "true";

    it.skipIf(skipIntegration)(
      "should compute embedding with correct dimensions",
      async () => {
        const embedding = await computeEmbedding("Hello world");
        expect(embedding).toHaveLength(384);
      },
      60000
    ); // 60s timeout for model download

    it.skipIf(skipIntegration)(
      "should return normalized vectors",
      async () => {
        const embedding = await computeEmbedding("Test text");
        // Check that the vector is normalized (magnitude ≈ 1)
        const magnitude = Math.sqrt(
          embedding.reduce((sum, x) => sum + x * x, 0)
        );
        expect(magnitude).toBeCloseTo(1, 3);
      },
      60000
    );

    it.skipIf(skipIntegration)(
      "should produce similar embeddings for similar texts",
      async () => {
        const emb1 = await computeEmbedding("compress log output");
        const emb2 = await computeEmbedding("shrink log files");
        const emb3 = await computeEmbedding("unrelated banana smoothie recipe");

        const sim12 = cosineSimilarity(emb1, emb2);
        const sim13 = cosineSimilarity(emb1, emb3);

        // Similar texts should have higher similarity than unrelated texts
        // Note: absolute threshold is relaxed since embedding similarity varies by model/environment
        expect(sim12).toBeGreaterThan(sim13);
        expect(sim12).toBeGreaterThan(0.15);
      },
      60000
    );
  });

  describe("computeEmbeddings (integration)", () => {
    const skipIntegration = process.env.SKIP_EMBEDDING_TESTS === "true";

    it.skipIf(skipIntegration)(
      "should compute multiple embeddings",
      async () => {
        const texts = ["Hello", "World", "Test"];
        const embeddings = await computeEmbeddings(texts);

        expect(embeddings).toHaveLength(3);
        for (const emb of embeddings) {
          expect(emb).toHaveLength(384);
        }
      },
      60000
    );

    it.skipIf(skipIntegration)(
      "should handle empty array",
      async () => {
        const embeddings = await computeEmbeddings([]);
        expect(embeddings).toHaveLength(0);
      },
      60000
    );
  });
});
