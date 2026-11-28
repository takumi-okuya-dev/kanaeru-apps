// 人のメモの画面：話したことと次に話したいことが最初に出る・自分だけが見られることが出る・アカウントは新しいタブで開く
// （javascript: はリンクにしない）・書き足しは失敗しても書いた内容が残り、送り直しは同じ appendId・直して 409 なら
// 「ほかで直されました。読み直してください。」が出て書いた内容が残る・中身を変えた送り直しは新しい appendId・
// 直すときの版は、直し始めたときの版（読み直しで新しくなっても変えない）。API は fetch の差しかえで答える。
import type { Note } from "@workspace/contracts/person";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { NotePage } from "./NotePage.tsx";
import { NOTE, NOTE_ID, errorResponse, stubPersonApi } from "./test-api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * 見本の人と、会った場の一覧を返す（ほかは handler に任せる）。
 * @param handler 書く要求に答える関数
 * @param note 返す人（なければ見本）
 * @returns 送られた要求
 */
function stubNote(
  handler: Parameters<typeof stubPersonApi>[0] = () => undefined,
  note: Note = NOTE,
) {
  return stubPersonApi(async (request) => {
    if (request.method === "GET" && request.path === `/api/v1/person/notes/${NOTE_ID}`) {
      return Response.json(note);
    }
    if (request.method === "GET" && request.path === "/api/v1/person/meetings") {
      return Response.json({ items: NOTE.meetings });
    }
    return handler(request);
  });
}

describe("人のメモの画面", () => {
  it("話したことと次に話したいことが最初に出て、ほかの欄はその下。自分だけが見られることが出る", async () => {
    stubNote();
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "田中 太郎" })).toBeVisible();
    expect(screen.getByText("このメモを見られるのはあなただけです。")).toBeVisible();
    const talk = screen.getByRole("heading", { level: 2, name: "話したこと" });
    const next = screen.getByRole("heading", { level: 2, name: "次に話したいこと" });
    const details = screen.getByRole("heading", { level: 2, name: "くわしく" });
    expect(screen.getByText("Go の話")).toBeVisible();
    expect(screen.getByText("転職の話")).toBeVisible();
    expect(talk.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(next.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("黒ぶちの眼鏡")).toBeVisible();
  });

  it("アカウントは新しいタブで開くリンク。LINE ID には注意を添え、javascript: はリンクにしない", async () => {
    stubNote();
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    const x = await screen.findByRole("link", { name: /X：@taro/ });
    expect(x).toHaveAttribute("href", "https://x.com/taro");
    expect(x).toHaveAttribute("target", "_blank");
    expect(x).toHaveAttribute("rel", "noopener noreferrer");
    const line = screen.getByRole("link", { name: /LINE ID：taro\.line/ });
    expect(line).toHaveAttribute("href", "https://line.me/R/ti/p/~taro.line");
    expect(screen.getByText("相手が ID で見つけられる設定のときだけ開けます。")).toBeVisible();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeVisible();
  });

  it("書き足しに失敗しても書いた内容が残り、送り直しは同じ appendId を使う", async () => {
    let calls = 0;
    const sent = stubNote((request) => {
      if (request.path !== `/api/v1/person/notes/${NOTE_ID}/appends`) return undefined;
      calls += 1;
      if (calls === 1) throw new TypeError("通信が切れた");
      return Response.json({
        ...NOTE,
        talk: `${NOTE.talk}\n\n── 2026-12-03 ──\n転職の話`,
        version: 4,
      });
    });
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    const box = await screen.findByRole("textbox", { name: "書き足すこと" });
    await userEvent.type(box, "転職の話");
    await userEvent.click(screen.getByRole("button", { name: "書き足す" }));
    expect(await screen.findByText(/保存できませんでした/)).toBeVisible();
    expect(box).toHaveValue("転職の話");
    await userEvent.click(screen.getByRole("button", { name: "書き足す" }));
    await waitFor(() => expect(box).toHaveValue(""));
    const appends = sent
      .filter((request) => request.path.endsWith("/appends"))
      .map((request) => request.body as { appendId: string; text: string });
    expect(appends).toHaveLength(2);
    expect(appends[1]?.appendId).toBe(appends[0]?.appendId);
    expect(appends[0]?.text).toBe("転職の話");
  });

  it("直して 409 なら「ほかで直されました。読み直してください。」が出て、書いた内容が残る", async () => {
    // 窓口が持つ値（そのほかの URL は http・https だけ）
    const saved: Note = { ...NOTE, accounts: { ...NOTE.accounts, url: "https://example.com" } };
    const sent = stubNote((request) => {
      if (request.method !== "PATCH") return undefined;
      return errorResponse(
        409,
        "PERSON_VERSION_CONFLICT",
        "ほかで直されました。読み直してください。",
      );
    }, saved);
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "直す" }));
    const next = screen.getByRole("textbox", { name: "次に話したいこと" });
    await userEvent.clear(next);
    await userEvent.type(next, "新しい話題");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText(/ほかで直されました。読み直してください。/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "次に話したいこと" })).toHaveValue("新しい話題");
    expect(sent.find((request) => request.method === "PATCH")?.body).toMatchObject({
      baseVersion: 3,
      nextTopic: "新しい話題",
    });
  });

  it("書き足しに失敗したあと文を変えて送ると、新しい appendId を使う", async () => {
    let calls = 0;
    const sent = stubNote((request) => {
      if (request.path !== `/api/v1/person/notes/${NOTE_ID}/appends`) return undefined;
      calls += 1;
      if (calls === 1) throw new TypeError("通信が切れた");
      return Response.json({ ...NOTE, version: 4 });
    });
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    const box = await screen.findByRole("textbox", { name: "書き足すこと" });
    await userEvent.type(box, "転職の話");
    await userEvent.click(screen.getByRole("button", { name: "書き足す" }));
    expect(await screen.findByText(/保存できませんでした/)).toBeVisible();
    await userEvent.type(box, "と引っ越しの話");
    await userEvent.click(screen.getByRole("button", { name: "書き足す" }));
    await waitFor(() => expect(box).toHaveValue(""));
    const ids = sent
      .filter((request) => request.path.endsWith("/appends"))
      .map((request) => (request.body as { appendId: string }).appendId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("直すときの版は直し始めたときの版で、読み直して版が新しくなっても変えない", async () => {
    const saved: Note = { ...NOTE, accounts: { ...NOTE.accounts, url: null } };
    let reads = 0;
    const sent = stubPersonApi((request) => {
      if (request.method === "GET" && request.path === `/api/v1/person/notes/${NOTE_ID}`) {
        reads += 1;
        // 2回目からは、ほかの端末で直されたあとの版
        return Response.json(
          reads === 1 ? saved : { ...saved, version: 4, nextTopic: "ほかの端末" },
        );
      }
      if (request.method === "GET" && request.path === "/api/v1/person/meetings") {
        return Response.json({ items: [] });
      }
      if (request.method === "PATCH") {
        return errorResponse(
          409,
          "PERSON_VERSION_CONFLICT",
          "ほかで直されました。読み直してください。",
        );
      }
      return undefined;
    });
    renderWithRouter(<NotePage noteId={NOTE_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "直す" }));
    // つながり直したときの読み直し（TanStack Query の refetchOnReconnect）
    act(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(reads).toBe(2));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText(/ほかで直されました。読み直してください。/)).toBeVisible();
    expect(sent.find((request) => request.method === "PATCH")?.body).toMatchObject({
      baseVersion: 3,
    });
  });
});
