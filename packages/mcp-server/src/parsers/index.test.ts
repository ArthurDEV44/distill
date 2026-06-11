import { describe, it, expect } from "vitest";
import { analyzeBuildOutput } from "./index.js";
import { countTokens } from "../utils/token-counter.js";

/**
 * US-006: build-output token counting must go through the single canonical
 * tiktoken encoder (`utils/token-counter`), not a second private instance.
 */
describe("build output parser token counting (US-006)", () => {
  it("token counts come from the canonical token-counter (identical results)", () => {
    const sample = "src/foo.ts(10,5): error TS2304: Cannot find name 'bar'.\n".repeat(10);
    const result = analyzeBuildOutput(sample);
    expect(result.stats.tokensOriginal).toBe(countTokens(sample));
    expect(result.stats.tokensCompressed).toBe(countTokens(result.summary));
    expect(result.stats.tokensOriginal).toBeGreaterThan(0);
  });
});
