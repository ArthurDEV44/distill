"use client";

import { useState, useEffect, useCallback } from "react";

interface UseSuggestionsOptions {
  status?: "active" | "dismissed" | "applied";
  limit?: number;
}

interface Suggestion {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  estimatedTokenSavings: number | null;
  estimatedCostSavingsMicros: number | null;
  context: Record<string, unknown> | null;
  status: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  summary: {
    total: number;
    active: number;
    totalPotentialSavingsMicros: number;
    totalPotentialTokenSavings: number;
  };
}

interface UseSuggestionsResult {
  data: SuggestionsResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSuggestions(options: UseSuggestionsOptions = {}): UseSuggestionsResult {
  const { status = "active", limit = 5 } = options;

  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", limit.toString());

      const response = await fetch(`/api/suggestions?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to fetch suggestions");
      }

      const suggestionsData = await response.json();
      setData(suggestionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [status, limit]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return { data, isLoading, error, refresh };
}
