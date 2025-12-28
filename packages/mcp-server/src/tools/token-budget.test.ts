/**
 * Token Budget Tests
 *
 * Ensures tool definitions stay within token budgets to prevent
 * context window bloat from MCP tool descriptions.
 *
 * These tests guard against regression - any change that increases
 * token consumption will fail the test.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { countTokens } from "../utils/token-counter.js";

// Import all tool definitions
import { autoOptimizeTool } from "./auto-optimize.js";
import { smartFileReadTool } from "./smart-file-read.js";
import { discoverToolsTool } from "./discover-tools.js";
import { analyzeBuildOutputTool } from "./analyze-build-output.js";
import { compressContextTool } from "./compress-context.js";
import { semanticCompressTool } from "./semantic-compress.js";
import { diffCompressTool } from "./diff-compress.js";
import { summarizeLogsTool } from "./summarize-logs.js";
import { codeSkeletonTool } from "./code-skeleton.js";
import { contextBudgetTool } from "./context-budget.js";
import { conversationCompressTool } from "./conversation-compress.js";
import { deduplicateErrorsTool } from "./deduplicate-errors.js";
import { smartCacheTool } from "./smart-cache-tool.js";
import { smartPipelineTool } from "./smart-pipeline.js";
import type { ToolDefinition } from "./registry.js";

// ============================================================================
// Token Budgets (in tokens)
// ============================================================================

/**
 * Maximum tokens allowed per tool definition.
 * These are intentionally tight to catch any bloat early.
 *
 * 2024-12: Tightened budgets after schema optimization
 */
const TOKEN_BUDGETS = {
  // Core tools (always loaded) - ultra-minimal
  auto_optimize: 90,
  smart_file_read: 120, // Reduced from 200
  discover_tools: 75,

  // Compress category
  compress_context: 120,
  semantic_compress: 100,
  diff_compress: 80,
  conversation_compress: 150,

  // Analyze category
  analyze_build_output: 110,
  context_budget: 120,

  // Logs category
  summarize_logs: 150,
  deduplicate_errors: 80,

  // Code category
  code_skeleton: 100,
  smart_cache: 110,

  // Pipeline category
  smart_pipeline: 110,
} as const;

/**
 * Maximum tokens for the entire ListTools response (core tools only).
 * Currently: auto_optimize + smart_file_read + discover_tools
 * 2024-12: Reduced from 500 after schema optimization
 */
const CORE_TOOLS_BUDGET = 300;

/**
 * Maximum tokens for all tools combined.
 */
const ALL_TOOLS_BUDGET = 1500;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serialize a tool definition as it would appear in ListTools response
 */
function serializeToolForMCP(tool: ToolDefinition): string {
  return JSON.stringify({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  });
}

/**
 * Count tokens in a tool definition
 */
function countToolTokens(tool: ToolDefinition): number {
  const serialized = serializeToolForMCP(tool);
  return countTokens(serialized);
}

// ============================================================================
// All Tools
// ============================================================================

const ALL_TOOLS: ToolDefinition[] = [
  autoOptimizeTool,
  smartFileReadTool,
  discoverToolsTool,
  analyzeBuildOutputTool,
  compressContextTool,
  semanticCompressTool,
  diffCompressTool,
  summarizeLogsTool,
  codeSkeletonTool,
  contextBudgetTool,
  conversationCompressTool,
  deduplicateErrorsTool,
  smartCacheTool,
  smartPipelineTool,
];

const CORE_TOOLS: ToolDefinition[] = [
  autoOptimizeTool,
  smartFileReadTool,
  discoverToolsTool,
];

// ============================================================================
// Tests
// ============================================================================

describe("Tool Token Budgets", () => {
  describe("Individual tool budgets", () => {
    it.each(ALL_TOOLS.map((t) => [t.name, t]))(
      "%s should be under budget",
      (name, tool) => {
        const tokens = countToolTokens(tool as ToolDefinition);
        const budget = TOKEN_BUDGETS[name as keyof typeof TOKEN_BUDGETS];

        expect(tokens).toBeLessThanOrEqual(budget);

        // Log for visibility
        const usage = Math.round((tokens / budget) * 100);
        console.log(`  ${name}: ${tokens}/${budget} tokens (${usage}%)`);
      }
    );
  });

  describe("Aggregate budgets", () => {
    it("core tools should be under combined budget", () => {
      const totalTokens = CORE_TOOLS.reduce(
        (sum, tool) => sum + countToolTokens(tool),
        0
      );

      expect(totalTokens).toBeLessThanOrEqual(CORE_TOOLS_BUDGET);

      const usage = Math.round((totalTokens / CORE_TOOLS_BUDGET) * 100);
      console.log(
        `  Core tools total: ${totalTokens}/${CORE_TOOLS_BUDGET} tokens (${usage}%)`
      );
    });

    it("all tools should be under combined budget", () => {
      const totalTokens = ALL_TOOLS.reduce(
        (sum, tool) => sum + countToolTokens(tool),
        0
      );

      expect(totalTokens).toBeLessThanOrEqual(ALL_TOOLS_BUDGET);

      const usage = Math.round((totalTokens / ALL_TOOLS_BUDGET) * 100);
      console.log(
        `  All tools total: ${totalTokens}/${ALL_TOOLS_BUDGET} tokens (${usage}%)`
      );
    });
  });

  describe("Token distribution", () => {
    it("should have balanced token distribution (no tool > 20% of total)", () => {
      const totalTokens = ALL_TOOLS.reduce(
        (sum, tool) => sum + countToolTokens(tool),
        0
      );

      for (const tool of ALL_TOOLS) {
        const tokens = countToolTokens(tool);
        const percentage = (tokens / totalTokens) * 100;

        expect(percentage).toBeLessThan(20);
      }
    });
  });
});

describe("Tool Schema Constraints", () => {
  describe("Description length", () => {
    it.each(ALL_TOOLS.map((t) => [t.name, t]))(
      "%s description should be concise (< 150 chars)",
      (name, tool) => {
        const description = (tool as ToolDefinition).description;
        expect(description.length).toBeLessThan(150);
      }
    );
  });

  describe("Schema structure", () => {
    it.each(ALL_TOOLS.map((t) => [t.name, t]))(
      "%s should not have deeply nested descriptions",
      (name, tool) => {
        const schema = (tool as ToolDefinition).inputSchema;
        const serialized = JSON.stringify(schema);

        // Count "description" occurrences - should be minimal
        const descriptionCount = (serialized.match(/"description"/g) || [])
          .length;

        // Allow max 3 descriptions per schema (for complex tools)
        expect(descriptionCount).toBeLessThanOrEqual(3);
      }
    );
  });
});

describe("ListTools Response Size", () => {
  it("should generate compact ListTools response for core tools", () => {
    const response = {
      tools: CORE_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };

    const serialized = JSON.stringify(response);
    const tokens = countTokens(serialized);

    // ListTools response should be under 600 tokens for core tools
    expect(tokens).toBeLessThan(600);

    console.log(`  ListTools (core): ${serialized.length} chars, ${tokens} tokens`);
  });

  it("should generate compact ListTools response for all tools", () => {
    const response = {
      tools: ALL_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };

    const serialized = JSON.stringify(response);
    const tokens = countTokens(serialized);

    // Full ListTools response should be under 1800 tokens
    expect(tokens).toBeLessThan(1800);

    console.log(`  ListTools (all): ${serialized.length} chars, ${tokens} tokens`);
  });
});

describe("Token Reduction Verification", () => {
  /**
   * Baseline values from BEFORE optimization (commit d4cdb98).
   * These are used to verify we actually reduced tokens.
   */
  const BASELINE_TOKENS = {
    auto_optimize: 287,
    smart_file_read: 342,
    discover_tools: 153,
    core_total: 782,
  };

  it("auto_optimize should be reduced from baseline", () => {
    const current = countToolTokens(autoOptimizeTool);
    const baseline = BASELINE_TOKENS.auto_optimize;
    const reduction = Math.round((1 - current / baseline) * 100);

    expect(current).toBeLessThan(baseline);
    expect(reduction).toBeGreaterThan(30); // At least 30% reduction

    console.log(`  auto_optimize: ${baseline} → ${current} (${reduction}% reduction)`);
  });

  it("smart_file_read should be reduced from baseline", () => {
    const current = countToolTokens(smartFileReadTool);
    const baseline = BASELINE_TOKENS.smart_file_read;
    const reduction = Math.round((1 - current / baseline) * 100);

    expect(current).toBeLessThan(baseline);
    expect(reduction).toBeGreaterThan(20); // At least 20% reduction

    console.log(`  smart_file_read: ${baseline} → ${current} (${reduction}% reduction)`);
  });

  it("discover_tools should be reduced from baseline", () => {
    const current = countToolTokens(discoverToolsTool);
    const baseline = BASELINE_TOKENS.discover_tools;
    const reduction = Math.round((1 - current / baseline) * 100);

    expect(current).toBeLessThan(baseline);
    expect(reduction).toBeGreaterThan(20); // At least 20% reduction

    console.log(`  discover_tools: ${baseline} → ${current} (${reduction}% reduction)`);
  });

  it("core tools total should be at least 40% reduced from baseline", () => {
    const currentTotal = CORE_TOOLS.reduce(
      (sum, tool) => sum + countToolTokens(tool),
      0
    );
    const baseline = BASELINE_TOKENS.core_total;
    const reduction = Math.round((1 - currentTotal / baseline) * 100);

    expect(currentTotal).toBeLessThan(baseline);
    expect(reduction).toBeGreaterThan(40); // At least 40% total reduction

    console.log(`  Core total: ${baseline} → ${currentTotal} (${reduction}% reduction)`);
  });
});

describe("Regression Prevention", () => {
  /**
   * Snapshot of current token counts.
   * Update these when intentionally adding features.
   * Any unexpected change will fail the test.
   *
   * 2024-12: Optimized schemas to reduce token overhead
   * - Removed property descriptions (moved to tool description)
   * - Removed rarely-used properties from public schema
   * - Simplified nested object type declarations
   */
  const CURRENT_SNAPSHOT = {
    auto_optimize: 80,
    smart_file_read: 106,
    discover_tools: 63,
  };

  // Tolerance: ±5 tokens for minor changes
  const TOLERANCE = 5;

  it.each(Object.entries(CURRENT_SNAPSHOT))(
    "%s should match snapshot (±5 tokens)",
    (name, expected) => {
      const tool = ALL_TOOLS.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool ${name} not found`);

      const actual = countToolTokens(tool);
      const diff = Math.abs(actual - expected);

      expect(diff).toBeLessThanOrEqual(TOLERANCE);

      if (diff > 0) {
        console.log(`  ${name}: expected ${expected}, got ${actual} (diff: ${diff})`);
      }
    }
  );
});
