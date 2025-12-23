"use client";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { BarChart3, Plus } from "lucide-react";
import Link from "next/link";

interface DashboardEmptyStateProps {
  userName: string;
}

export function DashboardEmptyState({ userName }: DashboardEmptyStateProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {userName}</p>
      </div>

      {/* Empty State */}
      <div className="flex min-h-[50vh] items-center justify-center">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 className="h-4 w-4" />
            </EmptyMedia>
            <EmptyTitle>Get Started with CtxOpt</EmptyTitle>
            <EmptyDescription>
              Create your first project to start tracking token usage and savings.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/dashboard/projects/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Your First Project
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  );
}
