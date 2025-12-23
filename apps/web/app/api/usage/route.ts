import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { apiKeys, usageRecords, users, projects } from "@/lib/db/schema";
import { eq, and, isNull, gte, inArray, count, sum, sql } from "drizzle-orm";
import { hashApiKey, isValidApiKeyFormat } from "@/lib/crypto";
import {
  UsageReportSchema,
  UsagePeriodEnum,
  type UsageStats,
  type ToolBreakdown,
  type DailyData,
  type ModelBreakdown,
} from "@ctxopt/shared";

function getPeriodStartDate(period: string): Date {
  const now = new Date();
  const days = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "365d": 365,
  }[period] ?? 30;

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * GET /api/usage - Get usage statistics
 *
 * Query params:
 * - projectId?: string - specific project, or undefined for all user's projects
 * - period: "7d" | "30d" | "90d" | "365d" (default: "30d")
 */
export async function GET(request: Request) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    // Get internal user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!user) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    // Parse query params
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const periodParam = url.searchParams.get("period") ?? "30d";
    const parsedPeriod = UsagePeriodEnum.safeParse(periodParam);
    const period = parsedPeriod.success ? parsedPeriod.data : "30d";
    const startDate = getPeriodStartDate(period);

    // Determine project filter
    let projectFilter: ReturnType<typeof eq> | ReturnType<typeof inArray>;

    if (projectId) {
      // Single project: verify ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return Response.json(
          { error: { code: "NOT_FOUND", message: "Project not found" } },
          { status: 404 }
        );
      }

      if (project.userId !== user.id) {
        return Response.json(
          { error: { code: "FORBIDDEN", message: "Access denied" } },
          { status: 403 }
        );
      }

      projectFilter = eq(usageRecords.projectId, projectId);
    } else {
      // All projects: get user's project IDs
      const userProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.userId, user.id));

      const projectIds = userProjects.map((p) => p.id);

      if (projectIds.length === 0) {
        // No projects, return empty stats
        const emptyStats: UsageStats = {
          totalTokensUsed: 0,
          totalTokensSaved: 0,
          totalSavingsPercent: 0,
          totalCostMicros: 0,
          totalSavingsMicros: 0,
          sessionCount: 0,
          totalCommands: 0,
          topTools: [],
        };
        return Response.json({
          stats: emptyStats,
          period,
          dailyData: [],
          modelBreakdown: {},
        });
      }

      projectFilter = inArray(usageRecords.projectId, projectIds);
    }

    // Aggregate usage stats
    const aggregateResult = await db
      .select({
        sessionCount: count(),
        totalTokensUsed: sum(usageRecords.tokensUsed),
        totalTokensSaved: sum(usageRecords.tokensSaved),
        totalCostMicros: sum(usageRecords.estimatedCostMicros),
        totalSavingsMicros: sum(usageRecords.estimatedSavingsMicros),
        totalCommands: sum(usageRecords.commandsCount),
      })
      .from(usageRecords)
      .where(and(projectFilter, gte(usageRecords.createdAt, startDate)));

    const aggregates = aggregateResult[0] ?? {
      sessionCount: 0,
      totalTokensUsed: null,
      totalTokensSaved: null,
      totalCostMicros: null,
      totalSavingsMicros: null,
      totalCommands: null,
    };

    // Get all records to aggregate tool breakdown
    const records = await db
      .select({
        toolsBreakdown: usageRecords.toolsBreakdown,
      })
      .from(usageRecords)
      .where(and(projectFilter, gte(usageRecords.createdAt, startDate)));

    // Aggregate tool breakdowns
    const toolAggregates: Record<string, { calls: number; tokensSaved: number }> = {};

    for (const record of records) {
      if (record.toolsBreakdown) {
        const breakdown = record.toolsBreakdown as Record<string, ToolBreakdown>;
        for (const [toolName, stats] of Object.entries(breakdown)) {
          if (!toolAggregates[toolName]) {
            toolAggregates[toolName] = { calls: 0, tokensSaved: 0 };
          }
          toolAggregates[toolName].calls += stats.calls;
          toolAggregates[toolName].tokensSaved += stats.tokensSaved;
        }
      }
    }

    // Convert to sorted array (top saving tools)
    const totalSaved = Number(aggregates.totalTokensSaved) || 0;
    const topTools = Object.entries(toolAggregates)
      .map(([name, stats]) => ({
        name,
        calls: stats.calls,
        tokensSaved: stats.tokensSaved,
        savingsPercent: totalSaved > 0 ? (stats.tokensSaved / totalSaved) * 100 : 0,
      }))
      .sort((a, b) => b.tokensSaved - a.tokensSaved)
      .slice(0, 10);

    // Calculate overall savings percent
    const totalUsed = Number(aggregates.totalTokensUsed) || 0;
    const totalBeforeOptimization = totalUsed + totalSaved;
    const totalSavingsPercent =
      totalBeforeOptimization > 0 ? (totalSaved / totalBeforeOptimization) * 100 : 0;

    const stats: UsageStats = {
      totalTokensUsed: totalUsed,
      totalTokensSaved: totalSaved,
      totalSavingsPercent: Math.round(totalSavingsPercent * 100) / 100,
      totalCostMicros: Number(aggregates.totalCostMicros) || 0,
      totalSavingsMicros: Number(aggregates.totalSavingsMicros) || 0,
      sessionCount: aggregates.sessionCount,
      totalCommands: Number(aggregates.totalCommands) || 0,
      topTools,
    };

    // Daily aggregation for charts
    const dailyResult = await db
      .select({
        date: sql<string>`DATE(${usageRecords.createdAt})`.as("date"),
        tokens: sum(usageRecords.tokensUsed),
        costMicros: sum(usageRecords.estimatedCostMicros),
        requests: count(),
      })
      .from(usageRecords)
      .where(and(projectFilter, gte(usageRecords.createdAt, startDate)))
      .groupBy(sql`DATE(${usageRecords.createdAt})`)
      .orderBy(sql`DATE(${usageRecords.createdAt})`);

    const dailyData: DailyData[] = dailyResult.map((row) => ({
      date: row.date,
      tokens: Number(row.tokens) || 0,
      costMicros: Number(row.costMicros) || 0,
      requests: row.requests,
    }));

    // Model breakdown for pie chart
    const modelResult = await db
      .select({
        model: usageRecords.model,
        requests: count(),
        tokens: sum(usageRecords.tokensUsed),
        costMicros: sum(usageRecords.estimatedCostMicros),
      })
      .from(usageRecords)
      .where(and(projectFilter, gte(usageRecords.createdAt, startDate)))
      .groupBy(usageRecords.model);

    const modelBreakdown: ModelBreakdown = {};
    for (const row of modelResult) {
      const modelName = row.model || "unknown";
      modelBreakdown[modelName] = {
        requests: row.requests,
        tokens: Number(row.tokens) || 0,
        costMicros: Number(row.costMicros) || 0,
      };
    }

    return Response.json({ stats, period, dailyData, modelBreakdown });
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch usage stats" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/usage - Receive usage report from MCP server
 *
 * Auth: API Key in Authorization header (Bearer ctxopt_proj_xxx)
 */
export async function POST(request: Request) {
  try {
    // Extract API key from header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } },
        { status: 401 }
      );
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "

    // Validate key format
    if (!isValidApiKeyFormat(apiKey)) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid API key format" } },
        { status: 401 }
      );
    }

    // Look up key by hash
    const keyHash = hashApiKey(apiKey);
    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);

    if (!keyRecord) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } },
        { status: 401 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = UsageReportSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    // Insert usage record
    const result = await db
      .insert(usageRecords)
      .values({
        projectId: keyRecord.projectId,
        apiKeyId: keyRecord.id,
        sessionId: parsed.data.sessionId,
        startedAt: new Date(parsed.data.startedAt),
        endedAt: new Date(parsed.data.endedAt),
        durationMs: parsed.data.durationMs,
        tokensUsed: parsed.data.tokensUsed,
        tokensSaved: parsed.data.tokensSaved,
        savingsPercent: parsed.data.savingsPercent,
        estimatedCostMicros: parsed.data.estimatedCostMicros,
        estimatedSavingsMicros: parsed.data.estimatedSavingsMicros,
        commandsCount: parsed.data.commandsCount,
        toolsBreakdown: parsed.data.toolsBreakdown ?? null,
        model: parsed.data.model ?? null,
        projectType: parsed.data.projectType ?? null,
      })
      .returning({ id: usageRecords.id });

    const newRecord = result[0];
    if (!newRecord) {
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to create usage record" } },
        { status: 500 }
      );
    }

    // Update last_used_at on the API key
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id));

    return Response.json(
      { success: true, recordId: newRecord.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error processing usage report:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to process usage report" } },
      { status: 500 }
    );
  }
}
