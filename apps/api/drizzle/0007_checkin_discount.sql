ALTER TABLE "checkin" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "checkin" ADD COLUMN "discount_name" text;--> statement-breakpoint
ALTER TABLE "checkin" ADD COLUMN "discount_amount" integer;--> statement-breakpoint
ALTER TABLE "checkin" ADD COLUMN "referrer_name" text;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_discount_fk" FOREIGN KEY ("event_id","discount_id") REFERENCES "public"."event_discount"("event_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_discount_amount_check" CHECK ("checkin"."discount_amount" >= 0);--> statement-breakpoint
ALTER TABLE "checkin" ADD CONSTRAINT "checkin_discount_check" CHECK (("checkin"."discount_id" is null and "checkin"."discount_name" is null and "checkin"."discount_amount" is null and "checkin"."referrer_name" is null) or ("checkin"."discount_id" is not null and "checkin"."discount_name" is not null and "checkin"."discount_amount" is not null));