import { z } from "zod";
import { formatCost, formatNumber } from "@ctxopt/shared";
import type { ServerConfig } from "../server.js";

export const getStatsSchema = {
  type: "object" as const,
  properties: {
    period: {
      type: "string",
      description: "Time period for stats (session)",
      enum: ["session"],
    },
  },
  required: [],
};

const inputSchema = z.object({
  period: z.enum(["session"]).optional().default("session"),
});

// In-memory session stats
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
  _config: ServerConfig
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  inputSchema.parse(args);

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
