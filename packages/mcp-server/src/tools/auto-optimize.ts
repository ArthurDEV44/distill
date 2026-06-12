/**
 * Auto-Optimize Tool
 *
 * Unified compression tool that absorbs all compression strategies.
 * Auto-detects content type or accepts an explicit strategy parameter
 * to bypass detection and force a specific compression path.
 *
 * Decomposed (US-012) into `auto-optimize/`:
 *   - types.ts       — shared types/interfaces
 *   - schema.ts      — MCP input/output schemas
 *   - detect.ts      — isBuildOutput/isDiffOutput + resolveStrategy (routing)
 *   - strategies.ts  — per-content-path optimize* functions
 *   - format.ts      — response_format rendering
 * This entry file is the thin dispatcher + tool definition.
 */

import type { ToolDefinition } from "./registry.js";
import { maybeWrapInMarker } from "../utils/distill-marker.js";
import {
  formatRestoreHint,
  getOriginStore,
  isRetrieveEnabled,
} from "../retrieve/origin-store.js";
import { compressContent } from "../compressors/index.js";
import { countTokens } from "../utils/token-counter.js";
import { MAX_OUTPUT_CHARS } from "../constants.js";

import type { AutoOptimizeArgs, OptimizationResult } from "./auto-optimize/types.js";
import { autoOptimizeSchema, autoOptimizeOutputSchema } from "./auto-optimize/schema.js";
import { resolveStrategy } from "./auto-optimize/detect.js";
import { formatOutput } from "./auto-optimize/format.js";
import {
  parsePreservePatterns,
  optimizeBuildOutput,
  optimizeLogs,
  optimizeDiff,
  optimizeStacktrace,
  optimizeSemantic,
  optimizeConfig,
  optimizeErrors,
  optimizeGeneric,
} from "./auto-optimize/strategies.js";

async function autoOptimize(
  args: AutoOptimizeArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const {
    content,
    strategy: rawStrategy = "auto",
    hint,
    aggressive = false,
    preservePatterns: rawPreserve,
    format = "plain",
    response_format: responseFormat = "normal",
    task,
  } = args;

  // F2: a non-empty task enables query-aware semantic selection.
  const query = task && task.trim().length > 0 ? task : undefined;

  // Handle empty or missing content
  if (!content || content.trim().length === 0) {
    const errorText = "No content provided. Pass content to optimize.";
    return {
      content: [{ type: "text", text: errorText }],
      isError: true,
      structuredContent: {
        detectedType: "none",
        originalTokens: 0,
        optimizedTokens: 0,
        savingsPercent: 0,
        method: "none",
        optimizedContent: "",
        compressionRatio: 1,
        outputChars: errorText.length,
        truncated: false,
      },
    };
  }

  const { parsed: preservePatterns, warnings: regexWarnings } = parsePreservePatterns(rawPreserve);

  // Minimum threshold for optimization (500 chars ~ 125 tokens)
  if (content.length < 500) {
    const tokens = countTokens(content);
    const shortResult: OptimizationResult = {
      optimizedContent: content,
      detectedType: "none",
      originalTokens: tokens,
      optimizedTokens: tokens,
      savingsPercent: 0,
      method: "none",
    };
    const shortOutput = formatOutput(shortResult, responseFormat);
    return {
      content: [{ type: "text", text: shortOutput }],
      structuredContent: {
        detectedType: "none",
        originalTokens: tokens,
        optimizedTokens: tokens,
        savingsPercent: 0,
        method: "none",
        optimizedContent: content,
        compressionRatio: 1,
        outputChars: shortOutput.length,
        truncated: false,
      },
    };
  }

  const resolved = resolveStrategy(content, rawStrategy, hint);

  let result: OptimizationResult;

  switch (resolved) {
    case "build":
      result = optimizeBuildOutput(content);
      break;
    case "logs":
      result = optimizeLogs(content, format);
      break;
    case "diff":
      result = optimizeDiff(content, aggressive);
      break;
    case "stacktrace":
      result = optimizeStacktrace(content, aggressive);
      break;
    case "code":
    case "semantic":
      result = optimizeSemantic(content, aggressive, preservePatterns, query);
      break;
    case "config":
      result = optimizeConfig(content, aggressive);
      break;
    case "errors":
      result = optimizeErrors(content, format);
      break;
    default:
      // "auto" that didn't resolve to a specific strategy -> generic.
      // F2: when a task is provided, upgrade the generic prose path to
      // query-aware semantic selection (the generic line-dedup compressor has
      // no relevance ranking, so task would otherwise be inert here).
      result = query
        ? optimizeSemantic(content, aggressive, preservePatterns, query)
        : optimizeGeneric(content, aggressive, preservePatterns);
  }

  // Format output based on response_format
  let output = formatOutput(result, responseFormat);

  // Append regex warnings if any patterns were filtered
  if (regexWarnings.length > 0) {
    output += "\n\n[WARN] " + regexWarnings.join("\n[WARN] ");
  }

  // Output budget cap: re-compress or truncate if over MAX_OUTPUT_CHARS
  // Note: re-compression uses the generic compressor and drops preservePatterns —
  // acceptable since the goal is to meet the size budget, not preserve formatting.
  // Regex warnings appended above are also lost on re-compression (acceptable trade-off).
  let truncated = false;
  if (output.length > MAX_OUTPUT_CHARS) {
    // Re-compress with aggressive settings
    const recompressed = compressContent(result.optimizedContent, {
      detail: "minimal",
      targetRatio: 0.2,
    });
    result = {
      ...result,
      optimizedContent: recompressed.compressed,
      optimizedTokens: recompressed.stats.compressedTokens,
      savingsPercent: Math.round(
        ((result.originalTokens - recompressed.stats.compressedTokens) / result.originalTokens) * 100,
      ),
      method: `${result.method}+recompressed`,
    };
    output = formatOutput(result, responseFormat);
  }

  if (output.length > MAX_OUTPUT_CHARS) {
    // Truncate as last resort — hard cap to ensure we never exceed budget
    truncated = true;
    const overBy = output.length - MAX_OUTPUT_CHARS;
    const truncMsg = `\n\n[... ${overBy} chars truncated. Use auto_optimize with smaller chunks.]`;
    output = output.slice(0, MAX_OUTPUT_CHARS - truncMsg.length) + truncMsg;
  }

  const compressionRatio = result.originalTokens > 0
    ? Math.min(1, Math.round((result.optimizedTokens / result.originalTokens) * 100) / 100)
    : 1;

  // US-008: opt-in compression envelope. Wrap only when savings ≥ 30%
  // (ratio ≤ 0.7). Gated by DISTILL_COMPRESSED_MARKERS env var for v0.9.x
  // backwards compatibility.
  const wrappedOutput = maybeWrapInMarker(output, {
    ratio: compressionRatio,
    method: result.method,
    shouldWrap: compressionRatio <= 0.7,
  });

  // F3: opt-in reversibility. When enabled and compression was meaningful
  // (savings >= 30%), keep the pre-compression original in the in-memory origin
  // store and append a recover hint OUTSIDE the marker envelope so the agent can
  // call ctx.restore(handle) if the lossy pass dropped something it needs.
  let finalText = wrappedOutput;
  if (isRetrieveEnabled() && compressionRatio <= 0.7) {
    const handle = getOriginStore().put(content);
    finalText = `${wrappedOutput}\n${formatRestoreHint(handle)}`;
  }

  return {
    content: [{ type: "text", text: finalText }],
    structuredContent: {
      detectedType: result.detectedType,
      originalTokens: result.originalTokens,
      optimizedTokens: result.optimizedTokens,
      savingsPercent: result.savingsPercent,
      method: result.method,
      optimizedContent: result.optimizedContent,
      compressionRatio,
      outputChars: finalText.length,
      truncated,
    },
  };
}

export function createAutoOptimizeTool(): ToolDefinition {
  return {
    name: "auto_optimize",
    description:
      "Compress large content to save tokens — build output, logs, diffs, code, configs, stack traces, errors.\n\n" +
      "WHEN TO USE: After running builds, tests, or commands that produce verbose output (>500 chars). " +
      "Before pasting logs, diffs, or error output into context. Ideal for tool results that would consume excessive tokens.\n\n" +
      "HOW TO FORMAT:\n" +
      '- Auto-detect: auto_optimize({ content: "<paste build output>" })\n' +
      '- Force strategy: auto_optimize({ content: "<paste>", strategy: "build" })\n' +
      '- Preserve patterns: auto_optimize({ content: "<paste>", preservePatterns: ["ERROR.*critical"] })\n' +
      '- Query-aware: auto_optimize({ content: "<paste>", task: "find the auth timeout bug" })\n' +
      '- Control verbosity: auto_optimize({ content: "<paste>", response_format: "minimal" })\n\n' +
      "Strategies and typical savings: build (95%), logs (80-90%), errors (70-90%), diff (60-80%), " +
      "stacktrace (50-80%), code/semantic (40-60%), config (30-60%). " +
      'Leave strategy as "auto" to detect automatically.\n\n' +
      "WHAT TO EXPECT: Compressed content with stats header. " +
      "response_format controls verbosity: minimal (savings % + content), normal (stats line + content), detailed (full metadata + content).\n\n" +
      "MARKER: When DISTILL_COMPRESSED_MARKERS=1 is set and savings are >= 30% " +
      "(ratio <= 0.7), the compressed text is wrapped in " +
      "[DISTILL:COMPRESSED ratio=X.XX method=<name>] ... [/DISTILL:COMPRESSED]. " +
      "The marker is opt-in and designed for use alongside the shipped PreCompact " +
      "hook so Claude Code's compact-summary step preserves the region verbatim.",
    inputSchema: autoOptimizeSchema,
    outputSchema: autoOptimizeOutputSchema,
    annotations: {
      title: "Auto Optimize",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args) => autoOptimize(args as AutoOptimizeArgs),
  };
}

/**
 * Default export imported by `server.ts` and registered at startup.
 */
export const autoOptimizeTool: ToolDefinition = createAutoOptimizeTool();
