import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, users, apiKeys } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { CreateApiKeySchema } from "@ctxopt/shared";
import { generateApiKey, getKeyPrefix, hashApiKey } from "@/lib/crypto";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/api-keys - List API keys for a project
 *
 * Returns keys with prefix (for identification), never the full key or hash
 */
export async function GET(_request: Request, context: RouteContext) {
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

    // Get all active (non-revoked) API keys
    const keys = await db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt)))
      .orderBy(apiKeys.createdAt);

    return Response.json({ apiKeys: keys });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch API keys" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/api-keys - Create a new API key
 *
 * IMPORTANT: The full key is returned ONLY ONCE in this response.
 * Store it securely - it cannot be retrieved later.
 */
export async function POST(request: Request, context: RouteContext) {
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

    // Parse and validate body
    const body = await request.json();
    const parsed = CreateApiKeySchema.safeParse(body);

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

    // Generate the key
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);

    // Store in database
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        projectId,
        keyHash,
        keyPrefix,
        name: parsed.data.name,
      })
      .returning({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });

    // Return the key - THIS IS THE ONLY TIME THE FULL KEY IS AVAILABLE
    return Response.json(
      {
        apiKey: {
          ...newKey,
          // Include the raw key ONLY in the creation response
          key: rawKey,
        },
        warning: "Store this key securely. It will not be shown again.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create API key" } },
      { status: 500 }
    );
  }
}
