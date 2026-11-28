// 確かめてから入れる画面（/reading/import/confirm。US2・US3・FR-014・FR-016。見本の3）。
// 読み取った件数・章ごとの数・新しいマーカーの数と、入れる本を見せる。入れる本は選び直すか、新しく登録できる。章の名前とコメントの付け先を直せる。
// 「入れる」で、束（90KB・500件）に分けて順に送る。途中で失敗したら止めて「もう一度入れる」を出す（もう一度送っても重ならない。research R4・R7）。
// 読み取った中身は画面の中の置き場だけにある。読み直して中身がなければ、取りこみの画面へ戻す。
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { markerKey } from "@workspace/contracts/reading";
import type { BookSummary } from "@workspace/contracts/reading";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { createBook, fetchMarkerKeys, importMarkerBatch } from "./api.ts";
import { READING_MARKER_LIMITS } from "@workspace/contracts/reading";
import { splitIntoBatches } from "./batches.ts";
import type { ImportedMarker } from "./import/goodnotes.ts";
import { clearImportDraft, getImportDraft } from "./import-session.ts";
import type { ImportDraft } from "./import-session.ts";
import { READING_QUERY_KEYS, useBooks } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/** 新しく登録するときの選択肢の値。 */
const NEW_BOOK = "__new__";

/**
 * ファイルの名前にいちばん近い本（書名の言葉がファイルの名前に多く入っている本。なければ最初の読んでいる本）。
 * @param books 本棚の本
 * @param fileName ファイルの名前
 * @returns 本の ID（本がなければ null）
 */
export function guessBook(books: readonly BookSummary[], fileName: string | null): string | null {
  if (books.length === 0) return null;
  const name = (fileName ?? "").normalize("NFKC").toLowerCase();
  let best: { id: string; score: number } | undefined;
  for (const book of books) {
    const words = book.title
      .normalize("NFKC")
      .toLowerCase()
      .split(/[\s・:：、。「」()（）-]+/u)
      .filter((word) => word.length >= 2);
    const score = words.filter((word) => name.includes(word)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: book.id, score };
  }
  return best?.id ?? books.find((book) => book.status === "reading")?.id ?? books[0]?.id ?? null;
}

/**
 * 選択の欄（Field の中で、名前と結ぶ）。
 * @param props 値（value）・選んだとき（onChange）・中身（children）
 * @param props.value 値
 * @param props.onChange 選んだとき
 * @param props.children 選択肢
 * @returns 欄の要素
 */
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

/**
 * 文の頭（長い文は切る）。
 * @param value 文
 * @returns 頭の文
 */
function head(value: string): string {
  const chars = [...value];
  return chars.length > 24 ? `${chars.slice(0, 24).join("")}…` : value;
}

/**
 * 確かめの中身（読み取った中身があるとき）。
 * @param props 読み取った中身（draft）
 * @param props.draft 読み取った中身
 * @returns 画面の要素
 */
function Confirm({ draft }: { draft: ImportDraft }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const books = useBooks();
  const [markers, setMarkers] = useState<ImportedMarker[]>(draft.markers);
  const [bookId, setBookId] = useState<string | null>(draft.bookId);
  const [newTitle, setNewTitle] = useState("");
  const [existingKeys, setExistingKeys] = useState<Set<string>>();
  const [newCount, setNewCount] = useState<number>();
  const [sending, setSending] = useState<{ done: number; total: number }>();
  const [sendError, setSendError] = useState<string>();
  const [titleError, setTitleError] = useState<string>();

  // 本棚を読み終えたら、ファイルの名前に近い本を選んでおく（まだ選んでいなければ）
  useEffect(() => {
    if (bookId === null && books.data)
      setBookId(guessBook(books.data.items, draft.fileName) ?? NEW_BOOK);
  }, [books.data, bookId, draft.fileName]);

  // 選んだ本の鍵を読み、新しいマーカーの数を数える（research R7）
  useEffect(() => {
    let cancelled = false;
    setExistingKeys(undefined);
    if (!bookId || bookId === NEW_BOOK) {
      setExistingKeys(new Set());
      return;
    }
    fetchMarkerKeys(bookId)
      .then((result) => {
        if (!cancelled) setExistingKeys(new Set(result.keys));
      })
      .catch(() => {
        if (!cancelled) setExistingKeys(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;
    if (!existingKeys) return;
    void Promise.all(markers.map((marker) => markerKey(marker))).then((keys) => {
      if (!cancelled) setNewCount(new Set(keys.filter((key) => !existingKeys.has(key))).size);
    });
    return () => {
      cancelled = true;
    };
  }, [existingKeys, markers]);

  const comments = markers.filter((marker) => marker.comment !== undefined).length;
  const questions = markers.filter((marker) => marker.question).length;
  const chapters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const marker of markers) {
      const name = marker.chapter ?? "";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [markers]);
  const commented = markers
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => marker.comment !== undefined);

  /**
   * 章の名前を直す（同じ名前のマーカーをまとめて）。
   * @param from 前の名前（なしは ""）
   * @param to 新しい名前
   */
  const renameChapter = (from: string, to: string) => {
    setMarkers((current) =>
      current.map((marker) => {
        if ((marker.chapter ?? "") !== from) return marker;
        const { chapter: _old, ...rest } = marker;
        return to.trim() === "" ? rest : { ...rest, chapter: to };
      }),
    );
  };

  /**
   * コメントを、同じページのほかのマーカーに付け替える。
   * @param fromIndex 今コメントのあるマーカー
   * @param toIndex 付け替える先のマーカー
   */
  const moveComment = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setMarkers((current) => {
      const next = [...current];
      const from = next[fromIndex];
      const to = next[toIndex];
      if (!from?.comment || !to) return current;
      // 付け先にコメントがあれば、上書きせずに改行でつなぐ（上限で切る）
      const joined = to.comment ? `${to.comment}\n${from.comment}` : from.comment;
      next[toIndex] = {
        ...to,
        comment: [...joined].slice(0, READING_MARKER_LIMITS.comment).join(""),
        question: to.question || from.question,
      };
      const { comment: _moved, ...rest } = from;
      next[fromIndex] = { ...rest, question: false };
      // 文のないマーカー（コメントだけ）は、コメントがなくなったら外す
      return next.filter((marker) => marker.text.trim() !== "" || marker.comment !== undefined);
    });
  };

  // 画面を離れたら、束を送るのをやめる（離れたあとに本の画面へ引き戻さない）
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** 入れる（新しく登録するなら先に本を足す）。 */
  const send = async () => {
    if (sending) return;
    setSendError(undefined);
    setTitleError(undefined);
    let target = bookId;
    try {
      if (!target || target === NEW_BOOK) {
        if (newTitle.trim() === "") {
          setTitleError("新しく登録する本の書名を入れてください。");
          return;
        }
        const created = await createBook({ title: newTitle, catalogSource: "manual" });
        target = created.id;
        setBookId(created.id);
        // 選ぶ欄に新しい本が出るよう、本棚を読み直す（束が失敗して画面に残ったとき、別の本の名前が出ないように）
        await queryClient.invalidateQueries({ queryKey: READING_QUERY_KEYS.books });
      }
      const batches = splitIntoBatches(draft.source, markers);
      setSending({ done: 0, total: batches.length });
      for (const [index, batch] of batches.entries()) {
        if (!mounted.current) return;
        await importMarkerBatch(target, { source: draft.source, markers: batch });
        if (mounted.current) setSending({ done: index + 1, total: batches.length });
      }
      clearImportDraft();
      if (!mounted.current) return;
      await queryClient.invalidateQueries({ queryKey: READING_QUERY_KEYS.all });
      await navigate({ to: "/reading/books/$bookId", params: { bookId: target } });
    } catch (error) {
      if (!mounted.current) return;
      setSendError(
        `入れられませんでした。${errorMessage(error)} もう一度入れても、入った分は重なりません。`,
      );
      setSending(undefined);
    }
  };

  const options = books.data?.items ?? [];
  return (
    <Page title="読み取りました" lead={draft.fileName ?? "貼り付けた文"}>
      <section aria-labelledby="reading-confirm-book" className="flex max-w-form flex-col gap-xs">
        <h2 id="reading-confirm-book" className="text-l font-bold">
          入れる本
        </h2>
        {books.isPending ? <Loading /> : null}
        {books.isError ? (
          <LoadError error={books.error} onRetry={() => void books.refetch()} />
        ) : null}
        {books.isSuccess ? (
          <Field label="本">
            <Select value={bookId ?? NEW_BOOK} onChange={setBookId}>
              {options.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
              <option value={NEW_BOOK}>新しく登録する</option>
            </Select>
          </Field>
        ) : null}
        {bookId === NEW_BOOK ? (
          <Field label="新しく登録する本の書名" required error={titleError}>
            <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          </Field>
        ) : null}
      </section>
      <section aria-labelledby="reading-confirm-counts" className="flex flex-col gap-xxs">
        <h2 id="reading-confirm-counts" className="text-l font-bold">
          読み取った数
        </h2>
        <p className="text-m tabular-nums">
          マーカー <b>{markers.length}</b>・コメント <b>{comments}</b>・「?」 <b>{questions}</b>
        </p>
        {newCount !== undefined ? (
          <p className="text-m tabular-nums">
            新しいマーカー <b>{newCount}</b>
            {markers.length - newCount > 0
              ? `（前に入れた ${markers.length - newCount} は重ねません）`
              : ""}
          </p>
        ) : null}
        {draft.skippedCount > 0 ? (
          <ResponseMessage tone="info">
            文が長すぎるマーカー（{draft.skippedCount}件）は入れません。
          </ResponseMessage>
        ) : null}
        {draft.skippedLines.length > 0 ? (
          <ResponseMessage tone="info">
            長すぎる行（{draft.skippedLines.join("・")}行目）は入れません。
          </ResponseMessage>
        ) : null}
      </section>
      <Disclosure summary={`章ごとの数と章の名前（${chapters.length}）`}>
        <ul className="flex max-w-form flex-col gap-xs">
          {chapters.map(([name, count]) => (
            <li key={name || "__none__"}>
              <Field label={`${name || "章なし"}（${count}）`}>
                <Input
                  defaultValue={name}
                  onBlur={(event) => renameChapter(name, event.target.value)}
                />
              </Field>
            </li>
          ))}
        </ul>
      </Disclosure>
      {commented.length > 0 ? (
        <Disclosure summary={`コメントの付け先（${commented.length}）`}>
          <ul className="flex max-w-form flex-col gap-xs">
            {commented.map(({ marker, index }) => {
              const samePage = markers
                .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(
                  ({ candidate }) => candidate.page === marker.page && candidate.text.trim() !== "",
                );
              return (
                <li key={`${index}-${marker.comment}`}>
                  <Field label={`「${head(marker.comment ?? "")}」の付け先`}>
                    <Select
                      value={String(index)}
                      onChange={(value) => moveComment(index, Number(value))}
                    >
                      {marker.text.trim() === "" ? (
                        <option value={String(index)}>マーカーなし</option>
                      ) : null}
                      {samePage.map(({ candidate, candidateIndex }) => (
                        <option key={candidateIndex} value={String(candidateIndex)}>
                          {head(candidate.text)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : null}
      {sending ? (
        <p aria-live="polite" aria-busy="true" className="text-m text-text-sub">
          入れています…（{sending.done} / {sending.total}）
        </p>
      ) : null}
      {sendError ? <ResponseMessage tone="danger">{sendError}</ResponseMessage> : null}
      <ButtonRow>
        <Link
          to="/reading/import"
          onClick={() => clearImportDraft()}
          className={buttonVariants({ variant: "secondary" })}
        >
          やめる
        </Link>
        <Button variant="primary" disabled={sending !== undefined} onClick={() => void send()}>
          {sendError ? "もう一度入れる" : "入れる"}
        </Button>
      </ButtonRow>
    </Page>
  );
}

/**
 * 確かめの中身（読み取った中身がなければ、取りこみの画面への案内）。
 * @returns 画面の要素
 */
function ConfirmGate() {
  const draft = getImportDraft();
  if (!draft) {
    return (
      <Page
        title="取りこむ"
        lead="読み取った中身がありません。もう一度ファイルを選ぶか、貼り付けてください。"
      >
        <ButtonRow>
          <Link to="/reading/import" className={buttonVariants({ variant: "primary" })}>
            取りこむ画面へ
          </Link>
        </ButtonRow>
      </Page>
    );
  }
  return <Confirm draft={draft} />;
}

/**
 * 確かめてから入れる画面。
 * @returns 画面の要素
 */
export function ConfirmImportPage() {
  return (
    <SessionGate>
      <ConfirmGate />
    </SessionGate>
  );
}
