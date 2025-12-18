// ============================================
// Anthropic Model Pricing (per million tokens)
// Updated: December 2025
// ============================================

export const ANTHROPIC_MODELS = {
  "claude-opus-4-20250514": {
    name: "Claude Opus 4",
    inputPricePerMillion: 15_000_000, // $15.00 in microdollars
    outputPricePerMillion: 75_000_000, // $75.00 in microdollars
    contextWindow: 200_000,
  },
  "claude-sonnet-4-20250514": {
    name: "Claude Sonnet 4",
    inputPricePerMillion: 3_000_000, // $3.00 in microdollars
    outputPricePerMillion: 15_000_000, // $15.00 in microdollars
    contextWindow: 200_000,
  },
  "claude-3-5-haiku-20241022": {
    name: "Claude 3.5 Haiku",
    inputPricePerMillion: 800_000, // $0.80 in microdollars
    outputPricePerMillion: 4_000_000, // $4.00 in microdollars
    contextWindow: 200_000,
  },
} as const;

export type AnthropicModel = keyof typeof ANTHROPIC_MODELS;

// ============================================
// Plan Limits
// ============================================

export const PLAN_LIMITS = {
  free: {
    maxProjects: 3,
    retentionDays: 7,
    suggestionsEnabled: true,
    exportEnabled: false,
  },
  pro: {
    maxProjects: 20,
    retentionDays: 90,
    suggestionsEnabled: true,
    exportEnabled: true,
  },
  enterprise: {
    maxProjects: -1, // unlimited
    retentionDays: 365,
    suggestionsEnabled: true,
    exportEnabled: true,
  },
} as const;

// ============================================
// Suggestion Thresholds
// ============================================

export const SUGGESTION_THRESHOLDS = {
  contextTooLarge: {
    warningPercent: 50, // Warn when context is > 50% of max
    criticalPercent: 80, // Critical when > 80%
  },
  redundantContent: {
    similarityThreshold: 0.85, // Content similarity > 85%
    minTokensToCheck: 100,
  },
  repetitivePrompts: {
    minOccurrences: 3, // Same prompt pattern 3+ times
    timeWindowHours: 24,
  },
} as const;

// ============================================
// Misc
// ============================================

export const DEFAULT_MODEL: AnthropicModel = "claude-sonnet-4-20250514";
