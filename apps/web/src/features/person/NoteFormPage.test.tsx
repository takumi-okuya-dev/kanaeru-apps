// 人を足す画面：自分だけが見られることと、知られたくないことを書かない注意が出る・フルネームが空なら送らない・
// 保存に失敗しても書いた内容が残り、送り直しは同じ clientRequestId を使う。API は fetch の差しかえで答える。
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { NoteNewPage } from "./NoteFormPage.tsx";
import { NOTE, stubPersonApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("人を足す画面", () => {
  it("自分だけが見られることと、知られたくないことを書かない注意が出る", async () => {
    stubPersonApi(() => undefined);
    renderWithRouter(<NoteNewPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "人を足す" })).toBeVisible();
    expect(screen.getByText("このメモを見られるのはあなただけです。")).toBeVisible();
    expect(
      screen.getByText("病気・信条など、相手が知られたくないことは書かないでください。"),
    ).toBeVisible();
  });

  it("フルネームが空なら保存できない（送らない）", async () => {
    const sent = stubPersonApi(() => undefined);
    renderWithRouter(<NoteNewPage />);
    await userEvent.click(await screen.findByRole("button", { name: "保存" }));
    expect(await screen.findByText("フルネームを入れてください。")).toBeVisible();
    expect(sent.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("保存に失敗しても書いた内容が残り、送り直しは同じ clientRequestId を使う", async () => {
    let calls = 0;
    const sent = stubPersonApi((request) => {
      if (request.method !== "POST") return undefined;
      calls += 1;
      if (calls === 1) throw new TypeError("通信が切れた");
      return Response.json(NOTE, { status: 201 });
    });
    renderWithRouter(<NoteNewPage />);
    await userEvent.type(await screen.findByRole("textbox", { name: /フルネーム/ }), "田中 太郎");
    await userEvent.type(screen.getByRole("textbox", { name: "話したこと" }), "Go の話");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText(/保存できませんでした/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /フルネーム/ })).toHaveValue("田中 太郎");
    expect(screen.getByRole("textbox", { name: "話したこと" })).toHaveValue("Go の話");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(calls).toBe(2));
    const posts = sent.filter((request) => request.method === "POST");
    const [first, second] = posts.map((request) => request.body as { clientRequestId: string });
    expect(first?.clientRequestId).toBeTruthy();
    expect(second?.clientRequestId).toBe(first?.clientRequestId);
    expect(posts[0]?.body).toMatchObject({ fullName: "田中 太郎", talk: "Go の話" });
  });

  it("保存に失敗したあと中身を変えて保存すると、新しい clientRequestId を使う", async () => {
    let calls = 0;
    const sent = stubPersonApi((request) => {
      if (request.method !== "POST") return undefined;
      calls += 1;
      if (calls === 1) throw new TypeError("通信が切れた");
      return Response.json(NOTE, { status: 201 });
    });
    renderWithRouter(<NoteNewPage />);
    const name = await screen.findByRole("textbox", { name: /フルネーム/ });
    await userEvent.type(name, "田中 太郎");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText(/保存できませんでした/)).toBeVisible();
    await userEvent.type(screen.getByRole("textbox", { name: "話したこと" }), "Go の話");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(calls).toBe(2));
    const [first, second] = sent
      .filter((request) => request.method === "POST")
      .map((request) => (request.body as { clientRequestId: string }).clientRequestId);
    expect(second).not.toBe(first);
  });
});
