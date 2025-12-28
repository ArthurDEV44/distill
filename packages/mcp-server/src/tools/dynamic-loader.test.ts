/**
 * Dynamic Tool Loader Tests
 *
 * Tests for lazy loading functionality to ensure:
 * 1. Only core tools are loaded at startup
 * 2. Non-core tools are loaded on-demand
 * 3. Token savings from lazy loading
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DynamicToolLoader,
  getDynamicLoader,
  resetDynamicLoader,
  TOOL_CATALOG,
  type ToolCategory,
} from "./dynamic-loader.js";
import { countTokens } from "../utils/token-counter.js";

describe("DynamicToolLoader", () => {
  let loader: DynamicToolLoader;

  beforeEach(() => {
    resetDynamicLoader();
    loader = getDynamicLoader();
  });

  describe("Core tools loading", () => {
    it("should only load core tools at startup", async () => {
      const coreTools = await loader.loadCoreTools();

      // Should only load tools marked as "core"
      const coreNames = coreTools.map((t) => t.name);
      expect(coreNames).toContain("auto_optimize");
      expect(coreNames).toContain("smart_file_read");

      // Should NOT load non-core tools
      expect(coreNames).not.toContain("compress_context");
      expect(coreNames).not.toContain("analyze_build_output");
      expect(coreNames).not.toContain("summarize_logs");
    });

    it("should have fewer loaded tools than total catalog", async () => {
      await loader.loadCoreTools();
      const loadedTools = loader.getLoadedTools();

      expect(loadedTools.length).toBeLessThan(TOOL_CATALOG.length);
      console.log(
        `  Core tools: ${loadedTools.length}/${TOOL_CATALOG.length} (${Math.round((loadedTools.length / TOOL_CATALOG.length) * 100)}%)`
      );
    });
  });

  describe("On-demand loading", () => {
    it("should load tools by category", async () => {
      await loader.loadCoreTools();
      const beforeCount = loader.getLoadedTools().length;

      const compressTools = await loader.loadByCategory("compress");

      const afterCount = loader.getLoadedTools().length;
      expect(afterCount).toBeGreaterThan(beforeCount);

      // Verify compress tools are loaded
      const loadedNames = loader.getLoadedTools().map((t) => t.name);
      expect(loadedNames).toContain("compress_context");
    });

    it("should load tools by name", async () => {
      await loader.loadCoreTools();
      expect(loader.isLoaded("summarize_logs")).toBe(false);

      await loader.loadByNames(["summarize_logs"]);

      expect(loader.isLoaded("summarize_logs")).toBe(true);
    });

    it("should load tools by query", async () => {
      await loader.loadCoreTools();
      const beforeCount = loader.getLoadedTools().length;

      await loader.loadByQuery("build");

      const afterCount = loader.getLoadedTools().length;
      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    it("should not duplicate already loaded tools", async () => {
      await loader.loadCoreTools();
      const firstCount = loader.getLoadedTools().length;

      await loader.loadCoreTools(); // Load again
      const secondCount = loader.getLoadedTools().length;

      expect(secondCount).toBe(firstCount);
    });
  });

  describe("Token savings from lazy loading", () => {
    it("should save tokens by loading only core tools", async () => {
      // Calculate tokens for core tools only
      const coreTools = await loader.loadCoreTools();
      const coreTokens = coreTools.reduce((sum, tool) => {
        const serialized = JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
        return sum + countTokens(serialized);
      }, 0);

      // Reset and load all tools
      resetDynamicLoader();
      const freshLoader = getDynamicLoader();
      const allTools = await freshLoader.loadAllTools();
      const allTokens = allTools.reduce((sum, tool) => {
        const serialized = JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
        return sum + countTokens(serialized);
      }, 0);

      // Core tools should use significantly fewer tokens
      const savings = Math.round((1 - coreTokens / allTokens) * 100);
      expect(savings).toBeGreaterThan(50); // At least 50% savings

      console.log(`  Token savings: ${allTokens} → ${coreTokens} (-${savings}%)`);
    });
  });

  describe("Tool catalog integrity", () => {
    it("should have all required categories", () => {
      const categories = new Set(TOOL_CATALOG.map((t) => t.category));

      expect(categories).toContain("core");
      expect(categories).toContain("compress");
      expect(categories).toContain("analyze");
      expect(categories).toContain("logs");
      expect(categories).toContain("code");
      expect(categories).toContain("pipeline");
    });

    it("should have unique tool names", () => {
      const names = TOOL_CATALOG.map((t) => t.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have loaders that resolve", async () => {
      for (const meta of TOOL_CATALOG) {
        const tool = await meta.loader();
        expect(tool).toBeDefined();
        expect(tool.name).toBe(meta.name);
        expect(tool.execute).toBeInstanceOf(Function);
      }
    });
  });

  describe("Change notifications", () => {
    it("should notify when new tools are loaded", async () => {
      let notified = false;
      loader.onToolsChanged(() => {
        notified = true;
      });

      await loader.loadCoreTools();

      expect(notified).toBe(true);
    });

    it("should not notify when no new tools are loaded", async () => {
      await loader.loadCoreTools();

      let notified = false;
      loader.onToolsChanged(() => {
        notified = true;
      });

      await loader.loadCoreTools(); // Load same tools again

      expect(notified).toBe(false);
    });
  });
});

describe("Metadata-only discovery", () => {
  let loader: DynamicToolLoader;

  beforeEach(() => {
    resetDynamicLoader();
    loader = getDynamicLoader();
  });

  it("should get available tools without loading them", () => {
    const available = loader.getAvailableTools();

    expect(available.length).toBe(TOOL_CATALOG.length);
    expect(loader.getLoadedTools().length).toBe(0);
  });

  it("should search tools without loading them", () => {
    const results = loader.searchTools("compress");

    expect(results.length).toBeGreaterThan(0);
    expect(loader.getLoadedTools().length).toBe(0);
  });

  it("should get tools by category without loading them", () => {
    const results = loader.getToolsByCategory("logs");

    expect(results.length).toBeGreaterThan(0);
    expect(loader.getLoadedTools().length).toBe(0);
  });
});
