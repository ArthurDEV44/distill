import { describe, expect, it } from "vitest";
import { semanticCompressor } from "./semantic.js";

/**
 * F2 query-aware compression. Build content where a task-relevant paragraph sits
 * in the low-importance middle (position U-curve would normally drop it) and
 * verify that passing the task preserves it.
 */
function buildContent(): string {
  const filler = (n: number) =>
    `Paragraph ${n} discusses unrelated configuration details and assorted boilerplate ` +
    `that carries little signal for any particular investigation and exists only to add bulk.`;

  const paras: string[] = [];
  for (let i = 0; i < 6; i++) paras.push(filler(i));
  // Task-relevant paragraph buried in the middle (position ~0.5, low U-curve weight).
  paras.splice(
    3,
    0,
    "The authentication handler throws a timeout when the session token expires mid-request, " +
      "causing the retry loop to abort before the refresh completes."
  );
  for (let i = 6; i < 12; i++) paras.push(filler(i));
  return paras.join("\n\n");
}

describe("semanticCompressor — F2 query-aware", () => {
  const content = buildContent();
  const task = "authentication timeout session token";

  it("preserves the task-relevant segment when a query is given", () => {
    const withQuery = semanticCompressor.compress(content, {
      detail: "normal",
      targetRatio: 0.3,
      query: task,
    });
    expect(withQuery.compressed).toContain("authentication handler throws a timeout");
  });

  it("query does not inflate output beyond the no-query baseline materially", () => {
    const withQuery = semanticCompressor.compress(content, {
      detail: "normal",
      targetRatio: 0.3,
      query: task,
    });
    const noQuery = semanticCompressor.compress(content, {
      detail: "normal",
      targetRatio: 0.3,
    });
    // Query reorders selection within roughly the same token budget — it must not
    // balloon output (the RCT warning: aggressive/over-selection inflates cost).
    expect(withQuery.stats.compressedTokens).toBeLessThanOrEqual(
      noQuery.stats.compressedTokens + noQuery.stats.originalTokens * 0.15
    );
  });

  it("is a no-op when query terms are all stopwords or too short", () => {
    const a = semanticCompressor.compress(content, { detail: "normal", targetRatio: 0.5 });
    const b = semanticCompressor.compress(content, {
      detail: "normal",
      targetRatio: 0.5,
      query: "the and for a an",
    });
    expect(b.compressed).toBe(a.compressed);
  });

  it("leaves behavior unchanged when no query is passed", () => {
    const baseline = semanticCompressor.compress(content, { detail: "normal", targetRatio: 0.5 });
    expect(baseline.stats.reductionPercent).toBeGreaterThan(0);
  });
});
