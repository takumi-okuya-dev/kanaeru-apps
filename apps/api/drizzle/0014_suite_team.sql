-- suite-003・threads-016：組織の中のチーム（team・team_member）と、Threads の「チームに入れる」・担当の team_id。
-- drizzle-kit の生成のあと、手で並べ直した：外部キーが指す一意の索引を先に作る・今ある「組織に入れる」の記録を
-- 組織ごとの「チーム1」へ移してから NOT NULL にする（本番に記録はないが、手元の記録を消さない）。
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_name_length" CHECK (char_length("team"."name") BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"team_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"leader" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_team_id_account_id_pk" PRIMARY KEY("team_id","account_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "team_id_organization_id_unique" ON "team" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_organization_id_name_unique" ON "team" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "team_member_organization_id_account_id_idx" ON "team_member" USING btree ("organization_id","account_id");--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_fk" FOREIGN KEY ("team_id","organization_id") REFERENCES "public"."team"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_organization_member_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "public"."organization_member"("organization_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 今ある記録を移す：運用アカウントを入れていた組織ごとに「チーム1」を作り、その組織の人の全員を入れる
INSERT INTO "team" ("organization_id", "name")
SELECT DISTINCT "organization_id", 'チーム1' FROM "threads_organization_account";--> statement-breakpoint
INSERT INTO "team_member" ("team_id", "organization_id", "account_id")
SELECT "team"."id", "organization_member"."organization_id", "organization_member"."account_id"
FROM "team" INNER JOIN "organization_member" ON "organization_member"."organization_id" = "team"."organization_id";--> statement-breakpoint
ALTER TABLE "threads_organization_account" ADD COLUMN "team_id" uuid;--> statement-breakpoint
UPDATE "threads_organization_account" SET "team_id" = "team"."id"
FROM "team" WHERE "team"."organization_id" = "threads_organization_account"."organization_id";--> statement-breakpoint
ALTER TABLE "threads_organization_account" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads_assignment" DROP CONSTRAINT "threads_assignment_organization_account_fk";--> statement-breakpoint
ALTER TABLE "threads_assignment" ADD COLUMN "team_id" uuid;--> statement-breakpoint
UPDATE "threads_assignment" SET "team_id" = "threads_organization_account"."team_id"
FROM "threads_organization_account"
WHERE "threads_organization_account"."threads_account_id" = "threads_assignment"."threads_account_id";--> statement-breakpoint
ALTER TABLE "threads_assignment" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "threads_organization_account_team_id_idx" ON "threads_organization_account" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_organization_account_id_team_id_unique" ON "threads_organization_account" USING btree ("threads_account_id","team_id");--> statement-breakpoint
ALTER TABLE "threads_organization_account" ADD CONSTRAINT "threads_organization_account_team_fk" FOREIGN KEY ("team_id","organization_id") REFERENCES "public"."team"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_organization_account" ADD CONSTRAINT "threads_organization_account_team_member_fk" FOREIGN KEY ("team_id","owner_account_id") REFERENCES "public"."team_member"("team_id","account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_assignment" ADD CONSTRAINT "threads_assignment_organization_account_fk" FOREIGN KEY ("threads_account_id","team_id") REFERENCES "public"."threads_organization_account"("threads_account_id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_assignment" ADD CONSTRAINT "threads_assignment_team_member_fk" FOREIGN KEY ("team_id","account_id") REFERENCES "public"."team_member"("team_id","account_id") ON DELETE cascade ON UPDATE no action;
