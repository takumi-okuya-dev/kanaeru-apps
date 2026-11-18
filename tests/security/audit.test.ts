// pnpm security:audit（scripts/security/audit.ts）の確かめ。
// pnpm audit は呼ばず、pnpm 12 の --json の形の見本（tests/security/fixtures/。指摘はすべて仮）を使う。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateAudit,
  formatBlocking,
  interpretAuditOutput,
  parseAuditJson,
  tokyoDate,
  validateExceptions,
} from "../../scripts/security/audit.ts";
import type { AuditRun } from "../../scripts/security/audit.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const PROD: AuditRun = { ok: true, advisories: parseAuditJson(fixture("audit-prod.json")) };
const DEV: AuditRun = { ok: true, advisories: parseAuditJson(fixture("audit-dev.json")) };
const CLEAN: AuditRun = { ok: true, advisories: [] };
const OFFLINE: AuditRun = { ok: false, reason: "offline", detail: "ERR_PNPM_AUDIT_BAD_RESPONSE" };
const TODAY = "2026-11-17";

/**
 * 例外の見本。
 * @param overrides 替える欄
 * @returns 例外
 */
function exception(overrides: Record<string, string> = {}) {
  return {
    id: "GHSA-test-high-0001",
    package: "sample-high",
    reason: "直る版がまだなく、本番の道では使わない（見本）",
    addedOn: "2026-11-01",
    expiresOn: "2027-01-30",
    ...overrides,
  };
}

describe("依存の手順（deps:audit）", () => {
  it("pnpm 12 の --json の形を読む（GHSA・重さ・依存の名前・版・直る版）", () => {
    expect(PROD.ok && PROD.advisories).toEqual([
      {
        id: "GHSA-test-high-0001",
        package: "sample-high",
        versions: ["1.2.3"],
        severity: "high",
        patched: ">=1.2.4",
      },
      {
        id: "GHSA-test-mode-0002",
        package: "sample-moderate",
        versions: ["0.1.0"],
        severity: "moderate",
        patched: "",
      },
    ]);
  });

  it("例外の決まり：id は一意・reason は空にしない・expiresOn は addedOn から90日以内", () => {
    expect(validateExceptions([exception()]).errors).toEqual([]);
    expect(validateExceptions([exception(), exception()]).errors.join()).toContain(
      "重なっています",
    );
    expect(validateExceptions([exception({ reason: " " })]).errors.join()).toContain("reason");
    expect(validateExceptions([exception({ expiresOn: "2027-02-01" })]).errors.join()).toContain(
      "90 日以内",
    );
    expect(validateExceptions({}).errors).toHaveLength(1);
  });

  it("合わない例外の一覧は誤りとして止める", () => {
    const result = evaluateAudit({
      prod: CLEAN,
      dev: CLEAN,
      exceptions: [exception({ reason: "" })],
      today: TODAY,
      ci: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.lines[0]).toContain("");
  });

  it("本番の依存の high（例外でない）で 1。文は決まった形", () => {
    const result = evaluateAudit({
      prod: PROD,
      dev: CLEAN,
      exceptions: [],
      today: TODAY,
      ci: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.blocking.map((item) => item.id)).toEqual(["GHSA-test-high-0001"]);
    expect(formatBlocking(result.blocking[0]!)).toBe(
      [
        "本番に入る依存に、重い既知の脆弱性があります：sample-high@1.2.3（GHSA-test-high-0001・high）",
        "  直る版：>=1.2.4。例外にするときは security/audit-exceptions.json に理由と期限を書いて足してください。",
      ].join("\n"),
    );
  });

  it("moderate と、開発の道具だけの依存（critical でも）は出すだけで 0", () => {
    const prod: AuditRun = {
      ok: true,
      advisories: PROD.ok ? PROD.advisories.filter((item) => item.severity !== "high") : [],
    };
    const result = evaluateAudit({ prod, dev: DEV, exceptions: [], today: TODAY, ci: false });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("sample-moderate");
    expect(result.lines.join("\n")).toContain("開発の道具の指摘（止めない）：sample-dev-tool");
  });

  it("期限の中の例外は許し、期限を過ぎた例外は無いものとして扱う", () => {
    expect(
      evaluateAudit({ prod: PROD, dev: CLEAN, exceptions: [exception()], today: TODAY, ci: false })
        .exitCode,
    ).toBe(0);
    const expired = evaluateAudit({
      prod: PROD,
      dev: CLEAN,
      exceptions: [exception({ addedOn: "2026-09-01", expiresOn: "2026-11-16" })],
      today: TODAY,
      ci: false,
    });
    expect(expired.exitCode).toBe(1);
    expect(expired.lines.join("\n")).toContain("期限を過ぎた例外");
  });

  it("もう指摘に出ない例外は「消してよい」と出す", () => {
    const result = evaluateAudit({
      prod: CLEAN,
      dev: CLEAN,
      exceptions: [exception()],
      today: TODAY,
      ci: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("消してよい：GHSA-test-high-0001");
  });

  it("通信ができないとき：CI がなければ「確かめられませんでした」と出して 0、CI があれば 1", () => {
    const local = evaluateAudit({
      prod: OFFLINE,
      dev: OFFLINE,
      exceptions: [],
      today: TODAY,
      ci: false,
    });
    expect(local).toMatchObject({ status: "unchecked", exitCode: 0 });
    expect(local.lines[0]).toContain("確かめられませんでした");
    expect(local.lines.join("\n")).toContain("通ったとは扱いません");
    const ci = evaluateAudit({ prod: OFFLINE, dev: CLEAN, exceptions: [], today: TODAY, ci: true });
    expect(ci).toMatchObject({ status: "failed", exitCode: 1 });
  });

  it("開発の道具の依存を確かめられなくても、本番の依存の止める指摘は消さずに出して 1", () => {
    for (const ci of [false, true]) {
      const result = evaluateAudit({ prod: PROD, dev: OFFLINE, exceptions: [], today: TODAY, ci });
      expect(result).toMatchObject({ status: "failed", exitCode: 1 });
      expect(result.blocking.map((item) => item.id)).toEqual(["GHSA-test-high-0001"]);
      expect(result.lines.join("\n")).toContain("重い既知の脆弱性があります：sample-high");
      expect(result.lines.join("\n")).toContain("開発の道具だけの依存を確かめられませんでした");
    }
  });

  it("開発の道具の依存だけ確かめられないとき：本番に止める指摘がなければ、手元は 0 で「通ったとは扱いません」、CI は 1", () => {
    const local = evaluateAudit({
      prod: CLEAN,
      dev: OFFLINE,
      exceptions: [exception()],
      today: TODAY,
      ci: false,
    });
    expect(local).toMatchObject({ status: "unchecked", exitCode: 0, blocking: [] });
    expect(local.lines.join("\n")).toContain("通ったとは扱いません");
    // 開発の道具の指摘が分からないので、例外を「消してよい」とは言わない
    expect(local.lines.join("\n")).not.toContain("消してよい");
    const ci = evaluateAudit({ prod: CLEAN, dev: OFFLINE, exceptions: [], today: TODAY, ci: true });
    expect(ci).toMatchObject({ status: "failed", exitCode: 1 });
  });

  describe("pnpm audit の終わり方と応答の形（error の物を、指摘なしと取り違えない）", () => {
    const prodJson = fixture("audit-prod.json");
    const cleanJson = JSON.stringify({
      advisories: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
    });

    it("終わり方 0 で指摘なし・終わり方 1 で指摘あり は読める", () => {
      expect(interpretAuditOutput(0, cleanJson, "")).toEqual({ ok: true, advisories: [] });
      const run = interpretAuditOutput(1, prodJson, "");
      expect(run.ok && run.advisories.map((advisory) => advisory.id)).toEqual([
        "GHSA-test-high-0001",
        "GHSA-test-mode-0002",
      ]);
    });

    it.each([
      [
        "error の物（終わり方 1）",
        1,
        JSON.stringify({ error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" } }),
      ],
      ["error の物（終わり方 0）", 0, JSON.stringify({ error: { code: "ERR_PNPM_X" } })],
      ["advisories がない", 0, JSON.stringify({ metadata: { vulnerabilities: {} } })],
      ["metadata.vulnerabilities がない", 0, JSON.stringify({ advisories: {} })],
      ["並び", 0, "[]"],
      ["JSON でない", 0, "<html>bad gateway</html>"],
    ])("%s は確かめられない（bad-response）", (_label, status, stdout) => {
      expect(interpretAuditOutput(status, stdout, "")).toMatchObject({
        ok: false,
        reason: "bad-response",
      });
    });

    it("指摘がないのに終わり方が 0 でない・終わり方が 0 と 1 のほか は確かめられない", () => {
      expect(interpretAuditOutput(1, cleanJson, "")).toMatchObject({
        ok: false,
        reason: "bad-response",
      });
      expect(interpretAuditOutput(2, prodJson, "")).toMatchObject({
        ok: false,
        reason: "bad-response",
      });
      expect(interpretAuditOutput(null, prodJson, "")).toMatchObject({
        ok: false,
        reason: "bad-response",
      });
    });

    it("標準の出力が空なら通信ができない（offline）として、エラーの番号を出す", () => {
      expect(interpretAuditOutput(1, "", " ERR_PNPM_AUDIT_BAD_RESPONSE  x")).toEqual({
        ok: false,
        reason: "offline",
        detail: "ERR_PNPM_AUDIT_BAD_RESPONSE",
      });
    });

    it("応答の形が合わないとき：手元は「確かめられませんでした」で 0（通ったとしない）、CI は 1", () => {
      const bad = interpretAuditOutput(1, JSON.stringify({ error: { code: "ERR_PNPM_X" } }), "");
      const local = evaluateAudit({
        prod: bad,
        dev: CLEAN,
        exceptions: [],
        today: TODAY,
        ci: false,
      });
      expect(local).toMatchObject({ status: "unchecked", exitCode: 0 });
      expect(local.lines[0]).toContain("pnpm audit の応答が合いません");
      const ci = evaluateAudit({ prod: CLEAN, dev: bad, exceptions: [], today: TODAY, ci: true });
      expect(ci).toMatchObject({ status: "failed", exitCode: 1 });
    });
  });

  describe("今日の日付は日本の時刻で決める（例外の期限）", () => {
    it("UTC の 15 時（日本の 0 時）で日付が変わる", () => {
      expect(tokyoDate(new Date("2026-11-17T14:59:59Z"))).toBe("2026-11-17");
      expect(tokyoDate(new Date("2026-11-17T15:00:00Z"))).toBe("2026-11-18");
      expect(tokyoDate(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    });

    it("期限の日の日本の 24 時を過ぎたら、UTC ではまだその日でも期限切れとして扱う", () => {
      const entry = exception({ addedOn: "2026-11-01", expiresOn: "2026-11-17" });
      const evaluateAt = (iso: string) =>
        evaluateAudit({
          prod: PROD,
          dev: CLEAN,
          exceptions: [entry],
          today: tokyoDate(new Date(iso)),
          ci: false,
        });
      expect(evaluateAt("2026-11-17T14:59:59Z").exitCode).toBe(0);
      const after = evaluateAt("2026-11-17T15:00:00Z");
      expect(after.exitCode).toBe(1);
      expect(after.lines.join("\n")).toContain("期限を過ぎた例外");
    });
  });
});
