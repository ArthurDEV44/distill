import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AnalyticsContent } from "./components/AnalyticsContent";

export default async function AnalyticsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <AnalyticsContent />;
}
