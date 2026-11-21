CREATE TABLE "event_organization" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "owner_account_id" uuid;--> statement-breakpoint
ALTER TABLE "event_organization" ADD CONSTRAINT "event_organization_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_organization" ADD CONSTRAINT "event_organization_member_fk" FOREIGN KEY ("organization_id","owner_account_id") REFERENCES "public"."organization_member"("organization_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_organization_organization_id_idx" ON "event_organization" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_owner_account_id_idx" ON "event" USING btree ("owner_account_id");