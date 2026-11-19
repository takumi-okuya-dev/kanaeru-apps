// 外部メディアの掲載文（threads-008）の結合のテスト（本物の PostgreSQL）：
// 一覧（開催日時の順・状況）・掲載文を作る（イベントの情報が要る・ルールに合わない行を外す・既定値が入る・作成中になる）・
// 保存（版・知らない欄・上限・自動の直しをもう一度・掲載 URL と状況）・宣伝を直したら知らせる・既定値（既定値にできる欄だけ）・持ち主だけ。
import "@hono/zod-openapi";
import type {
  ActivityEntry,
  ExternalMediaList,
  ListingDetail,
  Promotion,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";

const database = useTestDatabase();
const BASE = "/api/v1/threads/accounts";

/** イベントの情報（来年の11月25日）。 */
const EVENT = {
  startAt: `${new Date().getFullYear() + 1}-11-25T20:00`,
  endAt: `${new Date().getFullYear() + 1}-11-25T22:00`,
  format: "venue",
  venueName: "会議室A",
  prefecture: "東京都",
  address: "台東区上野4-1-8",
  building: "3階",
  station: "御徒町駅 徒歩3分",
  capacity: 25,
  feeYen: 3000,
  feeNote: null,
  cancelPolicy: "前日まで無料",
  audience: "初参加歓迎",
  organizer: "主催の会",
};

describe("外部メディアの掲載文", () => {
  let app: TestApp;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildApp(database, testConfig(), {
      features: createDomainFeatures([]),
    });
    cookie = (await loginAs(app)).cookie;
    accountId = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
  });

  /**
   * 窓口を呼ぶ（道の頭は運用アカウント）。
   * @param path 運用アカウントのあとの道
   * @param method 動き
   * @param payload 本文
   * @returns 応答
   */
  function api(path: string, method = "GET", payload?: unknown): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}${path}`, method, payload);
  }

  /**
   * 宣伝を足す。
   * @param title タイトル
   * @param content 内容
   * @param event イベントの情報
   * @returns 宣伝
   */
  async function promotion(
    title: string,
    content: string,
    event: typeof EVENT | null,
  ): Promise<Promotion> {
    const response = await api("/promotions", "POST", {
      title,
      content,
      targetLocation: "",
      targetPersona: "",
      targetAgeRange: "",
      cta: "",
      linkedUrl: "",
      priority: 0,
      status: "active",
      validUntil: null,
      event,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as Promotion;
  }

  it("掲載文を作ると、媒体の欄が並び、ルールに合わない行が外れ、既定値が入り、作成中になる", async () => {
    const event = await promotion(
      "IT交流会",
      "ゆるく繋がる会です。\nhttps://maps.app.goo.gl/abc\n詳しくはLINEで",
      EVENT,
    );
    const noEvent = await promotion("お知らせ", "イベントではない宣伝", null);
    // 既定値（既定値にできない欄は 400）
    let response = await api("/media-defaults/tsunagate", "PUT", {
      version: 0,
      values: { title: "x" },
    });
    expect(response.status).toBe(400);
    response = await api("/media-defaults/tsunagate", "PUT", {
      version: 0,
      values: { circle: " 交流サークル " },
    });
    expect(await response.json()).toMatchObject({ values: { circle: "交流サークル" }, version: 1 });

    // まだ作っていない
    let detail = (await (
      await api(`/external-media/${event.id}/tsunagate`)
    ).json()) as ListingDetail;
    expect(detail.listing).toMatchObject({ status: "not_started", fields: null, version: 0 });
    expect(detail.defaults).toEqual({ circle: "交流サークル" });

    // イベントの情報がなければ作れない
    response = await api(`/external-media/${noEvent.id}/tsunagate/generate`, "POST", {
      version: 0,
    });
    expect(response.status).toBe(400);

    response = await api(`/external-media/${event.id}/tsunagate/generate`, "POST", { version: 0 });
    expect(response.status).toBe(200);
    detail = (await response.json()) as ListingDetail;
    expect(detail.listing.status).toBe("drafting");
    expect(detail.listing.version).toBe(1);
    expect(detail.listing.fields?.circle).toBe("交流サークル");
    expect(Object.values(detail.listing.fields ?? {}).join("\n")).not.toContain("maps.app.goo.gl");
    expect(detail.listing.fixes.map((fix) => fix.reason).join("／")).toContain("URL");
    expect(detail.sourceChanged).toBe(false);

    // 古い版で作り直すと 409
    response = await api(`/external-media/${event.id}/tsunagate/generate`, "POST", { version: 0 });
    expect(((await response.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");

    // 一覧：開催日時のある宣伝が先で、状況が出る
    const list = (await (await api("/external-media")).json()) as ExternalMediaList;
    expect(list.promotions.map((item) => item.title)).toEqual(["IT交流会", "お知らせ"]);
    expect(list.promotions[0]?.listings).toEqual([
      { media: "tsunagate", status: "drafting", postedUrl: null },
    ]);
  });

  it("保存：知らない欄・上限は 400。欄は自動の直しをもう一度通す。掲載 URL と状況。宣伝を直すと知らせる", async () => {
    const event = await promotion("IT交流会", "ゆるく繋がる会です。", EVENT);
    let detail = (await (
      await api(`/external-media/${event.id}/peatix/generate`, "POST", { version: 0 })
    ).json()) as ListingDetail;
    let response = await api(`/external-media/${event.id}/peatix`, "PUT", {
      version: detail.listing.version,
      fields: { nope: "x" },
    });
    expect(response.status).toBe(400);
    response = await api(`/external-media/${event.id}/peatix`, "PUT", {
      version: detail.listing.version,
      fields: { title: "あ".repeat(46) },
    });
    expect(response.status).toBe(400);
    response = await api(`/external-media/${event.id}/peatix`, "PUT", {
      version: detail.listing.version,
      fields: { body: "楽しい会です。\nお問い合わせは info@example.com まで" },
    });
    detail = (await response.json()) as ListingDetail;
    expect(detail.listing.fields?.body).toBe("楽しい会です。");
    expect(detail.listing.fixes.some((fix) => fix.reason.includes("メールアドレス"))).toBe(true);
    response = await api(`/external-media/${event.id}/peatix`, "PUT", {
      version: detail.listing.version,
      status: "posted",
      postedUrl: "javascript:alert(1)",
    });
    expect(response.status).toBe(400);
    response = await api(`/external-media/${event.id}/peatix`, "PUT", {
      version: detail.listing.version,
      status: "posted",
      postedUrl: "https://peatix.com/event/1",
      imageStyle: "photo",
    });
    detail = (await response.json()) as ListingDetail;
    expect(detail.listing).toMatchObject({
      status: "posted",
      postedUrl: "https://peatix.com/event/1",
      imageStyle: "photo",
    });

    // 宣伝を直すと「作ったあとに宣伝が直された」
    await api(`/promotions/${event.id}`, "PUT", {
      title: "IT交流会（12月）",
      content: "ゆるく繋がる会です。",
      targetLocation: "",
      targetPersona: "",
      targetAgeRange: "",
      cta: "",
      linkedUrl: "",
      priority: 0,
      status: "active",
      validUntil: null,
      event: EVENT,
      version: event.version,
    });
    detail = (await (await api(`/external-media/${event.id}/peatix`)).json()) as ListingDetail;
    expect(detail.sourceChanged).toBe(true);

    const activity = (await (await api("/activity?kind=content")).json()) as {
      items: ActivityEntry[];
    };
    expect(activity.items.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["listing_generated", "listing_saved"]),
    );
  });

  it("知らない媒体・ほかの人の運用アカウントの宣伝は 404", async () => {
    const event = await promotion("IT交流会", "会です。", EVENT);
    expect((await api(`/external-media/${event.id}/twitter`)).status).toBe(404);
    const other = (await loginAs(app, { lineUserId: `U${"7".repeat(32)}` })).cookie;
    expect(
      (await call(app, other, `${BASE}/${accountId}/external-media/${event.id}/peatix`)).status,
    ).toBe(404);
    const created = (await (await call(app, other, BASE, "POST", { name: "別" })).json()) as {
      id: string;
    };
    expect(
      (await call(app, other, `${BASE}/${created.id}/external-media/${event.id}/peatix`)).status,
    ).toBe(404);
  });
});
