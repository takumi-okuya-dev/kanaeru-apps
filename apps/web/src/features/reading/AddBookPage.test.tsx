// 本を足す画面：書名で探して候補を選ぶと欄に入る・探せないときは手で書ける・出どころの表示・足す本文（書誌の出どころ・ISBN）。
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { AddBookPage } from "./AddBookPage.tsx";
import { BOOK, errorResponse, stubReadingApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("本を足す画面", () => {
  it("書名で探して候補を選ぶと、書名と著者が入り、書誌の出どころと ISBN を送る", async () => {
    const sent = stubReadingApi((request) => {
      if (request.path === "/api/v1/reading/catalog/search") {
        return Response.json({
          items: [
            {
              title: "見本の本",
              author: "架空 太郎",
              isbn: "9784873117782",
              coverUrl: null,
              source: "ndl",
            },
          ],
        });
      }
      if (request.method === "POST" && request.path === "/api/v1/reading/books") {
        return Response.json(BOOK, { status: 201 });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithRouter(<AddBookPage />);
    expect(await screen.findByText(/国立国会図書館サーチと openBD/)).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "書名か ISBN" }), "見本");
    await user.click(screen.getByRole("button", { name: "探す" }));
    await user.click(await screen.findByRole("button", { name: "選ぶ" }));
    expect(screen.getByRole("textbox", { name: /書名/ })).toHaveValue("見本の本");
    expect(screen.getByRole("textbox", { name: "著者" })).toHaveValue("架空 太郎");
    await user.click(screen.getByRole("checkbox", { name: "GoodNotes" }));
    await user.click(screen.getByRole("button", { name: "本棚に足す" }));
    await waitFor(() => {
      expect(
        sent.find(
          (request) => request.method === "POST" && request.path === "/api/v1/reading/books",
        )?.body,
      ).toMatchObject({
        title: "見本の本",
        isbn: "9784873117782",
        catalogSource: "ndl",
        sources: ["goodnotes"],
      });
    });
    expect(sent.some((request) => request.path.includes("見本"))).toBe(false);
  });

  it("探せないときは理由を出し、手で書いて足せる（書誌の出どころは manual）", async () => {
    const sent = stubReadingApi((request) => {
      if (request.path === "/api/v1/reading/catalog/search") {
        return errorResponse(502, "READING_CATALOG_UNAVAILABLE", "今は本を探せません。");
      }
      if (request.method === "POST" && request.path === "/api/v1/reading/books") {
        return Response.json(BOOK, { status: 201 });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderWithRouter(<AddBookPage />);
    await user.type(await screen.findByRole("searchbox", { name: "書名か ISBN" }), "見本");
    await user.click(screen.getByRole("button", { name: "探す" }));
    expect(await screen.findByText(/今は本を探せません。.*手で書けます/)).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: /書名/ }), "技術書典の見本");
    await user.click(screen.getByRole("button", { name: "本棚に足す" }));
    await waitFor(() => {
      expect(
        sent.find(
          (request) => request.method === "POST" && request.path === "/api/v1/reading/books",
        )?.body,
      ).toMatchObject({
        title: "技術書典の見本",
        catalogSource: "manual",
      });
    });
  });

  it("書名が空なら送らない", async () => {
    const sent = stubReadingApi(() => undefined);
    const user = userEvent.setup();
    renderWithRouter(<AddBookPage />);
    await user.click(await screen.findByRole("button", { name: "本棚に足す" }));
    expect(screen.getByText("書名を入れてください。")).toBeVisible();
    expect(sent.filter((request) => request.method === "POST")).toEqual([]);
  });
});
