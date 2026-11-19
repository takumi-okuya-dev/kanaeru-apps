CREATE TABLE "survey_answer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"concern" text,
	"monthly_price" text,
	"tester" text,
	"job_role" text,
	"job_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_answer_monthly_price_check" CHECK ("survey_answer"."monthly_price" in ('jpy0', 'jpy500', 'jpy1000', 'jpy3000plus', 'unknown')),
	CONSTRAINT "survey_answer_tester_check" CHECK ("survey_answer"."tester" in ('yes', 'no')),
	CONSTRAINT "survey_answer_job_role_check" CHECK ("survey_answer"."job_role" in ('executive', 'manager', 'employee', 'freelance', 'student', 'other')),
	CONSTRAINT "survey_answer_job_type_check" CHECK ("survey_answer"."job_type" in ('engineer', 'designer', 'sales', 'marketing', 'planning', 'backoffice', 'management', 'other'))
);
--> statement-breakpoint
ALTER TABLE "survey_answer" ADD CONSTRAINT "survey_answer_checkin_id_checkin_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_answer_checkin_id_unique" ON "survey_answer" USING btree ("checkin_id");