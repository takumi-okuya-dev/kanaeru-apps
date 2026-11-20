CREATE TABLE "booking_dismissal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"checkin_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"dismissed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"application_source" text NOT NULL,
	"entry_kind" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entered_by" uuid,
	"memo" text,
	"account_id" uuid,
	"checkin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_entry_application_source_check" CHECK ("booking_entry"."application_source" in ('connpass', 'peatix', 'direct', 'other')),
	CONSTRAINT "booking_entry_entry_kind_check" CHECK ("booking_entry"."entry_kind" in ('manual', 'import', 'walk_in')),
	CONSTRAINT "booking_entry_status_check" CHECK ("booking_entry"."status" in ('confirmed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "booking_import_mapping" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"header_key" text NOT NULL,
	"name_column" text NOT NULL,
	"application_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_import_mapping_application_source_check" CHECK ("booking_import_mapping"."application_source" in ('connpass', 'peatix', 'direct', 'other'))
);
--> statement-breakpoint
CREATE TABLE "booking_setting" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_setting_mode_check" CHECK ("booking_setting"."mode" in ('reception', 'roster'))
);
--> statement-breakpoint
ALTER TABLE "booking_dismissal" ADD CONSTRAINT "booking_dismissal_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_dismissal" ADD CONSTRAINT "booking_dismissal_checkin_id_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_dismissal" ADD CONSTRAINT "booking_dismissal_entry_id_booking_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."booking_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_dismissal" ADD CONSTRAINT "booking_dismissal_dismissed_by_account_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_entered_by_account_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_entry" ADD CONSTRAINT "booking_entry_checkin_id_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_import_mapping" ADD CONSTRAINT "booking_import_mapping_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_setting" ADD CONSTRAINT "booking_setting_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_dismissal_checkin_id_entry_id_unique" ON "booking_dismissal" USING btree ("checkin_id","entry_id");--> statement-breakpoint
CREATE INDEX "booking_dismissal_event_id_idx" ON "booking_dismissal" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "booking_dismissal_entry_id_idx" ON "booking_dismissal" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "booking_dismissal_dismissed_by_idx" ON "booking_dismissal" USING btree ("dismissed_by");--> statement-breakpoint
CREATE INDEX "booking_entry_event_id_applied_at_idx" ON "booking_entry" USING btree ("event_id","applied_at");--> statement-breakpoint
CREATE INDEX "booking_entry_entered_by_idx" ON "booking_entry" USING btree ("entered_by");--> statement-breakpoint
CREATE INDEX "booking_entry_account_id_idx" ON "booking_entry" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_entry_checkin_id_unique" ON "booking_entry" USING btree ("checkin_id") WHERE "booking_entry"."checkin_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_entry_event_id_account_id_unique" ON "booking_entry" USING btree ("event_id","account_id") WHERE "booking_entry"."account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_import_mapping_owner_account_id_header_key_unique" ON "booking_import_mapping" USING btree ("owner_account_id","header_key");