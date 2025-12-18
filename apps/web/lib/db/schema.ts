import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// USERS (synced from Clerk via webhook)
// ============================================
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email").notNull(),
    name: text("name"),
    imageUrl: text("image_url"),
    plan: text("plan").notNull().default("free"), // 'free' | 'pro' | 'enterprise'
    polarSubscriptionId: text("polar_subscription_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_clerk_id_idx").on(table.clerkId),
    index("users_email_idx").on(table.email),
  ]
);

// ============================================
// PROJECTS
// ============================================
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    settings: jsonb("settings")
      .$type<{
        defaultModel?: string;
        maxTokensPerRequest?: number;
        enableSuggestions?: boolean;
      }>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    uniqueIndex("projects_slug_user_idx").on(table.slug, table.userId),
  ]
);

// ============================================
// SUGGESTIONS (optimization recommendations)
// ============================================
export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    type: text("type").notNull(), // 'context_too_large' | 'redundant_content' | etc.
    severity: text("severity").notNull(), // 'low' | 'medium' | 'high'
    title: text("title").notNull(),
    description: text("description").notNull(),

    // Potential savings
    estimatedTokenSavings: integer("estimated_token_savings"),
    estimatedCostSavingsMicros: integer("estimated_cost_savings_micros"),

    // Context
    context: jsonb("context").$type<{
      currentTokens?: number;
      suggestedTokens?: number;
      snippet?: string;
      recommendation?: string;
    }>(),

    // Status
    status: text("status").notNull().default("active"), // 'active' | 'dismissed' | 'applied'
    dismissedAt: timestamp("dismissed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("suggestions_project_id_idx").on(table.projectId),
    index("suggestions_user_id_idx").on(table.userId),
    index("suggestions_status_idx").on(table.status),
  ]
);

// ============================================
// RELATIONS
// ============================================
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  suggestions: many(suggestions),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  suggestions: many(suggestions),
}));

export const suggestionsRelations = relations(suggestions, ({ one }) => ({
  project: one(projects, { fields: [suggestions.projectId], references: [projects.id] }),
  user: one(users, { fields: [suggestions.userId], references: [users.id] }),
}));

// ============================================
// TYPE EXPORTS
// ============================================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;
