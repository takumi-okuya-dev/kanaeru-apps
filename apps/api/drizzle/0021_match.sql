CREATE TABLE "match_join" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"match_table_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_join_nickname_check" CHECK (char_length("match_join"."nickname") between 1 and 20),
	CONSTRAINT "match_join_level_check" CHECK ("match_join"."level" in ('advanced', 'intermediate', 'beginner', 'novice'))
);
--> statement-breakpoint
CREATE TABLE "match_level_memory" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid,
	"organization_id" uuid,
	"account_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_level_memory_holder_check" CHECK (num_nonnulls("match_level_memory"."owner_account_id", "match_level_memory"."organization_id") = 1),
	CONSTRAINT "match_level_memory_level_check" CHECK ("match_level_memory"."level" in ('advanced', 'intermediate', 'beginner', 'novice'))
);
--> statement-breakpoint
CREATE TABLE "match_table" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"play_date" date NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"editor_device_id" text,
	"last_change_id" uuid,
	"seed" integer DEFAULT 0 NOT NULL,
	"view_token_hash" text,
	"view_token_expires_at" timestamp with time zone,
	"join_token_hash" text,
	"join_token_expires_at" timestamp with time zone,
	"join_closed_at" timestamp with time zone,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_table_name_check" CHECK (char_length("match_table"."name") between 1 and 60),
	CONSTRAINT "match_table_version_check" CHECK ("match_table"."version" >= 1),
	CONSTRAINT "match_table_content_check" CHECK (jsonb_typeof("match_table"."content") = 'object'),
	CONSTRAINT "match_table_editor_device_id_check" CHECK ("match_table"."editor_device_id" is null or char_length("match_table"."editor_device_id") between 1 and 64)
);
--> statement-breakpoint
CREATE TABLE "match_table_organization" (
	"match_table_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_join" ADD CONSTRAINT "match_join_match_table_id_match_table_id_fk" FOREIGN KEY ("match_table_id") REFERENCES "public"."match_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_level_memory" ADD CONSTRAINT "match_level_memory_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_level_memory" ADD CONSTRAINT "match_level_memory_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_level_memory" ADD CONSTRAINT "match_level_memory_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_table_organization" ADD CONSTRAINT "match_table_organization_match_table_id_match_table_id_fk" FOREIGN KEY ("match_table_id") REFERENCES "public"."match_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_table_organization" ADD CONSTRAINT "match_table_organization_member_fk" FOREIGN KEY ("organization_id","owner_account_id") REFERENCES "public"."organization_member"("organization_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_join_match_table_id_created_at_idx" ON "match_join" USING btree ("match_table_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_level_memory_owner_account_id_account_id_unique" ON "match_level_memory" USING btree ("owner_account_id","account_id") WHERE "match_level_memory"."owner_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "match_level_memory_organization_id_account_id_unique" ON "match_level_memory" USING btree ("organization_id","account_id") WHERE "match_level_memory"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "match_level_memory_account_id_idx" ON "match_level_memory" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "match_table_owner_account_id_play_date_idx" ON "match_table" USING btree ("owner_account_id","play_date");--> statement-breakpoint
CREATE INDEX "match_table_event_id_idx" ON "match_table" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_table_view_token_hash_unique" ON "match_table" USING btree ("view_token_hash") WHERE "match_table"."view_token_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "match_table_join_token_hash_unique" ON "match_table" USING btree ("join_token_hash") WHERE "match_table"."join_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "match_table_organization_organization_id_idx" ON "match_table_organization" USING btree ("organization_id");