/**
 * Smart Pipeline Tool
 *
 * Automatically chains compression tools based on detected content type.
 * Executes multiple optimization steps sequentially with result passthrough.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import { countTokens } from "../utils/token-counter.js";
import { detectContentType } from "../utils/content-detector.js";
import type { ContentType } from "../compressors/types.js";

// Import compression functions directly (not tools)
import { analyzeBuildOutput } from "../parsers/index.js";
import { groupBySignature, formatGroups } from "../utils/signature-grouper.js";
import { getSummarizer } from "../summarizers/index.js";
import type { LogSummary } from "../summarizers/types.js";
import { compressContent } from "../compressors/index.js";
import { compressDiff } from "../compressors/diff.js";
import {
  detectPipelineContentType,
  type PipelineContentType,
} from "../pipelines/definitions.js";

/**
 * JSON Schema for MCP tool registration
 */
export const smartPipelineSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The content to optimize through the pipeline",
    },
    mode: {
      type: "string",
      description: "Pipeline mode: 'auto' for automatic detection, 'custom' for manual pipeline",
      enum: ["auto", "custom"],
    },
    contentType: {
      type: "string",
      description: "Force content type (overrides auto-detection). Options: build, logs, stacktrace, diff, config, code, generic",
      enum: ["build", "logs", "stacktrace", "diff", "config", "code", "generic"],
    },
    customPipeline: {
      type: "array",
      items: { type: "string" },
      description: "Custom pipeline steps when mode='custom'. Available: analyze_build, deduplicate, summarize_logs, compress_diff, semantic_compress",
    },
    maxSteps: {
      type: "number",
      description: "Maximum pipeline steps to execute (default: 5)",
    },
  },
  required: ["content"],
};

/**
 * Zod schema for runtime input validation
 */
const inputSchema = z.object({
  content: z.string().min(1, "Content is required"),
  mode: z.enum(["auto", "custom"]).optional().default("auto"),
  contentType: z
    .enum(["build", "logs", "stacktrace", "diff", "config", "code", "generic"])
    .optional(),
  customPipeline: z.array(z.string()).optional(),
  maxSteps: z.number().int().positive().optional().default(5),
});

/**
 * Pipeline step result
 */
interface StepResult {
  step: string;
  inputTokens: number;
  outputTokens: number;
  savingsPercent: number;
}

/**
 * Pipeline execution result
 */
interface PipelineResult {
  finalContent: string;
  detectedType: PipelineContentType;
  steps: StepResult[];
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  totalSavingsPercent: number;
}

// =============================================================================
// Pipeline Step Functions
// =============================================================================

/**
 * Format log summary to string
 */
function formatLogSummary(summary: LogSummary): string {
  const parts: string[] = [];
  parts.push(`## ${summary.overview}`);
  parts.push("");

  if (summary.errors.length > 0) {
    parts.push("### Errors");
    for (const error of summary.errors.slice(0, 10)) {
      const count = error.count > 1 ? ` (x${error.count})` : "";
      parts.push(`- ${error.timestamp || ""} ${error.message}${count}`);
    }
    parts.push("");
  }

  if (summary.warnings.length > 0) {
    parts.push("### Warnings");
    for (const warning of summary.warnings.slice(0, 5)) {
      const count = warning.count > 1 ? ` (x${warning.count})` : "";
      parts.push(`- ${warning.timestamp || ""} ${warning.message}${count}`);
    }
    parts.push("");
  }

  if (summary.keyEvents.length > 0) {
    parts.push("### Key Events");
    for (const event of summary.keyEvents.slice(0, 5)) {
      parts.push(`- ${event.timestamp || ""} ${event.message}`);
    }
  }

  return parts.join("\n");
}

/**
 * Step: Analyze build output
 */
function stepAnalyzeBuild(content: string): string {
  const result = analyzeBuildOutput(content, { verbosity: "normal" });
  return result.summary;
}

/**
 * Step: Deduplicate errors
 */
function stepDeduplicate(content: string): string {
  const lines = content.split("\n");
  const result = groupBySignature(lines);
  return formatGroups(result);
}

/**
 * Step: Summarize logs
 */
function stepSummarizeLogs(content: string): string {
  const summarizer = getSummarizer(content);
  if (!summarizer) {
    // Fallback to generic compression
    return stepSemanticCompress(content);
  }
  const summary = summarizer.summarize(content, { detail: "normal" });
  return formatLogSummary(summary);
}

/**
 * Step: Compress diff
 */
function stepCompressDiff(content: string): string {
  const result = compressDiff(content, { strategy: "hunks-only" });
  return result.compressed;
}

/**
 * Step: Semantic compression
 */
function stepSemanticCompress(content: string): string {
  const result = compressContent(content, {
    detail: "normal",
    targetRatio: 0.5,
  });
  return result.compressed;
}

/**
 * Step: Generic compression
 */
function stepGenericCompress(content: string): string {
  const result = compressContent(content, {
    detail: "normal",
  });
  return result.compressed;
}

/**
 * Map of step names to functions
 */
const STEP_FUNCTIONS: Record<string, (content: string) => string> = {
  analyze_build_output: stepAnalyzeBuild,
  analyze_build: stepAnalyzeBuild,
  deduplicate_errors: stepDeduplicate,
  deduplicate: stepDeduplicate,
  summarize_logs: stepSummarizeLogs,
  diff_compress: stepCompressDiff,
  compress_diff: stepCompressDiff,
  semantic_compress: stepSemanticCompress,
  compress_context: stepGenericCompress,
  generic: stepGenericCompress,
};

/**
 * Map content types to step sequences
 */
const TYPE_TO_STEPS: Record<PipelineContentType, string[]> = {
  build: ["analyze_build_output", "deduplicate_errors"],
  logs: ["summarize_logs"],
  stacktrace: ["deduplicate_errors", "semantic_compress"],
  diff: ["diff_compress"],
  config: ["compress_context"],
  code: ["semantic_compress"],
  generic: ["semantic_compress"],
};

// =============================================================================
// Pipeline Execution
// =============================================================================

/**
 * Execute a pipeline on content
 */
function executePipeline(
  content: string,
  steps: string[],
  maxSteps: number
): { finalContent: string; stepResults: StepResult[] } {
  let currentContent = content;
  const stepResults: StepResult[] = [];

  const stepsToExecute = steps.slice(0, maxSteps);

  for (const stepName of stepsToExecute) {
    const stepFn = STEP_FUNCTIONS[stepName];
    if (!stepFn) {
      console.error(`[smart-pipeline] Unknown step: ${stepName}`);
      continue;
    }

    const inputTokens = countTokens(currentContent);

    try {
      currentContent = stepFn(currentContent);
    } catch (error) {
      console.error(`[smart-pipeline] Step ${stepName} failed:`, error);
      // Continue with current content
      continue;
    }

    const outputTokens = countTokens(currentContent);
    const savingsPercent =
      inputTokens > 0 ? Math.round((1 - outputTokens / inputTokens) * 100) : 0;

    stepResults.push({
      step: stepName,
      inputTokens,
      outputTokens,
      savingsPercent,
    });

    // Stop if no improvement
    if (outputTokens >= inputTokens) {
      break;
    }
  }

  return { finalContent: currentContent, stepResults };
}

/**
 * Format pipeline result for output
 */
function formatOutput(result: PipelineResult): string {
  const parts: string[] = [];

  parts.push("## Smart Pipeline Result\n");
  parts.push("```");
  parts.push(result.finalContent);
  parts.push("```\n");

  parts.push("---");
  parts.push("### Pipeline Execution\n");
  parts.push(`- **Detected type:** ${result.detectedType}`);
  parts.push(`- **Steps executed:** ${result.steps.length}`);
  parts.push("");

  // Step details
  if (result.steps.length > 0) {
    parts.push("| Step | Input Tokens | Output Tokens | Savings |");
    parts.push("|------|--------------|---------------|---------|");
    for (const step of result.steps) {
      parts.push(
        `| ${step.step} | ${step.inputTokens.toLocaleString()} | ${step.outputTokens.toLocaleString()} | ${step.savingsPercent}% |`
      );
    }
    parts.push("");
  }

  // Total stats
  parts.push("### Total Statistics\n");
  parts.push(
    `- **Original tokens:** ${result.totalOriginalTokens.toLocaleString()}`
  );
  parts.push(
    `- **Final tokens:** ${result.totalCompressedTokens.toLocaleString()}`
  );
  parts.push(
    `- **Total savings:** ${(result.totalOriginalTokens - result.totalCompressedTokens).toLocaleString()} tokens (${result.totalSavingsPercent}%)`
  );

  return parts.join("\n");
}

/**
 * Execute the smart pipeline tool
 */
export async function executeSmartPipeline(
  args: unknown
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  const input = parseResult.data;

  // Detect content type
  let detectedType: PipelineContentType;
  if (input.contentType) {
    detectedType = input.contentType;
  } else {
    detectedType = detectPipelineContentType(input.content);
    // Fall back to standard detection if no specific type found
    if (detectedType === "generic") {
      const standardType = detectContentType(input.content);
      if (standardType !== "generic") {
        detectedType = standardType;
      }
    }
  }

  // Determine pipeline steps
  let steps: string[];
  if (input.mode === "custom" && input.customPipeline) {
    steps = input.customPipeline;
  } else {
    steps = TYPE_TO_STEPS[detectedType] ?? TYPE_TO_STEPS.generic;
  }

  // Validate custom pipeline steps
  if (input.mode === "custom" && input.customPipeline) {
    const invalidSteps = input.customPipeline.filter(
      (s) => !STEP_FUNCTIONS[s]
    );
    if (invalidSteps.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid pipeline steps: ${invalidSteps.join(", ")}. Available: ${Object.keys(STEP_FUNCTIONS).join(", ")}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Execute pipeline
  const originalTokens = countTokens(input.content);
  const { finalContent, stepResults } = executePipeline(
    input.content,
    steps,
    input.maxSteps
  );
  const finalTokens = countTokens(finalContent);

  // Build result
  const result: PipelineResult = {
    finalContent,
    detectedType,
    steps: stepResults,
    totalOriginalTokens: originalTokens,
    totalCompressedTokens: finalTokens,
    totalSavingsPercent:
      originalTokens > 0
        ? Math.round((1 - finalTokens / originalTokens) * 100)
        : 0,
  };

  // Update session state
  const tokensSaved = originalTokens - finalTokens;
  if (tokensSaved > 0) {
  }

  return {
    content: [
      {
        type: "text",
        text: formatOutput(result),
      },
    ],
  };
}

/**
 * Tool definition for MCP registration
 */
export const smartPipelineTool: ToolDefinition = {
  name: "smart_pipeline",
  description: `Automatically chain multiple compression tools based on detected content type.

This tool detects the content type and applies the optimal sequence of compression steps:
- **Build output**: analyze-build → deduplicate-errors (90-98% savings)
- **Logs**: summarize-logs (80-90% savings)
- **Stack traces**: deduplicate → semantic-compress (70-85% savings)
- **Git diffs**: diff-compress (50-95% savings)
- **Config files**: compress-context (30-60% savings)
- **Code/Generic**: semantic-compress (40-60% savings)

Use this tool when:
- You have mixed or unknown content types
- You want maximum compression with minimal configuration
- You need to chain multiple optimization steps

Modes:
- **auto** (default): Automatically detect content type and apply optimal pipeline
- **custom**: Specify your own pipeline steps

Available custom steps:
- analyze_build_output, deduplicate_errors, summarize_logs
- diff_compress, semantic_compress, compress_context`,
  inputSchema: smartPipelineSchema,
  execute: executeSmartPipeline,
};
