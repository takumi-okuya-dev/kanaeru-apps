// 外部メディアの掲載文の読み出しと保存（threads-008。めぐるの external-media/external-media-service.ts を写した）。
// 媒体の決まり（組み立て・自動の直し）は約束の media だけを使う（決まった計算。アプリの中で AI を呼ばない。AD-20）。
// 掲載文は宣伝とは別に保存し、直しても宣伝は変わらない。ルールのチェックは画面がその場で計算する（保存しない）。
import {
  MEDIA,
  MEDIA_DEFINITIONS,
  THREADS_ERRORS,
  buildListing,
  refixListing,
} from "@workspace/contracts/threads";
import type {
  ExternalMediaList,
  Listing,
  ListingDetail,
  ListingSource,
  ListingUpdateInput,
  ListingValues,
  Media,
  MediaDefaultsInput,
} from "@workspace/contracts/threads";
import { and, eq, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { toPromotion } from "./research.ts";
import { threadsMediaDefault, threadsPromotion, threadsPromotionListing } from "./schema.ts";

/** 宣伝の行。 */
type PromotionRow = typeof threadsPromotion.$inferSelect;

/** 掲載文の行。 */
type ListingRow = typeof threadsPromotionListing.$inferSelect;

/** 欄の上限がないときの上限（文字）。 */
const FIELD_MAX_DEFAULT = 15000;

/**
 * 入力の誤り（欄のそばに出す）。
 * @param path 欄
 * @param message 文
 * @returns エラー
 */
function invalid(path: string, message: string): AppError {
  return new AppError("INVALID_INPUT", { fields: [{ path, message }] });
}

/**
 * 掲載文を作る材料（宣伝・イベントの情報・媒体の既定値）。
 * @param row 宣伝の行
 * @param defaults 媒体の既定値
 * @returns 材料
 */
export function sourceOf(row: PromotionRow, defaults: ListingValues): ListingSource {
  return {
    title: row.title,
    content: row.content,
    targetLocation: row.targetLocation,
    targetPersona: row.targetPersona,
    targetAgeRange: row.targetAgeRange,
    cta: row.cta,
    linkedUrl: row.linkedUrl,
    event: row.event ?? null,
    defaults,
  };
}

/**
 * 外部メディアの一覧（宣伝と、行のある媒体の状況）。開催日時の近い順（終わったものは後ろ・日時のないものは最後）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param now 今
 * @returns 一覧
 */
export async function listExternalMedia(
  db: Executor,
  threadsAccountId: string,
  now: Date,
): Promise<ExternalMediaList> {
  const [rows, listings] = await Promise.all([
    db
      .select()
      .from(threadsPromotion)
      .where(eq(threadsPromotion.threadsAccountId, threadsAccountId)),
    db
      .select({
        promotionId: threadsPromotionListing.promotionId,
        media: threadsPromotionListing.media,
        status: threadsPromotionListing.status,
        postedUrl: threadsPromotionListing.postedUrl,
      })
      .from(threadsPromotionListing)
      .where(eq(threadsPromotionListing.threadsAccountId, threadsAccountId)),
  ]);
  const nowLocal = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 16);
  const rank = (row: PromotionRow) => (!row.event ? 2 : row.event.startAt >= nowLocal ? 0 : 1);
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.event?.startAt ?? "").localeCompare(b.event?.startAt ?? "") * (rank(a) === 1 ? -1 : 1),
  );
  return {
    promotions: rows.map((row) => ({
      id: row.id,
      title: row.title,
      event: row.event ?? null,
      listings: MEDIA.flatMap((media) => {
        const found = listings.find((item) => item.promotionId === row.id && item.media === media);
        return found ? [{ media, status: found.status, postedUrl: found.postedUrl }] : [];
      }),
    })),
  };
}

/**
 * 媒体の既定値（なければ空・版 0）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param media 媒体
 * @returns 既定値と版
 */
async function defaultsOf(db: Executor, threadsAccountId: string, media: Media) {
  const [row] = await db
    .select()
    .from(threadsMediaDefault)
    .where(
      and(
        eq(threadsMediaDefault.threadsAccountId, threadsAccountId),
        eq(threadsMediaDefault.media, media),
      ),
    );
  return { values: row?.values ?? {}, version: row?.version ?? 0 };
}

/**
 * 宣伝と掲載文の行と既定値を読む。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @returns 宣伝の行・掲載文の行（なければ undefined）・既定値
 * @throws {AppError} その運用アカウントの宣伝でないとき（NOT_FOUND）
 */
async function loadListing(
  db: Executor,
  threadsAccountId: string,
  promotionId: string,
  media: Media,
) {
  const [row] = await db
    .select({ promotion: threadsPromotion, listing: threadsPromotionListing })
    .from(threadsPromotion)
    .leftJoin(
      threadsPromotionListing,
      and(
        eq(threadsPromotionListing.promotionId, threadsPromotion.id),
        eq(threadsPromotionListing.media, media),
      ),
    )
    .where(
      and(
        eq(threadsPromotion.id, promotionId),
        eq(threadsPromotion.threadsAccountId, threadsAccountId),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND");
  const defaults = await defaultsOf(db, threadsAccountId, media);
  return { promotion: row.promotion, listing: row.listing ?? undefined, defaults: defaults.values };
}

/**
 * 掲載文の行を、返す形にする（行がなければ初めの値）。
 * @param row 掲載文の行
 * @returns 掲載文
 */
function toListing(row: ListingRow | undefined): Listing {
  return {
    status: row?.status ?? "not_started",
    postedUrl: row?.postedUrl ?? null,
    imageStyle: row?.imageStyle ?? "illustration",
    fields: row?.fields ?? null,
    fixes: row?.fixes ?? [],
    generatedAt: row?.generatedAt?.toISOString() ?? null,
    sourceVersion: row?.sourceVersion ?? null,
    version: row?.version ?? 0,
  };
}

/**
 * 掲載文の画面の中身。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @param now 今
 * @returns 宣伝・掲載文・既定値・宣伝が直されたか
 */
export async function getListingDetail(
  db: Executor,
  threadsAccountId: string,
  promotionId: string,
  media: Media,
  now: Date,
): Promise<ListingDetail> {
  const { promotion, listing, defaults } = await loadListing(
    db,
    threadsAccountId,
    promotionId,
    media,
  );
  return detailOf(promotion, listing, defaults, media, now);
}

/**
 * 応答の形にする。
 * @param promotion 宣伝の行
 * @param listing 掲載文の行
 * @param defaults 既定値
 * @param media 媒体
 * @param now 今
 * @returns 掲載文の画面の中身
 */
function detailOf(
  promotion: PromotionRow,
  listing: ListingRow | undefined,
  defaults: ListingValues,
  media: Media,
  now: Date,
): ListingDetail {
  return {
    promotion: toPromotion(promotion, now),
    media,
    listing: toListing(listing),
    defaults,
    sourceChanged:
      listing?.sourceVersion !== undefined &&
      listing.sourceVersion !== null &&
      listing.sourceVersion !== promotion.version,
  };
}

/**
 * 掲載文の行を、版を確かめてから書く（行がなければ作る）。
 * @param tx トランザクション
 * @param key 宣伝・運用アカウント・媒体
 * @param version 画面が持っている版（行がなければ 0）
 * @param values 書く値
 * @returns 書いた行
 * @throws {AppError} 版が合わないとき（THREADS_VERSION_CONFLICT）
 */
async function writeListing(
  tx: Executor,
  key: { promotionId: string; threadsAccountId: string; media: Media },
  version: number,
  values: Partial<typeof threadsPromotionListing.$inferInsert>,
): Promise<ListingRow> {
  const [row] =
    version === 0
      ? await tx
          .insert(threadsPromotionListing)
          .values({ ...key, ...values })
          .onConflictDoNothing()
          .returning()
      : await tx
          .update(threadsPromotionListing)
          .set({ ...values, version: sql`${threadsPromotionListing.version} + 1` })
          .where(
            and(
              eq(threadsPromotionListing.promotionId, key.promotionId),
              eq(threadsPromotionListing.media, key.media),
              eq(threadsPromotionListing.version, version),
            ),
          )
          .returning();
  if (!row) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
  return row;
}

/**
 * 掲載文を作る（作り直す）。状況が未着手なら作成中にする。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @param version 画面が持っている版
 * @param now 今
 * @returns 掲載文の画面の中身
 * @throws {AppError} イベントの情報がない（INVALID_INPUT）・版が合わない・ない
 */
export async function generateListing(
  db: Db,
  threadsAccountId: string,
  promotionId: string,
  media: Media,
  version: number,
  now: Date,
): Promise<ListingDetail> {
  return db.transaction(async (tx) => {
    const { promotion, listing, defaults } = await loadListing(
      tx,
      threadsAccountId,
      promotionId,
      media,
    );
    if (!promotion.event)
      throw invalid("event", "宣伝にイベントの情報（開催日時など）を入れてから作ってください。");
    const built = buildListing(media, sourceOf(promotion, defaults));
    const row = await writeListing(tx, { promotionId, threadsAccountId, media }, version, {
      fields: built.fields,
      fixes: built.fixes,
      generatedAt: now,
      sourceVersion: promotion.version,
      status: !listing || listing.status === "not_started" ? "drafting" : listing.status,
    });
    return detailOf(promotion, row, defaults, media, now);
  });
}

/**
 * 欄・状況・掲載 URL・画像の種類を保存する。欄を送ったときは、自動の直しをもう一度通す。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param promotionId 宣伝の ID
 * @param media 媒体
 * @param input 入力
 * @param now 今
 * @returns 掲載文の画面の中身
 * @throws {AppError} 知らない欄・上限を超える（INVALID_INPUT）・版が合わない・ない
 */
export async function updateListing(
  db: Db,
  threadsAccountId: string,
  promotionId: string,
  media: Media,
  input: ListingUpdateInput,
  now: Date,
): Promise<ListingDetail> {
  return db.transaction(async (tx) => {
    const { promotion, listing, defaults } = await loadListing(
      tx,
      threadsAccountId,
      promotionId,
      media,
    );
    const def = MEDIA_DEFINITIONS[media];
    const values: Partial<typeof threadsPromotionListing.$inferInsert> = {};
    if (input.fields) {
      for (const [key, value] of Object.entries(input.fields)) {
        const field = def.fields.find((item) => item.key === key);
        if (!field) throw invalid(`fields.${key}`, "知らない欄です。");
        const max = field.max ?? FIELD_MAX_DEFAULT;
        if ([...value].length > max)
          throw invalid(`fields.${key}`, `「${field.label}」は${max}文字までにしてください。`);
      }
      const refixed = refixListing(
        media,
        { ...(listing?.fields ?? {}), ...input.fields },
        sourceOf(promotion, defaults),
      );
      values.fields = refixed.fields;
      values.fixes = [...(listing?.fixes ?? []), ...refixed.fixes];
    }
    if (input.status !== undefined) values.status = input.status;
    if (input.postedUrl !== undefined)
      values.postedUrl = input.postedUrl === "" ? null : input.postedUrl;
    if (input.imageStyle !== undefined) values.imageStyle = input.imageStyle;
    const row = await writeListing(
      tx,
      { promotionId, threadsAccountId, media },
      input.version,
      values,
    );
    return detailOf(promotion, row, defaults, media, now);
  });
}

/**
 * 5つの媒体の既定値。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @returns 媒体ごとの値と版
 */
export async function listMediaDefaults(db: Executor, threadsAccountId: string) {
  const rows = await db
    .select()
    .from(threadsMediaDefault)
    .where(eq(threadsMediaDefault.threadsAccountId, threadsAccountId));
  return {
    items: MEDIA.map((media) => {
      const row = rows.find((item) => item.media === media);
      return { media, values: row?.values ?? {}, version: row?.version ?? 0 };
    }),
  };
}

/**
 * 媒体の既定値を保存する（既定値にできる欄の key だけ。読んだ版と同じときだけ）。
 * @param db DB
 * @param threadsAccountId 運用アカウントの ID
 * @param media 媒体
 * @param input 既定値と版
 * @returns 保存した値と版
 * @throws {AppError} 既定値にできない欄（INVALID_INPUT）・版が合わない（THREADS_VERSION_CONFLICT）
 */
export async function saveMediaDefaults(
  db: Db,
  threadsAccountId: string,
  media: Media,
  input: MediaDefaultsInput,
) {
  const allowed = new Set(
    MEDIA_DEFINITIONS[media].fields.filter((field) => field.defaultable).map((field) => field.key),
  );
  for (const key of Object.keys(input.values)) {
    if (!allowed.has(key)) throw invalid(`values.${key}`, "既定値にできない欄です。");
  }
  const values = Object.fromEntries(
    Object.entries(input.values).map(([key, value]) => [key, value.trim()]),
  );
  const [row] =
    input.version === 0
      ? await db
          .insert(threadsMediaDefault)
          .values({ threadsAccountId, media, values })
          .onConflictDoNothing()
          .returning()
      : await db
          .update(threadsMediaDefault)
          .set({ values, version: sql`${threadsMediaDefault.version} + 1` })
          .where(
            and(
              eq(threadsMediaDefault.threadsAccountId, threadsAccountId),
              eq(threadsMediaDefault.media, media),
              eq(threadsMediaDefault.version, input.version),
            ),
          )
          .returning();
  if (!row) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
  return { media, values: row.values, version: row.version };
}
