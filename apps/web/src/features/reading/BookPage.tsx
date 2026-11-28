// 本の画面（/reading/books/$bookId。US5・US6・FR-021〜FR-023・FR-006・FR-008・FR-009。見本の4）。
// 上に分かりたいこと。マーカーとコメントを章ごとに、本の中の順（ページか位置）に並べる。コメントを直す・? の印を付け外す・マーカーを消す。
// 下の「本の設定」で、状態・読む場所を変える・ほかの本にまとめる・本を消す。説明の材料・書き出しは reading-003 以降。
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  READING_BOOK_STATUSES,
  READING_BOOK_STATUS_LABELS,
  READING_SOURCES,
  READING_SOURCE_LABELS,
  isQuestionComment,
} from "@workspace/contracts/reading";
import type { Book, Marker, ReadingBookStatus, ReadingSource } from "@workspace/contracts/reading";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Cover } from "./Cover.tsx";
import { deleteBook, deleteMarker, mergeBook, updateBook, updateMarker } from "./api.ts";
import { READING_QUERY_KEYS, useBook, useBooks } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/** 章のまとまり。 */
type ChapterGroup = {
  /** 章の名前（なしは null） */
  name: string | null;
  /** マーカー（本の中の順） */
  markers: Marker[];
};

/**
 * マーカーを章ごとにまとめる（並びは本の中の順のまま。同じ章が離れて出てきたら、別のまとまりにする）。
 * @param markers マーカー（本の中の順）
 * @returns 章のまとまり
 */
export function groupByChapter(markers: readonly Marker[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const marker of markers) {
    const last = groups.at(-1);
    if (last && last.name === marker.chapter) last.markers.push(marker);
    else groups.push({ name: marker.chapter, markers: [marker] });
  }
  return groups;
}

/**
 * 本の問い合わせを読み直す。
 * @param queryClient 問い合わせの道具
 */
async function refresh(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: READING_QUERY_KEYS.all });
}

/**
 * マーカーの1件（文・ページ・コメント・直す・印・消す）。
 * @param props マーカー（marker）
 * @param props.marker マーカー
 * @returns 要素
 */
function MarkerItem({ marker }: { marker: Marker }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(marker.comment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  /**
   * 直す（失敗しても書いた文は残す）。
   * @param input 直す欄
   * @param input.comment コメント
   * @param input.question あとで調べるの印
   */
  const save = async (input: { comment?: string | null; question?: boolean }) => {
    setPending(true);
    setError(undefined);
    try {
      await updateMarker(marker.id, input);
      await refresh(queryClient);
      setEditing(false);
    } catch (caught) {
      setError(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  /**
   * コメントを保存する（? で始めたら印も付ける）。
   * @param event 送る出来事
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = comment.trim();
    const next = trimmed === "" ? null : trimmed;
    const markQuestion = isQuestionComment(trimmed) && !marker.question;
    // 何も変えずに保存したときは送らない（「直した」の印を立てない）
    if (next === marker.comment && !markQuestion) {
      setEditing(false);
      return;
    }
    void save({
      ...(next !== marker.comment ? { comment: next } : {}),
      ...(markQuestion ? { question: true } : {}),
    });
  };

  /** 消す。 */
  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      await deleteMarker(marker.id);
      setConfirming(false);
      await refresh(queryClient);
    } catch (caught) {
      setError(`消せませんでした。${errorMessage(caught)}`);
      setPending(false);
    }
  };

  const where =
    marker.page !== null
      ? `p.${marker.page}`
      : marker.location !== null
        ? `位置 ${marker.location}`
        : null;
  return (
    <li className="flex flex-col gap-x3s border-t border-border py-xs first:border-t-0">
      {marker.text !== "" ? (
        <blockquote className="rounded-sm bg-surface-sunken px-xs py-xxs text-m break-words">
          {marker.text}
          {where ? <span className="block text-xs text-text-sub tabular-nums">{where}</span> : null}
        </blockquote>
      ) : where ? (
        <span className="text-xs text-text-sub tabular-nums">{where}</span>
      ) : null}
      {editing ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-xxs">
          <Field label="コメント" description="先頭に「?」を書くと、あとで調べるの印が付きます。">
            <Textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
          <ButtonRow>
            <Button size="small" onClick={() => setEditing(false)} disabled={pending}>
              やめる
            </Button>
            <Button size="small" type="submit" variant="primary" disabled={pending}>
              保存
            </Button>
          </ButtonRow>
        </form>
      ) : (
        <div className="flex flex-col gap-x3s">
          {marker.comment ? (
            <p className="text-m break-words">
              {marker.question ? <Badge className="mr-x3s">あとで調べる</Badge> : null}
              {marker.comment}
            </p>
          ) : marker.question ? (
            <Badge>あとで調べる</Badge>
          ) : null}
          <div className="flex flex-wrap gap-xxs">
            <Button
              size="small"
              onClick={() => {
                // 開くたびに今のコメントから始める（取りこみで変わったあとに、古い書きかけを出さない）
                setComment(marker.comment ?? "");
                setEditing(true);
              }}
              disabled={pending}
            >
              {marker.comment ? "コメントを直す" : "コメントを書く"}
            </Button>
            <Button
              size="small"
              onClick={() => void save({ question: !marker.question })}
              disabled={pending}
            >
              {marker.question ? "印を外す" : "あとで調べる"}
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setConfirming(true)}
              disabled={pending}
            >
              消す
            </Button>
          </div>
        </div>
      )}
      {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="マーカーを消しますか"
        confirmLabel="消す"
        pending={pending}
        error={error}
        onConfirm={() => void remove()}
      >
        このマーカーとコメントを消します。同じ本を取りこみ直しても、戻りません。
      </ConfirmDialog>
    </li>
  );
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
 * 本の設定（状態・読む場所・まとめる・消す）。
 * @param props 本（book）
 * @param props.book 本
 * @returns 要素
 */
function BookSettings({ book }: { book: Book }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const books = useBooks();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const others = (books.data?.items ?? []).filter((other) => other.id !== book.id);

  /**
   * 書いて読み直す。
   * @param run 書く処理
   * @param failure 失敗の頭の文
   * @param leave この本がなくなる操作のとき、先に移る先（なければ移らない）
   * @returns 成功したか
   */
  const write = async (
    run: () => Promise<unknown>,
    failure: string,
    leave?: () => Promise<unknown>,
  ): Promise<boolean> => {
    setPending(true);
    setError(undefined);
    try {
      await run();
      if (leave) {
        // この本がなくなる操作は、先に画面を移り、この本の問い合わせを捨ててから読み直す（一瞬「見つかりません」を出さない）
        await leave();
        queryClient.removeQueries({ queryKey: READING_QUERY_KEYS.book(book.id) });
      }
      await refresh(queryClient);
      return true;
    } catch (caught) {
      setError(`${failure}${errorMessage(caught)}`);
      return false;
    } finally {
      setPending(false);
    }
  };

  /**
   * 読む場所を付け外す。
   * @param source 読む場所
   * @param checked 付けるか
   */
  const toggleSource = (source: ReadingSource, checked: boolean) => {
    const sources = checked
      ? [...book.sources, source]
      : book.sources.filter((value) => value !== source);
    void write(() => updateBook(book.id, { sources }), "保存できませんでした。");
  };

  return (
    <Disclosure summary="本の設定（状態・読む場所・まとめる・消す）">
      <div className="flex max-w-form flex-col gap-s">
        <ChoiceChips
          label="状態"
          options={READING_BOOK_STATUSES.map((status) => ({
            value: status,
            label: READING_BOOK_STATUS_LABELS[status],
          }))}
          value={book.status}
          onValueChange={(status: ReadingBookStatus) =>
            void write(() => updateBook(book.id, { status }), "保存できませんでした。")
          }
        />
        <fieldset className="flex flex-col gap-x3s">
          <legend className="text-m font-bold">読む場所</legend>
          {READING_SOURCES.map((source) => (
            <label key={source} className="flex min-h-xl items-center gap-xxs text-m">
              <input
                type="checkbox"
                className="size-s accent-primary"
                checked={book.sources.includes(source)}
                disabled={pending}
                onChange={(event) => toggleSource(source, event.target.checked)}
              />
              {READING_SOURCE_LABELS[source]}
            </label>
          ))}
        </fieldset>
        {others.length > 0 ? (
          <div className="flex flex-col gap-xxs">
            <Field
              label="ほかの本にまとめる"
              description="2回登録してしまった本を1冊にします。この本は消えます。"
            >
              <Select value={mergeInto} onChange={setMergeInto}>
                <option value="">まとめる先を選ぶ</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.title}
                  </option>
                ))}
              </Select>
            </Field>
            <ButtonRow>
              <Button disabled={mergeInto === "" || pending} onClick={() => setConfirmMerge(true)}>
                まとめる
              </Button>
            </ButtonRow>
          </div>
        ) : null}
        <ButtonRow>
          <Button variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
            本を消す
          </Button>
        </ButtonRow>
        {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={confirmMerge}
        onOpenChange={setConfirmMerge}
        title="ほかの本にまとめますか"
        confirmLabel="まとめる"
        danger={false}
        pending={pending}
        error={error}
        onConfirm={() =>
          void write(
            () => mergeBook(book.id, mergeInto),
            "まとめられませんでした。",
            () => navigate({ to: "/reading/books/$bookId", params: { bookId: mergeInto } }),
          )
        }
      >
        この本のマーカー（{book.markerCount}
        ）を、選んだ本に寄せます。同じマーカーは1つになり、この本は消えます。
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="本を消しますか"
        confirmLabel="消す"
        pending={pending}
        error={error}
        onConfirm={() =>
          void write(
            () => deleteBook(book.id),
            "消せませんでした。",
            () => navigate({ to: "/reading" }),
          )
        }
      >
        この本と、マーカー（{book.markerCount}）を消します。元に戻せません。
      </ConfirmDialog>
    </Disclosure>
  );
}

/**
 * 分かりたいこと（見る・直す）。
 * @param props 本（book）
 * @param props.book 本
 * @returns 要素
 */
function Want({ book }: { book: Book }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [want, setWant] = useState(book.want ?? "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  /**
   * 保存する。
   * @param event 送る出来事
   */
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await updateBook(book.id, { want });
      await refresh(queryClient);
      setEditing(false);
    } catch (caught) {
      setError(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  if (editing) {
    return (
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex max-w-form flex-col gap-xxs"
      >
        <Field label="分かりたいこと" error={error}>
          <Textarea rows={3} value={want} onChange={(event) => setWant(event.target.value)} />
        </Field>
        <ButtonRow>
          <Button onClick={() => setEditing(false)} disabled={pending}>
            やめる
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            保存
          </Button>
        </ButtonRow>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-xxs">
      <p className="text-m break-words">
        <span className="text-text-sub">分かりたいこと：</span>
        {book.want ?? "まだ書いていません"}
      </p>
      <Button size="small" variant="text" onClick={() => setEditing(true)}>
        直す
      </Button>
    </div>
  );
}

/**
 * 本の中身（読めたとき）。
 * @param props 本（book）
 * @param props.book 本
 * @returns 要素
 */
function BookBody({ book }: { book: Book }) {
  const groups = groupByChapter(book.markers);
  return (
    <Page title={book.title} lead={book.author ?? undefined}>
      <div className="flex items-start gap-xs">
        <Cover title={book.title} coverUrl={book.coverUrl} />
        <Want book={book} />
      </div>
      {book.markers.length === 0 ? (
        <div className="flex flex-col gap-xxs">
          <p className="text-m text-text-sub">まだマーカーがありません。</p>
          <ButtonRow>
            <Link to="/reading/import" className="text-m text-text-link underline">
              取りこむ
            </Link>
          </ButtonRow>
        </div>
      ) : (
        groups.map((group, index) => (
          <section
            key={`${group.name ?? "none"}-${index}`}
            aria-label={group.name ?? "章なし"}
            className="flex flex-col"
          >
            <h2 className="flex justify-between gap-xxs border-b border-border pb-x3s text-m font-bold">
              <span className="break-words">{group.name ?? "章なし"}</span>
              <span className="font-normal text-text-sub tabular-nums">{group.markers.length}</span>
            </h2>
            <ul className="flex flex-col">
              {group.markers.map((marker) => (
                <MarkerItem key={marker.id} marker={marker} />
              ))}
            </ul>
          </section>
        ))
      )}
      <BookSettings book={book} />
    </Page>
  );
}

/**
 * 本を読みこむ。
 * @param props 本の ID（bookId）
 * @param props.bookId 本の ID
 * @returns 要素
 */
function BookLoader({ bookId }: { bookId: string }) {
  const query = useBook(bookId);
  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  return <BookBody book={query.data} />;
}

/**
 * 本の画面。
 * @param props 本の ID（bookId）
 * @param props.bookId 本の ID
 * @returns 画面の要素
 */
export function BookPage({ bookId }: { bookId: string }) {
  return (
    <SessionGate>
      <BookLoader bookId={bookId} />
    </SessionGate>
  );
}

const routeApi = getRouteApi("/reading/books/$bookId");

/**
 * 本の画面の道の部品（道の bookId を渡す）。
 * @returns 画面の要素
 */
export function BookRoute() {
  const { bookId } = routeApi.useParams();
  return <BookPage bookId={bookId} />;
}
