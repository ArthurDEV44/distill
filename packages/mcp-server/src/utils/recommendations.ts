/**
 * Recommendations Generator
 *
 * Generates contextual recommendations based on session patterns and usage.
 */

import type { SessionState } from "../state/session.js";
import { getToolBreakdown, getPatternStats } from "../state/session.js";

export interface Recommendation {
  type: "optimization" | "warning" | "tip";
  message: string;
  priority: number; // 1-10, higher = more important
}

/**
 * Generate recommendations based on session state
 */
export function generateRecommendations(state: SessionState): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const patterns = getPatternStats(state);
  const toolBreakdown = getToolBreakdown(state);

  // Retry loops detected
  if (patterns.retryLoopsDetected > 0) {
    recommendations.push({
      type: "warning",
      message: `${patterns.retryLoopsDetected} retry loop(s) detected. Analyze errors before retrying commands.`,
      priority: 9,
    });
  }

  // Many unique errors
  if (patterns.uniqueErrors > 20) {
    recommendations.push({
      type: "tip",
      message: `${patterns.uniqueErrors} unique errors cached. Focus on fixing one error type at a time.`,
      priority: 7,
    });
  }

  // High error occurrence rate
  if (patterns.totalErrorOccurrences > 100) {
    recommendations.push({
      type: "warning",
      message: `${patterns.totalErrorOccurrences} error occurrences tracked. Consider using analyze_build_output for compression.`,
      priority: 8,
    });
  }

  // Large token usage without savings
  const savingsRatio =
    state.tokensUsed > 0 ? state.tokensSaved / (state.tokensUsed + state.tokensSaved) : 0;

  if (state.tokensUsed > 50000 && savingsRatio < 0.1) {
    recommendations.push({
      type: "optimization",
      message: "High token usage with low savings. Use compress_context for large outputs.",
      priority: 8,
    });
  }

  // Frequent build analysis
  const buildToolStats = toolBreakdown.get("analyze_build_output");
  if (buildToolStats && buildToolStats.calls > 5) {
    recommendations.push({
      type: "tip",
      message: `Build analyzed ${buildToolStats.calls} times. Consider using --watch mode for faster feedback.`,
      priority: 5,
    });
  }

  // No compression tools used
  const compressStats = toolBreakdown.get("compress_context");
  if (!compressStats && state.tokensUsed > 20000) {
    recommendations.push({
      type: "optimization",
      message: "compress_context not used yet. It can reduce large outputs by 40-90%.",
      priority: 6,
    });
  }

  // Session running long with many commands
  const sessionDurationMs = Date.now() - state.startedAt.getTime();
  const sessionHours = sessionDurationMs / (1000 * 60 * 60);
  if (sessionHours > 2 && state.commandHistory.length > 50) {
    recommendations.push({
      type: "tip",
      message: "Long session detected. Consider restarting to clear accumulated state.",
      priority: 4,
    });
  }

  // Good savings - positive feedback
  if (savingsRatio > 0.3 && state.tokensSaved > 10000) {
    recommendations.push({
      type: "tip",
      message: `Great job! ${Math.round(savingsRatio * 100)}% token savings achieved.`,
      priority: 2,
    });
  }

  // Sort by priority (descending)
  return recommendations.sort((a, b) => b.priority - a.priority);
}

/**
 * Format recommendations as markdown
 */
export function formatRecommendations(recommendations: Recommendation[]): string {
  if (recommendations.length === 0) {
    return "No recommendations at this time.";
  }

  const lines: string[] = [];

  for (const rec of recommendations) {
    const icon =
      rec.type === "warning" ? "⚠️" : rec.type === "optimization" ? "💡" : "ℹ️";
    lines.push(`${icon} ${rec.message}`);
  }

  return lines.join("\n");
}

/**
 * Get top N recommendations as strings
 */
export function getTopRecommendations(state: SessionState, limit: number = 3): string[] {
  const recommendations = generateRecommendations(state);
  return recommendations.slice(0, limit).map((r) => r.message);
}
