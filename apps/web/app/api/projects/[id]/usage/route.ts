import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, users, usageRecords } from "@/lib/db/schema";
import { eq, and, gte, count, sum } from "drizzle-orm";
import { UsagePeriodEnum, type UsageStats, type ToolBreakdown } from "@ctxopt/shared";

type RouteContext = { params: Promise<{ id: string }> };

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
 * GET /api/projects/[id]/usage - Get usage statistics for a project
 *
 * Query params:
 * - period: "7d" | "30d" | "90d" | "365d" (default: "30d")
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
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

    // Get project and verify ownership
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

    // Parse period from query string
    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period") ?? "30d";
    const parsedPeriod = UsagePeriodEnum.safeParse(periodParam);
    const period = parsedPeriod.success ? parsedPeriod.data : "30d";
    const startDate = getPeriodStartDate(period);

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
      .where(
        and(
          eq(usageRecords.projectId, projectId),
          gte(usageRecords.createdAt, startDate)
        )
      );

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
      .where(
        and(
          eq(usageRecords.projectId, projectId),
          gte(usageRecords.createdAt, startDate)
        )
      );

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
      .slice(0, 10); // Top 10

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

    return Response.json({ stats, period });
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch usage stats" } },
      { status: 500 }
    );
  }
}
