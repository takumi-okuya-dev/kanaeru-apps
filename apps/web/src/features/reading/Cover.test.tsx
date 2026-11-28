// 本の表紙：書影があれば画像・なければ仮の表紙・読めなければ仮の表紙に切りかえる。
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Cover } from "./Cover.tsx";

describe("本の表紙", () => {
  it("書影がなければ、書名の頭の文字で仮の表紙", () => {
    render(<Cover title="見本のネットワーク入門" coverUrl={null} />);
    expect(screen.getByTestId("placeholder-cover")).toHaveTextContent("見本のネット");
  });

  it("書影が読めなければ、仮の表紙に切りかえる", () => {
    const { container } = render(
      <Cover title="見本" coverUrl="https://cover.openbd.jp/9784873117782.jpg" />,
    );
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://cover.openbd.jp/9784873117782.jpg");
    fireEvent.error(image as HTMLImageElement);
    expect(screen.getByTestId("placeholder-cover")).toBeInTheDocument();
  });
});
