/**
 * Lazy MCP Tests
 *
 * Tests for the lazy-mcp pattern implementation:
 * - browse_tools meta-tool for navigating tool hierarchy
 * - run_tool meta-tool for executing tools by name
 * - Token savings from lazy loading (95%+ reduction)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  browseToolsTool,
  runToolTool,
  lazyMcpTools,
  setLazyMcpRegistry,
  calculateLazySavings,
} from "./lazy-mcp.js";
import { resetDynamicLoader, TOOL_CATALOG } from "./dynamic-loader.js";
import { countTokens } from "../utils/token-counter.js";

describe("Lazy MCP Pattern", () => {
  beforeEach(() => {
    resetDynamicLoader();
  });

  describe("browse_tools", () => {
    it("should list categories when no category specified", async () => {
      const result = await browseToolsTool.execute({});
      const text = result.content[0]?.text ?? "";

      expect(text).toContain("ctxopt/");
      expect(text).toContain("compress/");
      expect(text).toContain("analyze/");
      expect(text).toContain("logs/");
      expect(text).toContain("code/");
      expect(text).toContain("pipeline/");
    });

    it("should list tools in a specific category", async () => {
      const result = await browseToolsTool.execute({ category: "compress" });
      const text = result.content[0]?.text ?? "";

      expect(text).toContain("ctxopt/compress/");
      expect(text).toContain("compress_context");
      expect(text).toContain("semantic_compress");
    });

    it("should show tool count per category", async () => {
      const result = await browseToolsTool.execute({});
      const text = result.content[0]?.text ?? "";

      // Should show something like "compress/ (4 tools)"
      expect(text).toMatch(/\(\d+ tools?\)/);
    });

    it("should handle invalid category", async () => {
      const result = await browseToolsTool.execute({ category: "invalid" });
      const text = result.content[0]?.text ?? "";

      expect(text).toContain("No tools in category");
    });
  });

  describe("run_tool", () => {
    it("should execute a tool by name", async () => {
      const result = await runToolTool.execute({
        name: "auto_optimize",
        args: { content: "test content that is long enough to process" },
      });

      // Should return tool output (not error about unknown tool)
      expect(result.isError).not.toBe(true);
    });

    it("should return error for unknown tool", async () => {
      const result = await runToolTool.execute({
        name: "nonexistent_tool",
        args: {},
      });
      const text = result.content[0]?.text ?? "";

      expect(result.isError).toBe(true);
      expect(text).toContain("Unknown tool");
    });

    it("should list available tools on error", async () => {
      const result = await runToolTool.execute({
        name: "bad_tool",
        args: {},
      });
      const text = result.content[0]?.text ?? "";

      expect(text).toContain("Available:");
      expect(text).toContain("auto_optimize");
    });

    it("should pass args to the tool", async () => {
      const result = await runToolTool.execute({
        name: "auto_optimize",
        args: {
          content: "Error: Something went wrong\nError: Something went wrong",
          hint: "errors",
        },
      });

      expect(result.isError).not.toBe(true);
    });
  });

  describe("lazyMcpTools collection", () => {
    it("should contain exactly 2 tools", () => {
      expect(lazyMcpTools).toHaveLength(2);
    });

    it("should contain browse_tools and run_tool", () => {
      const names = lazyMcpTools.map((t) => t.name);
      expect(names).toContain("browse_tools");
      expect(names).toContain("run_tool");
    });

    it("should have minimal schemas", () => {
      for (const tool of lazyMcpTools) {
        const schemaStr = JSON.stringify(tool.inputSchema);
        const tokens = countTokens(schemaStr);
        expect(tokens).toBeLessThan(100);
      }
    });
  });

  describe("Token savings", () => {
    it("should calculate significant savings", () => {
      const savings = calculateLazySavings();

      expect(savings.savingsPercent).toBeGreaterThan(80);
      expect(savings.lazyTokens).toBeLessThan(savings.fullTokens);

      console.log(
        `  Lazy tokens: ${savings.lazyTokens}, Full tokens: ${savings.fullTokens}, Savings: ${savings.savingsPercent}%`
      );
    });

    it("should use fewer tokens than core loading", async () => {
      // Calculate lazy mode tokens
      const lazyTokens = lazyMcpTools.reduce((sum, tool) => {
        const serialized = JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
        return sum + countTokens(serialized);
      }, 0);

      // Calculate full catalog tokens (simulated)
      const fullTokens = TOOL_CATALOG.length * 80; // ~80 tokens per tool

      const savingsPercent = Math.round((1 - lazyTokens / fullTokens) * 100);
      expect(savingsPercent).toBeGreaterThan(90);

      console.log(`  Lazy: ${lazyTokens} tokens, Full: ${fullTokens} tokens, Savings: ${savingsPercent}%`);
    });
  });

  describe("Registry integration", () => {
    it("should work with custom registry", async () => {
      let executedTool = "";
      let executedArgs: unknown = null;

      setLazyMcpRegistry({
        execute: async (name, args) => {
          executedTool = name;
          executedArgs = args;
          return { content: [{ type: "text", text: "mocked result" }] };
        },
      });

      const result = await runToolTool.execute({
        name: "auto_optimize",
        args: { content: "test" },
      });

      expect(executedTool).toBe("auto_optimize");
      expect(executedArgs).toEqual({ content: "test" });
      expect(result.content[0]?.text).toBe("mocked result");
    });
  });
});

describe("Lazy mode comparison", () => {
  beforeEach(() => {
    resetDynamicLoader();
  });

  it("should show lazy vs core vs all token usage", async () => {
    // Lazy mode: 2 tools
    const lazyTokens = lazyMcpTools.reduce((sum, tool) => {
      const serialized = JSON.stringify({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
      return sum + countTokens(serialized);
    }, 0);

    // Simulated core mode: ~4 tools
    const coreTokens = 4 * 80;

    // Simulated all mode: all catalog tools
    const allTokens = TOOL_CATALOG.length * 80;

    console.log(`  Mode comparison:`);
    console.log(`    lazy: ${lazyTokens} tokens (2 tools)`);
    console.log(`    core: ~${coreTokens} tokens (4 tools)`);
    console.log(`    all:  ~${allTokens} tokens (${TOOL_CATALOG.length} tools)`);

    expect(lazyTokens).toBeLessThan(coreTokens);
    expect(coreTokens).toBeLessThan(allTokens);
  });
});
