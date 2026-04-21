/**
 * Logs Compressor — regression suite
 *
 * Two blocks:
 *   - US-015: parseLogLine dedup (compressor & summarizer share one
 *     implementation; level classification is identical across paths).
 *   - US-019: output-shape, compression-ratio floor, unhappy-path regressions
 *     grounded in a curated fixture under `__fixtures__/logs/`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { logsCompressor } from "./logs.js";
import { genericSummarizer } from "../summarizers/generic.js";
import { parseLogLine as parseLogLineUtils } from "../utils/log-parser.js";

const loadFixture = (path: string) =>
  readFileSync(new URL(`./__fixtures__/${path}`, import.meta.url), "utf8");

const APP_LOG = loadFixture("logs/app-log-sample.txt");

const MIXED_LOG_SAMPLE = [
  "2024-01-15T10:00:01 [INFO] server listening on port 3000",
  "2024-01-15T10:00:02 [WARN] high memory usage: 87%",
  "2024-01-15T10:00:03 [ERROR] failed to connect to db host=127.0.0.1",
  "2024-01-15T10:00:04 [CRITICAL] panic recovered in handler",
  "2024-01-15T10:00:05 [FATAL] out of memory",
  "2024-01-15T10:00:06 [WARNING] deprecated API called",
  "2024-01-15T10:00:07 [ERR] timeout after 5000ms",
  "2024-01-15T10:00:08 [DEBUG] cache miss for key abc123",
].join("\n");

describe("logs compressor — parseLogLine dedup (US-015)", () => {
  it("parses lines via the same utils function used by the generic summarizer", () => {
    // Compressor and summarizer both import parseLogLine from utils/log-parser.ts.
    // Calling parseLogLine directly yields the exact structure both paths consume.
    const entry = parseLogLineUtils("2024-01-15T10:00:03 [ERROR] boom");
    expect(entry.level).toBe("error");
    expect(entry.raw).toBe("2024-01-15T10:00:03 [ERROR] boom");
    expect(entry.count).toBe(1);
    expect(entry.timestamp).toBeDefined();
    expect(entry.message.length).toBeGreaterThan(0);
  });

  it("classifies error/warning counts identically between compressor and summarizer", () => {
    // Same input → same parseLogLine calls → same level tags → same counts.
    const summary = genericSummarizer.summarize(MIXED_LOG_SAMPLE, {
      detail: "detailed",
      focus: ["errors", "warnings"],
    });

    const result = logsCompressor.compress(MIXED_LOG_SAMPLE, {
      detail: "detailed",
    });

    // Re-parse the sample the same way the summarizer does to read
    // what the compressor *should* count via its shared parser.
    const expectedErrors = MIXED_LOG_SAMPLE.split("\n").filter(
      (l) => parseLogLineUtils(l).level === "error"
    ).length;
    const expectedWarnings = MIXED_LOG_SAMPLE.split("\n").filter(
      (l) => parseLogLineUtils(l).level === "warning"
    ).length;

    expect(summary.statistics.errorCount).toBe(expectedErrors);
    expect(summary.statistics.warningCount).toBe(expectedWarnings);

    // Compressor output contains the rendered summary block with the same counts.
    // Parse the "**Errors:** N" / "**Warnings:** N" markers from the compressed text.
    const errMatch = result.compressed.match(/\*\*Errors:\*\*\s+(\d+)/);
    const warnMatch = result.compressed.match(/\*\*Warnings:\*\*\s+(\d+)/);
    expect(errMatch).not.toBeNull();
    expect(warnMatch).not.toBeNull();
    expect(Number(errMatch?.[1])).toBe(expectedErrors);
    expect(Number(warnMatch?.[1])).toBe(expectedWarnings);
  });

  it("documents the more-permissive unification: CRITICAL / ERR / FATAL all classify as error", () => {
    // The previous compressor-local parser missed CRITICAL and ERR entirely.
    // The unified utils parser catches all three — this is the "more permissive"
    // behaviour the PRD (US-015) asks us to adopt when implementations diverge.
    expect(parseLogLineUtils("[CRITICAL] boom").level).toBe("error");
    expect(parseLogLineUtils("[ERR] boom").level).toBe("error");
    expect(parseLogLineUtils("[FATAL] boom").level).toBe("error");
    expect(parseLogLineUtils("[ERROR] boom").level).toBe("error");
    // WARN and WARNING both collapse to "warning".
    expect(parseLogLineUtils("[WARN] caution").level).toBe("warning");
    expect(parseLogLineUtils("[WARNING] caution").level).toBe("warning");
  });
});

describe("logs compressor — regressions (US-019)", () => {
  it("groups repetitive request / health-check lines and renders the summary block", () => {
    const result = logsCompressor.compress(APP_LOG, { detail: "normal" });
    // Summary header + level counts present.
    expect(result.compressed).toMatch(/### Log Summary/);
    expect(result.compressed).toMatch(/\*\*Errors:\*\*\s+\d+/);
    expect(result.compressed).toMatch(/\*\*Warnings:\*\*\s+\d+/);
    expect(result.compressed).toMatch(/Unique patterns:/);
    // "similar entries omitted" marker for the large GET /api/health run.
    expect(result.compressed).toMatch(/similar entries/);
    expect(result.stats.technique).toBe("log-grouping");
  });

  it("meets compression-ratio floor on repetitive app log (≤ 60% of input tokens)", () => {
    const result = logsCompressor.compress(APP_LOG, { detail: "normal" });
    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.6);
    expect(result.stats.reductionPercent).toBeGreaterThanOrEqual(40);
  });

  it("unhappy path: empty / non-log / synthetic repetitive input never throws and stays bounded", () => {
    const opts = { detail: "normal" as const };

    const empty = logsCompressor.compress("", opts);
    expect(typeof empty.compressed).toBe("string");
    expect(empty.stats.reductionPercent).toBe(0);

    const ws = logsCompressor.compress("   \n\n   ", opts);
    expect(typeof ws.compressed).toBe("string");

    // Pathological: 500 identical log lines → must collapse dramatically.
    const synthetic = Array.from(
      { length: 500 },
      () => "2024-01-15T10:00:00 [INFO] tick",
    ).join("\n");
    const bigResult = logsCompressor.compress(synthetic, opts);
    expect(bigResult.stats.compressedLines).toBeLessThanOrEqual(10);
    // The summary count must reflect the full input (Info count = 500).
    expect(bigResult.compressed).toMatch(/\*\*Info\/Other:\*\*\s+500/);
  });
});
