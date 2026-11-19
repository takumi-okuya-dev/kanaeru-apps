// 差しこみの場所：登録した順に並び、同じ ID は置きかえる。
import { describe, expect, it } from "vitest";
import {
  checkinPanelSections,
  eventDataSections,
  registerCheckinPanelSection,
  registerEventDataSection,
} from "./slots.ts";

describe("差しこみの場所", () => {
  it("A5 の節は登録した順で、同じ ID は置きかえる", () => {
    const first = () => null;
    const second = () => null;
    const replaced = () => null;
    registerEventDataSection({ id: "test-a", Component: first });
    registerEventDataSection({ id: "test-b", Component: second });
    registerEventDataSection({ id: "test-a", Component: replaced });
    const ids = eventDataSections().map((section) => section.id);
    expect(ids.filter((id) => id.startsWith("test-"))).toEqual(["test-a", "test-b"]);
    expect(eventDataSections().find((section) => section.id === "test-a")?.Component).toBe(
      replaced,
    );
  });

  it("A3 の直す枠の節も登録できる", () => {
    const panel = () => null;
    registerCheckinPanelSection({ id: "test-panel", Component: panel });
    expect(checkinPanelSections().some((section) => section.id === "test-panel")).toBe(true);
  });
});
