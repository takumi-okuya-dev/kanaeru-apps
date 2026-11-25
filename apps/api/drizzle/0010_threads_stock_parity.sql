ALTER TABLE "threads_post_draft" ADD COLUMN "last_review_request_id" uuid;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD COLUMN "body_edited_at" timestamp with time zone;