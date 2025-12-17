import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { apiKeys, projects, users, requests } from "@/lib/db/schema";
import { eq, and, count, sum } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/api-keys/[id] - Get details of a specific API key
export async function GET(request: Request, { params }: RouteParams) {
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

    const { id } = await params;

    // Get API key with project info
    const [apiKey] = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        projectId: apiKeys.projectId,
        projectName: projects.name,
        userId: apiKeys.userId,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .innerJoin(projects, eq(apiKeys.projectId, projects.id))
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (!apiKey) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "API key not found" } },
        { status: 404 }
      );
    }

    // Verify ownership
    if (apiKey.userId !== user.id) {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Access denied" } },
        { status: 403 }
      );
    }

    // Get usage stats for this key
    const [stats] = await db
      .select({
        requestCount: count(),
        totalTokens: sum(requests.totalTokens),
        totalCostMicros: sum(requests.totalCostMicros),
      })
      .from(requests)
      .where(eq(requests.apiKeyId, id));

    return Response.json({
      apiKey: {
        ...apiKey,
        stats: {
          requestCount: stats?.requestCount ?? 0,
          totalTokens: Number(stats?.totalTokens ?? 0),
          totalCostMicros: Number(stats?.totalCostMicros ?? 0),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching API key:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch API key" } },
      { status: 500 }
    );
  }
}

// DELETE /api/api-keys/[id] - Revoke (soft delete) or permanently delete an API key
export async function DELETE(request: Request, { params }: RouteParams) {
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

    const { id } = await params;

    // Check for permanent deletion flag
    const url = new URL(request.url);
    const permanent = url.searchParams.get("permanent") === "true";

    // Get API key
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    if (!apiKey) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "API key not found" } },
        { status: 404 }
      );
    }

    // Verify ownership
    if (apiKey.userId !== user.id) {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Access denied" } },
        { status: 403 }
      );
    }

    if (permanent) {
      // Hard delete - remove completely
      // Note: This may fail if there are requests referencing this key
      // The schema uses onDelete: cascade for projects, but not for requests
      try {
        await db.delete(apiKeys).where(eq(apiKeys.id, id));
        return new Response(null, { status: 204 });
      } catch {
        return Response.json(
          {
            error: {
              code: "CONFLICT",
              message:
                "Cannot permanently delete API key with existing requests. Use soft delete instead.",
            },
          },
          { status: 409 }
        );
      }
    } else {
      // Soft delete - set revokedAt timestamp
      const [revokedKey] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, id))
        .returning();

      if (!revokedKey) {
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Failed to revoke API key" } },
          { status: 500 }
        );
      }

      return Response.json({
        message: "API key revoked successfully",
        apiKey: {
          id: revokedKey.id,
          name: revokedKey.name,
          keyPrefix: revokedKey.keyPrefix,
          revokedAt: revokedKey.revokedAt,
        },
      });
    }
  } catch (error) {
    console.error("Error deleting API key:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete API key" } },
      { status: 500 }
    );
  }
}
