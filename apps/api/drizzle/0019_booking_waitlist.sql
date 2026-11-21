CREATE TABLE "booking_offer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"token_hash" text,
	"offered_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_offer_status_check" CHECK ("booking_offer"."status" in ('pending', 'accepted', 'declined', 'expired', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "booking_quota" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"application_source" text NOT NULL,
	"seats" integer NOT NULL,
	"manage_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_quota_application_source_check" CHECK ("booking_quota"."application_source" in ('connpass', 'peatix', 'other')),
	CONSTRAINT "booking_quota_seats_check" CHECK ("booking_quota"."seats" between 1 and 1000),
	CONSTRAINT "booking_quota_manage_url_check" CHECK ("booking_quota"."manage_url" is null or (char_length("booking_quota"."manage_url") <= 500 and "booking_quota"."manage_url" ~ '^https?://'))
);
--> statement-breakpoint
ALTER TABLE "booking_entry" DROP CONSTRAINT "booking_entry_status_check";--> statement-breakpoint
ALTER TABLE "booking_notice" DROP CONSTRAINT "booking_notice_kind_check";--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "quota_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "notified_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "notified_venue" text;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "change_detected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD COLUMN "same_day_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_offer" ADD CONSTRAINT "booking_offer_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_offer" ADD CONSTRAINT "booking_offer_entry_id_booking_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."booking_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_offer" ADD CONSTRAINT "booking_offer_offered_by_account_id_fk" FOREIGN KEY ("offered_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_quota" ADD CONSTRAINT "booking_quota_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_offer_entry_id_pending_unique" ON "booking_offer" USING btree ("entry_id") WHERE "booking_offer"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "booking_offer_token_hash_unique" ON "booking_offer" USING btree ("token_hash") WHERE "booking_offer"."token_hash" is not null;--> statement-breakpoint
CREATE INDEX "booking_offer_status_deadline_idx" ON "booking_offer" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "booking_offer_event_id_idx" ON "booking_offer" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "booking_offer_offered_by_idx" ON "booking_offer" USING btree ("offered_by");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_quota_event_id_application_source_unique" ON "booking_quota" USING btree ("event_id","application_source");--> statement-breakpoint
CREATE INDEX "booking_entry_event_id_status_idx" ON "booking_entry" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_status_check" CHECK ("booking_entry"."status" in ('confirmed', 'waitlisted', 'offered', 'cancelled'));--> statement-breakpoint
ALTER TABLE "booking_notice" ADD CONSTRAINT "booking_notice_kind_check" CHECK ("booking_notice"."kind" in ('confirmed', 'waitlisted', 'offered', 'offer_expired', 'changed', 'cancelled_event', 'same_day', 'test'));--> statement-breakpoint
ALTER TABLE "booking_setting" ADD CONSTRAINT "booking_setting_capacity_check" CHECK ("booking_setting"."capacity" is null or "booking_setting"."capacity" between 1 and 1000);