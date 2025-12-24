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

export const DEFAULT_MODEL: AnthropicModel = "claude-sonnet-4-20250514";
