CREATE TABLE "booking_contact" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_contact_email_check" CHECK (char_length("booking_contact"."email") <= 254)
);
--> statement-breakpoint
CREATE TABLE "booking_line_channel" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"holder_account_id" uuid,
	"holder_organization_id" uuid,
	"line_channel_id" text,
	"channel_secret_ciphertext" "bytea",
	"channel_secret_iv" "bytea",
	"channel_secret_key_version" smallint,
	"channel_secret_tail" text,
	"access_token_ciphertext" "bytea",
	"access_token_iv" "bytea",
	"access_token_key_version" smallint,
	"access_token_tail" text,
	"basic_id" text,
	"reply_to_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_line_channel_holder_check" CHECK (num_nonnulls("booking_line_channel"."holder_account_id", "booking_line_channel"."holder_organization_id") = 1),
	CONSTRAINT "booking_line_channel_line_check" CHECK (num_nulls("booking_line_channel"."line_channel_id", "booking_line_channel"."channel_secret_ciphertext", "booking_line_channel"."channel_secret_iv", "booking_line_channel"."channel_secret_key_version", "booking_line_channel"."channel_secret_tail", "booking_line_channel"."access_token_ciphertext", "booking_line_channel"."access_token_iv", "booking_line_channel"."access_token_key_version", "booking_line_channel"."access_token_tail") in (0, 9))
);
--> statement-breakpoint
CREATE TABLE "booking_line_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_line_link_line_user_id_check" CHECK ("booking_line_link"."line_user_id" ~ '^U[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "booking_line_link_token" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_line_link_token_line_user_id_check" CHECK ("booking_line_link_token"."line_user_id" ~ '^U[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "booking_notice" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entry_id" uuid,
	"channel_id" uuid,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_notice_kind_check" CHECK ("booking_notice"."kind" in ('confirmed', 'waitlisted', 'offered', 'offer_expired', 'changed', 'cancelled_event', 'test')),
	CONSTRAINT "booking_notice_method_check" CHECK ("booking_notice"."method" in ('line', 'email', 'none')),
	CONSTRAINT "booking_notice_result_check" CHECK ("booking_notice"."result" in ('sent', 'off', 'not_allowed', 'no_destination', 'failed', 'unavailable')),
	CONSTRAINT "booking_notice_entry_check" CHECK (("booking_notice"."kind" = 'test') = ("booking_notice"."entry_id" is null))
);
--> statement-breakpoint
ALTER TABLE "booking_contact" ADD CONSTRAINT "booking_contact_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_channel" ADD CONSTRAINT "booking_line_channel_holder_account_id_account_id_fk" FOREIGN KEY ("holder_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_channel" ADD CONSTRAINT "booking_line_channel_holder_organization_id_organization_id_fk" FOREIGN KEY ("holder_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_link" ADD CONSTRAINT "booking_line_link_channel_id_booking_line_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."booking_line_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_link" ADD CONSTRAINT "booking_line_link_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_link_token" ADD CONSTRAINT "booking_line_link_token_channel_id_booking_line_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."booking_line_channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_line_link_token" ADD CONSTRAINT "booking_line_link_token_used_by_account_id_account_id_fk" FOREIGN KEY ("used_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notice" ADD CONSTRAINT "booking_notice_entry_id_booking_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."booking_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notice" ADD CONSTRAINT "booking_notice_channel_id_booking_line_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."booking_line_channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_line_channel_holder_account_id_unique" ON "booking_line_channel" USING btree ("holder_account_id") WHERE "booking_line_channel"."holder_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_line_channel_holder_organization_id_unique" ON "booking_line_channel" USING btree ("holder_organization_id") WHERE "booking_line_channel"."holder_organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_line_link_channel_id_account_id_unique" ON "booking_line_link" USING btree ("channel_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_line_link_channel_id_line_user_id_unique" ON "booking_line_link" USING btree ("channel_id","line_user_id");--> statement-breakpoint
CREATE INDEX "booking_line_link_account_id_idx" ON "booking_line_link" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_line_link_token_token_hash_unique" ON "booking_line_link_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "booking_line_link_token_channel_id_line_user_id_idx" ON "booking_line_link_token" USING btree ("channel_id","line_user_id");--> statement-breakpoint
CREATE INDEX "booking_line_link_token_used_by_account_id_idx" ON "booking_line_link_token" USING btree ("used_by_account_id");--> statement-breakpoint
CREATE INDEX "booking_notice_entry_id_idx" ON "booking_notice" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "booking_notice_channel_id_created_at_idx" ON "booking_notice" USING btree ("channel_id","created_at");