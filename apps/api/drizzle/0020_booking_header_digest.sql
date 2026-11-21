-- booking-001（Codex のレビュー）：CSV の列の対応の一意の索引を、見出しの並びそのものから SHA-256 へ移す。
-- 見出しの並び（最大50列 × 100文字の JSON）は B-tree の索引の1行の上限（約 2.7KB）を超えうるため。
-- drizzle-kit の生成のあと、手で並べ直した：空を許す列を足す → 今ある行を埋める → NOT NULL → 新しい索引 → 古い索引を消す。
-- 前の版（本番）は予約の表を使っていない（0015〜0019 と一緒に出す）ので、古い索引を消しても戻す先は困らない。
ALTER TABLE "booking_import_mapping" ADD COLUMN "header_digest" text;--> statement-breakpoint
UPDATE "booking_import_mapping" SET "header_digest" = encode(sha256(convert_to("header_key", 'UTF8')), 'hex');--> statement-breakpoint
ALTER TABLE "booking_import_mapping" ALTER COLUMN "header_digest" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_import_mapping_owner_account_id_header_digest_unique" ON "booking_import_mapping" USING btree ("owner_account_id","header_digest");--> statement-breakpoint
DROP INDEX "booking_import_mapping_owner_account_id_header_key_unique";
