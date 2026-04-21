/**
 * Config Compressor — regression suite (US-019).
 *
 * JSON path: long strings truncated with "...", deep nested objects
 * collapsed to "{N keys}" / "[N items]", large arrays summarized.
 * YAML path: indentation > maxDepth dropped and replaced with a
 * "... (N nested items)" marker.
 * Unhappy: non-config input falls through to technique "none"
 * without throwing.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configCompressor } from "./config.js";

const loadFixture = (path: string) =>
  readFileSync(new URL(`./__fixtures__/${path}`, import.meta.url), "utf8");

const JSON_SAMPLE = loadFixture("config/sample.json");

describe("configCompressor — regressions (US-019)", () => {
  it("summarizes deep nested JSON and long arrays at normal detail", () => {
    const result = configCompressor.compress(JSON_SAMPLE, {
      detail: "normal",
    });
    // Technique reports the JSON path.
    expect(result.stats.technique).toBe("json-summarize");
    // Deeply nested object collapsed.
    expect(result.compressed).toMatch(/\{\s*"\d+ keys"|\{\d+ keys\}|"\{\d+ keys\}"/);
    // Large array summarized with "more items".
    expect(result.compressed).toMatch(/more items/);
    // omittedInfo acknowledges the summarization happened.
    expect(result.omittedInfo).toMatch(/summarized/);
  });

  it("meets compression-ratio floor on nested JSON (≤ 85% of input tokens)", () => {
    const result = configCompressor.compress(JSON_SAMPLE, {
      detail: "normal",
    });
    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.85);
    expect(result.stats.reductionPercent).toBeGreaterThan(0);
  });

  it("detects and compresses YAML-like content", () => {
    const yamlSample = [
      "name: my-app",
      "version: 1.0.0",
      "nested:",
      "  level1:",
      "    level2:",
      "      level3:",
      "        level4:",
      "          level5:",
      "            deep: true",
      "tags:",
      "  - one",
      "  - two",
      "  - three",
    ].join("\n");
    const result = configCompressor.compress(yamlSample, {
      detail: "minimal",
    });
    expect(result.stats.technique).toBe("yaml-depth-limit");
    expect(result.compressed).toMatch(/name: my-app/);
    // Deep indentation replaced with the "nested items" marker.
    expect(result.compressed).toMatch(/nested items/);
  });

  it("unhappy path: empty / malformed / non-config input returns safely", () => {
    const opts = { detail: "normal" as const };

    const empty = configCompressor.compress("", opts);
    expect(typeof empty.compressed).toBe("string");

    // Broken JSON that *looks* like JSON → the compressor tries, fails, and
    // falls through to technique "none" on the JSON branch.
    const broken = '{ "this is": "broken", ';
    const brokenResult = configCompressor.compress(broken, opts);
    // Accept either the untouched content (technique "none") OR a
    // graceful degradation — key requirement is no throw and the
    // original content is preserved as a string.
    expect(typeof brokenResult.compressed).toBe("string");
    expect(brokenResult.compressed.length).toBeGreaterThanOrEqual(
      Math.floor(broken.length * 0.5),
    );

    // Fully non-config input → detectConfigType returns "unknown" →
    // technique "none", content passes through.
    const prose = "this is not a config file, it is just prose text";
    const proseResult = configCompressor.compress(prose, opts);
    expect(proseResult.stats.technique).toBe("none");
    expect(proseResult.compressed).toBe(prose);
  });

  it("snapshot-style: minimal-depth JSON output shape is stable", () => {
    const input = JSON.stringify(
      {
        top: { inner: { deeper: { deepest: "x" } }, sibling: 42 },
      },
      null,
      2,
    );
    const result = configCompressor.compress(input, { detail: "minimal" });
    // At detail="minimal", maxDepth=1 → `top` collapses to "{N keys}".
    expect(result.compressed).toMatchInlineSnapshot(`
      "{
        "top": "{2 keys}"
      }"
    `);
  });
});
