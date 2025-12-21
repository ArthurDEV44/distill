import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, users, apiKeys } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string; keyId: string }> };

/**
 * DELETE /api/projects/[id]/api-keys/[keyId] - Revoke an API key
 *
 * Performs a soft delete by setting revokedAt timestamp.
 * The key remains in the database for audit purposes.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id: projectId, keyId } = await context.params;
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

    // Find the API key
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.projectId, projectId),
          isNull(apiKeys.revokedAt)
        )
      )
      .limit(1);

    if (!apiKey) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "API key not found or already revoked" } },
        { status: 404 }
      );
    }

    // Soft delete: set revokedAt
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId));

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error revoking API key:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to revoke API key" } },
      { status: 500 }
    );
  }
}
