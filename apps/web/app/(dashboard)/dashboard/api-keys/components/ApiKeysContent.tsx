"use client";

import { useState } from "react";
import { useApiKeys } from "@/lib/hooks/useApiKeys";
import { ApiKeysList } from "./ApiKeysList";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import { NewKeyDisplay } from "./NewKeyDisplay";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface ApiKeysContentProps {
  projects: Project[];
}

export function ApiKeysContent({ projects }: ApiKeysContentProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ""
  );
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { apiKeys, isLoading, error, createKey, revokeKey } = useApiKeys({
    projectId: selectedProjectId,
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleCreate = async (name: string) => {
    const result = await createKey({ name });
    if (result) {
      setNewKey({ key: result.apiKey.key, name: result.apiKey.name });
      setShowCreateDialog(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (confirm("Are you sure you want to revoke this API key? This cannot be undone.")) {
      await revokeKey(keyId);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">Manage API keys for your projects</p>
        </div>

        <div className="rounded-lg border p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No Projects</h3>
          <p className="text-muted-foreground mb-6">
            Create a project first to generate API keys.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Manage API keys for usage tracking and analytics
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create API Key
        </button>
      </div>

      {/* Project Selector */}
      <div className="flex items-center gap-4">
        <label htmlFor="project" className="text-sm font-medium">
          Project:
        </label>
        <select
          id="project"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm bg-background"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* New Key Display */}
      {newKey && (
        <NewKeyDisplay
          keyValue={newKey.key}
          keyName={newKey.name}
          onDismiss={() => setNewKey(null)}
        />
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* API Keys List */}
      <ApiKeysList
        apiKeys={apiKeys}
        isLoading={isLoading}
        projectName={selectedProject?.name ?? ""}
        onRevoke={handleRevoke}
      />

      {/* Setup Instructions */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">Setup Instructions</h2>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">1. Configure your CLI:</p>
            <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-x-auto">
              ctxopt config set api-key YOUR_API_KEY
            </pre>
          </div>
          <div>
            <p className="font-medium">2. (Optional) Set custom API URL:</p>
            <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-x-auto">
              ctxopt config set api-url https://your-api-url.com/api
            </pre>
          </div>
          <div>
            <p className="font-medium">3. Start using CtxOpt:</p>
            <p className="text-muted-foreground mt-1">
              Usage data will be automatically reported to your dashboard after each session.
            </p>
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateApiKeyDialog
          projectName={selectedProject?.name ?? ""}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
