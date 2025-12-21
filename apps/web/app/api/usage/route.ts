import { db } from "@/lib/db";
import { apiKeys, usageRecords } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashApiKey, isValidApiKeyFormat } from "@/lib/crypto";
import { UsageReportSchema } from "@ctxopt/shared";

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
