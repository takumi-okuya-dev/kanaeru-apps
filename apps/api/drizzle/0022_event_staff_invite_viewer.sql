CREATE TABLE "staff_invite_viewer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_invite_viewer" ADD CONSTRAINT "staff_invite_viewer_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite_viewer" ADD CONSTRAINT "staff_invite_viewer_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invite_viewer_event_id_account_id_unique" ON "staff_invite_viewer" USING btree ("event_id","account_id");--> statement-breakpoint
CREATE INDEX "staff_invite_viewer_account_id_idx" ON "staff_invite_viewer" USING btree ("account_id");