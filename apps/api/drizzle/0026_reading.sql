CREATE TABLE "reading_book" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"isbn" text,
	"cover_url" text,
	"catalog_source" text NOT NULL,
	"want" text,
	"status" text DEFAULT 'reading' NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_book_id_owner_unique" UNIQUE("id","owner_account_id"),
	CONSTRAINT "reading_book_title_check" CHECK (char_length("reading_book"."title") between 1 and 300),
	CONSTRAINT "reading_book_author_check" CHECK (char_length("reading_book"."author") between 1 and 300),
	CONSTRAINT "reading_book_isbn_check" CHECK ("reading_book"."isbn" ~ '^[0-9]{13}$'),
	CONSTRAINT "reading_book_cover_url_check" CHECK (left("reading_book"."cover_url", 24) = 'https://cover.openbd.jp/' and char_length("reading_book"."cover_url") <= 300),
	CONSTRAINT "reading_book_catalog_source_check" CHECK ("reading_book"."catalog_source" in ('ndl', 'openbd', 'manual')),
	CONSTRAINT "reading_book_want_check" CHECK (char_length("reading_book"."want") between 1 and 500),
	CONSTRAINT "reading_book_status_check" CHECK ("reading_book"."status" in ('reading', 'finished', 'dropped')),
	CONSTRAINT "reading_book_sources_check" CHECK ("reading_book"."sources" <@ array['kindle', 'goodnotes', 'other']::text[] and cardinality("reading_book"."sources") <= 3)
);
--> statement-breakpoint
CREATE TABLE "reading_marker" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"book_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"chapter" text,
	"page" integer,
	"location" integer,
	"position" bigint NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"comment" text,
	"comment_edited" boolean DEFAULT false NOT NULL,
	"question" boolean DEFAULT false NOT NULL,
	"question_edited" boolean DEFAULT false NOT NULL,
	"dedupe_key" char(64) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_marker_book_dedupe_key_unique" UNIQUE("book_id","dedupe_key"),
	CONSTRAINT "reading_marker_source_check" CHECK ("reading_marker"."source" in ('goodnotes', 'kindle', 'paste')),
	CONSTRAINT "reading_marker_chapter_check" CHECK (char_length("reading_marker"."chapter") between 1 and 200),
	CONSTRAINT "reading_marker_page_check" CHECK ("reading_marker"."page" >= 1),
	CONSTRAINT "reading_marker_location_check" CHECK ("reading_marker"."location" >= 1),
	CONSTRAINT "reading_marker_text_check" CHECK (char_length("reading_marker"."text") <= 4000),
	CONSTRAINT "reading_marker_comment_check" CHECK (char_length("reading_marker"."comment") between 1 and 4000),
	CONSTRAINT "reading_marker_text_or_comment_check" CHECK ("reading_marker"."text" <> '' or "reading_marker"."comment" is not null),
	CONSTRAINT "reading_marker_dedupe_key_check" CHECK ("reading_marker"."dedupe_key" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "reading_book" ADD CONSTRAINT "reading_book_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_marker" ADD CONSTRAINT "reading_marker_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_marker" ADD CONSTRAINT "reading_marker_book_fk" FOREIGN KEY ("book_id","owner_account_id") REFERENCES "public"."reading_book"("id","owner_account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_book_owner_shelf_idx" ON "reading_book" USING btree ("owner_account_id","status","last_imported_at" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_marker_book_position_idx" ON "reading_marker" USING btree ("book_id","deleted_at","position");--> statement-breakpoint
CREATE INDEX "reading_marker_owner_idx" ON "reading_marker" USING btree ("owner_account_id");