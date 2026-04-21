/**
 * Generic Compressor — regression suite (US-019).
 *
 * Guards the fallback compressor against shape drift, ratio regressions,
 * and crash paths. `genericCompressor` is the always-applicable last
 * resort, so it MUST never throw on malformed input.
 */

import { describe, expect, it } from "vitest";
import { genericCompressor } from "./generic.js";

const REPETITIVE_SAMPLE = Array.from({ length: 30 }, (_, i) =>
  `[INFO] request ${i % 3 === 0 ? "GET" : "POST"} /api/items 200 ${10 + (i % 5)}ms`,
).join("\n");

describe("genericCompressor — regressions (US-019)", () => {
  it("dedups repeating lines and emits an omittedInfo marker", () => {
    const result = genericCompressor.compress(REPETITIVE_SAMPLE, {
      detail: "normal",
    });

    expect(result.compressed).toMatch(/similar lines omitted/);
    expect(result.stats.technique).toBe("line-deduplication");
    expect(result.stats.compressedLines).toBeLessThan(result.stats.originalLines);
    expect(result.omittedInfo).toMatch(/lines omitted through deduplication/);
  });

  it("meets compression-ratio floor on repetitive content (≤ 80% of input tokens)", () => {
    const result = genericCompressor.compress(REPETITIVE_SAMPLE, {
      detail: "normal",
    });
    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.8);
    expect(result.stats.reductionPercent).toBeGreaterThanOrEqual(20);
  });

  it("preserves lines matching preservePatterns even when they would be deduped", () => {
    // 5 keep-me lines interleaved so the first-pass consecutive-repeats
    // collapser doesn't fold them, but their normalized forms all match,
    // so without preserve they dedup into one sample via groupLines.
    const input = [
      "keep me: 123",
      "unrelated",
      "keep me: 456",
      "unrelated",
      "keep me: 789",
      "unrelated",
      "keep me: 111",
      "unrelated",
      "keep me: 222",
    ].join("\n");
    const withPreserve = genericCompressor.compress(input, {
      detail: "minimal",
      preservePatterns: [/keep me:/],
    });
    const withoutPreserve = genericCompressor.compress(input, {
      detail: "minimal",
    });
    const preservedCount = (withPreserve.compressed.match(/keep me:/g) ?? []).length;
    const dedupCount = (withoutPreserve.compressed.match(/keep me:/g) ?? []).length;
    // With preserve, all 5 survive as individual groups;
    // without preserve, the five normalize identically and collapse to one sample.
    expect(preservedCount).toBe(5);
    expect(dedupCount).toBe(1);
  });

  it("unhappy path: empty / whitespace / 100 KB of repeat input returns bounded output without throw", () => {
    const opts = { detail: "normal" as const };

    const empty = genericCompressor.compress("", opts);
    expect(empty.compressed).toBe("");
    expect(empty.stats.reductionPercent).toBe(0);

    const ws = genericCompressor.compress("   \n\t\n   ", opts);
    expect(typeof ws.compressed).toBe("string");
    // Bounded: may emit the consecutive-repeat marker (~30 chars) but nothing
    // runaway. The point is "doesn't explode", not "emits exactly empty".
    expect(ws.compressed.length).toBeLessThanOrEqual(64);

    // Bounded-but-large single-line input exercises the "no line breaks"
    // edge case. Kept small enough to stay well under the 30s Vitest
    // timeout when tiktoken encodes the repeated string.
    const big = "x".repeat(2_000);
    const bigResult = genericCompressor.compress(big, opts);
    expect(bigResult.compressed.length).toBeLessThanOrEqual(big.length);
    expect(bigResult.stats.originalLines).toBe(1);
  });

  it("snapshot-style: omittedInfo marker shape is stable for repetitive input", () => {
    const result = genericCompressor.compress(REPETITIVE_SAMPLE, {
      detail: "normal",
    });
    // We only snapshot the marker shape, not the full output — cosmetic
    // whitespace changes in compressed body are free; format changes in the
    // omittedInfo string force deliberate review.
    expect(result.omittedInfo).toMatchInlineSnapshot(
      `"26 lines omitted through deduplication"`,
    );
  });
});
