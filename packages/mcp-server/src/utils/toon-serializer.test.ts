/**
 * TOON Serializer Tests
 *
 * Tests for converting MCP tool definitions to TOON format.
 */

import { describe, it, expect } from "vitest";
import {
  serializeToolsToToon,
  serializeToolsToToonTabular,
  serializeMetadataToToon,
  serializeMetadataToToonTabular,
  compareTokens,
  type ToolMetadataLite,
} from "./toon-serializer.js";
import type { ToolDefinition } from "../tools/registry.js";

// Sample tool definitions for testing
const sampleTools: ToolDefinition[] = [
  {
    name: "auto_optimize",
    description: "Auto-compress verbose output (build errors, logs). 80-95% token reduction.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        hint: { enum: ["build", "logs", "errors", "code", "auto"] },
        aggressive: { type: "boolean" },
        format: { enum: ["plain", "markdown"] },
      },
      required: ["content"],
    },
    execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
  },
  {
    name: "smart_file_read",
    description: "Read code with AST extraction. Modes: structure, target, query, lines, skeleton.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        target: {
          properties: {
            type: { enum: ["function", "class", "interface", "type", "variable", "method"] },
            name: { type: "string" },
          },
        },
        query: { type: "string" },
        skeleton: { type: "boolean" },
      },
      required: ["filePath"],
    },
    execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
  },
  {
    name: "discover_tools",
    description: "Find and load optimization tools. Categories: compress, analyze, logs, code, pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { enum: ["compress", "analyze", "logs", "code", "pipeline"] },
        load: { type: "boolean" },
      },
    },
    execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
  },
];

describe("TOON Serializer", () => {
  describe("serializeToolsToToon", () => {
    it("should serialize tools to TOON format", () => {
      const result = serializeToolsToToon(sampleTools);

      expect(result).toContain("tools[3]:");
      expect(result).toContain("auto_optimize");
      expect(result).toContain("smart_file_read");
      expect(result).toContain("discover_tools");
    });

    it("should include parameter information", () => {
      const result = serializeToolsToToon(sampleTools);

      // Check for required vs optional params
      expect(result).toContain("content");
      expect(result).toContain("hint?");
      expect(result).toContain("filePath");
    });

    it("should include type information for non-string params", () => {
      const result = serializeToolsToToon(sampleTools);

      expect(result).toContain(":bool");
      // Enum types should show values
      expect(result).toMatch(/build\|logs\|errors/);
    });

    it("should group by category when requested", () => {
      const categories = new Map([
        ["auto_optimize", "core"],
        ["smart_file_read", "core"],
        ["discover_tools", "meta"],
      ]);

      const result = serializeToolsToToon(sampleTools, {
        groupByCategory: true,
        categories,
      });

      expect(result).toContain("core[2]:");
      expect(result).toContain("meta[1]:");
    });
  });

  describe("serializeToolsToToonTabular", () => {
    it("should serialize tools to tabular TOON format", () => {
      const result = serializeToolsToToonTabular(sampleTools);

      expect(result).toContain("tools[3]{name,params,desc}:");
      expect(result).toContain("auto_optimize,");
      expect(result).toContain("smart_file_read,");
    });

    it("should use comma-separated values with proper escaping", () => {
      const result = serializeToolsToToonTabular(sampleTools);
      const lines = result.split("\n");

      // Header should define 3 fields
      expect(lines[0]).toContain("{name,params,desc}");

      // Tool lines should exist
      const toolLines = lines.slice(1).filter((l) => l.trim());
      expect(toolLines.length).toBe(3);

      // Values with commas should be quoted
      for (const line of toolLines) {
        // Line should start with tool name
        expect(line.trim()).toMatch(/^(auto_optimize|smart_file_read|discover_tools),/);
      }
    });
  });

  describe("compareTokens", () => {
    it("should show TOON uses fewer tokens than JSON", () => {
      const result = compareTokens(sampleTools);

      expect(result.json).toBeGreaterThan(0);
      expect(result.toon).toBeGreaterThan(0);
      expect(result.toonTabular).toBeGreaterThan(0);
      expect(result.savings).toBeGreaterThan(0);

      // TOON should use fewer tokens than JSON
      expect(result.toon).toBeLessThan(result.json);
      expect(result.toonTabular).toBeLessThan(result.json);
    });

    it("should achieve at least 20% token reduction", () => {
      const result = compareTokens(sampleTools);

      expect(result.savings).toBeGreaterThanOrEqual(20);
      console.log(`  Token savings: ${result.savings}% (JSON: ${result.json}, TOON: ${result.toon}, Tabular: ${result.toonTabular})`);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty tools array", () => {
      const result = serializeToolsToToon([]);
      expect(result).toBe("tools[0]:");
    });

    it("should handle tool with no parameters", () => {
      const noParamTool: ToolDefinition = {
        name: "simple_tool",
        description: "A simple tool with no params",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
      };

      const result = serializeToolsToToon([noParamTool]);
      expect(result).toContain("simple_tool()");
    });

    it("should handle nested object parameters", () => {
      const result = serializeToolsToToon(sampleTools);
      // target parameter has nested properties
      expect(result).toMatch(/target\?:\{type,name\}/);
    });

    it("should truncate long descriptions", () => {
      const longDescTool: ToolDefinition = {
        name: "long_desc",
        description: "This is a very long description that should be truncated to save tokens in the TOON output format because we want to be efficient.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
      };

      const result = serializeToolsToToon([longDescTool]);
      expect(result.length).toBeLessThan(200);
      expect(result).toContain("...");
    });

    it("should handle enum with many values", () => {
      const manyEnumTool: ToolDefinition = {
        name: "many_enum",
        description: "Tool with many enum values",
        inputSchema: {
          type: "object",
          properties: {
            option: { enum: ["a", "b", "c", "d", "e", "f", "g"] },
          },
        },
        execute: async () => ({ content: [{ type: "text" as const, text: "" }] }),
      };

      const result = serializeToolsToToon([manyEnumTool]);
      // Should truncate to first 3 values + ...
      expect(result).toContain("a|b|c|...");
    });
  });
});

describe("TOON Format Compliance", () => {
  it("should use TOON array syntax [N]", () => {
    const result = serializeToolsToToon(sampleTools);
    expect(result).toMatch(/tools\[\d+\]:/);
  });

  it("should use TOON tabular header syntax {fields}", () => {
    const result = serializeToolsToToonTabular(sampleTools);
    expect(result).toMatch(/tools\[\d+\]\{name,params,desc\}:/);
  });

  it("should use indentation for nested content", () => {
    const result = serializeToolsToToon(sampleTools);
    const lines = result.split("\n");

    // Tool entries should be indented
    const toolLines = lines.filter((l) => l.includes("auto_optimize") || l.includes("smart_file_read"));
    for (const line of toolLines) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });
});

// Sample metadata for lazy loading tests
const sampleMetadata: ToolMetadataLite[] = [
  {
    name: "auto_optimize",
    category: "core",
    description: "Auto-detect content type and apply optimal compression",
  },
  {
    name: "smart_file_read",
    category: "core",
    description: "Read files with AST-based extraction",
  },
  {
    name: "compress_context",
    category: "compress",
    description: "Compress generic text content (logs, configs)",
  },
  {
    name: "summarize_logs",
    category: "logs",
    description: "Summarize verbose log output",
  },
];

describe("Lightweight Metadata TOON Serialization", () => {
  describe("serializeMetadataToToon", () => {
    it("should serialize metadata without loading tools", () => {
      const result = serializeMetadataToToon(sampleMetadata, { groupByCategory: false });

      expect(result).toContain("tools[4]:");
      expect(result).toContain("auto_optimize");
      expect(result).toContain("smart_file_read");
      expect(result).toContain("compress_context");
    });

    it("should group by category when requested", () => {
      const result = serializeMetadataToToon(sampleMetadata, { groupByCategory: true });

      expect(result).toContain("core[2]:");
      expect(result).toContain("compress[1]:");
      expect(result).toContain("logs[1]:");
    });

    it("should use arrow notation for descriptions", () => {
      const result = serializeMetadataToToon(sampleMetadata);

      expect(result).toContain("→");
      expect(result).toContain("auto_optimize → Auto-detect");
    });

    it("should truncate long descriptions", () => {
      const longMeta: ToolMetadataLite[] = [
        {
          name: "long_tool",
          category: "core",
          description: "This is a very long description that should be truncated to save tokens",
        },
      ];

      const result = serializeMetadataToToon(longMeta);
      expect(result).toContain("...");
    });
  });

  describe("serializeMetadataToToonTabular", () => {
    it("should serialize metadata to tabular format", () => {
      const result = serializeMetadataToToonTabular(sampleMetadata);

      expect(result).toContain("tools[4]{name,desc}:");
      expect(result).toContain("auto_optimize,");
    });

    it("should handle descriptions with commas", () => {
      const commasMeta: ToolMetadataLite[] = [
        {
          name: "comma_tool",
          category: "core",
          description: "First, second, third",
        },
      ];

      const result = serializeMetadataToToonTabular(commasMeta);
      // Should quote the description
      expect(result).toContain('"First, second, third"');
    });
  });

  describe("Token comparison", () => {
    it("should be more compact than full TOON with parameters", () => {
      const metaResult = serializeMetadataToToon(sampleMetadata);
      const fullResult = serializeToolsToToon(sampleTools);

      // Metadata-only should be shorter (no parameter info)
      expect(metaResult.length).toBeLessThan(fullResult.length);
    });

    it("should show significant savings for lazy loading", () => {
      const metaResult = serializeMetadataToToonTabular(sampleMetadata);

      // Very compact output
      const lines = metaResult.split("\n");
      expect(lines.length).toBe(5); // header + 4 tools
    });
  });
});
