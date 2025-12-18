import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";
import { CreateProjectSchema } from "@ctxopt/shared";
import { PLAN_LIMITS } from "@ctxopt/shared";
import type { Plan } from "@ctxopt/shared";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

async function generateUniqueSlug(baseSlug: string, userId: string): Promise<string> {
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.slug, slug), eq(projects.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

// GET /api/projects - List all projects for the current user
export async function GET() {
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

    // Get projects with API key count
    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        settings: projects.settings,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(projects.createdAt);

    return Response.json({ projects: userProjects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch projects" } },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
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
    const parsed = CreateProjectSchema.safeParse(body);

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

    // Check project limit based on plan
    const planLimits = PLAN_LIMITS[user.plan as Plan];
    const [projectCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.userId, user.id));

    if (planLimits.maxProjects !== -1 && (projectCount?.count ?? 0) >= planLimits.maxProjects) {
      return Response.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Project limit reached. Your ${user.plan} plan allows ${planLimits.maxProjects} projects.`,
          },
        },
        { status: 403 }
      );
    }

    // Generate unique slug
    const baseSlug = slugify(parsed.data.name);
    const slug = await generateUniqueSlug(baseSlug || "project", user.id);

    // Create project
    const [newProject] = await db
      .insert(projects)
      .values({
        name: parsed.data.name,
        slug,
        description: parsed.data.description ?? null,
        userId: user.id,
        settings: parsed.data.settings ?? {},
      })
      .returning();

    return Response.json({ project: newProject }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create project" } },
      { status: 500 }
    );
  }
}
