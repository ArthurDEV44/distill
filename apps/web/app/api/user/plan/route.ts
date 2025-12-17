import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/user/plan - Get current user's plan
export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const [user] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!user) {
      return Response.json({ plan: "free" });
    }

    return Response.json({ plan: user.plan });
  } catch (error) {
    console.error("Error fetching user plan:", error);
    return Response.json({ plan: "free" });
  }
}
