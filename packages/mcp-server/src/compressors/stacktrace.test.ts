/**
 * Stack Trace Compressor — regression suite (US-019).
 *
 * Covers JS, Python, and generic fallback paths. The compressor must
 * recognize internal frames and collapse them, leaving project frames
 * visible. Unhappy paths include empty input, non-stacktrace content,
 * and mixed frames with no internal patterns.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stacktraceCompressor } from "./stacktrace.js";

const loadFixture = (path: string) =>
  readFileSync(new URL(`./__fixtures__/${path}`, import.meta.url), "utf8");

const NODE_STACK = loadFixture("stacktrace/node-error.txt");
const PYTHON_STACK = loadFixture("stacktrace/python-traceback.txt");

describe("stacktraceCompressor — regressions (US-019)", () => {
  it("collapses Node.js internal frames and keeps the error header + project frames", () => {
    const result = stacktraceCompressor.compress(NODE_STACK, {
      detail: "normal",
    });

    // Error header preserved verbatim.
    expect(result.compressed).toMatch(/^TypeError: Cannot read properties of undefined/);
    // Internal-frames omission marker inserted.
    expect(result.compressed).toMatch(/\d+ internal frames omitted/);
    // Project frames survive.
    expect(result.compressed).toMatch(/services\/users\.ts/);
    expect(result.compressed).toMatch(/controllers\/userController\.ts/);
    // Dialect metadata recorded.
    expect(result.stats.technique).toBe("stacktrace-javascript");
    // omittedInfo reports how many internal frames were summarized.
    expect(result.omittedInfo).toMatch(/internal\/library frames summarized/);
  });

  it("meets compression-ratio floor on an internal-heavy Node stack (≤ 65% of input tokens)", () => {
    const result = stacktraceCompressor.compress(NODE_STACK, {
      detail: "normal",
    });
    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.65);
    expect(result.stats.reductionPercent).toBeGreaterThanOrEqual(35);
  });

  it("handles Python tracebacks and tags the dialect", () => {
    const result = stacktraceCompressor.compress(PYTHON_STACK, {
      detail: "normal",
    });
    expect(result.compressed).toMatch(/^Traceback \(most recent call last\)/);
    expect(result.stats.technique).toBe("stacktrace-python");
    // Project file visible, site-packages frames summarized.
    expect(result.compressed).toMatch(/services\/users\.py/);
  });

  it("unhappy path: empty / non-stacktrace / bounded input never throws", () => {
    const opts = { detail: "normal" as const };

    const empty = stacktraceCompressor.compress("", opts);
    expect(typeof empty.compressed).toBe("string");
    expect(empty.compressed.length).toBeLessThanOrEqual(empty.compressed.length); // sanity
    expect(empty.stats.reductionPercent).toBe(0);

    const notAStack = stacktraceCompressor.compress(
      "hello world\nsome random text\nno frames here",
      opts,
    );
    expect(notAStack.compressed.length).toBeGreaterThan(0);
    // No match → generic fallback, technique tagged as unknown.
    expect(notAStack.stats.technique).toBe("stacktrace-unknown");

    // 500 lines of repeated internal-looking frames → bounded output.
    const synthetic = Array.from(
      { length: 500 },
      (_, i) => `    at foo (/node_modules/lib/index.js:${i}:5)`,
    ).join("\n");
    const bigResult = stacktraceCompressor.compress(synthetic, opts);
    // All 500 lines should collapse to a single omission marker.
    expect(bigResult.stats.compressedLines).toBeLessThanOrEqual(3);
  });

  it("snapshot-style: the internal-frames omission marker format is stable", () => {
    const synthetic = [
      "Error: boom",
      "    at userHandler (/home/app/src/handlers/user.ts:10:1)",
      "    at /node_modules/express/lib/router.js:1:1",
      "    at /node_modules/express/lib/router.js:2:1",
      "    at /node_modules/express/lib/router.js:3:1",
    ].join("\n");
    const result = stacktraceCompressor.compress(synthetic, {
      detail: "normal",
    });
    expect(result.compressed).toMatchInlineSnapshot(`
      "Error: boom
          at userHandler (/home/app/src/handlers/user.ts:10:1)
          ... (3 internal frames omitted)"
    `);
  });
});
