import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { apiKeys, projects, users } from "@/lib/db/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { CreateApiKeySchema, PLAN_LIMITS } from "@ctxopt/shared";
import type { Plan } from "@ctxopt/shared";
import { generateApiKey } from "@/lib/api-keys";

// GET /api/api-keys - List all API keys for the current user
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

    // Parse optional query params
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");

    // Build query conditions
    const conditions = [eq(apiKeys.userId, user.id)];
    if (projectId) {
      conditions.push(eq(apiKeys.projectId, projectId));
    }

    // Get API keys with project name
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        projectId: apiKeys.projectId,
        projectName: projects.name,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .innerJoin(projects, eq(apiKeys.projectId, projects.id))
      .where(and(...conditions))
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

// POST /api/api-keys - Create a new API key
export async function POST(request: Request) {
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

    const { name, projectId, permissions, expiresAt } = parsed.data;

    // Verify project exists and belongs to user
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
        { error: { code: "FORBIDDEN", message: "Access denied to this project" } },
        { status: 403 }
      );
    }

    // Check API key limit based on plan
    const planLimits = PLAN_LIMITS[user.plan as Plan];
    const [keyCount] = await db
      .select({ count: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.projectId, projectId),
          isNull(apiKeys.revokedAt) // Only count active keys
        )
      );

    if (
      planLimits.maxApiKeysPerProject !== -1 &&
      (keyCount?.count ?? 0) >= planLimits.maxApiKeysPerProject
    ) {
      return Response.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `API key limit reached. Your ${user.plan} plan allows ${planLimits.maxApiKeysPerProject} keys per project.`,
          },
        },
        { status: 403 }
      );
    }

    // Generate the API key
    const { key, hash, prefix } = generateApiKey();

    // Insert into database
    const [newApiKey] = await db
      .insert(apiKeys)
      .values({
        name,
        keyHash: hash,
        keyPrefix: prefix,
        projectId,
        userId: user.id,
        permissions: permissions ?? {},
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    if (!newApiKey) {
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to create API key" } },
        { status: 500 }
      );
    }

    // Return the full key ONLY ONCE - this is the only time it will be shown
    return Response.json(
      {
        apiKey: {
          id: newApiKey.id,
          name: newApiKey.name,
          keyPrefix: newApiKey.keyPrefix,
          projectId: newApiKey.projectId,
          projectName: project.name,
          userId: newApiKey.userId,
          permissions: newApiKey.permissions,
          lastUsedAt: newApiKey.lastUsedAt,
          expiresAt: newApiKey.expiresAt,
          revokedAt: newApiKey.revokedAt,
          createdAt: newApiKey.createdAt,
        },
        key, // Full key - NEVER stored, shown only once
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
