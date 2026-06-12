import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolRegistry, type ToolDefinition } from "./registry.js";
import { SAVINGS_STATS_ENV_VAR, getSessionStats } from "../stats/session-stats.js";

/** A tool that reports a fixed compression saving via structuredContent. */
function compressingTool(originalTokens: number, optimizedTokens: number): ToolDefinition {
  return {
    name: "fake_compress",
    description: "test",
    inputSchema: { type: "object", properties: {} },
    execute: () =>
      Promise.resolve({
        content: [{ type: "text", text: "compressed body" }],
        structuredContent: { originalTokens, optimizedTokens },
      }),
  };
}

/** A tool with no token counters (like code_execute) — no savings telemetry. */
const noStatsTool: ToolDefinition = {
  name: "fake_nostats",
  description: "test",
  inputSchema: { type: "object", properties: {} },
  execute: () => Promise.resolve({ content: [{ type: "text", text: "ran" }] }),
};

describe("ToolRegistry F1 savings telemetry", () => {
  const original = process.env[SAVINGS_STATS_ENV_VAR];
  beforeEach(() => {
    delete process.env[SAVINGS_STATS_ENV_VAR];
    getSessionStats().reset();
  });
  afterEach(() => {
    if (original === undefined) delete process.env[SAVINGS_STATS_ENV_VAR];
    else process.env[SAVINGS_STATS_ENV_VAR] = original;
  });

  it("populates tokensSaved from structuredContent (fixes the old =0 hardcode)", async () => {
    const reg = createToolRegistry();
    reg.register(compressingTool(1000, 300));
    const result = await reg.execute("fake_compress", {});
    expect(result.tokensSaved).toBe(700);
  });

  it("does not append the savings line when the env flag is off", async () => {
    const reg = createToolRegistry();
    reg.register(compressingTool(1000, 300));
    const result = await reg.execute("fake_compress", {});
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.text).toBe("compressed body");
  });

  it("appends a separate savings-line block when the env flag is on", async () => {
    process.env[SAVINGS_STATS_ENV_VAR] = "1";
    const reg = createToolRegistry();
    reg.register(compressingTool(1000, 300));
    const result = await reg.execute("fake_compress", {});
    expect(result.content).toHaveLength(2);
    expect(result.content[0]!.text).toBe("compressed body");
    expect(result.content[1]!.text).toMatch(
      /^\[distill: saved 700 tokens \(70%\) this call; session total 700 tokens over 1 calls\]$/
    );
  });

  it("accumulates across calls in the session singleton", async () => {
    process.env[SAVINGS_STATS_ENV_VAR] = "1";
    const reg = createToolRegistry();
    reg.register(compressingTool(1000, 300));
    await reg.execute("fake_compress", {});
    const second = await reg.execute("fake_compress", {});
    expect(second.content[1]!.text).toContain("session total 1,400 tokens over 2 calls");
  });

  it("records nothing and appends nothing for tools without token counters", async () => {
    process.env[SAVINGS_STATS_ENV_VAR] = "1";
    const reg = createToolRegistry();
    reg.register(noStatsTool);
    const result = await reg.execute("fake_nostats", {});
    expect(result.tokensSaved).toBe(0);
    expect(result.content).toHaveLength(1);
    expect(getSessionStats().snapshot().calls).toBe(0);
  });

  it("records nothing when optimized >= original (no real saving)", async () => {
    process.env[SAVINGS_STATS_ENV_VAR] = "1";
    const reg = createToolRegistry();
    reg.register(compressingTool(500, 500));
    const result = await reg.execute("fake_compress", {});
    expect(result.tokensSaved).toBe(0);
    expect(result.content).toHaveLength(1);
  });
});
