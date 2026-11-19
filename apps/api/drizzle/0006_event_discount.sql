CREATE TABLE "event_discount" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"asks_referrer" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_discount_event_id_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "event_discount_amount_check" CHECK ("event_discount"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_discount" ADD CONSTRAINT "event_discount_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;