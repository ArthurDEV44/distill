/**
 * Output Configuration
 *
 * Global configuration for tool output formatting.
 * Singleton pattern for session-wide settings.
 */

/**
 * Verbosity levels for output
 */
export type VerbosityLevel = "minimal" | "normal" | "detailed";

/**
 * Output format modes
 */
export type OutputMode = "structured" | "prose" | "toon";

/**
 * Global output configuration
 */
export interface OutputConfig {
  /** Verbosity level for output */
  verbosity: VerbosityLevel;
  /** Output format mode */
  mode: OutputMode;
  /** Use TOON format when applicable */
  useToon: boolean;
  /** Include statistics in output */
  includeStats: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: OutputConfig = {
  verbosity: "normal",
  mode: "structured",
  useToon: false,
  includeStats: true,
};

/**
 * Global configuration instance (singleton)
 */
let globalConfig: OutputConfig = { ...DEFAULT_CONFIG };

/**
 * Get current output configuration
 */
export function getOutputConfig(): OutputConfig {
  return { ...globalConfig };
}

/**
 * Update output configuration
 */
export function setOutputConfig(config: Partial<OutputConfig>): void {
  globalConfig = {
    ...globalConfig,
    ...config,
  };
}

/**
 * Reset to default configuration
 */
export function resetOutputConfig(): void {
  globalConfig = { ...DEFAULT_CONFIG };
}

/**
 * Get verbosity-based limits
 */
export function getVerbosityLimits(verbosity?: VerbosityLevel): {
  maxDescriptionLength: number;
  maxItems: number;
  includeDetails: boolean;
} {
  const level = verbosity ?? globalConfig.verbosity;

  switch (level) {
    case "minimal":
      return {
        maxDescriptionLength: 40,
        maxItems: 5,
        includeDetails: false,
      };
    case "normal":
      return {
        maxDescriptionLength: 80,
        maxItems: 15,
        includeDetails: true,
      };
    case "detailed":
      return {
        maxDescriptionLength: 200,
        maxItems: 50,
        includeDetails: true,
      };
  }
}

/**
 * Format output based on current configuration
 */
export function shouldUseToon(): boolean {
  return globalConfig.useToon || globalConfig.mode === "toon";
}

/**
 * Check if stats should be included
 */
export function shouldIncludeStats(): boolean {
  return globalConfig.includeStats;
}
