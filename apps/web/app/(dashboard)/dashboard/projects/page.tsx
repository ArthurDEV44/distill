import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ProjectsContent } from "./components/ProjectsContent";

export default async function ProjectsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get internal user
  const [internalUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, user.id))
    .limit(1);

  if (!internalUser) {
    redirect("/sign-in");
  }

  // Get user's projects
  const userProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.userId, internalUser.id))
    .orderBy(projects.createdAt);

  return <ProjectsContent projects={userProjects} />;
}
