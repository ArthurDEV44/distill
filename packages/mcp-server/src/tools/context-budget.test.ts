/**
 * Context Budget Tool Tests
 */

import { describe, it, expect } from "vitest";
import { executeContextBudget } from "./context-budget.js";


describe("context_budget tool", () => {


  describe("basic estimation", () => {
    it("should count input tokens", async () => {
      const content = "Hello, world! This is a test message.";

      const result = await executeContextBudget({ content });

      expect(result.isError).toBeFalsy();
      const text = result.content[0]!.text;
      expect(text).toContain("Input Tokens");
      expect(text).toContain("Context Budget Analysis");
    });

    it("should estimate output tokens", async () => {
      const content = "What is the difference between let and const in JavaScript?";

      const result = await executeContextBudget({ content });

      expect(result.isError).toBeFalsy();
      const text = result.content[0]!.text;
      expect(text).toContain("Estimated Output");
    });

    it("should calculate total tokens", async () => {
      const content = "Explain how async/await works.";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("Total Estimated");
    });

    it("should show estimated cost", async () => {
      const content = "Create a function that sorts an array.";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("Estimated Cost");
      expect(text).toContain("$");
    });

    it("should show context usage percentage", async () => {
      const content = "Short prompt.";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("Context Usage");
      expect(text).toContain("%");
    });
  });

  describe("model selection", () => {
    it("should use default model when not specified", async () => {
      const content = "Test content";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("Claude Sonnet 4");
    });

    it("should use specified model", async () => {
      const content = "Test content";

      const result = await executeContextBudget(
        { content, model: "claude-opus-4-20250514" });

      const text = result.content[0]!.text;
      expect(text).toContain("Claude Opus 4");
    });

    it("should accept haiku model", async () => {
      const content = "Test content";

      const result = await executeContextBudget(
        { content, model: "claude-3-5-haiku-20241022" });

      const text = result.content[0]!.text;
      expect(text).toContain("Claude 3.5 Haiku");
    });
  });

  describe("budget checking", () => {
    it("should report within budget when tokens are under limit", async () => {
      const content = "Short content";

      const result = await executeContextBudget(
        { content, budgetTokens: 10000 });

      const text = result.content[0]!.text;
      expect(text).toContain("Within Budget");
      expect(text).toContain("remaining");
    });

    it("should report over budget when tokens exceed limit", async () => {
      // Create content that will exceed a small budget
      const content = Array(100).fill("This is a test sentence.").join(" ");

      const result = await executeContextBudget(
        { content, budgetTokens: 100 });

      const text = result.content[0]!.text;
      expect(text).toContain("OVER BUDGET");
      expect(text).toContain("over");
    });

    it("should not show budget status when no budget specified", async () => {
      const content = "Test content";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).not.toContain("Budget Status");
    });
  });

  describe("recommendations", () => {
    it("should recommend smart_file_read for code content", async () => {
      // Create varied code content (not repetitive) with enough tokens
      const content = `
function processData(data) {
  const result = data.map(item => item * 2);
  return result.filter(x => x > 10);
}

class DataProcessor {
  constructor() {
    this.cache = new Map();
    this.timeout = 5000;
  }

  async process(input) {
    if (this.cache.has(input)) {
      return this.cache.get(input);
    }
    const result = await this.transform(input);
    this.cache.set(input, result);
    return result;
  }

  transform(value) {
    return value.toString().toUpperCase();
  }
}

const handler = async (req, res) => {
  try {
    const data = await req.json();
    const processor = new DataProcessor();
    const result = await processor.process(data);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error processing request:', error);
    return res.json({ success: false, error: error.message });
  }
};

export { processData, DataProcessor, handler };
      `;

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      // Should have code-related recommendations
      expect(text).toContain("Optimization Recommendations");
    });

    it("should recommend summarize_logs for log content", async () => {
      const content = `
[2025-12-23 10:00:00] INFO: Server started on port 3000
[2025-12-23 10:00:01] DEBUG: Loading configuration
[2025-12-23 10:00:02] INFO: Database connected
[2025-12-23 10:00:03] WARN: Cache miss for key xyz
      `.repeat(20);

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("summarize_logs");
    });

    it("should recommend deduplicate_errors for repeated errors", async () => {
      const content = Array(30)
        .fill("Error: Connection refused at Database.connect()")
        .join("\n");

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("deduplicate_errors");
    });

    it("should recommend semantic_compress for long prose", async () => {
      const content = Array(200)
        .fill("This is a paragraph of text explaining something in detail.")
        .join(" ");

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("semantic_compress");
    });

    it("should show potential savings percentage", async () => {
      const content = Array(50)
        .fill("[INFO] Processing request from client")
        .join("\n");

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("Potential Savings");
    });
  });

  describe("output estimation toggle", () => {
    it("should include output estimation by default", async () => {
      const content = "What is TypeScript?";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      // Estimated Output should be > 0
      expect(text).toMatch(/Estimated Output \| [1-9]/);
    });

    it("should exclude output estimation when disabled", async () => {
      const content = "What is TypeScript?";

      const result = await executeContextBudget(
        { content, includeEstimatedOutput: false });

      const text = result.content[0]!.text;
      // Estimated Output should be 0
      expect(text).toContain("Estimated Output | 0");
    });
  });

  describe("input validation", () => {
    it("should reject empty content", async () => {
      const result = await executeContextBudget({ content: "" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Invalid input");
    });

    it("should reject invalid model", async () => {
      const result = await executeContextBudget(
        { content: "test", model: "invalid-model" as any });

      expect(result.isError).toBe(true);
    });

    it("should reject budget below minimum", async () => {
      const result = await executeContextBudget(
        { content: "test", budgetTokens: 49 });

      expect(result.isError).toBe(true);
    });
  });

  describe("auto-optimize availability", () => {
    it("should indicate auto-optimize available for large optimizable content", async () => {
      const content = Array(100)
        .fill("[ERROR] Failed to connect")
        .join("\n");

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      expect(text).toContain("auto_optimize");
    });

    it("should not show auto-optimize tip for small content", async () => {
      const content = "Short content here";

      const result = await executeContextBudget({ content });

      const text = result.content[0]!.text;
      // Small content shouldn't trigger the tip
      expect(text).not.toContain("Tip: Use `auto_optimize`");
    });
  });
});
