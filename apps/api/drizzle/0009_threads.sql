CREATE TABLE "threads_account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prompt_post_count" smallint DEFAULT 30 NOT NULL,
	"post_length_target" smallint DEFAULT 150 NOT NULL,
	"short_length" smallint DEFAULT 55 NOT NULL,
	"medium_length" smallint DEFAULT 100 NOT NULL,
	"long_length" smallint DEFAULT 135 NOT NULL,
	"short_ratio" smallint DEFAULT 35 NOT NULL,
	"medium_ratio" smallint DEFAULT 45 NOT NULL,
	"long_ratio" smallint DEFAULT 20 NOT NULL,
	"core_rules" text DEFAULT '' NOT NULL,
	"connection_status" text DEFAULT 'not_connected' NOT NULL,
	"threads_user_id" text,
	"username" text,
	"display_name" text,
	"connection_generation" bigint DEFAULT 0 NOT NULL,
	"reconnect_hint" text,
	"insights_denied_at" timestamp with time zone,
	"replies_denied_at" timestamp with time zone,
	"promotion_ratio_percent" smallint DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_account_connection_status_check" CHECK ("threads_account"."connection_status" in ('not_connected', 'connected', 'needs_reconnect')),
	CONSTRAINT "threads_account_connection_consistency" CHECK (("threads_account"."connection_status" = 'not_connected' AND "threads_account"."threads_user_id" IS NULL AND "threads_account"."username" IS NULL)
        OR ("threads_account"."connection_status" <> 'not_connected' AND "threads_account"."threads_user_id" IS NOT NULL AND "threads_account"."username" IS NOT NULL)),
	CONSTRAINT "threads_account_promotion_ratio_range" CHECK ("threads_account"."promotion_ratio_percent" BETWEEN 0 AND 100),
	CONSTRAINT "threads_account_reconnect_hint_check" CHECK ("threads_account"."reconnect_hint" IS NULL OR "threads_account"."reconnect_hint" = 'short_lived_token'),
	CONSTRAINT "threads_account_name_length" CHECK (char_length("threads_account"."name") BETWEEN 1 AND 50),
	CONSTRAINT "threads_account_prompt_post_count_range" CHECK ("threads_account"."prompt_post_count" BETWEEN 1 AND 50),
	CONSTRAINT "threads_account_core_rules_length" CHECK (char_length("threads_account"."core_rules") <= 2000),
	CONSTRAINT "threads_account_post_length_target_range" CHECK ("threads_account"."post_length_target" BETWEEN 50 AND 500),
	CONSTRAINT "threads_account_post_kind_length_range" CHECK ("threads_account"."short_length" BETWEEN 10 AND "threads_account"."post_length_target" AND "threads_account"."medium_length" BETWEEN 10 AND "threads_account"."post_length_target" AND "threads_account"."long_length" BETWEEN 10 AND "threads_account"."post_length_target"),
	CONSTRAINT "threads_account_post_kind_ratio_range" CHECK ("threads_account"."short_ratio" BETWEEN 0 AND 100 AND "threads_account"."medium_ratio" BETWEEN 0 AND 100 AND "threads_account"."long_ratio" BETWEEN 0 AND 100 AND "threads_account"."short_ratio" + "threads_account"."medium_ratio" + "threads_account"."long_ratio" = 100)
);
--> statement-breakpoint
CREATE TABLE "threads_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"item_count" integer DEFAULT 1 NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_activity_log_kind_check" CHECK ("threads_activity_log"."kind" in ('review', 'draft', 'content', 'settings', 'autopost')),
	CONSTRAINT "threads_activity_log_summary_length" CHECK (char_length("threads_activity_log"."summary") <= 100)
);
--> statement-breakpoint
CREATE TABLE "threads_analysis_setting" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"trends_in_prompt" boolean DEFAULT true NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_analysis_setting_themes_array" CHECK (jsonb_typeof("threads_analysis_setting"."themes") = 'array' AND jsonb_array_length("threads_analysis_setting"."themes") <= 10)
);
--> statement-breakpoint
CREATE TABLE "threads_connection" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"access_token_ciphertext" "bytea" NOT NULL,
	"access_token_iv" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone NOT NULL,
	"recheck_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads_deletion_request" (
	"confirmation_code" text PRIMARY KEY NOT NULL,
	"request_fingerprint" text NOT NULL,
	"threads_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"last_attempted_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "threads_deletion_request_status_check" CHECK ("threads_deletion_request"."status" in ('pending', 'completed', 'failed')),
	CONSTRAINT "threads_deletion_request_completed" CHECK (("threads_deletion_request"."status" = 'completed') = ("threads_deletion_request"."completed_at" IS NOT NULL)
        AND ("threads_deletion_request"."status" <> 'completed' OR "threads_deletion_request"."threads_user_id" IS NULL)),
	CONSTRAINT "threads_deletion_request_code_format" CHECK ("threads_deletion_request"."confirmation_code" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "threads_draft_batch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"draft_count" smallint NOT NULL,
	"delimiter_found" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_draft_batch_draft_count_range" CHECK ("threads_draft_batch"."draft_count" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "threads_follower_snapshot" (
	"threads_account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"followers_count" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "threads_follower_snapshot_threads_account_id_snapshot_date_pk" PRIMARY KEY("threads_account_id","snapshot_date"),
	CONSTRAINT "threads_follower_snapshot_count_nonnegative" CHECK ("threads_follower_snapshot"."followers_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "threads_media_default" (
	"threads_account_id" uuid NOT NULL,
	"media" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_media_default_threads_account_id_media_pk" PRIMARY KEY("threads_account_id","media"),
	CONSTRAINT "threads_media_default_media_check" CHECK ("threads_media_default"."media" in ('kokuchpro', 'peatix', 'tsunagate', 'jmty', 'youtrust'))
);
--> statement-breakpoint
CREATE TABLE "threads_mention_person" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"username" text NOT NULL,
	"label" text NOT NULL,
	"always" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_mention_person_username_valid" CHECK ("threads_mention_person"."username" ~ '^[a-z0-9._]{1,30}$'),
	CONSTRAINT "threads_mention_person_label_length" CHECK (char_length("threads_mention_person"."label") BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "threads_mention_setting" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"delay_minutes" integer DEFAULT 30 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_mention_setting_message_length" CHECK (char_length("threads_mention_setting"."message") <= 100),
	CONSTRAINT "threads_mention_setting_delay_valid" CHECK ("threads_mention_setting"."delay_minutes" IN (10, 30, 60, 180, 360, 720, 1440))
);
--> statement-breakpoint
CREATE TABLE "threads_ng_word" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"word" text NOT NULL,
	"normalized" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "threads_ng_word_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_ng_word_word_length" CHECK (char_length("threads_ng_word"."word") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "threads_oauth_state" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_oauth_state_hash_format" CHECK ("threads_oauth_state"."state_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "threads_post_classification" (
	"draft_id" uuid PRIMARY KEY NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"opening_type" text NOT NULL,
	"theme_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_post_classification_opening_type_check" CHECK ("threads_post_classification"."opening_type" in ('aruaru', 'question', 'assertion', 'story', 'number', 'announce', 'other')),
	CONSTRAINT "threads_post_classification_source_check" CHECK ("threads_post_classification"."source" in ('ai', 'manual')),
	CONSTRAINT "threads_post_classification_theme_id_format" CHECK ("threads_post_classification"."theme_id" IS NULL OR "threads_post_classification"."theme_id" ~ '^t[0-9a-z]{1,8}$')
);
--> statement-breakpoint
CREATE TABLE "threads_post_draft" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reject_reasons" text[],
	"reject_note" text,
	"prioritized_at" timestamp with time zone,
	"carryover_attempt_id" uuid,
	"published_at" timestamp with time zone,
	"threads_media_id" text,
	"threads_permalink" text,
	"permalink_checked_at" timestamp with time zone,
	"publish_failed_at" timestamp with time zone,
	"publish_error" text,
	"published_slot_minute" smallint,
	"published_carryover" boolean,
	"published_prioritized" boolean,
	"blocked_at" timestamp with time zone,
	"blocked_reason" text,
	"blocked_words" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_post_draft_position_range" CHECK ("threads_post_draft"."position" >= 0 AND "threads_post_draft"."position" < 50),
	CONSTRAINT "threads_post_draft_body_length" CHECK (char_length("threads_post_draft"."body") BETWEEN 1 AND 2000),
	CONSTRAINT "threads_post_draft_reject_note_length" CHECK (char_length("threads_post_draft"."reject_note") <= 200),
	CONSTRAINT "threads_post_draft_status_check_v2" CHECK ("threads_post_draft"."status" in ('needs_review', 'approved', 'rejected', 'publishing', 'published', 'publish_failed')),
	CONSTRAINT "threads_post_draft_publish_error_check" CHECK ("threads_post_draft"."publish_error" IS NULL OR "threads_post_draft"."publish_error" in ('network', 'threads_server', 'invalid_request', 'container_error', 'unknown')),
	CONSTRAINT "threads_post_draft_blocked_reason_check" CHECK ("threads_post_draft"."blocked_reason" IS NULL OR "threads_post_draft"."blocked_reason" in ('ng_word', 'over_threads_limit')),
	CONSTRAINT "threads_post_draft_blocked_state" CHECK (("threads_post_draft"."blocked_at" IS NULL AND "threads_post_draft"."blocked_reason" IS NULL AND "threads_post_draft"."blocked_words" IS NULL)
        OR ("threads_post_draft"."status" = 'needs_review' AND "threads_post_draft"."blocked_at" IS NOT NULL AND "threads_post_draft"."blocked_reason" IS NOT NULL)),
	CONSTRAINT "threads_post_draft_published_slot_minute_range" CHECK ("threads_post_draft"."published_slot_minute" IS NULL OR "threads_post_draft"."published_slot_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "threads_post_draft_threads_media_state" CHECK (("threads_post_draft"."threads_media_id" IS NULL AND "threads_post_draft"."threads_permalink" IS NULL) OR "threads_post_draft"."status" = 'published'),
	CONSTRAINT "threads_post_draft_threads_permalink_length" CHECK (char_length("threads_post_draft"."threads_permalink") <= 2000),
	CONSTRAINT "threads_post_draft_reject_reasons_valid" CHECK ("threads_post_draft"."reject_reasons" IS NULL OR (cardinality("threads_post_draft"."reject_reasons") >= 1
        AND array_position("threads_post_draft"."reject_reasons", NULL) IS NULL
        AND "threads_post_draft"."reject_reasons" <@ ARRAY['similar', 'tone', 'thin', 'inaccurate', 'too_promotional', 'policy']::text[])),
	CONSTRAINT "threads_post_draft_review_state_v2" CHECK (("threads_post_draft"."status" = 'needs_review' AND "threads_post_draft"."reviewed_at" IS NULL AND "threads_post_draft"."reject_reasons" IS NULL AND "threads_post_draft"."reject_note" IS NULL
          AND "threads_post_draft"."prioritized_at" IS NULL AND "threads_post_draft"."carryover_attempt_id" IS NULL
          AND "threads_post_draft"."published_at" IS NULL AND "threads_post_draft"."publish_failed_at" IS NULL AND "threads_post_draft"."publish_error" IS NULL)
        OR ("threads_post_draft"."status" IN ('approved', 'publishing') AND "threads_post_draft"."reviewed_at" IS NOT NULL AND "threads_post_draft"."reject_reasons" IS NULL AND "threads_post_draft"."reject_note" IS NULL
          AND "threads_post_draft"."published_at" IS NULL AND "threads_post_draft"."publish_failed_at" IS NULL AND "threads_post_draft"."publish_error" IS NULL)
        OR ("threads_post_draft"."status" = 'rejected' AND "threads_post_draft"."reviewed_at" IS NOT NULL
          AND (coalesce(cardinality("threads_post_draft"."reject_reasons"), 0) >= 1 OR coalesce(btrim("threads_post_draft"."reject_note"), '') <> '')
          AND "threads_post_draft"."prioritized_at" IS NULL AND "threads_post_draft"."carryover_attempt_id" IS NULL
          AND "threads_post_draft"."published_at" IS NULL AND "threads_post_draft"."publish_failed_at" IS NULL AND "threads_post_draft"."publish_error" IS NULL)
        OR ("threads_post_draft"."status" = 'published' AND "threads_post_draft"."reviewed_at" IS NOT NULL AND "threads_post_draft"."reject_reasons" IS NULL AND "threads_post_draft"."reject_note" IS NULL
          AND "threads_post_draft"."prioritized_at" IS NULL AND "threads_post_draft"."carryover_attempt_id" IS NULL
          AND "threads_post_draft"."published_at" IS NOT NULL AND "threads_post_draft"."publish_failed_at" IS NULL AND "threads_post_draft"."publish_error" IS NULL)
        OR ("threads_post_draft"."status" = 'publish_failed' AND "threads_post_draft"."reviewed_at" IS NOT NULL AND "threads_post_draft"."reject_reasons" IS NULL AND "threads_post_draft"."reject_note" IS NULL
          AND "threads_post_draft"."prioritized_at" IS NULL AND "threads_post_draft"."carryover_attempt_id" IS NULL
          AND "threads_post_draft"."published_at" IS NULL AND "threads_post_draft"."publish_failed_at" IS NOT NULL AND "threads_post_draft"."publish_error" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "threads_post_mention" (
	"draft_id" uuid PRIMARY KEY NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"usernames" text[] NOT NULL,
	"text" text NOT NULL,
	"delay_minutes" integer,
	"send_after" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"container_id" text,
	"publish_requested_at" timestamp with time zone,
	"reply_media_id" text,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_post_mention_state_check" CHECK ("threads_post_mention"."state" in ('pending', 'sent', 'canceled', 'failed')),
	CONSTRAINT "threads_post_mention_failure_reason_check" CHECK ("threads_post_mention"."failure_reason" IS NULL OR "threads_post_mention"."failure_reason" in ('not_found', 'post_failed', 'no_permission', 'expired', 'ng_word', 'limit', 'error')),
	CONSTRAINT "threads_post_mention_failed_has_reason" CHECK (("threads_post_mention"."state" = 'failed') = ("threads_post_mention"."failure_reason" IS NOT NULL)),
	CONSTRAINT "threads_post_mention_sent_has_time" CHECK (("threads_post_mention"."state" = 'sent') = ("threads_post_mention"."sent_at" IS NOT NULL)),
	CONSTRAINT "threads_post_mention_when" CHECK ("threads_post_mention"."delay_minutes" IS NOT NULL OR "threads_post_mention"."send_after" IS NOT NULL),
	CONSTRAINT "threads_post_mention_usernames_count" CHECK (cardinality("threads_post_mention"."usernames") BETWEEN 1 AND 5),
	CONSTRAINT "threads_post_mention_text_length" CHECK (char_length("threads_post_mention"."text") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "threads_post_metric" (
	"draft_id" uuid PRIMARY KEY NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"state" text NOT NULL,
	"views" integer,
	"likes" integer,
	"replies" integer,
	"reposts" integer,
	"quotes" integer,
	"shares" integer,
	"last_fetched_at" timestamp with time zone,
	"last_elapsed_minutes" integer,
	"last_kind" text,
	"confirmed_at" timestamp with time zone,
	"unmeasurable_reason" text,
	"judgment" text,
	"judgment_ratio" double precision,
	"judgment_baseline" double precision,
	"judged_at" timestamp with time zone,
	"feedback_memo" text,
	"include_in_prompt" boolean DEFAULT true NOT NULL,
	"feedback_version" integer DEFAULT 1 NOT NULL,
	"feedback_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_post_metric_state_check" CHECK ("threads_post_metric"."state" in ('updating', 'confirmed', 'late_confirmed', 'unmeasurable')),
	CONSTRAINT "threads_post_metric_last_kind_check" CHECK ("threads_post_metric"."last_kind" IS NULL OR "threads_post_metric"."last_kind" in ('h24', 'd3', 'd7', 'late')),
	CONSTRAINT "threads_post_metric_unmeasurable_reason" CHECK (("threads_post_metric"."state" = 'unmeasurable') = ("threads_post_metric"."unmeasurable_reason" IS NOT NULL)
        AND ("threads_post_metric"."unmeasurable_reason" IS NULL OR "threads_post_metric"."unmeasurable_reason" in ('not_found', 'no_media_id'))),
	CONSTRAINT "threads_post_metric_confirmed_at" CHECK (("threads_post_metric"."state" IN ('confirmed', 'late_confirmed')) = ("threads_post_metric"."confirmed_at" IS NOT NULL)),
	CONSTRAINT "threads_post_metric_judgment" CHECK ("threads_post_metric"."judgment" IS NULL OR ("threads_post_metric"."judgment" in ('good', 'normal', 'poor')
        AND "threads_post_metric"."state" IN ('confirmed', 'late_confirmed') AND "threads_post_metric"."judgment_ratio" IS NOT NULL AND "threads_post_metric"."judgment_baseline" > 0)),
	CONSTRAINT "threads_post_metric_feedback_memo_length" CHECK (char_length("threads_post_metric"."feedback_memo") <= 200),
	CONSTRAINT "threads_post_metric_counts_nonnegative" CHECK (coalesce("threads_post_metric"."views", 0) >= 0 AND coalesce("threads_post_metric"."likes", 0) >= 0 AND coalesce("threads_post_metric"."replies", 0) >= 0
        AND coalesce("threads_post_metric"."reposts", 0) >= 0 AND coalesce("threads_post_metric"."quotes", 0) >= 0 AND coalesce("threads_post_metric"."shares", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "threads_post_metric_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"draft_id" uuid NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"elapsed_minutes" integer NOT NULL,
	"views" integer,
	"likes" integer,
	"replies" integer,
	"reposts" integer,
	"quotes" integer,
	"shares" integer,
	CONSTRAINT "threads_post_metric_snapshot_kind_check" CHECK ("threads_post_metric_snapshot"."kind" in ('h24', 'd3', 'd7', 'late')),
	CONSTRAINT "threads_post_metric_snapshot_method_check" CHECK ("threads_post_metric_snapshot"."method" in ('slot', 'daily'))
);
--> statement-breakpoint
CREATE TABLE "threads_posting_schedule" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"slot_minutes" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"jitter" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_until" timestamp with time zone,
	"blocked_notice_seen_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_posting_schedule_slot_count" CHECK (cardinality("threads_posting_schedule"."slot_minutes") <= 10),
	CONSTRAINT "threads_posting_schedule_slot_range" CHECK (0 <= ALL("threads_posting_schedule"."slot_minutes") AND 1439 >= ALL("threads_posting_schedule"."slot_minutes")),
	CONSTRAINT "threads_posting_schedule_enabled_requires_slots" CHECK (NOT "threads_posting_schedule"."enabled" OR cardinality("threads_posting_schedule"."slot_minutes") >= 1)
);
--> statement-breakpoint
CREATE TABLE "threads_promotion" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"target_location" text DEFAULT '' NOT NULL,
	"target_persona" text DEFAULT '' NOT NULL,
	"target_age_range" text DEFAULT '' NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"linked_url" text DEFAULT '' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_until" date,
	"event" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_promotion_title_length" CHECK (char_length("threads_promotion"."title") BETWEEN 1 AND 100),
	CONSTRAINT "threads_promotion_content_length" CHECK (char_length("threads_promotion"."content") BETWEEN 1 AND 2000),
	CONSTRAINT "threads_promotion_short_text_length" CHECK (char_length("threads_promotion"."target_location") <= 100 AND char_length("threads_promotion"."target_persona") <= 100
        AND char_length("threads_promotion"."target_age_range") <= 100 AND char_length("threads_promotion"."cta") <= 100),
	CONSTRAINT "threads_promotion_linked_url_length" CHECK (char_length("threads_promotion"."linked_url") <= 2000),
	CONSTRAINT "threads_promotion_priority_range" CHECK ("threads_promotion"."priority" BETWEEN 0 AND 100),
	CONSTRAINT "threads_promotion_status_check" CHECK ("threads_promotion"."status" in ('active', 'paused', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "threads_promotion_listing" (
	"promotion_id" uuid NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"media" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"posted_url" text,
	"fields" jsonb,
	"fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_style" text DEFAULT 'illustration' NOT NULL,
	"source_version" integer,
	"generated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_promotion_listing_promotion_id_media_pk" PRIMARY KEY("promotion_id","media"),
	CONSTRAINT "threads_promotion_listing_media_check" CHECK ("threads_promotion_listing"."media" in ('kokuchpro', 'peatix', 'tsunagate', 'jmty', 'youtrust')),
	CONSTRAINT "threads_promotion_listing_status_check" CHECK ("threads_promotion_listing"."status" in ('not_started', 'drafting', 'posted', 'stopped')),
	CONSTRAINT "threads_promotion_listing_image_style_check" CHECK ("threads_promotion_listing"."image_style" in ('illustration', 'photo')),
	CONSTRAINT "threads_promotion_listing_posted_url_valid" CHECK ("threads_promotion_listing"."posted_url" IS NULL OR ("threads_promotion_listing"."posted_url" ~ '^https?://' AND char_length("threads_promotion_listing"."posted_url") <= 2000))
);
--> statement-breakpoint
CREATE TABLE "threads_publish_attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"slot_date" date NOT NULL,
	"slot_minute" smallint NOT NULL,
	"draft_id" uuid,
	"is_carryover" boolean DEFAULT false NOT NULL,
	"state" text NOT NULL,
	"skip_reason" text,
	"retry_count" smallint DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"container_id" text,
	"publish_requested_at" timestamp with time zone,
	"last_error" text,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_publish_attempt_state_check" CHECK ("threads_publish_attempt"."state" in ('in_progress', 'retry_wait', 'succeeded', 'failed', 'carried_over', 'skipped')),
	CONSTRAINT "threads_publish_attempt_slot_minute_range" CHECK ("threads_publish_attempt"."slot_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "threads_publish_attempt_retry_count_range" CHECK ("threads_publish_attempt"."retry_count" BETWEEN 0 AND 3),
	CONSTRAINT "threads_publish_attempt_skip_state" CHECK (("threads_publish_attempt"."state" = 'skipped' AND "threads_publish_attempt"."skip_reason" IS NOT NULL AND "threads_publish_attempt"."draft_id" IS NULL)
        OR ("threads_publish_attempt"."state" <> 'skipped' AND "threads_publish_attempt"."skip_reason" IS NULL)),
	CONSTRAINT "threads_publish_attempt_skip_reason_check" CHECK ("threads_publish_attempt"."skip_reason" IS NULL OR "threads_publish_attempt"."skip_reason" in ('no_drafts', 'needs_reconnect', 'rate_limited', 'daily_limit', 'auto_post_off')),
	CONSTRAINT "threads_publish_attempt_last_error_check" CHECK ("threads_publish_attempt"."last_error" IS NULL OR "threads_publish_attempt"."last_error" in ('network', 'threads_server', 'invalid_request', 'container_error', 'unknown')),
	CONSTRAINT "threads_publish_attempt_retry_wait_state" CHECK ("threads_publish_attempt"."state" <> 'retry_wait' OR "threads_publish_attempt"."next_retry_at" IS NOT NULL),
	CONSTRAINT "threads_publish_attempt_pending_has_draft" CHECK ("threads_publish_attempt"."state" NOT IN ('in_progress', 'retry_wait') OR "threads_publish_attempt"."draft_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "threads_reference_post" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"body" text NOT NULL,
	"keyword" text DEFAULT '' NOT NULL,
	"post_url" text DEFAULT '' NOT NULL,
	"why_good" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT 'threads' NOT NULL,
	"posted_date_mode" text DEFAULT 'unknown' NOT NULL,
	"posted_date" date,
	"metric_likes" integer,
	"metric_replies" integer,
	"metric_views" integer,
	"metric_saves" integer,
	"metric_reposts" integer,
	"metric_followers" integer,
	"author" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_reference_post_body_length" CHECK (char_length("threads_reference_post"."body") BETWEEN 1 AND 2000),
	CONSTRAINT "threads_reference_post_text_length" CHECK (char_length("threads_reference_post"."keyword") <= 100 AND char_length("threads_reference_post"."post_url") <= 2000 AND char_length("threads_reference_post"."why_good") <= 2000
        AND char_length("threads_reference_post"."author") <= 100 AND char_length("threads_reference_post"."memo") <= 500),
	CONSTRAINT "threads_reference_post_platform_check" CHECK ("threads_reference_post"."platform" IN ('threads', 'instagram', 'tiktok', 'x', 'other')),
	CONSTRAINT "threads_reference_post_posted_date_mode_check" CHECK ("threads_reference_post"."posted_date_mode" IN ('exact', 'week', 'month', '3months', 'unknown')),
	CONSTRAINT "threads_reference_post_posted_date_matches_mode" CHECK (("threads_reference_post"."posted_date_mode" = 'exact') = ("threads_reference_post"."posted_date" IS NOT NULL)),
	CONSTRAINT "threads_reference_post_metrics_nonnegative" CHECK (coalesce("threads_reference_post"."metric_likes", 0) >= 0 AND coalesce("threads_reference_post"."metric_replies", 0) >= 0 AND coalesce("threads_reference_post"."metric_views", 0) >= 0
        AND coalesce("threads_reference_post"."metric_saves", 0) >= 0 AND coalesce("threads_reference_post"."metric_reposts", 0) >= 0 AND coalesce("threads_reference_post"."metric_followers", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "threads_research_keyword" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"threads_account_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"keyword_normalized" text NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_research_keyword_keyword_length" CHECK (char_length("threads_research_keyword"."keyword") BETWEEN 1 AND 100),
	CONSTRAINT "threads_research_keyword_purpose_length" CHECK (char_length("threads_research_keyword"."purpose") <= 100)
);
--> statement-breakpoint
CREATE TABLE "threads_strategy" (
	"threads_account_id" uuid PRIMARY KEY NOT NULL,
	"purpose_origin" text DEFAULT '' NOT NULL,
	"purpose_self" text DEFAULT '' NOT NULL,
	"purpose_others" text DEFAULT '' NOT NULL,
	"purpose_future" text DEFAULT '' NOT NULL,
	"purpose_stance" text DEFAULT '' NOT NULL,
	"activity_axis" text DEFAULT '' NOT NULL,
	"final_action" text DEFAULT '' NOT NULL,
	"target_persona" text DEFAULT '' NOT NULL,
	"real_worries" text DEFAULT '' NOT NULL,
	"desired_self_image" text DEFAULT '' NOT NULL,
	"perceived_image" text DEFAULT '' NOT NULL,
	"content_theme_mix" text DEFAULT '' NOT NULL,
	"anti_persona" text DEFAULT '' NOT NULL,
	"benchmark_accounts" text DEFAULT '' NOT NULL,
	"funnel_design" text DEFAULT '' NOT NULL,
	"post_genres" text DEFAULT '' NOT NULL,
	"dm_reply_template" text DEFAULT '' NOT NULL,
	"inquiry_quality_tips" text DEFAULT '' NOT NULL,
	"tone_notes" text DEFAULT '' NOT NULL,
	"differentiation" text DEFAULT '' NOT NULL,
	"success_metrics" text DEFAULT '' NOT NULL,
	"profile_bio_draft" text DEFAULT '' NOT NULL,
	"pinned_post_draft_1" text DEFAULT '' NOT NULL,
	"pinned_post_draft_2" text DEFAULT '' NOT NULL,
	"pinned_post_draft_3" text DEFAULT '' NOT NULL,
	"tone_preset" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_strategy_tone_preset_check" CHECK ("threads_strategy"."tone_preset" in ('energetic_casual', 'polite_warm', 'formal', 'casual_frank', 'introspective_calm', 'passionate', 'humorous'))
);
--> statement-breakpoint
CREATE TABLE "threads_token_check_failure" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "threads_token_check_failure_reason_check" CHECK ("threads_token_check_failure"."reason" in ('pending', 'invalid_format', 'invalid', 'short_lived', 'account_mismatch'))
);
--> statement-breakpoint
ALTER TABLE "threads_account" ADD CONSTRAINT "threads_account_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_activity_log" ADD CONSTRAINT "threads_activity_log_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_analysis_setting" ADD CONSTRAINT "threads_analysis_setting_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_connection" ADD CONSTRAINT "threads_connection_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_draft_batch" ADD CONSTRAINT "threads_draft_batch_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_follower_snapshot" ADD CONSTRAINT "threads_follower_snapshot_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_media_default" ADD CONSTRAINT "threads_media_default_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_mention_person" ADD CONSTRAINT "threads_mention_person_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_mention_setting" ADD CONSTRAINT "threads_mention_setting_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_ng_word" ADD CONSTRAINT "threads_ng_word_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_oauth_state" ADD CONSTRAINT "threads_oauth_state_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_oauth_state" ADD CONSTRAINT "threads_oauth_state_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_classification" ADD CONSTRAINT "threads_post_classification_draft_id_threads_post_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."threads_post_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_classification" ADD CONSTRAINT "threads_post_classification_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_batch_id_threads_draft_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."threads_draft_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_draft" ADD CONSTRAINT "threads_post_draft_carryover_attempt_id_threads_publish_attempt_id_fk" FOREIGN KEY ("carryover_attempt_id") REFERENCES "public"."threads_publish_attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_mention" ADD CONSTRAINT "threads_post_mention_draft_id_threads_post_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."threads_post_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_mention" ADD CONSTRAINT "threads_post_mention_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_metric" ADD CONSTRAINT "threads_post_metric_draft_id_threads_post_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."threads_post_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_metric" ADD CONSTRAINT "threads_post_metric_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_metric_snapshot" ADD CONSTRAINT "threads_post_metric_snapshot_draft_id_threads_post_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."threads_post_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_post_metric_snapshot" ADD CONSTRAINT "threads_post_metric_snapshot_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_posting_schedule" ADD CONSTRAINT "threads_posting_schedule_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_promotion" ADD CONSTRAINT "threads_promotion_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_promotion_listing" ADD CONSTRAINT "threads_promotion_listing_promotion_id_threads_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."threads_promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_promotion_listing" ADD CONSTRAINT "threads_promotion_listing_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_publish_attempt" ADD CONSTRAINT "threads_publish_attempt_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_publish_attempt" ADD CONSTRAINT "threads_publish_attempt_draft_id_threads_post_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."threads_post_draft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_reference_post" ADD CONSTRAINT "threads_reference_post_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_research_keyword" ADD CONSTRAINT "threads_research_keyword_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_strategy" ADD CONSTRAINT "threads_strategy_threads_account_id_threads_account_id_fk" FOREIGN KEY ("threads_account_id") REFERENCES "public"."threads_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_token_check_failure" ADD CONSTRAINT "threads_token_check_failure_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_account_account_id_idx" ON "threads_account" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_account_threads_user_id_unique" ON "threads_account" USING btree ("threads_user_id");--> statement-breakpoint
CREATE INDEX "threads_activity_log_threads_account_id_created_at_idx" ON "threads_activity_log" USING btree ("threads_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_activity_log_created_at_idx" ON "threads_activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "threads_connection_recheck_at_idx" ON "threads_connection" USING btree ("recheck_at") WHERE "threads_connection"."recheck_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "threads_deletion_request_request_fingerprint_unique" ON "threads_deletion_request" USING btree ("request_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_draft_batch_threads_account_id_client_request_id_unique" ON "threads_draft_batch" USING btree ("threads_account_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_mention_person_threads_account_id_username_unique" ON "threads_mention_person" USING btree ("threads_account_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_ng_word_threads_account_id_normalized_unique" ON "threads_ng_word" USING btree ("threads_account_id","normalized");--> statement-breakpoint
CREATE INDEX "threads_oauth_state_expires_at_idx" ON "threads_oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "threads_post_classification_threads_account_id_idx" ON "threads_post_classification" USING btree ("threads_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_post_draft_batch_id_position_unique" ON "threads_post_draft" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "threads_post_draft_threads_account_id_status_idx" ON "threads_post_draft" USING btree ("threads_account_id","status","reviewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "threads_post_draft_queue_idx" ON "threads_post_draft" USING btree ("threads_account_id","status","prioritized_at" DESC NULLS LAST,"reviewed_at","id");--> statement-breakpoint
CREATE INDEX "threads_post_draft_published_idx" ON "threads_post_draft" USING btree ("threads_account_id","status","published_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "threads_post_mention_pending_idx" ON "threads_post_mention" USING btree ("threads_account_id","state") WHERE "threads_post_mention"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "threads_post_mention_threads_account_id_sent_at_idx" ON "threads_post_mention" USING btree ("threads_account_id","sent_at");--> statement-breakpoint
CREATE INDEX "threads_post_metric_threads_account_id_state_idx" ON "threads_post_metric" USING btree ("threads_account_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_post_metric_snapshot_draft_id_kind_unique" ON "threads_post_metric_snapshot" USING btree ("draft_id","kind");--> statement-breakpoint
CREATE INDEX "threads_post_metric_snapshot_threads_account_id_fetched_at_idx" ON "threads_post_metric_snapshot" USING btree ("threads_account_id","fetched_at");--> statement-breakpoint
CREATE INDEX "threads_posting_schedule_enabled_idx" ON "threads_posting_schedule" USING btree ("enabled") WHERE "threads_posting_schedule"."enabled";--> statement-breakpoint
CREATE INDEX "threads_promotion_threads_account_id_idx" ON "threads_promotion" USING btree ("threads_account_id");--> statement-breakpoint
CREATE INDEX "threads_promotion_listing_threads_account_id_idx" ON "threads_promotion_listing" USING btree ("threads_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_publish_attempt_threads_account_id_slot_at_unique" ON "threads_publish_attempt" USING btree ("threads_account_id","slot_at");--> statement-breakpoint
CREATE INDEX "threads_publish_attempt_pending_idx" ON "threads_publish_attempt" USING btree ("state","next_retry_at") WHERE "threads_publish_attempt"."state" IN ('in_progress', 'retry_wait');--> statement-breakpoint
CREATE INDEX "threads_publish_attempt_threads_account_id_slot_date_idx" ON "threads_publish_attempt" USING btree ("threads_account_id","slot_date");--> statement-breakpoint
CREATE INDEX "threads_reference_post_threads_account_id_created_at_idx" ON "threads_reference_post" USING btree ("threads_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "threads_research_keyword_threads_account_id_keyword_normalized_unique" ON "threads_research_keyword" USING btree ("threads_account_id","keyword_normalized");--> statement-breakpoint
CREATE INDEX "threads_token_check_failure_account_id_failed_at_idx" ON "threads_token_check_failure" USING btree ("account_id","failed_at");