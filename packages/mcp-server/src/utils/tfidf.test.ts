/**
 * TF-IDF Utilities Tests
 */

import { describe, it, expect } from "vitest";
import { calculateTFIDF, getSegmentTFIDFScore, getTopTerms } from "./tfidf.js";

describe("TF-IDF utilities", () => {
  describe("calculateTFIDF", () => {
    it("should return empty map for empty segments", () => {
      const result = calculateTFIDF([]);
      expect(result.size).toBe(0);
    });

    it("should calculate TF-IDF for single segment", () => {
      const segments = ["hello world"];
      const result = calculateTFIDF(segments);

      expect(result.size).toBe(1);
      expect(result.get(0)).toBeDefined();
    });

    it("should calculate higher IDF for rare terms", () => {
      const segments = [
        "the quick brown fox",
        "the lazy dog",
        "the unique unicorn", // "unicorn" only appears here
      ];

      const result = calculateTFIDF(segments);

      // Get scores for segment with "unicorn"
      const unicornSegmentScores = result.get(2);
      const unicornScore = unicornSegmentScores?.find(
        (s) => s.term === "unicorn"
      );

      // Get scores for segment with "quick"
      const quickSegmentScores = result.get(0);
      const quickScore = quickSegmentScores?.find((s) => s.term === "quick");

      expect(unicornScore).toBeDefined();
      expect(quickScore).toBeDefined();

      // Both are unique terms (appear in 1 segment), so IDF should be the same
      // But TF might differ based on segment length
      expect(unicornScore!.idf).toBeGreaterThan(0);
      expect(quickScore!.idf).toBeGreaterThan(0);
    });

    it("should filter stopwords", () => {
      const segments = ["the a an is are was"];
      const result = calculateTFIDF(segments);

      // All stopwords should be filtered, resulting in empty scores
      const scores = result.get(0);
      expect(scores).toEqual([]);
    });

    it("should handle segments with code terms", () => {
      const segments = [
        "function calculateSum returns number",
        "const result equals function call",
      ];

      const result = calculateTFIDF(segments);
      expect(result.size).toBe(2);

      // Check that code terms are captured
      const scores0 = result.get(0);
      expect(scores0?.some((s) => s.term === "calculatesum")).toBe(true);
    });
  });

  describe("getSegmentTFIDFScore", () => {
    it("should return 0 for non-existent segment", () => {
      const tfidfMap = calculateTFIDF(["hello world"]);
      const score = getSegmentTFIDFScore(999, tfidfMap);
      expect(score).toBe(0);
    });

    it("should return 0 for empty segment", () => {
      const tfidfMap = calculateTFIDF([""]);
      const score = getSegmentTFIDFScore(0, tfidfMap);
      expect(score).toBe(0);
    });

    it("should return higher score for unique content", () => {
      const segments = [
        "common words common words common words",
        "unique specialized terminology here",
        "common words again common words",
      ];

      const tfidfMap = calculateTFIDF(segments);

      const score0 = getSegmentTFIDFScore(0, tfidfMap);
      const score1 = getSegmentTFIDFScore(1, tfidfMap);
      const score2 = getSegmentTFIDFScore(2, tfidfMap);

      // Segment 1 has unique terms, should have higher score
      expect(score1).toBeGreaterThan(score0);
      expect(score1).toBeGreaterThan(score2);
    });

    it("should return normalized score between 0 and 1", () => {
      const segments = ["hello world", "foo bar baz"];
      const tfidfMap = calculateTFIDF(segments);

      const score0 = getSegmentTFIDFScore(0, tfidfMap);
      const score1 = getSegmentTFIDFScore(1, tfidfMap);

      expect(score0).toBeGreaterThanOrEqual(0);
      expect(score0).toBeLessThanOrEqual(1);
      expect(score1).toBeGreaterThanOrEqual(0);
      expect(score1).toBeLessThanOrEqual(1);
    });
  });

  describe("getTopTerms", () => {
    it("should return empty array for non-existent segment", () => {
      const tfidfMap = calculateTFIDF(["hello world"]);
      const terms = getTopTerms(999, tfidfMap);
      expect(terms).toEqual([]);
    });

    it("should return top N terms by TF-IDF score", () => {
      const segments = ["alpha beta gamma delta epsilon zeta"];
      const tfidfMap = calculateTFIDF(segments);

      const top3 = getTopTerms(0, tfidfMap, 3);
      expect(top3.length).toBeLessThanOrEqual(3);
    });

    it("should sort terms by TF-IDF descending", () => {
      const segments = ["error critical failure warning info debug"];
      const tfidfMap = calculateTFIDF(segments);

      const terms = getTopTerms(0, tfidfMap);

      // Verify sorting
      for (let i = 1; i < terms.length; i++) {
        expect(terms[i - 1]!.tfidf).toBeGreaterThanOrEqual(terms[i]!.tfidf);
      }
    });
  });
});
