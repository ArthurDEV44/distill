/**
 * Auto-Optimize MCP input/output schemas (US-012 decomposition).
 */

// Input schema with semantic descriptions for better LLM understanding
export const autoOptimizeSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The content to optimize (build output, logs, diffs, errors, code, config, or any text)",
    },
    strategy: {
      enum: ["auto", "logs", "build", "diff", "stacktrace", "code", "semantic", "config", "errors"],
      description:
        "Compression strategy: auto (detect), logs (server/test logs), build (compiler errors), " +
        "diff (git diff), stacktrace (stack traces), code/semantic (TF-IDF importance), " +
        "config (JSON/YAML), errors (deduplication)",
      default: "auto",
    },
    response_format: {
      enum: ["minimal", "normal", "detailed"],
      description:
        "Output verbosity: minimal (savings % + content), normal (stats line + content), " +
        "detailed (full metadata block + content)",
      default: "normal",
    },
    aggressive: {
      type: "boolean",
      description: "Enable aggressive compression for maximum token savings",
      default: false,
    },
    preservePatterns: {
      type: "array",
      items: { type: "string" },
      description: "Regex patterns for content that must never be compressed (e.g. ['ERROR.*critical', 'TODO'])",
      maxItems: 20,
      default: [],
    },
    format: {
      enum: ["plain", "markdown"],
      description: "Output format for structured sections (plain or markdown)",
      default: "plain",
    },
  },
  required: ["content"],
};

// Output schema per MCP 2025-06-18 spec for structured validation
export const autoOptimizeOutputSchema = {
  type: "object" as const,
  properties: {
    detectedType: {
      type: "string",
      description: "Detected or specified content type",
    },
    originalTokens: {
      type: "number",
      description: "Token count before optimization",
    },
    optimizedTokens: {
      type: "number",
      description: "Token count after optimization",
    },
    savingsPercent: {
      type: "number",
      description: "Percentage of tokens saved (0-100)",
    },
    method: {
      type: "string",
      description: "Compression method used",
    },
    optimizedContent: {
      type: "string",
      description: "The optimized content",
    },
  },
  required: ["detectedType", "originalTokens", "optimizedTokens", "savingsPercent", "method", "optimizedContent"],
};
