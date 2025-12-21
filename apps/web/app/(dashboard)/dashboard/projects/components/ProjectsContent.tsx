"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Folder, Trash2, MoreVertical } from "lucide-react";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

interface ProjectsContentProps {
  projects: Project[];
}

export function ProjectsContent({ projects }: ProjectsContentProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      return;
    }

    setDeletingId(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert("Failed to delete project");
      }
    } catch {
      alert("Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your projects and their settings</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Folder className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-xl font-semibold">No Projects</h3>
          <p className="mt-2 text-muted-foreground">
            Get started by creating your first project.
          </p>
          <Link
            href="/dashboard/projects/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Folder className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{project.name}</h3>
                    <p className="text-sm text-muted-foreground">{project.slug}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(project.id)}
                  disabled={deletingId === project.id}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                  title="Delete project"
                >
                  {deletingId === project.id ? (
                    <MoreVertical className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
              {project.description && (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
