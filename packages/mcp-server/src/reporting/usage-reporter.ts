/**
 * Usage Reporter
 *
 * Sends session usage statistics to the CtxOpt web API at session end.
 */

import type { UsageReport, ToolBreakdown } from "@ctxopt/shared";
import {
  getSessionStats,
  getToolBreakdown,
  type SessionState,
  type ToolStats,
} from "../state/session.js";

/**
 * Calculate estimated cost in microdollars based on tokens used
 *
 * Using Claude Sonnet 4 pricing as default:
 * - Input: $3.00 / 1M tokens = 3 microdollars per token
 * - Output: $15.00 / 1M tokens = 15 microdollars per token
 *
 * We estimate 80% input, 20% output ratio
 */
function calculateCostMicros(tokens: number): number {
  const inputRatio = 0.8;
  const outputRatio = 0.2;
  const inputPricePerToken = 3; // microdollars
  const outputPricePerToken = 15; // microdollars

  return Math.round(
    tokens * inputRatio * inputPricePerToken + tokens * outputRatio * outputPricePerToken
  );
}

/**
 * Convert tool breakdown map to plain object
 */
function toolBreakdownToObject(
  breakdown: Map<string, ToolStats>
): Record<string, ToolBreakdown> {
  const result: Record<string, ToolBreakdown> = {};

  for (const [name, stats] of breakdown.entries()) {
    result[name] = {
      calls: stats.calls,
      tokensIn: stats.tokensIn,
      tokensOut: stats.tokensOut,
      tokensSaved: stats.tokensSaved,
    };
  }

  return result;
}

/**
 * Build the usage report from session state
 */
export function buildUsageReport(state: SessionState): UsageReport {
  const stats = getSessionStats(state);
  const breakdown = getToolBreakdown(state);
  const now = new Date();

  // Calculate savings
  const totalBeforeOptimization = stats.tokensUsed + stats.tokensSaved;
  const savingsPercent =
    totalBeforeOptimization > 0 ? (stats.tokensSaved / totalBeforeOptimization) * 100 : 0;

  return {
    sessionId: state.sessionId,
    startedAt: state.startedAt.toISOString(),
    endedAt: now.toISOString(),
    durationMs: stats.duration,

    tokensUsed: stats.tokensUsed,
    tokensSaved: stats.tokensSaved,
    savingsPercent: Math.round(savingsPercent * 100) / 100,

    estimatedCostMicros: calculateCostMicros(stats.tokensUsed),
    estimatedSavingsMicros: calculateCostMicros(stats.tokensSaved),

    commandsCount: stats.commandCount,
    toolsBreakdown: toolBreakdownToObject(breakdown),

    model: "claude-sonnet-4", // Default model assumption
    projectType: state.project?.type,
  };
}

export interface ReportResult {
  success: boolean;
  recordId?: string;
  error?: string;
}

/**
 * Send usage report to the CtxOpt web API
 *
 * @param state - Current session state
 * @param apiKey - API key for authentication
 * @param apiBaseUrl - Base URL for the API (e.g., https://app.ctxopt.dev/api)
 * @param verbose - Whether to log debug messages
 * @returns Promise resolving to report result
 */
export async function reportUsage(
  state: SessionState,
  apiKey: string,
  apiBaseUrl: string,
  verbose: boolean = false
): Promise<ReportResult> {
  // Skip if no commands were recorded
  if (state.commandHistory.length === 0) {
    if (verbose) {
      console.error("[ctxopt] No commands recorded, skipping usage report");
    }
    return { success: true };
  }

  const report = buildUsageReport(state);

  if (verbose) {
    console.error(
      `[ctxopt] Sending usage report: ${report.commandsCount} commands, ${report.tokensUsed} tokens, ${report.tokensSaved} saved`
    );
  }

  try {
    const response = await fetch(`${apiBaseUrl}/usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(report),
      // Short timeout for non-blocking exit
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      if (verbose) {
        console.error(`[ctxopt] Usage report failed: ${response.status} - ${errorBody}`);
      }
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorBody}`,
      };
    }

    const result = (await response.json()) as { success: boolean; recordId?: string };

    if (verbose) {
      console.error(`[ctxopt] Usage report sent successfully (recordId: ${result.recordId})`);
    }

    return {
      success: true,
      recordId: result.recordId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (verbose) {
      console.error(`[ctxopt] Failed to send usage report: ${message}`);
    }
    return {
      success: false,
      error: message,
    };
  }
}
