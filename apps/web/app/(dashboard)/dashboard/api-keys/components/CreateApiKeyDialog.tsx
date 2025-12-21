"use client";

import { useState } from "react";

interface CreateApiKeyDialogProps {
  projectName: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateApiKeyDialog({
  projectName,
  onClose,
  onCreate,
}: CreateApiKeyDialogProps) {
  const [name, setName] = useState("Default");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    await onCreate(name);
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-background border shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-1">Create API Key</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Create a new API key for {projectName}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="keyName" className="block text-sm font-medium mb-1">
                Key Name
              </label>
              <input
                id="keyName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Production, CI/CD, Development"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                maxLength={50}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A friendly name to identify this key
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? "Creating..." : "Create Key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
