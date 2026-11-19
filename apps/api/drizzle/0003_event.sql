CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue" text NOT NULL,
	"fee" integer NOT NULL,
	"google_form_url" text,
	"line_group_url" text,
	"survey_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_fee_check" CHECK ("event"."fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_staff" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invite" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD CONSTRAINT "staff_invite_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_staff_event_id_account_id_unique" ON "event_staff" USING btree ("event_id","account_id");--> statement-breakpoint
CREATE INDEX "event_staff_account_id_idx" ON "event_staff" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invite_event_id_unique" ON "staff_invite" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invite_token_unique" ON "staff_invite" USING btree ("token");