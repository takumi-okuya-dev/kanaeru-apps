// 組織の約束（suite-001）：名前の形・役割の入力・抜ける入力。
import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_INVITE_TOKEN_FORMAT,
  ORGANIZATION_NAME_MAX,
  ORGANIZATION_ROLE_LABELS,
  OrganizationLeaveInput,
  OrganizationMemberRoleInput,
  OrganizationNameInput,
} from "./index.ts";

describe("組織の入力", () => {
  it("名前は前後の空白を除いて1〜50文字", () => {
    expect(OrganizationNameInput.parse({ name: "  飲食チーム  " })).toEqual({ name: "飲食チーム" });
    expect(OrganizationNameInput.safeParse({ name: "   " }).success).toBe(false);
    expect(
      OrganizationNameInput.safeParse({ name: "あ".repeat(ORGANIZATION_NAME_MAX) }).success,
    ).toBe(true);
    expect(
      OrganizationNameInput.safeParse({ name: "あ".repeat(ORGANIZATION_NAME_MAX + 1) }).success,
    ).toBe(false);
    expect(OrganizationNameInput.safeParse({ name: "a", extra: 1 }).success).toBe(false);
  });

  it("役割の切り替えは編集者かメンバーだけ（管理者は引き継ぎで替わる）", () => {
    expect(OrganizationMemberRoleInput.safeParse({ role: "editor" }).success).toBe(true);
    expect(OrganizationMemberRoleInput.safeParse({ role: "member" }).success).toBe(true);
    expect(OrganizationMemberRoleInput.safeParse({ role: "admin" }).success).toBe(false);
    expect(ORGANIZATION_ROLE_LABELS).toEqual({
      admin: "管理者",
      editor: "編集者",
      member: "メンバー",
    });
  });

  it("抜ける入力の引き継ぐ人は任意で、あれば ID の形", () => {
    expect(OrganizationLeaveInput.safeParse({}).success).toBe(true);
    expect(OrganizationLeaveInput.safeParse({ successorAccountId: "x" }).success).toBe(false);
  });

  it("招待の札は base64url の43文字", () => {
    expect(ORGANIZATION_INVITE_TOKEN_FORMAT.test("A".repeat(43))).toBe(true);
    expect(ORGANIZATION_INVITE_TOKEN_FORMAT.test("A".repeat(42))).toBe(false);
    expect(ORGANIZATION_INVITE_TOKEN_FORMAT.test(`${"A".repeat(42)}+`)).toBe(false);
  });
});
