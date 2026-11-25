CREATE TABLE "threads_assignment" (
	"threads_account_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delegated" boolean DEFAULT false NOT NULL,
	"delegated_at" timestamp with time zone,
	"notice_seen_at" timestamp with time zone,
	CONSTRAINT "threads_assignment_threads_account_id_account_id_pk" PRIMARY KEY("threads_account_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "threads_organization_account" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "handed_over_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_account" ADD COLUMN "handover_from_name" text;--> statement-breakpoint
ALTER TABLE "threads_activity_log" ADD COLUMN "actor_account_id" uuid;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD COLUMN "created_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD COLUMN "updated_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD COLUMN "reviewed_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "threads_assignment" ADD CONSTRAINT "threads_assignment_organization_account_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_organization_account"("threads_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_assignment" ADD CONSTRAINT "threads_assignment_member_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "public"."organization_member"("organization_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_organization_account" ADD CONSTRAINT "threads_organization_account_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_organization_account" ADD CONSTRAINT "threads_organization_account_member_fk" FOREIGN KEY ("organization_id","owner_account_id") REFERENCES "public"."organization_member"("organization_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_assignment_organization_id_account_id_idx" ON "threads_assignment" USING btree ("organization_id","account_id");--> statement-breakpoint
CREATE INDEX "threads_assignment_account_id_idx" ON "threads_assignment" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "threads_organization_account_organization_id_idx" ON "threads_organization_account" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "threads_activity_log" ADD CONSTRAINT "threads_activity_log_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_reviewed_by_account_id_account_id_fk" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_activity_log_actor_account_id_created_at_idx" ON "threads_activity_log" USING btree ("actor_account_id","created_at" DESC NULLS LAST);