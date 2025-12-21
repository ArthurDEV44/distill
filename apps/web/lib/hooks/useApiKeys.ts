"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiKey, CreateApiKeyInput } from "@ctxopt/shared";

interface UseApiKeysOptions {
  projectId: string;
}

interface CreateApiKeyResult {
  apiKey: ApiKey & { key: string };
  warning: string;
}

interface UseApiKeysResult {
  apiKeys: ApiKey[];
  isLoading: boolean;
  error: string | null;
  createKey: (input: CreateApiKeyInput) => Promise<CreateApiKeyResult | null>;
  revokeKey: (keyId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useApiKeys({ projectId }: UseApiKeysOptions): UseApiKeysResult {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/api-keys`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to fetch API keys");
      }

      const data = await response.json();
      setApiKeys(data.apiKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const createKey = useCallback(
    async (input: CreateApiKeyInput): Promise<CreateApiKeyResult | null> => {
      try {
        const response = await fetch(`/api/projects/${projectId}/api-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to create API key");
        }

        const result = await response.json();
        await fetchKeys(); // Refresh the list
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        return null;
      }
    },
    [projectId, fetchKeys]
  );

  const revokeKey = useCallback(
    async (keyId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/projects/${projectId}/api-keys/${keyId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to revoke API key");
        }

        await fetchKeys(); // Refresh the list
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        return false;
      }
    },
    [projectId, fetchKeys]
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchKeys();
  }, [fetchKeys]);

  useEffect(() => {
    if (projectId) {
      fetchKeys();
    }
  }, [projectId, fetchKeys]);

  return { apiKeys, isLoading, error, createKey, revokeKey, refresh };
}
