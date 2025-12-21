import { z } from "zod";

// ============================================
// Project Types
// ============================================

export const ProjectSettingsSchema = z.object({
  defaultModel: z.string().optional(),
  maxTokensPerRequest: z.number().optional(),
  enableSuggestions: z.boolean().optional(),
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50),
  description: z.string().max(500).nullable(),
  userId: z.string().uuid(),
  settings: ProjectSettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  settings: ProjectSettingsSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: ProjectSettingsSchema.partial().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// ============================================
// Suggestion Types
// ============================================

export const SuggestionTypeEnum = z.enum([
  "context_too_large",
  "redundant_content",
  "inefficient_format",
  "missing_cache",
  "repetitive_prompts",
]);

export type SuggestionType = z.infer<typeof SuggestionTypeEnum>;

export const SuggestionSeverityEnum = z.enum(["low", "medium", "high"]);

export type SuggestionSeverity = z.infer<typeof SuggestionSeverityEnum>;

export const SuggestionSchema = z.object({
  id: z.string().uuid(),
  type: SuggestionTypeEnum,
  severity: SuggestionSeverityEnum,
  title: z.string(),
  description: z.string(),
  estimatedTokenSavings: z.number().nullable(),
  estimatedCostSavingsMicros: z.number().nullable(),
  context: z
    .object({
      currentTokens: z.number().optional(),
      suggestedTokens: z.number().optional(),
      snippet: z.string().optional(),
      recommendation: z.string().optional(),
    })
    .nullable(),
  status: z.enum(["active", "dismissed", "applied"]),
  createdAt: z.date(),
});

export type Suggestion = z.infer<typeof SuggestionSchema>;

// ============================================
// User & Plan Types
// ============================================

export const PlanEnum = z.enum(["free", "pro", "enterprise"]);

export type Plan = z.infer<typeof PlanEnum>;

export interface UserPlan {
  plan: Plan;
  features: {
    maxProjects: number;
    retentionDays: number;
    suggestionsEnabled: boolean;
    exportEnabled: boolean;
  };
}

// ============================================
// API Error Types
// ============================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const ApiErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];

// ============================================
// API Key Types
// ============================================

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  keyPrefix: z.string(), // First 12 chars for display (e.g., "ctxopt_proj_")
  name: z.string(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
  revokedAt: z.date().nullable(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

// ============================================
// Usage Report Types (MCP -> Web API)
// ============================================

export const ToolBreakdownSchema = z.object({
  calls: z.number().int().min(0),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
  tokensSaved: z.number().int().min(0),
});

export type ToolBreakdown = z.infer<typeof ToolBreakdownSchema>;

export const UsageReportSchema = z.object({
  // Session info
  sessionId: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().int().positive(),

  // Token metrics
  tokensUsed: z.number().int().min(0),
  tokensSaved: z.number().int().min(0),
  savingsPercent: z.number().min(0).max(100),

  // Cost estimation (microdollars: 1 = $0.000001)
  estimatedCostMicros: z.number().int().min(0),
  estimatedSavingsMicros: z.number().int().min(0),

  // Breakdown
  commandsCount: z.number().int().min(0),
  toolsBreakdown: z.record(z.string(), ToolBreakdownSchema).optional(),

  // Metadata
  model: z.string().optional(),
  projectType: z.string().optional(),
});

export type UsageReport = z.infer<typeof UsageReportSchema>;

// ============================================
// Usage Stats Types (Dashboard Display)
// ============================================

export const UsageStatsSchema = z.object({
  // Totals for the period
  totalTokensUsed: z.number().int().min(0),
  totalTokensSaved: z.number().int().min(0),
  totalSavingsPercent: z.number().min(0).max(100),
  totalCostMicros: z.number().int().min(0),
  totalSavingsMicros: z.number().int().min(0),

  // Session counts
  sessionCount: z.number().int().min(0),
  totalCommands: z.number().int().min(0),

  // Top saving tools
  topTools: z.array(
    z.object({
      name: z.string(),
      calls: z.number().int(),
      tokensSaved: z.number().int(),
      savingsPercent: z.number(),
    })
  ),
});

export type UsageStats = z.infer<typeof UsageStatsSchema>;

export const UsagePeriodEnum = z.enum(["7d", "30d", "90d", "365d"]);

export type UsagePeriod = z.infer<typeof UsagePeriodEnum>;
