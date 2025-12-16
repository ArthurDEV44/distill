import { z } from "zod";
import { formatCost, formatNumber } from "@ctxopt/shared";
import type { ServerConfig } from "../server";

export const getStatsSchema = {
  type: "object" as const,
  properties: {
    period: {
      type: "string",
      description: "Time period for stats (session, today, week, month)",
      enum: ["session", "today", "week", "month"],
    },
  },
  required: [],
};

const inputSchema = z.object({
  period: z.enum(["session", "today", "week", "month"]).optional().default("session"),
});

// In-memory session stats (would be replaced by API call in production)
let sessionStats = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalCostMicros: 0,
  startTime: Date.now(),
};

export function recordUsage(inputTokens: number, outputTokens: number, costMicros: number) {
  sessionStats.requests++;
  sessionStats.inputTokens += inputTokens;
  sessionStats.outputTokens += outputTokens;
  sessionStats.totalCostMicros += costMicros;
}

export function resetSession() {
  sessionStats = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCostMicros: 0,
    startTime: Date.now(),
  };
}

export async function getStats(
  args: unknown,
  config: ServerConfig
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { period } = inputSchema.parse(args);

  // If API key is configured, fetch from server
  if (config.apiKey && config.apiBaseUrl) {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/usage?period=${period}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return formatServerStats(data, period);
      }
    } catch {
      // Fall back to local stats
    }
  }

  // Return local session stats
  const duration = Math.round((Date.now() - sessionStats.startTime) / 1000 / 60);

  const result = `## Session Statistics

**Duration:** ${duration} minutes
**Requests:** ${sessionStats.requests}
**Total Tokens:** ${formatNumber(sessionStats.inputTokens + sessionStats.outputTokens)}
  - Input: ${formatNumber(sessionStats.inputTokens)}
  - Output: ${formatNumber(sessionStats.outputTokens)}
**Estimated Cost:** ${formatCost(sessionStats.totalCostMicros)}

${
  sessionStats.requests > 0
    ? `### Averages
- Tokens per request: ${formatNumber(Math.round((sessionStats.inputTokens + sessionStats.outputTokens) / sessionStats.requests))}
- Cost per request: ${formatCost(Math.round(sessionStats.totalCostMicros / sessionStats.requests))}`
    : "*No requests recorded yet*"
}

---
*Stats from CtxOpt local session*`;

  return {
    content: [{ type: "text", text: result }],
  };
}

function formatServerStats(
  data: {
    summary: {
      totalRequests: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      totalCostMicros: number;
      avgLatencyMs: number;
    };
    quotaUsage: {
      used: number;
      limit: number;
      percentage: number;
      resetDate: string;
    };
  },
  period: string
): { content: Array<{ type: "text"; text: string }> } {
  const { summary, quotaUsage } = data;

  const result = `## Usage Statistics (${period})

**Requests:** ${summary.totalRequests.toLocaleString()}
**Total Tokens:** ${formatNumber(summary.totalTokens)}
  - Input: ${formatNumber(summary.inputTokens)}
  - Output: ${formatNumber(summary.outputTokens)}
**Total Cost:** ${formatCost(summary.totalCostMicros)}
**Avg Latency:** ${summary.avgLatencyMs}ms

### Quota Usage
**Used:** ${formatNumber(quotaUsage.used)} / ${formatNumber(quotaUsage.limit)} tokens
**Percentage:** ${quotaUsage.percentage.toFixed(1)}%
**Resets:** ${new Date(quotaUsage.resetDate).toLocaleDateString()}

---
*Stats from CtxOpt*`;

  return {
    content: [{ type: "text", text: result }],
  };
}
