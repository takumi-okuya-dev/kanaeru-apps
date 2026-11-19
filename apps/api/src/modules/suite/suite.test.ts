// スイートの窓口の結合のテスト（本物の PostgreSQL）：見えるアプリの一覧（ログインの前・利用者・運営者）・台帳を読む・変える・
// 組み立てが付ける requireApp（見えないアプリの道は 404）・isAppVisible・DB の変更の初めの行。
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, jsonRequest, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import {
  ORGANIZER_LINE_USER_ID_FOR_TEST,
  loginAs,
  withCookie,
} from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { DEMO_APP, DEMO_APP_KEY, DEMO_MODULE } from "../../../test/helpers/suite.ts";
import { INITIAL_APP_SETTINGS, isAppVisible, upsertVisibility } from "./index.ts";

const database = useTestDatabase();

/** 見えるアプリの一覧の答え（使う所だけ）。 */
type VisibleList = { apps: { key: string; visibility: string }[]; isOperator: boolean };

/** 台帳の答え（使う所だけ）。 */
type SettingList = { apps: { key: string; visibility: string; stored: boolean }[] };

describe("スイートの窓口", () => {
  let app: TestApp;
  let operator: string;
  let member: string;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }), {
      extraApps: [DEMO_APP],
      extraModules: { demo: DEMO_MODULE },
    });
    operator = (await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST })).cookie;
    member = (await loginAs(app)).cookie;
  });

  /**
   * 見えるアプリの key を読む。
   * @param cookie ログインのクッキー（なければログインの前）
   * @returns 答え
   */
  async function visibleApps(cookie?: string): Promise<VisibleList> {
    const response = await app.request(
      "/api/v1/suite/apps",
      cookie ? withCookie(cookie) : undefined,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as VisibleList;
  }

  /**
   * 運営者として公開の状態を変える。
   * @param key アプリの key
   * @param visibility 公開の状態
   * @param cookie クッキー（既定は運営者）
   * @returns 答え
   */
  function putVisibility(key: string, visibility: unknown, cookie = operator) {
    return app.request(
      `/api/v1/suite/app-settings/${key}`,
      withCookie(cookie, jsonRequest("PUT", { visibility })),
    );
  }

  describe("見えるアプリの一覧", () => {
    it("ログインの前と利用者には公開のアプリだけ、運営者には行のない（運営者だけの）アプリも返す", async () => {
      const anonymous = await visibleApps();
      expect(anonymous.isOperator).toBe(false);
      expect(anonymous.apps.map((item) => item.key)).toContain("reception");
      expect(anonymous.apps.map((item) => item.key)).not.toContain(DEMO_APP_KEY);
      expect((await visibleApps(member)).apps.map((item) => item.key)).not.toContain(DEMO_APP_KEY);

      const forOperator = await visibleApps(operator);
      expect(forOperator.isOperator).toBe(true);
      expect(forOperator.apps.find((item) => item.key === DEMO_APP_KEY)).toMatchObject({
        visibility: "operator_only",
      });
      expect(forOperator.apps.find((item) => item.key === "reception")).toMatchObject({
        visibility: "public",
      });
    });

    it("切のアプリは運営者にも返さず、公開にするとログインの前から返す", async () => {
      expect((await putVisibility(DEMO_APP_KEY, "off")).status).toBe(200);
      expect((await visibleApps(operator)).apps.map((item) => item.key)).not.toContain(
        DEMO_APP_KEY,
      );
      expect((await putVisibility(DEMO_APP_KEY, "public")).status).toBe(200);
      expect((await visibleApps()).apps.map((item) => item.key)).toContain(DEMO_APP_KEY);
    });
  });

  describe("台帳", () => {
    it("運営者だけが読め、登録されたアプリごとに1行（行がなければ運営者だけ・stored は false）", async () => {
      expect((await app.request("/api/v1/suite/app-settings")).status).toBe(401);
      expect((await app.request("/api/v1/suite/app-settings", withCookie(member))).status).toBe(
        403,
      );
      const response = await app.request("/api/v1/suite/app-settings", withCookie(operator));
      expect(response.status).toBe(200);
      const body = (await response.json()) as SettingList;
      expect(body.apps.find((item) => item.key === "reception")).toMatchObject({
        visibility: "public",
        stored: true,
      });
      expect(body.apps.find((item) => item.key === DEMO_APP_KEY)).toMatchObject({
        visibility: "operator_only",
        stored: false,
      });
    });

    it("運営者が変えると、すぐに台帳と一覧に効く。利用者は 403、形の違う値は 400、ない key は 404", async () => {
      const changed = await putVisibility(DEMO_APP_KEY, "public");
      expect(changed.status).toBe(200);
      expect(await changed.json()).toMatchObject({
        key: DEMO_APP_KEY,
        visibility: "public",
        stored: true,
      });
      expect((await putVisibility(DEMO_APP_KEY, "off", member)).status).toBe(403);
      const wrong = await putVisibility(DEMO_APP_KEY, "hidden");
      expect(wrong.status).toBe(400);
      expect((await wrong.json()) as { error: { code: string } }).toMatchObject({
        error: { code: "INVALID_INPUT" },
      });
      expect((await putVisibility("missing", "public")).status).toBe(404);
      expect((await putVisibility("NOT_A_KEY", "public")).status).toBe(404);
      // 同じ値を2度書いても1行
      expect((await putVisibility(DEMO_APP_KEY, "public")).status).toBe(200);
      const rows = await database.pool.query("SELECT 1 FROM app_setting WHERE app_key = $1", [
        DEMO_APP_KEY,
      ]);
      expect(rows.rowCount).toBe(1);
    });
  });

  describe("組み立てが付ける requireApp", () => {
    it("運営者だけのアプリの道は、運営者には通り、利用者とログインの前には 404", async () => {
      expect((await app.request("/api/v1/demo/ping", withCookie(operator))).status).toBe(200);
      expect((await app.request("/api/v1/demo/ping", withCookie(member))).status).toBe(404);
      const anonymous = await app.request("/api/v1/demo/ping");
      expect(anonymous.status).toBe(404);
      expect((await anonymous.json()) as { error: { code: string } }).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    });

    it("切はだれにも 404、公開はログインの前も通る", async () => {
      await putVisibility(DEMO_APP_KEY, "off");
      expect((await app.request("/api/v1/demo/ping", withCookie(operator))).status).toBe(404);
      await putVisibility(DEMO_APP_KEY, "public");
      expect((await app.request("/api/v1/demo/ping")).status).toBe(200);
    });

    it("機械の道（jobs・webhooks）は、運営者だけでもログインなしで通り、切のときだけ 404", async () => {
      const tick = () => app.request("/api/v1/demo/jobs/tick", jsonRequest("POST", {}));
      // 行がない（運営者だけ）：ふつうの道はログインの前に 404 だが、機械の道は通る
      expect((await app.request("/api/v1/demo/ping")).status).toBe(404);
      expect((await tick()).status).toBe(200);
      await putVisibility(DEMO_APP_KEY, "off");
      expect((await tick()).status).toBe(404);
      await putVisibility(DEMO_APP_KEY, "public");
      expect((await tick()).status).toBe(200);
    });

    it("受付アプリを切にすると、その領域の道（参加者が開く道も）が 404 になる", async () => {
      expect((await app.request("/api/v1/events", withCookie(operator))).status).toBe(200);
      await putVisibility("reception", "off");
      expect((await app.request("/api/v1/events", withCookie(operator))).status).toBe(404);
      const summary = await app.request(
        "/api/v1/events/0193a1b2-0000-7000-8000-000000000000/summary",
        withCookie(member),
      );
      expect(summary.status).toBe(404);
      // 共通の領域（account・suite）の道は、アプリの状態に関わらず動く
      expect((await app.request("/api/v1/accounts/me", withCookie(member))).status).toBe(200);
      expect((await app.request("/api/v1/suite/apps")).status).toBe(200);
    });
  });

  it("isAppVisible は、行がなければ運営者だけ、行があればその状態で決める（ログインの前は null）", async () => {
    expect(await isAppVisible(database.db, DEMO_APP_KEY, { isOperator: true })).toBe(true);
    expect(await isAppVisible(database.db, DEMO_APP_KEY, { isOperator: false })).toBe(false);
    expect(await isAppVisible(database.db, DEMO_APP_KEY, null)).toBe(false);
    await upsertVisibility(database.db, DEMO_APP_KEY, "public");
    expect(await isAppVisible(database.db, DEMO_APP_KEY, null)).toBe(true);
  });

  it("決まりに合わないアプリ（予約語の key）を足すと、組み立てが起動を止める", () => {
    expect(() =>
      buildApp(database, testConfig(), {
        extraApps: [{ ...DEMO_APP, key: "settings", basePath: "/settings-demo" }],
      }),
    ).toThrow(/key が予約語です：settings/);
  });
});

describe("DB の変更の初めの行", () => {
  it("DB の変更が入れる台帳の行は INITIAL_APP_SETTINGS と同じ（受付アプリは公開）", () => {
    const drizzleDir = new URL("../../../drizzle/", import.meta.url);
    const inserted = readdirSync(drizzleDir)
      .filter((name) => name.endsWith(".sql"))
      .flatMap((name) =>
        [
          ...readFileSync(new URL(name, drizzleDir), "utf8").matchAll(
            /INSERT INTO "app_setting" \("app_key", "visibility"\) VALUES \('([a-z0-9]+)', '([a-z_]+)'\)/g,
          ),
        ].map((match) => ({ appKey: match[1], visibility: match[2] })),
      );
    expect(inserted).toEqual(INITIAL_APP_SETTINGS);
  });

  it("表を空にしても、結合のテストの手伝いが初めの行を戻す", async () => {
    await truncateAllTables(database);
    expect(await isAppVisible(database.db, "reception", null)).toBe(true);
  });
});
