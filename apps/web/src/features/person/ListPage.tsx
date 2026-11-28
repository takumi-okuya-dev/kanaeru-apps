// 人の一覧と検索の画面（/person。US2・US6・FR-012〜FR-017・FR-019）。一覧は最後に保存した順で、名前の横に見た目の特徴を出す。
// 探す言葉とタグは画面の状態だけに持つ（道・search params・sessionStorage に入れない。validateSearch を使わない。AD-31）。
// 検索は POST の本文で送り、当たった所は API が返した前後の文と当たった所をそのまま出す（画面はもう一度探さない）。
// 遅れて届いた前の検索の答えは捨てる（いちばん新しい検索の答えだけ）。5秒おきの読み直しは使わない。
// タグで絞る欄の選択肢は、読みこんだ一覧（新しい500人）のタグ。「CSV で書き出す」で自分のメモをすべて書き出す。
import { PERSON_MATCH_FIELD_LABELS, normalizeTag } from "@workspace/contracts/person";
import type { NoteSearchInput, NoteSummary, SearchResult } from "@workspace/contracts/person";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveFile } from "../../lib/download.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { downloadExport, searchNotes } from "./api.ts";
import { PRIVACY_TEXT } from "./note-form.ts";
import { useNotes } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/**
 * 一覧に出てくるタグ（そろえて同じものは1つ。出てきた順）。
 * @param notes 人の並び
 * @returns タグの並び
 */
export function tagsIn(notes: readonly NoteSummary[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = normalizeTag(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

/** TagSelect が受け取るもの。 */
type TagSelectProps = {
  /** 選んだタグ（すべては ""） */
  value: string;
  /** 選んだとき */
  onChange: (value: string) => void;
  /** 選択肢 */
  tags: readonly string[];
};

/**
 * タグで絞る欄（Field の中で、名前と結ぶ）。
 * @param props 値（value）・選んだとき（onChange）・選択肢（tags）
 * @returns 欄の要素
 */
function TagSelect({ value, onChange, tags }: TagSelectProps) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">すべて</option>
      {tags.map((tag) => (
        <option key={tag} value={tag}>
          {tag}
        </option>
      ))}
    </select>
  );
}

/** NoteRow が受け取るもの。 */
type NoteRowProps = {
  /** 人 */
  note: NoteSummary;
  /** 当たった所（検索の結果のときだけ） */
  matches?: SearchResult["items"][number]["matches"];
};

/**
 * 人の一覧の1行（名前の横に見た目の特徴。検索の結果なら当たった所も）。
 * @param props 人（note）・当たった所（matches）
 * @returns 行の要素
 */
function NoteRow({ note, matches }: NoteRowProps) {
  const nameId = `person-note-${note.id}`;
  return (
    <li
      aria-labelledby={nameId}
      className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
    >
      <div className="flex flex-wrap items-baseline gap-x-xs gap-y-x3s">
        <Link
          id={nameId}
          to="/person/notes/$noteId"
          params={{ noteId: note.id }}
          className="text-l font-bold break-words text-text-link underline"
        >
          {note.fullName}
        </Link>
        {note.appearance ? (
          <span className="text-m break-words text-text-sub">{note.appearance}</span>
        ) : null}
      </div>
      {note.tags.length > 0 ? (
        <div className="flex flex-wrap gap-x3s">
          {note.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      ) : null}
      {matches && matches.length > 0 ? (
        <ul className="flex flex-col gap-x3s">
          {matches.map((match, index) => (
            <li key={`${match.field}-${index}`} className="text-s break-words">
              <span className="text-text-sub">{PERSON_MATCH_FIELD_LABELS[match.field]}：</span>
              {match.before}
              <mark className="rounded-sm bg-primary-subtle font-bold text-text">{match.hit}</mark>
              {match.after}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * 人の一覧と検索の中身（ログインしているとき）。
 * @returns 画面の要素
 */
function NoteList() {
  const query = useNotes();
  const [words, setWords] = useState("");
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<SearchResult>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  // いちばん新しい検索の番号（やめる・新しく探すたびに進める）
  const latest = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const notes = query.data?.items ?? [];
  const tags = tagsIn(notes);

  /**
   * 探す（言葉もタグもなければ、検索をやめて一覧に戻る）。
   * @param nextWords 探す言葉
   * @param nextTag 絞るタグ
   */
  const runSearch = async (nextWords: string, nextTag: string) => {
    // 遅れて届いた前の検索の答えで、新しい答えを上書きしない（いちばん新しい検索の答えだけを出す）
    latest.current += 1;
    const ticket = latest.current;
    setSearchError(undefined);
    const trimmed = nextWords.trim();
    if (trimmed === "" && nextTag === "") {
      setResult(undefined);
      setSearching(false);
      return;
    }
    const input: NoteSearchInput = {
      ...(trimmed ? { query: trimmed } : {}),
      ...(nextTag ? { tag: nextTag } : {}),
    };
    setSearching(true);
    try {
      const found = await searchNotes(input);
      if (ticket === latest.current) setResult(found);
    } catch (error) {
      if (ticket === latest.current) setSearchError(`探せませんでした。${errorMessage(error)}`);
    } finally {
      if (ticket === latest.current) setSearching(false);
    }
  };

  /** 検索をやめて一覧に戻る（探している途中の答えも出さない）。 */
  const cancelSearch = () => {
    latest.current += 1;
    setWords("");
    setTag("");
    setResult(undefined);
    setSearching(false);
    setSearchError(undefined);
  };

  /**
   * 探すフォームを送る。
   * @param event 送る出来事
   */
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searching) void runSearch(words, tag);
  };

  /** CSV を書き出す。 */
  const exportCsv = async () => {
    if (exporting) return;
    setExportError(undefined);
    setExporting(true);
    try {
      const file = await downloadExport();
      saveFile(file.blob, file.filename);
    } catch (error) {
      setExportError(`書き出せませんでした。${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page
      title="人物メモ"
      lead={PRIVACY_TEXT}
      actions={
        <Link to="/person/new" className={buttonVariants({ variant: "primary" })}>
          人を足す
        </Link>
      }
    >
      <form
        role="search"
        aria-label="人を探す"
        noValidate
        onSubmit={submit}
        className="flex max-w-form flex-col gap-xs"
      >
        <Field
          label="探す言葉"
          description="名前・よみ・話したこと・会った場の名前などから探します。"
        >
          <Input
            type="search"
            autoComplete="off"
            value={words}
            onChange={(e) => setWords(e.target.value)}
          />
        </Field>
        {tags.length > 0 ? (
          <Field
            label="タグで絞る"
            {...(query.data?.truncated
              ? { description: "新しい500人に付いたタグから選べます。" }
              : {})}
          >
            <TagSelect
              value={tag}
              tags={tags}
              onChange={(value) => {
                setTag(value);
                void runSearch(words, value);
              }}
            />
          </Field>
        ) : null}
        <ButtonRow>
          {result || searching || words !== "" || tag !== "" ? (
            <Button onClick={cancelSearch}>やめる</Button>
          ) : null}
          <Button type="submit" variant="primary" aria-disabled={searching || undefined}>
            {searching ? "探しています…" : "探す"}
          </Button>
        </ButtonRow>
        {searchError ? <ResponseMessage tone="danger">{searchError}</ResponseMessage> : null}
      </form>
      {result ? (
        <section aria-labelledby="person-results" className="flex flex-col gap-xs">
          <h2 id="person-results" className="text-l leading-tight font-bold">
            探した結果（{result.items.length}人）
          </h2>
          {result.truncated ? (
            <p className="text-m">新しい100人だけを出しています。言葉を足して絞ってください。</p>
          ) : null}
          {result.items.length === 0 ? (
            <p className="text-m">当たる人はいませんでした。</p>
          ) : (
            <ul aria-label="探した結果" className="flex flex-col gap-xs">
              {result.items.map((item) => (
                <NoteRow key={item.note.id} note={item.note} matches={item.matches} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-labelledby="person-notes" className="flex flex-col gap-xs">
          <h2 id="person-notes" className="text-l leading-tight font-bold">
            最近書いた人
          </h2>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <LoadError error={query.error} onRetry={() => void query.refetch()} />
          ) : notes.length === 0 ? (
            <p className="text-m">
              まだだれもいません。「人を足す」から、会った人を足してください。
            </p>
          ) : (
            <>
              {query.data.truncated ? (
                <p className="text-m">新しい500人だけを出しています。探すと全員から探せます。</p>
              ) : null}
              <ul aria-label="人" className="flex flex-col gap-xs">
                {notes.map((note) => (
                  <NoteRow key={note.id} note={note} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <section aria-labelledby="person-more" className="flex flex-col gap-xxs">
        <h2 id="person-more" className="text-l leading-tight font-bold">
          ほかの操作
        </h2>
        <ButtonRow layout="grid">
          <Link to="/person/meetings" className={buttonVariants({ variant: "secondary" })}>
            会った場の一覧
          </Link>
          <Button aria-disabled={exporting || undefined} onClick={() => void exportCsv()}>
            {exporting ? "書き出しています…" : "CSV で書き出す"}
          </Button>
        </ButtonRow>
        {exportError ? <ResponseMessage tone="danger">{exportError}</ResponseMessage> : null}
      </section>
    </Page>
  );
}

/**
 * 人の一覧と検索の画面（ログインが要る）。
 * @returns 画面の要素
 */
export function ListPage() {
  return (
    <SessionGate>
      <NoteList />
    </SessionGate>
  );
}
