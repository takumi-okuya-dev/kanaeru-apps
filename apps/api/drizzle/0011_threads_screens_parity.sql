CREATE TABLE "threads_revocation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_user_hash" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "threads_revocation_hash_format" CHECK ("threads_revocation"."threads_user_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "profile_picture_url" text;--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "promotions_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "research_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "core_rules_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_deletion_request" ADD COLUMN "threads_user_hash" text;--> statement-breakpoint
ALTER TABLE "threads_draft_batch" ADD COLUMN "strategy_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_draft_batch" ADD COLUMN "promotions_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_draft_batch" ADD COLUMN "research_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_draft_batch" ADD COLUMN "core_rules_changed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "threads_revocation_threads_user_hash_issued_at_idx" ON "threads_revocation" USING btree ("threads_user_hash","issued_at");--> statement-breakpoint
CREATE INDEX "threads_revocation_received_at_idx" ON "threads_revocation" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "threads_deletion_request_threads_user_hash_idx" ON "threads_deletion_request" USING btree ("threads_user_hash");