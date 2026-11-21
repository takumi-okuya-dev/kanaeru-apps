CREATE TABLE "booking_consent" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"organization_id" uuid,
	"owner_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_consent_holder_check" CHECK (num_nonnulls("booking_consent"."organization_id", "booking_consent"."owner_account_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "booking_email_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_email_request_email_check" CHECK (char_length("booking_email_request"."email") <= 254)
);
--> statement-breakpoint
ALTER TABLE "booking_entry" DROP CONSTRAINT "booking_entry_entry_kind_check";--> statement-breakpoint
ALTER TABLE "booking_setting" DROP CONSTRAINT "booking_setting_mode_check";--> statement-breakpoint
ALTER TABLE "booking_entry" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD COLUMN "entry_token_hash" text;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "accepting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_consent" ADD CONSTRAINT "booking_consent_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_consent" ADD CONSTRAINT "booking_consent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_consent" ADD CONSTRAINT "booking_consent_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_email_request" ADD CONSTRAINT "booking_email_request_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_consent_account_id_organization_id_unique" ON "booking_consent" USING btree ("account_id","organization_id") WHERE "booking_consent"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_consent_account_id_owner_account_id_unique" ON "booking_consent" USING btree ("account_id","owner_account_id") WHERE "booking_consent"."owner_account_id" is not null;--> statement-breakpoint
CREATE INDEX "booking_consent_organization_id_idx" ON "booking_consent" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "booking_consent_owner_account_id_idx" ON "booking_consent" USING btree ("owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_email_request_token_hash_unique" ON "booking_email_request" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "booking_email_request_event_id_email_idx" ON "booking_email_request" USING btree ("event_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_entry_event_id_contact_email_unique" ON "booking_entry" USING btree ("event_id","contact_email") WHERE "booking_entry"."contact_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_entry_entry_token_hash_unique" ON "booking_entry" USING btree ("entry_token_hash") WHERE "booking_entry"."entry_token_hash" is not null;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_contact_email_check" CHECK ("booking_entry"."contact_email" is null or char_length("booking_entry"."contact_email") <= 254);--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_entry_kind_check" CHECK ("booking_entry"."entry_kind" in ('manual', 'import', 'walk_in', 'self_page'));--> statement-breakpoint
ALTER TABLE "booking_setting" ADD CONSTRAINT "booking_setting_visibility_check" CHECK ("booking_setting"."visibility" in ('public', 'members'));--> statement-breakpoint
ALTER TABLE "booking_setting" ADD CONSTRAINT "booking_setting_mode_check" CHECK ("booking_setting"."mode" in ('reception', 'roster', 'self_page'));