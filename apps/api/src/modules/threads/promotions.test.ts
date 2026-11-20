// 宣伝（threads-012）の結合のテスト（本物の PostgreSQL）：イベントの情報の全部の欄を保存して読める・カードから状態だけを変える
// （版が合わなければ 409）・足す・直す・消すと宣伝を変えた日時が進む・上限の数を一覧で返す。
import "@hono/zod-openapi";
import type { Promotion, PromotionList, ThreadsAccount } from "@workspace/contracts/threads";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import { threadsAccount } from "./schema.ts";

const database = useTestDatabase();
const BASE = "/api/v1/threads/accounts";

/** イベントの情報の全部の欄。 */
const EVENT = {
  startAt: "2026-12-05T19:00",
  endAt: "2026-12-05T21:00",
  format: "venue",
  venueName: "上野の会場",
  prefecture: "東京都",
  address: "台東区上野4-1-8",
  building: "3階",
  station: "御徒町駅 徒歩3分",
  capacity: 25,
  feeYen: 3000,
  feeNote: "学生は1000円引き",
  cancelPolicy: "前日までに連絡してください。",
  audience: "IT・コンサル系の方、初参加歓迎",
  organizer: "かなえる運営",
} as const;

/** 宣伝の入力の見本。 */
const PROMOTION = {
  title: "12月の交流会",
  content: "転職を考えている人の交流会です。",
  targetLocation: "東京",
  targetPersona: "20代の会社員",
  targetAgeRange: "20代",
  cta: "プロフィールのリンクから申し込む",
  linkedUrl: "https://example.com/event",
  priority: 10,
  status: "active",
  validUntil: null,
  event: EVENT,
} as const;

describe("宣伝（threads-012）", () => {
  let app: TestApp;
  let cookie: string;
  let id: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildApp(database, testConfig(), { features: createDomainFeatures([]) });
    cookie = (await loginAs(app)).cookie;
    id = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
  });

  /**
   * 宣伝を変えた日時を読む。
   * @returns 日時（まだなら null）
   */
  async function promotionsChangedAt(): Promise<Date | null> {
    const [row] = await database.db
      .select({ at: threadsAccount.promotionsChangedAt })
      .from(threadsAccount)
      .where(eq(threadsAccount.id, id));
    return row?.at ?? null;
  }

  it("イベントの情報の欄（都道府県・住所・建物・参加費の説明・キャンセル・対象・主催）を保存して読める", async () => {
    const created = await call(app, cookie, `${BASE}/${id}/promotions`, "POST", PROMOTION);
    expect(created.status).toBe(201);
    const promotion = (await created.json()) as Promotion;
    expect(promotion.event).toEqual(EVENT);
    const list = (await (
      await call(app, cookie, `${BASE}/${id}/promotions`)
    ).json()) as PromotionList;
    expect(list.items[0]?.event).toEqual(EVENT);
    expect(list.limit).toBeGreaterThan(0);
    // 空の欄は null にして持つ
    const cleared = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      event: { ...EVENT, prefecture: null, address: "", building: " ", organizer: "" },
      version: promotion.version,
    });
    expect(cleared.status).toBe(200);
    const after = (await cleared.json()) as Promotion;
    expect(after.event).toMatchObject({
      prefecture: null,
      address: null,
      building: null,
      organizer: null,
    });
  });

  it("都道府県は選択肢だけ", async () => {
    const response = await call(app, cookie, `${BASE}/${id}/promotions`, "POST", {
      ...PROMOTION,
      event: { ...EVENT, prefecture: "東京" },
    });
    expect(response.status).toBe(400);
  });

  it("状態だけを変えると宣伝の対象から外れ、版が合わなければ 409", async () => {
    const promotion = (await (
      await call(app, cookie, `${BASE}/${id}/promotions`, "POST", PROMOTION)
    ).json()) as Promotion;
    expect(promotion.isTargetable).toBe(true);
    const paused = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      status: "paused",
      version: promotion.version,
    });
    expect(paused.status).toBe(200);
    const pausedBody = (await paused.json()) as Promotion;
    expect(pausedBody).toMatchObject({ status: "paused", isTargetable: false });
    // 古い版のままでは変えられない
    const stale = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      status: "ended",
      version: promotion.version,
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");
  });

  it("足す・直す・消すと、宣伝を変えた日時が進む", async () => {
    expect(await promotionsChangedAt()).toBeNull();
    const promotion = (await (
      await call(app, cookie, `${BASE}/${id}/promotions`, "POST", PROMOTION)
    ).json()) as Promotion;
    const afterCreate = await promotionsChangedAt();
    expect(afterCreate).not.toBeNull();
    await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      status: "paused",
      version: promotion.version,
    });
    const afterUpdate = await promotionsChangedAt();
    expect(afterUpdate!.getTime()).toBeGreaterThanOrEqual(afterCreate!.getTime());
    const removed = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "DELETE");
    expect(removed.status).toBe(204);
    const afterDelete = await promotionsChangedAt();
    expect(afterDelete!.getTime()).toBeGreaterThanOrEqual(afterUpdate!.getTime());
    // 版が合わない・ない ID では進めない
    const before = await promotionsChangedAt();
    const missing = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "DELETE");
    expect(missing.status).toBe(404);
    expect((await promotionsChangedAt())!.getTime()).toBe(before!.getTime());
  });
});
