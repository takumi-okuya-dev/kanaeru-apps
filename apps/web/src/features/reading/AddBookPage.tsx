// 本を足す画面（/reading/books/new。US1・FR-001〜FR-006）。書名か ISBN で書誌を探し、候補を選ぶと書名・著者・ISBN・書影が入る。
// 見つからなければ、書名と著者を手で書く。書誌の出どころ（国立国会図書館サーチ）を書く（補足 8章の帰属）。
// 検索の言葉は画面の状態だけに持ち、道に載せない。足したら、その本の画面へ移る。
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { READING_SOURCES, READING_SOURCE_LABELS } from "@workspace/contracts/reading";
import type {
  CatalogItem,
  ReadingCatalogSource,
  ReadingSource,
} from "@workspace/contracts/reading";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Cover } from "./Cover.tsx";
import { createBook, searchCatalog } from "./api.ts";
import { READING_QUERY_KEYS } from "./queries.ts";

/** 選んだ書誌（手で書くときは manual）。 */
type Picked = {
  isbn: string | null;
  coverUrl: string | null;
  catalogSource: ReadingCatalogSource;
};

/** 手で書いたときの書誌。 */
const MANUAL: Picked = { isbn: null, coverUrl: null, catalogSource: "manual" };

/**
 * 本を足す中身（ログインしているとき）。
 * @returns 画面の要素
 */
function AddBook() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogItem[]>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const latest = useRef(0);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [want, setWant] = useState("");
  const [sources, setSources] = useState<ReadingSource[]>([]);
  const [picked, setPicked] = useState<Picked>(MANUAL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  /**
   * 書誌を探す。
   * @param event 送る出来事
   */
  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = q.trim();
    if (trimmed === "" || searching) return;
    latest.current += 1;
    const ticket = latest.current;
    setSearching(true);
    setSearchError(undefined);
    try {
      const result = await searchCatalog(trimmed);
      if (ticket === latest.current) setItems(result.items);
    } catch (error) {
      if (ticket === latest.current) {
        setItems(undefined);
        setSearchError(`${errorMessage(error)} 下の欄に書名と著者を手で書けます。`);
      }
    } finally {
      if (ticket === latest.current) setSearching(false);
    }
  };

  /**
   * 候補を選ぶ（書名と著者を欄に入れる）。
   * @param item 候補
   */
  const pick = (item: CatalogItem) => {
    setTitle(item.title);
    setAuthor(item.author ?? "");
    setPicked({ isbn: item.isbn, coverUrl: item.coverUrl, catalogSource: item.source });
  };

  /**
   * 読む場所を付け外す。
   * @param source 読む場所
   * @param checked 付けるか
   */
  const toggleSource = (source: ReadingSource, checked: boolean) => {
    setSources((current) =>
      checked ? [...current, source] : current.filter((value) => value !== source),
    );
  };

  /**
   * 本を足す。
   * @param event 送る出来事
   */
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (title.trim() === "") {
      setSaveError("書名を入れてください。");
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const book = await createBook({
        title,
        author,
        want,
        sources,
        isbn: picked.isbn,
        coverUrl: picked.coverUrl,
        catalogSource: picked.catalogSource,
      });
      await queryClient.invalidateQueries({ queryKey: READING_QUERY_KEYS.all });
      await navigate({ to: "/reading/books/$bookId", params: { bookId: book.id } });
    } catch (error) {
      setSaveError(`足せませんでした。${errorMessage(error)}`);
      setSaving(false);
    }
  };

  return (
    <Page
      title="本を足す"
      lead="書名か ISBN で探します。見つからない本は、書名と著者を手で書きます。"
    >
      <form
        role="search"
        aria-label="本を探す"
        noValidate
        onSubmit={(event) => void search(event)}
        className="flex max-w-form flex-col gap-xs"
      >
        <Field label="書名か ISBN" description="書誌は国立国会図書館サーチと openBD から探します。">
          <Input
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <ButtonRow>
          <Button type="submit" disabled={searching}>
            {searching ? "探しています…" : "探す"}
          </Button>
        </ButtonRow>
        {searchError ? <ResponseMessage tone="danger">{searchError}</ResponseMessage> : null}
      </form>
      {items ? (
        <section aria-labelledby="reading-candidates" className="flex flex-col gap-xxs">
          <h2 id="reading-candidates" className="text-m font-bold">
            候補（{items.length}件）
          </h2>
          {items.length === 0 ? (
            <p className="text-m text-text-sub">
              見つかりませんでした。下の欄に手で書いてください。
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-border bg-surface">
              {items.map((item) => (
                <li
                  key={`${item.isbn ?? item.title}`}
                  className="flex items-center gap-xs border-t border-border p-xs first:border-t-0"
                >
                  <Cover title={item.title} coverUrl={item.coverUrl} />
                  <div className="flex min-w-0 flex-1 flex-col gap-x3s">
                    <span className="text-m font-bold break-words">{item.title}</span>
                    <span className="text-s break-words text-text-sub">
                      {[item.author, item.isbn ? `ISBN ${item.isbn}` : null]
                        .filter(Boolean)
                        .join("・")}
                    </span>
                  </div>
                  <Button size="small" onClick={() => pick(item)}>
                    選ぶ
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <form
        noValidate
        onSubmit={(event) => void save(event)}
        className="flex max-w-form flex-col gap-xs"
      >
        <Field label="書名" required>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </Field>
        <Field label="著者">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <Field label="この本で分かりたいこと" description="任意。あとから直せます。">
          <Textarea rows={3} value={want} onChange={(e) => setWant(e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-x3s">
          <legend className="text-m font-bold">どこで読みますか（いくつでも）</legend>
          {READING_SOURCES.map((source) => (
            <label key={source} className="flex min-h-xl items-center gap-xxs text-m">
              <input
                type="checkbox"
                className="size-s accent-primary"
                checked={sources.includes(source)}
                onChange={(e) => toggleSource(source, e.target.checked)}
              />
              {READING_SOURCE_LABELS[source]}
            </label>
          ))}
        </fieldset>
        {saveError ? <ResponseMessage tone="danger">{saveError}</ResponseMessage> : null}
        <ButtonRow>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "足しています…" : "本棚に足す"}
          </Button>
        </ButtonRow>
      </form>
    </Page>
  );
}

/**
 * 本を足す画面。
 * @returns 画面の要素
 */
export function AddBookPage() {
  return (
    <SessionGate>
      <AddBook />
    </SessionGate>
  );
}
