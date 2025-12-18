ALTER TABLE "api_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_daily" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestions" DROP COLUMN IF EXISTS "request_id";--> statement-breakpoint
DROP TABLE "api_keys" CASCADE;--> statement-breakpoint
DROP TABLE "requests" CASCADE;--> statement-breakpoint
DROP TABLE "usage_daily" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "monthly_token_limit";