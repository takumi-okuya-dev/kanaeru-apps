CREATE TABLE "person_meeting" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"met_on" date NOT NULL,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_meeting_id_owner_unique" UNIQUE("id","owner_account_id"),
	CONSTRAINT "person_meeting_source_check" CHECK ("person_meeting"."source" in ('manual', 'event')),
	CONSTRAINT "person_meeting_event_source_check" CHECK ("person_meeting"."source" = 'event' or "person_meeting"."event_id" is null),
	CONSTRAINT "person_meeting_name_check" CHECK (char_length("person_meeting"."name") between 1 and 100),
	CONSTRAINT "person_meeting_name_key_check" CHECK (char_length("person_meeting"."name_key") between 1 and 400)
);
--> statement-breakpoint
CREATE TABLE "person_note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"reading" text,
	"line_name" text,
	"appearance" text,
	"account_x" text,
	"account_connpass" text,
	"account_github" text,
	"account_linkedin" text,
	"account_line" text,
	"account_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tag_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"talk" text DEFAULT '' NOT NULL,
	"next_topic" text DEFAULT '' NOT NULL,
	"search_text" text NOT NULL,
	"search_version" smallint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"create_request_id" uuid,
	"recent_append_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_note_id_owner_unique" UNIQUE("id","owner_account_id"),
	CONSTRAINT "person_note_full_name_check" CHECK (char_length("person_note"."full_name") between 1 and 100),
	CONSTRAINT "person_note_reading_check" CHECK (char_length("person_note"."reading") <= 100),
	CONSTRAINT "person_note_line_name_check" CHECK (char_length("person_note"."line_name") <= 100),
	CONSTRAINT "person_note_appearance_check" CHECK (char_length("person_note"."appearance") <= 200),
	CONSTRAINT "person_note_accounts_check" CHECK (char_length("person_note"."account_x") <= 200 and char_length("person_note"."account_connpass") <= 200 and char_length("person_note"."account_github") <= 200 and char_length("person_note"."account_linkedin") <= 200 and char_length("person_note"."account_line") <= 200 and char_length("person_note"."account_url") <= 200),
	CONSTRAINT "person_note_account_url_check" CHECK ("person_note"."account_url" ~* '^https?://'),
	CONSTRAINT "person_note_tags_check" CHECK (cardinality("person_note"."tag_keys") = cardinality("person_note"."tags") and array_position("person_note"."tags", null) is null and array_position("person_note"."tag_keys", null) is null),
	CONSTRAINT "person_note_recent_append_ids_check" CHECK (cardinality("person_note"."recent_append_ids") <= 20 and array_position("person_note"."recent_append_ids", null) is null),
	CONSTRAINT "person_note_talk_check" CHECK (char_length("person_note"."talk") <= 20000),
	CONSTRAINT "person_note_next_topic_check" CHECK (char_length("person_note"."next_topic") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "person_note_meeting" (
	"note_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_note_meeting_pkey" PRIMARY KEY("note_id","meeting_id")
);
--> statement-breakpoint
ALTER TABLE "person_meeting" ADD CONSTRAINT "person_meeting_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_meeting" ADD CONSTRAINT "person_meeting_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_note" ADD CONSTRAINT "person_note_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_note_meeting" ADD CONSTRAINT "person_note_meeting_note_fk" FOREIGN KEY ("note_id","owner_account_id") REFERENCES "public"."person_note"("id","owner_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_note_meeting" ADD CONSTRAINT "person_note_meeting_meeting_fk" FOREIGN KEY ("meeting_id","owner_account_id") REFERENCES "public"."person_meeting"("id","owner_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_meeting_owner_event_unique" ON "person_meeting" USING btree ("owner_account_id","event_id") WHERE "person_meeting"."event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "person_meeting_owner_manual_unique" ON "person_meeting" USING btree ("owner_account_id","name_key","met_on") WHERE "person_meeting"."source" = 'manual';--> statement-breakpoint
CREATE INDEX "person_meeting_owner_met_on_idx" ON "person_meeting" USING btree ("owner_account_id","met_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "person_meeting_event_id_idx" ON "person_meeting" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_note_owner_create_request_unique" ON "person_note" USING btree ("owner_account_id","create_request_id") WHERE "person_note"."create_request_id" is not null;--> statement-breakpoint
CREATE INDEX "person_note_owner_updated_at_idx" ON "person_note" USING btree ("owner_account_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "person_note_meeting_meeting_id_idx" ON "person_note_meeting" USING btree ("meeting_id");