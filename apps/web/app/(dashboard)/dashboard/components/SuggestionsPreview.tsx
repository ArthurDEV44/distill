"use client";

import { formatCost } from "@ctxopt/shared";

interface Suggestion {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  estimatedTokenSavings: number | null;
  estimatedCostSavingsMicros: number | null;
  projectName: string;
}

interface SuggestionsPreviewProps {
  suggestions: Suggestion[];
  isLoading?: boolean;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-red-100 text-red-700";
    case "medium":
      return "bg-yellow-100 text-yellow-700";
    case "low":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function SuggestionsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 rounded-lg border animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-5 w-12 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

export function SuggestionsPreview({ suggestions, isLoading = false }: SuggestionsPreviewProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Optimization Suggestions</h2>
        <SuggestionsSkeleton />
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Optimization Suggestions</h2>
        <p className="text-muted-foreground">
          No suggestions yet. We&apos;ll analyze your usage and provide recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-xl font-semibold">Optimization Suggestions</h2>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-2 mb-1">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${getSeverityColor(suggestion.severity)}`}
              >
                {suggestion.severity}
              </span>
              <p className="text-sm font-medium flex-1">{suggestion.title}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{suggestion.projectName}</p>
              {suggestion.estimatedCostSavingsMicros && (
                <p className="text-xs font-medium text-green-600">
                  Save {formatCost(suggestion.estimatedCostSavingsMicros)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
