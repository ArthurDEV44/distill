/**
 * Usage Reporter
 *
 * Sends session usage statistics to the CtxOpt web API at session end.
 * Also handles periodic reporting during the session to ensure data is captured
 * even if the session ends abruptly.
 */

import type { UsageReport, ToolBreakdown } from "@ctxopt/shared";
import {
  getSessionStats,
  getToolBreakdown,
  type SessionState,
  type ToolStats,
} from "../state/session.js";

// Periodic reporting constants
const PERIODIC_REPORT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PERIODIC_REPORT_COMMAND_COUNT = 50; // Report every 50 commands

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

    model: state.model ?? "claude-sonnet-4", // Use registered model or default
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

/**
 * Check if we should report usage based on time or command count
 * This is called after each tool execution to enable periodic reporting
 */
export function shouldReportPeriodically(state: SessionState): boolean {
  const now = Date.now();
  const stats = getSessionStats(state);

  // Check if enough commands have been executed since last report
  const commandsSinceLastReport = stats.commandCount - state.lastReportedCommandCount;
  if (commandsSinceLastReport >= PERIODIC_REPORT_COMMAND_COUNT) {
    return true;
  }

  // Check if enough time has passed since last report
  if (state.lastReportedAt) {
    const timeSinceLastReport = now - state.lastReportedAt.getTime();
    if (timeSinceLastReport >= PERIODIC_REPORT_INTERVAL_MS && commandsSinceLastReport > 0) {
      return true;
    }
  } else {
    // No report yet, check time since session start
    const timeSinceStart = now - state.startedAt.getTime();
    if (timeSinceStart >= PERIODIC_REPORT_INTERVAL_MS && stats.commandCount > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Report usage periodically if needed
 * Returns true if a report was sent
 */
export async function maybeReportPeriodically(
  state: SessionState,
  verbose: boolean = false
): Promise<boolean> {
  // Skip if API not configured
  if (!state.apiKey || !state.apiBaseUrl) {
    return false;
  }

  // Check if we should report
  if (!shouldReportPeriodically(state)) {
    return false;
  }

  if (verbose) {
    console.error("[ctxopt] Periodic usage report triggered");
  }

  try {
    const result = await reportUsage(state, state.apiKey, state.apiBaseUrl, verbose);

    if (result.success) {
      // Update last reported state
      state.lastReportedAt = new Date();
      state.lastReportedCommandCount = getSessionStats(state).commandCount;
    }

    return result.success;
  } catch (error) {
    if (verbose) {
      console.error("[ctxopt] Periodic report failed:", error);
    }
    return false;
  }
}
