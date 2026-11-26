CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"app_key" text,
	"body" text NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_body_check" CHECK (char_length("feedback"."body") between 1 and 2000),
	CONSTRAINT "feedback_app_key_check" CHECK ("feedback"."app_key" is null or char_length("feedback"."app_key") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_account_id_created_at_idx" ON "feedback" USING btree ("account_id","created_at");