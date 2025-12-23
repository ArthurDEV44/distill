"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  UsagePeriod,
  UsageStats,
  DailyData,
  ModelBreakdown,
} from "@ctxopt/shared";

interface UseProjectUsageOptions {
  projectId?: string; // undefined = all projects
}

interface UsageStatsWithCharts extends UsageStats {
  dailyData: DailyData[];
  modelBreakdown: ModelBreakdown;
}

interface UseProjectUsageResult {
  stats: UsageStatsWithCharts | null;
  isLoading: boolean;
  error: Error | null;
  period: UsagePeriod;
  setPeriod: (period: UsagePeriod) => void;
  refresh: () => void;
}

export function useProjectUsage({
  projectId,
}: UseProjectUsageOptions = {}): UseProjectUsageResult {
  const [stats, setStats] = useState<UsageStatsWithCharts | null>(null);
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ period });
      if (projectId) {
        params.set("projectId", projectId);
      }

      const response = await fetch(`/api/usage?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to fetch usage stats");
      }

      const data = await response.json();

      setStats({
        ...data.stats,
        dailyData: data.dailyData,
        modelBreakdown: data.modelBreakdown,
      });
    } catch (err) {
      console.error("Error fetching usage stats:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    period,
    setPeriod,
    refresh: fetchStats,
  };
}
