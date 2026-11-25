// ナビの今の項目：同じ道は page、下の道は一番長く当たる項目が true。区切りの途中では当てない。
import { describe, expect, it } from "vitest";
import type { NavItem } from "../lib/feature.ts";
import { currentNav } from "./current-nav.ts";

const ITEMS: readonly NavItem[] = [
  { id: "list", label: "一覧", to: "/admin/events", icon: "list" },
  { id: "reception", label: "参加者・合計", to: "/admin/events/e1", icon: "people" },
  {
    id: "setup",
    label: "準備",
    to: "/admin/events/e1/setup",
    icon: "setup",
    also: ["/admin/events/e1/edit"],
  },
];

describe("ナビの今の項目", () => {
  it("行き先と同じ道は page", () => {
    expect(currentNav(ITEMS, "/admin/events")).toEqual({ id: "list", ariaCurrent: "page" });
    expect(currentNav(ITEMS, "/admin/events/e1")).toEqual({ id: "reception", ariaCurrent: "page" });
  });

  it("下の道は、一番長く当たる項目が true", () => {
    expect(currentNav(ITEMS, "/admin/events/e1/data")).toEqual({
      id: "reception",
      ariaCurrent: "true",
    });
    expect(currentNav(ITEMS, "/admin/events/e1/setup/qr/checkin")).toEqual({
      id: "setup",
      ariaCurrent: "true",
    });
    expect(currentNav(ITEMS, "/admin/events/new")).toEqual({ id: "list", ariaCurrent: "true" });
  });

  it("also の道も含める", () => {
    expect(currentNav(ITEMS, "/admin/events/e1/edit")).toEqual({
      id: "setup",
      ariaCurrent: "true",
    });
  });

  it("薄い項目は、行き先が同じでも今の項目にならない（core-022）", () => {
    const items: readonly NavItem[] = [
      // 薄い項目を先に並べても、一覧が今の項目のまま（薄い項目の行き先は、押したときに進む一覧）
      {
        id: "dim",
        label: "困りごと",
        to: "/admin/events",
        icon: "concerns",
        disabled: { message: "先に交流会を選んでください" },
      },
      { id: "list", label: "一覧", to: "/admin/events", icon: "list" },
    ];
    expect(currentNav(items, "/admin/events")).toEqual({ id: "list", ariaCurrent: "page" });
    expect(currentNav(items, "/admin/events/e1")).toEqual({ id: "list", ariaCurrent: "true" });
    expect(currentNav([items[0] as NavItem], "/admin/events")).toBeUndefined();
  });

  it("区切りの途中や、ほかの道には当てない", () => {
    expect(currentNav(ITEMS, "/admin/eventsx")).toBeUndefined();
    expect(currentNav(ITEMS, "/e/e1/checkin")).toBeUndefined();
    expect(currentNav([], "/admin/events")).toBeUndefined();
  });
});
