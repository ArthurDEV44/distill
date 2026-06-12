/**
 * F3 integration: ctx.restore round-trips through the QuickJS bridge, and
 * auto_optimize emits a recover hint + stores the original when enabled.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codeExecuteTool } from "../tools/code-execute.js";
import { autoOptimizeTool } from "../tools/auto-optimize.js";
import { RETRIEVE_ENV_VAR, getOriginStore } from "./origin-store.js";

async function exec(code: string) {
  const result = await codeExecuteTool.execute({ code });
  const sc = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
  return { sc, isError: result.isError };
}

// Highly repetitive error content → errors strategy dedups to one signature,
// guaranteeing >= 30% savings so the F3 emission gate fires.
const REPETITIVE = Array.from(
  { length: 60 },
  (_, i) => `ERROR: failed to connect to database at attempt number ${i}`
).join("\n");

describe("F3 ctx.restore round-trip", () => {
  it("recovers a stored original via ctx.restore", async () => {
    const handle = getOriginStore().put("the original uncompressed content");
    const { sc } = await exec(`return ctx.restore(${JSON.stringify(handle)})`);
    expect(sc?.output).toBe("the original uncompressed content");
  }, 30000);

  it("returns null for an unknown handle", async () => {
    const { sc } = await exec(`return ctx.restore("dnope000000") === null`);
    expect(sc?.output).toBe("true");
  }, 30000);
});

describe("F3 auto_optimize emission", () => {
  const original = process.env[RETRIEVE_ENV_VAR];
  beforeEach(() => {
    process.env[RETRIEVE_ENV_VAR] = "1";
  });
  afterEach(() => {
    if (original === undefined) delete process.env[RETRIEVE_ENV_VAR];
    else process.env[RETRIEVE_ENV_VAR] = original;
  });

  it("appends a restore hint and stores the recoverable original when enabled", async () => {
    const result = await autoOptimizeTool.execute({ content: REPETITIVE, strategy: "errors" });
    const text = result.content[0]?.text ?? "";
    const match = /ctx\.restore\("(d[0-9a-f]{10})"\)/.exec(text);
    expect(match).toBeTruthy();
    expect(getOriginStore().get(match![1]!)).toBe(REPETITIVE);
  });

  it("does not append a hint when disabled", async () => {
    delete process.env[RETRIEVE_ENV_VAR];
    const result = await autoOptimizeTool.execute({ content: REPETITIVE, strategy: "errors" });
    expect(result.content[0]?.text ?? "").not.toContain("ctx.restore");
  });
});
