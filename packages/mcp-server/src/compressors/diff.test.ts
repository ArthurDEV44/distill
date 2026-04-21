/**
 * Diff Compressor — regression suite (US-019).
 *
 * Locks down the three strategies (hunks-only, summary, semantic) against
 * a 3-file unified-diff fixture that exercises modified / added file
 * statuses and multiple hunks. The parser is hit indirectly — each
 * strategy reads ParsedDiff.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compressDiff, parseDiff } from "./diff.js";

const loadFixture = (path: string) =>
  readFileSync(new URL(`./__fixtures__/${path}`, import.meta.url), "utf8");

const DIFF_SAMPLE = loadFixture("diff/simple.diff");

describe("diff compressor — regressions (US-019)", () => {
  it("parses the fixture into 3 files with mixed statuses and accurate counts", () => {
    const parsed = parseDiff(DIFF_SAMPLE);
    expect(parsed.files).toHaveLength(3);

    const paths = parsed.files.map((f) => f.newPath);
    expect(paths).toContain("src/services/users.ts");
    expect(paths).toContain("src/controllers/userController.ts");
    expect(paths).toContain("src/tests/users.test.ts");

    const added = parsed.files.filter((f) => f.status === "added");
    expect(added).toHaveLength(1);
    expect(added[0]?.newPath).toBe("src/tests/users.test.ts");

    expect(parsed.totalAdditions).toBeGreaterThan(0);
    expect(parsed.totalDeletions).toBeGreaterThan(0);
  });

  it("hunks-only strategy keeps only change lines + context and hits the ratio floor (≤ 90% of input tokens)", () => {
    const result = compressDiff(DIFF_SAMPLE, {
      strategy: "hunks-only",
      contextLines: 1,
    });
    expect(result.stats.technique).toBe("diff:hunks-only");
    expect(result.filesChanged).toHaveLength(3);
    // Change lines preserved.
    expect(result.compressed).toMatch(/\+  getUserName/);
    expect(result.compressed).toMatch(/-  getUserName/);
    // File status icons present.
    expect(result.compressed).toMatch(/^M src\/services\/users\.ts/m);
    expect(result.compressed).toMatch(/^A src\/tests\/users\.test\.ts/m);

    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    // hunks-only drops headers + unchanged context beyond ±1 lines. This is
    // a modest gain on small diffs — 90% guards against drastic drift.
    expect(ratio).toBeLessThanOrEqual(0.9);
  });

  it("summary strategy replaces diff content with grouped human-readable counts", () => {
    const result = compressDiff(DIFF_SAMPLE, { strategy: "summary" });
    expect(result.stats.technique).toBe("diff:summary");
    // Summary headers present.
    expect(result.compressed).toMatch(/## Diff Summary/);
    expect(result.compressed).toMatch(/Files changed: 3/);
    // Should categorize the added test file separately from modified ones.
    expect(result.compressed).toMatch(/### Added \(1\)/);
    expect(result.compressed).toMatch(/### Modified \(2\)/);
    // No hunk content leaks through.
    expect(result.compressed).not.toMatch(/^@@/m);

    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.7);
  });

  it("semantic strategy scores hunks and surfaces the error-throwing hunk", () => {
    const result = compressDiff(DIFF_SAMPLE, {
      strategy: "semantic",
      maxTokens: 150,
    });
    expect(result.stats.technique).toBe("diff:semantic");
    // The hunk that adds `throw new Error("User is null")` should be high
    // priority and make it past the maxTokens cutoff.
    expect(result.compressed).toMatch(/User is null/);
  });

  it("unhappy path: empty / non-diff input returns safely with zero files", () => {
    const empty = compressDiff("", { strategy: "hunks-only" });
    expect(empty.filesChanged).toEqual([]);
    expect(empty.additions).toBe(0);
    expect(empty.deletions).toBe(0);
    expect(typeof empty.compressed).toBe("string");

    const notADiff = compressDiff("hello world\nthis is not a diff\n", {
      strategy: "hunks-only",
    });
    expect(notADiff.filesChanged).toEqual([]);
    expect(notADiff.stats.originalTokens).toBeGreaterThan(0);

    // Malformed hunk header — parser falls back to sensible defaults.
    const malformed = compressDiff(
      "diff --git a/foo b/foo\n@@ not a real header @@\nsome line\n",
      { strategy: "hunks-only" },
    );
    expect(malformed.filesChanged).toContain("foo");
    expect(typeof malformed.compressed).toBe("string");
  });

  it("snapshot-style: summary section structure is stable", () => {
    const tinyDiff = [
      "diff --git a/a.ts b/a.ts",
      "index 1..2 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,3 +1,3 @@",
      " keep",
      "-old",
      "+new",
      " keep",
    ].join("\n");
    const result = compressDiff(tinyDiff, { strategy: "summary" });
    expect(result.compressed).toMatchInlineSnapshot(`
      "## Diff Summary
      - Files changed: 1
      - Additions: +1
      - Deletions: -1

      ### Modified (1)
      - a.ts: +1/-1, 1 hunk"
    `);
  });
});
