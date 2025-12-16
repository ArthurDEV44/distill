import { ANTHROPIC_MODELS, type AnthropicModel } from "./constants";

/**
 * Calculate cost in microdollars for a given number of tokens
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCostMicros: number; outputCostMicros: number; totalCostMicros: number } {
  const modelInfo = ANTHROPIC_MODELS[model as AnthropicModel];

  if (!modelInfo) {
    // Default to Sonnet pricing if model not found
    const defaultModel = ANTHROPIC_MODELS["claude-sonnet-4-20250514"];
    const inputCostMicros = Math.ceil(
      (inputTokens / 1_000_000) * defaultModel.inputPricePerMillion
    );
    const outputCostMicros = Math.ceil(
      (outputTokens / 1_000_000) * defaultModel.outputPricePerMillion
    );
    return {
      inputCostMicros,
      outputCostMicros,
      totalCostMicros: inputCostMicros + outputCostMicros,
    };
  }

  const inputCostMicros = Math.ceil(
    (inputTokens / 1_000_000) * modelInfo.inputPricePerMillion
  );
  const outputCostMicros = Math.ceil(
    (outputTokens / 1_000_000) * modelInfo.outputPricePerMillion
  );

  return {
    inputCostMicros,
    outputCostMicros,
    totalCostMicros: inputCostMicros + outputCostMicros,
  };
}

/**
 * Format microdollars to human-readable currency string
 */
export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(6)}`;
  }
  if (dollars < 1) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Generate a URL-safe slug from a string
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * Calculate context window usage percentage
 */
export function calculateContextUsage(
  tokens: number,
  model: string
): number {
  const modelInfo = ANTHROPIC_MODELS[model as AnthropicModel];
  const contextWindow = modelInfo?.contextWindow ?? 200_000;
  return Math.round((tokens / contextWindow) * 100);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

/**
 * Get start of current month (UTC)
 */
export function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Get start of next month (UTC)
 */
export function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Check if a date is within the current month
 */
export function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth()
  );
}
