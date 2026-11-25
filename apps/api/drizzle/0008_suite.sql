CREATE TABLE "app_setting" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_key" text NOT NULL,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_setting_visibility_check" CHECK ("app_setting"."visibility" in ('off', 'operator_only', 'public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_setting_app_key_unique" ON "app_setting" USING btree ("app_key");--> statement-breakpoint
-- 受付アプリは公開（本番のふるまいを変えないため。AD-16）。値は modules/suite/repository.ts の INITIAL_APP_SETTINGS と同じ
INSERT INTO "app_setting" ("app_key", "visibility") VALUES ('reception', 'public') ON CONFLICT ("app_key") DO NOTHING;
