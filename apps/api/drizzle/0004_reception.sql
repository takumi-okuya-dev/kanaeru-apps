CREATE TABLE "checkin" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"account_id" uuid,
	"entered_by" uuid,
	"name" text NOT NULL,
	"application_source" text NOT NULL,
	"referral" text NOT NULL,
	"payment_method" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_amount_check" CHECK ("checkin"."amount" >= 0),
	CONSTRAINT "checkin_application_source_check" CHECK ("checkin"."application_source" in ('connpass', 'peatix', 'direct', 'other')),
	CONSTRAINT "checkin_referral_check" CHECK ("checkin"."referral" in ('friend', 'sns', 'announcement', 'other')),
	CONSTRAINT "checkin_payment_method_check" CHECK ("checkin"."payment_method" in ('paypay', 'cash', 'free'))
);
--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_entered_by_account_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_event_id_account_id_unique" ON "checkin" USING btree ("event_id","account_id") WHERE "checkin"."account_id" is not null;--> statement-breakpoint
CREATE INDEX "checkin_event_id_created_at_idx" ON "checkin" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "checkin_account_id_created_at_idx" ON "checkin" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "checkin_entered_by_idx" ON "checkin" USING btree ("entered_by");