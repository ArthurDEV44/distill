/**
 * Detect Retry Loop Tool
 *
 * Detects when Claude Code enters a retry loop (same command executed
 * multiple times without success) and alerts to avoid unnecessary token consumption.
 */

import { z } from "zod";
import type { SessionState, CommandEntry } from "../state/session.js";
import { getCommandsByNormalized, getRecentCommands, addCommand } from "../state/session.js";
import { normalizeCommand, isCommonRetryCommand } from "../utils/command-normalizer.js";
import {
  hashOutput,
  calculateOutputSimilarity,
  analyzeErrorTrend,
  formatTimespan,
  type ErrorTrendAnalysis,
} from "../utils/output-similarity.js";
import type { ToolDefinition } from "./registry.js";

export const detectRetryLoopSchema = {
  type: "object" as const,
  properties: {
    command: {
      type: "string",
      description: "The command that was executed",
    },
    output: {
      type: "string",
      description: "The output of the command (optional, for similarity comparison)",
    },
    threshold: {
      type: "number",
      description: "Number of repetitions to trigger detection (default: 3)",
    },
  },
  required: ["command"],
};

const inputSchema = z.object({
  command: z.string(),
  output: z.string().optional(),
  threshold: z.number().optional().default(3),
});

interface LoopDetails {
  command: string;
  normalizedCommand: string;
  occurrences: number;
  timespan: string;
  similarity: number;
  errorTrend: ErrorTrendAnalysis;
}

interface DetectRetryLoopResult {
  loopDetected: boolean;
  details?: LoopDetails;
  suggestion?: string;
  recentCommands: string[];
  isCommonRetryCommand: boolean;
}

/**
 * Generate contextual suggestion based on error trend
 */
function generateSuggestion(
  errorTrend: ErrorTrendAnalysis,
  similarity: number,
  occurrences: number
): string {
  // High similarity with same errors = stuck in a loop
  if (similarity >= 90 && errorTrend.trend === "same") {
    return "Les mmes erreurs se rptent. Analysez-les en dtail avant de ressayer. Utilisez analyze_build_output pour un rsum des erreurs.";
  }

  // Errors decreasing = making progress
  if (errorTrend.trend === "decreasing") {
    return `Les erreurs diminuent (${errorTrend.firstCount} → ${errorTrend.lastCount}). Continuez les corrections une par une.`;
  }

  // Errors increasing = going wrong direction
  if (errorTrend.trend === "increasing") {
    return `Les erreurs augmentent (${errorTrend.firstCount} → ${errorTrend.lastCount}). Revenez  un tat stable (git stash/reset) et reprenez.`;
  }

  // Fluctuating = unstable
  if (errorTrend.trend === "fluctuating") {
    return "Les erreurs fluctuent. Prenez du recul et analysez la cause racine avant de continuer.";
  }

  // High occurrence count
  if (occurrences >= 5) {
    return `Cette commande a t excute ${occurrences} fois. Arrtez et analysez le problme sous-jacent.`;
  }

  // Default
  return "Prenez du recul et analysez la cause racine des erreurs avant de ressayer.";
}

/**
 * Format the result as markdown
 */
function formatResult(result: DetectRetryLoopResult): string {
  const parts: string[] = [];

  if (result.loopDetected && result.details) {
    parts.push("## Boucle de Retry Dtecte");
    parts.push("");
    parts.push(`**Commande:** \`${result.details.command}\``);
    parts.push(`**Commande normalise:** \`${result.details.normalizedCommand}\``);
    parts.push(`**Occurrences:** ${result.details.occurrences}`);
    parts.push(`**Priode:** ${result.details.timespan}`);
    parts.push(`**Similarit des outputs:** ${result.details.similarity}%`);
    parts.push("");

    // Error trend
    if (result.details.errorTrend.errorCounts.length > 0) {
      parts.push("### Tendance des Erreurs");
      parts.push(`- **Trend:** ${result.details.errorTrend.trend}`);
      parts.push(`- **Premire excution:** ${result.details.errorTrend.firstCount} erreur(s)`);
      parts.push(`- **Dernire excution:** ${result.details.errorTrend.lastCount} erreur(s)`);
      parts.push(`- **Delta:** ${result.details.errorTrend.delta > 0 ? "+" : ""}${result.details.errorTrend.delta}`);
      parts.push("");
    }

    // Suggestion
    if (result.suggestion) {
      parts.push("### Suggestion");
      parts.push(`> ${result.suggestion}`);
      parts.push("");
    }
  } else {
    parts.push("## Aucune Boucle Dtecte");
    parts.push("");
    if (result.isCommonRetryCommand) {
      parts.push(
        "*Cette commande est souvent source de boucles de retry. Surveillez les erreurs rptes.*"
      );
      parts.push("");
    }
  }

  // Recent commands
  if (result.recentCommands.length > 0) {
    parts.push("### Commandes Rcentes");
    result.recentCommands.forEach((cmd, i) => {
      parts.push(`${i + 1}. \`${cmd}\``);
    });
  }

  return parts.join("\n");
}

export async function executeDetectRetryLoop(
  args: unknown,
  state: SessionState
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { command, output, threshold } = inputSchema.parse(args);

  // Normalize the command for comparison
  const normalized = normalizeCommand(command);

  // Get similar commands from history within 5 minute window
  const similarCommands = getCommandsByNormalized(state, normalized);

  // Calculate output hash if output provided
  const currentHash = output ? hashOutput(output) : undefined;

  // Calculate similarity with previous outputs
  const historyHashes = similarCommands
    .map((c) => c.outputHash)
    .filter((h): h is string => h !== undefined);
  const similarity = currentHash ? calculateOutputSimilarity(historyHashes, currentHash) : 0;

  // Analyze error trend from outputs (we need to store outputs for this)
  // For now, we'll use a simplified approach based on stored data
  const errorTrend = analyzeErrorTrend(output ? [output] : []);

  // Get recent commands for context
  const recentEntries = getRecentCommands(state, 5);
  const recentCommands = recentEntries.map((e) => e.command);

  // Check if common retry command
  const isCommon = isCommonRetryCommand(command);

  // Detect loop
  const loopDetected = similarCommands.length >= threshold - 1;

  // Build result
  const result: DetectRetryLoopResult = {
    loopDetected,
    isCommonRetryCommand: isCommon,
    recentCommands,
  };

  if (loopDetected) {
    const firstCommand = similarCommands[0];
    const timespan = firstCommand
      ? formatTimespan(firstCommand.timestamp, Date.now())
      : "unknown";

    result.details = {
      command,
      normalizedCommand: normalized,
      occurrences: similarCommands.length + 1,
      timespan,
      similarity,
      errorTrend,
    };

    result.suggestion = generateSuggestion(errorTrend, similarity, similarCommands.length + 1);
  }

  // Record this command for future detection
  // This is done through the stats middleware, but we add extra fields here
  // Note: The actual recording is done by the middleware after tool execution
  // Here we just prepare the data for it

  return {
    content: [{ type: "text", text: formatResult(result) }],
  };
}

export const detectRetryLoopTool: ToolDefinition = {
  name: "detect_retry_loop",
  description: `Detect if Claude Code is in a retry loop (same command executed multiple times).
Use this tool when you notice repeated build/test failures to get suggestions on how to proceed.
Returns loop detection status, error trend analysis, and actionable suggestions.`,
  inputSchema: detectRetryLoopSchema,
  execute: executeDetectRetryLoop,
};
