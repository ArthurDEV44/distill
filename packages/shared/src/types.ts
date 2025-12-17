import { z } from "zod";

// ============================================
// API Key Types
// ============================================

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  keyPrefix: z.string(),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const ApiKeyPermissionsSchema = z.object({
  allowedModels: z.array(z.string()).optional(),
  maxTokensPerRequest: z.number().positive().optional(),
});

export type ApiKeyPermissions = z.infer<typeof ApiKeyPermissionsSchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  projectId: z.string().uuid("Invalid project ID"),
  permissions: ApiKeyPermissionsSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export interface ApiKeyCreateResponse {
  apiKey: ApiKey & {
    projectName?: string;
    permissions?: ApiKeyPermissions;
    expiresAt?: Date | null;
    revokedAt?: Date | null;
  };
  key: string; // Full key, shown only once
}

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
// Usage & Metrics Types
// ============================================

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostMicros: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

export interface ModelUsage {
  model: string;
  requests: number;
  tokens: number;
  costMicros: number;
}

export interface QuotaUsage {
  used: number;
  limit: number;
  percentage: number;
  resetDate: string;
}

export interface UsageResponse {
  summary: UsageSummary;
  daily: DailyUsage[];
  byModel: Record<string, ModelUsage>;
  quotaUsage: QuotaUsage;
}

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
// Request/Response Types for Proxy
// ============================================

export interface ProxyRequestMetadata {
  requestId: string;
  projectId: string;
  apiKeyId: string;
  userId: string;
  model: string;
  inputTokens: number;
  startTime: number;
}

export interface ProxyResponseMetadata {
  outputTokens: number;
  latencyMs: number;
  statusCode: number;
  contextWindowUsage?: number;
}

// ============================================
// User & Plan Types
// ============================================

export const PlanEnum = z.enum(["free", "pro", "enterprise"]);

export type Plan = z.infer<typeof PlanEnum>;

export interface UserPlan {
  plan: Plan;
  monthlyTokenLimit: number;
  features: {
    maxProjects: number;
    maxApiKeysPerProject: number;
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
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  INVALID_API_KEY: "INVALID_API_KEY",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ANTHROPIC_ERROR: "ANTHROPIC_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];
