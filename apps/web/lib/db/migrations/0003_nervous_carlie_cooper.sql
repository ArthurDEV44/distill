CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"api_key_id" uuid,
	"session_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"duration_ms" integer NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"tokens_saved" integer DEFAULT 0 NOT NULL,
	"savings_percent" real DEFAULT 0 NOT NULL,
	"estimated_cost_micros" integer DEFAULT 0 NOT NULL,
	"estimated_savings_micros" integer DEFAULT 0 NOT NULL,
	"commands_count" integer DEFAULT 0 NOT NULL,
	"tools_breakdown" jsonb,
	"model" text,
	"project_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_project_id_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "usage_records_project_id_idx" ON "usage_records" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "usage_records_created_at_idx" ON "usage_records" USING btree ("created_at");