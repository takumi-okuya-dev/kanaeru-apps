CREATE TABLE "entitlement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_key" text NOT NULL,
	"holder_account_id" uuid,
	"holder_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_holder_check" CHECK (("entitlement"."holder_account_id" IS NULL) <> ("entitlement"."holder_organization_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"admin_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_name_length" CHECK (char_length("organization"."name") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "organization_invite" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_ciphertext" "bytea",
	"token_iv" "bytea",
	"key_version" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"demoted_at" timestamp with time zone,
	CONSTRAINT "organization_member_organization_id_account_id_pk" PRIMARY KEY("organization_id","account_id"),
	CONSTRAINT "organization_member_role_check" CHECK ("organization_member"."role" in ('admin', 'editor', 'member'))
);
--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_holder_account_id_account_id_fk" FOREIGN KEY ("holder_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_holder_organization_id_organization_id_fk" FOREIGN KEY ("holder_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invite" ADD CONSTRAINT "organization_invite_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlement_holder_account_id_idx" ON "entitlement" USING btree ("holder_account_id");--> statement-breakpoint
CREATE INDEX "entitlement_holder_organization_id_idx" ON "entitlement" USING btree ("holder_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invite_token_hash_unique" ON "organization_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_member_account_id_idx" ON "organization_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_member_admin_unique" ON "organization_member" USING btree ("organization_id") WHERE "organization_member"."role" = 'admin';