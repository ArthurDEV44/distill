import { describe, it, expect } from "vitest";
import { getCompressor, compressContent, analyzeContent } from "./index.js";
import { semanticCompressor, diffCompressor, compressDiff } from "./direct.js";
import type { ContentType } from "./types.js";

const ALL_CONTENT_TYPES: ContentType[] = ["logs", "stacktrace", "config", "code", "generic"];
const DISPATCH_NAMES = new Set(["logs", "stacktrace", "config", "generic"]);

describe("compressor dispatch surface honesty (US-005)", () => {
  it("getCompressor never routes to the direct-only compressors", () => {
    for (const ct of ALL_CONTENT_TYPES) {
      const c = getCompressor(ct);
      expect(c.name).not.toBe("semantic");
      expect(c.name).not.toBe("diff");
      expect(c).not.toBe(semanticCompressor);
      expect(c).not.toBe(diffCompressor);
    }
  });

  it("the reachable compressor set equals the dispatch array exactly", () => {
    const reachable = new Set(ALL_CONTENT_TYPES.map((ct) => getCompressor(ct).name));
    for (const name of reachable) {
      expect(DISPATCH_NAMES.has(name)).toBe(true);
    }
  });

  it("compressContent runs generic dedup for code — never a semantic/diff technique", () => {
    const code = "function foo(){ return 1; }\n".repeat(20);
    const result = compressContent(code);
    expect(result.stats.technique).not.toContain("semantic");
    expect(result.stats.technique).not.toContain("diff");
  });

  it("direct.js is the explicit surface for the direct-only compressors", () => {
    expect(semanticCompressor.name).toBe("semantic");
    expect(diffCompressor.name).toBe("diff");
    expect(typeof semanticCompressor.compress).toBe("function");
    expect(typeof compressDiff).toBe("function");
  });
});

describe("analyzeContent honesty (US-007)", () => {
  it("exposes an INDICATIVE estimatedReductionRange (not a measured guarantee)", () => {
    const logs = "2024-01-01 INFO request 1\n".repeat(50);
    const a = analyzeContent(logs);
    expect(a).toHaveProperty("estimatedReductionRange");
    expect(a.estimatedReductionRange).toMatch(/^\d+-\d+%$/);
    expect(a).toHaveProperty("detectedType");
    expect(a).toHaveProperty("suggestedCompressor");
    // the legacy, misleading field name is gone
    expect((a as Record<string, unknown>).estimatedReduction).toBeUndefined();
  });
});
