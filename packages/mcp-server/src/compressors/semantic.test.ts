/**
 * Semantic Compressor — regression suite (US-019).
 *
 * Exercises the TF-IDF segment-picking path with content that has enough
 * substance (≥ 50 tokens) for the compressor to actually cut. Also locks
 * down the no-op guards for tiny input, the line-fallback path when the
 * blank-line segmenter yields ≤ 1 segment, and the preserve-patterns
 * hard-keep.
 */

import { describe, expect, it } from "vitest";
import { semanticCompressor } from "./semantic.js";

// ~120 tokens worth of paragraph-segmented content with clearly varying
// relevance (errors + code block + boilerplate). Enough to hit the
// TF-IDF path with meaningful segment differentiation.
const PARAGRAPH_SAMPLE = [
  "The authentication middleware checks every incoming request for a valid JWT.",
  "Invalid tokens return 401 Unauthorized immediately.",
  "",
  "Error: token expired at 2024-01-15T10:00:00Z. Refresh-token flow failed.",
  "Error: token expired at 2024-01-15T10:05:00Z. Refresh-token flow failed.",
  "",
  "```ts",
  "function verify(token: string): boolean {",
  "  return jwt.verify(token, SECRET).exp > Date.now();",
  "}",
  "```",
  "",
  "The application also supports legacy Basic auth on a separate route.",
  "This is mostly used for internal health checks and is not recommended.",
  "",
  "Unrelated paragraph about the weather and sports and cooking.",
  "Nothing about authentication here. Just filler content.",
].join("\n");

describe("semanticCompressor — regressions (US-019)", () => {
  it("keeps high-importance segments and reports TF-IDF technique", () => {
    const result = semanticCompressor.compress(PARAGRAPH_SAMPLE, {
      detail: "normal",
      targetRatio: 0.5,
    });

    expect(result.stats.technique).toMatch(/^semantic-/);
    // Error segments should be kept (hasErrorIndicators boosts their score).
    expect(result.compressed).toMatch(/Error: token expired/);
    // The compressed output should be shorter than the input.
    expect(result.compressed.length).toBeLessThan(PARAGRAPH_SAMPLE.length);
  });

  it("meets compression-ratio floor with default targetRatio=0.5 (≤ 75% of input tokens)", () => {
    const result = semanticCompressor.compress(PARAGRAPH_SAMPLE, {
      detail: "normal",
      targetRatio: 0.5,
    });
    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    // Target is 0.5 but the compressor keeps high-score segments whole, so
    // the real floor is looser than 50%. 75% guards against drastic drift.
    expect(ratio).toBeLessThanOrEqual(0.75);
  });

  it("honors preservePatterns — marked segments must appear in output", () => {
    const input = [
      "alpha paragraph about unrelated topic one",
      "",
      "beta paragraph with the sentinel KEEP_ME marker",
      "",
      "gamma paragraph about unrelated topic two",
      "",
      "delta paragraph about unrelated topic three",
      "",
      "epsilon paragraph about unrelated topic four",
      "",
      "zeta paragraph about unrelated topic five",
      "",
      "eta paragraph about unrelated topic six",
    ].join("\n");
    const result = semanticCompressor.compress(input, {
      detail: "normal",
      targetRatio: 0.3,
      preservePatterns: [/KEEP_ME/],
    });
    expect(result.compressed).toMatch(/KEEP_ME/);
    expect(result.preservedSegments.length).toBeGreaterThanOrEqual(1);
  });

  it("unhappy path: tiny / single-line / atomic content returns as-is without crashing", () => {
    const opts = { detail: "normal" as const };

    // < 50 tokens → no-op guard returns content unchanged.
    const tiny = semanticCompressor.compress("hi", opts);
    expect(tiny.compressed).toBe("hi");
    expect(tiny.stats.technique).toMatch(/no-op/);
    expect(tiny.preservedSegments).toEqual([]);

    // ≥ 100 chars single line with no blank-line separators → line fallback
    // or char-chunk fallback keeps the compressor from returning empty.
    const oneLine = "word ".repeat(50).trim(); // 249 chars, 1 line, 50 tokens-ish.
    const oneLineResult = semanticCompressor.compress(oneLine, opts);
    expect(oneLineResult.compressed.length).toBeGreaterThan(0);

    // Pure whitespace is well below 100 chars → canCompress false, but the
    // compressor is called directly — it should return safely via the
    // no-op guard.
    const ws = semanticCompressor.compress("   \n\n   \n   ", opts);
    expect(typeof ws.compressed).toBe("string");
  });

  it("snapshot-style: technique string shape is stable across happy / no-op paths", () => {
    const happy = semanticCompressor.compress(PARAGRAPH_SAMPLE, {
      detail: "normal",
      targetRatio: 0.5,
    });
    const tiny = semanticCompressor.compress("short", { detail: "normal" });

    expect(happy.stats.technique).toMatchInlineSnapshot(`"semantic-compression"`);
    expect(tiny.stats.technique).toMatchInlineSnapshot(
      `"semantic-compression (no-op: content already optimized, <50 tokens)"`,
    );
  });
});
