// 区分のタブ（threads-018）：名前と添える文字・今の区分の印・押すと選ぶ・読み上げだけの文字・端のぼかしは読み上げない。
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionTabs } from "./SectionTabs.tsx";

describe("SectionTabs", () => {
  it("今の区分に印を付け、押すとその区分を選ぶ", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SectionTabs
        label="見るもの"
        tabs={[
          { id: "a", label: "一つ目", badge: "1/2" },
          { id: "b", label: "二つ目", badge: "✓", srSuffix: "（済み）" },
          { id: "c", label: "三つ目" },
        ]}
        current="b"
        onSelect={onSelect}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "見るもの" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("button", { name: "一つ目 1/2" }).getAttribute("aria-current")).toBe(
      null,
    );
    expect(
      screen.getByRole("button", { name: "二つ目 ✓（済み）" }).getAttribute("aria-current"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "三つ目" }));
    expect(onSelect).toHaveBeenCalledWith("c");
    for (const edge of container.querySelectorAll("[data-edge]")) {
      expect(edge.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
