// 取りこむ画面（/reading/import。US2・US4・FR-010〜FR-018。見本の2）。GoodNotes から書き出した PDF を選ぶか、1行に1つの文を貼る。
// PDF は端末の中で読む（pdf.js は、ここで「ファイルを選ぶ」を押したときだけ読みこむ。AD-34）。PDF も、マーカーのない本の文も送らない。
// 読み取った中身は、上限に合わせ・ファイルの中の重なりを1つにしてから（prepare-markers.ts）、画面の中の置き場（import-session.ts）に置き、確かめの画面へ移る。
// 読み取りの途中で画面を離れたら、読み取りをやめ、確かめの画面へは移らない。
import { useNavigate } from "@tanstack/react-router";
import { READING_IMPORT_LIMITS, parsePastedMarkers } from "@workspace/contracts/reading";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useId, useRef, useState } from "react";
import type * as React from "react";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { setImportDraft } from "./import-session.ts";
import { fitMarkersToLimits, mergeDuplicateMarkers } from "./prepare-markers.ts";

/** 読み取れなかったときの文（何が起きたか・どうすればよいか。利用者の値を入れない）。 */
const READ_ERROR_MESSAGES = {
  "too-large":
    "ファイルが大きすぎます（300MB まで）。章ごとに分けて書き出すか、貼り付けで入れてください。",
  "not-pdf":
    "PDF のファイルではありません。GoodNotes の共有から「PDF」で書き出したファイルを選んでください。",
  broken: "PDF を読めませんでした。書き出し直すか、貼り付けで入れてください。",
  aborted: "読み取りをやめました。",
  empty:
    "マーカーもテキストボックスも見つかりませんでした。GoodNotes で書き出すときに、書きこみを含める設定かを確かめるか、貼り付けで入れてください。",
  "too-many": `マーカーが多すぎます（一度に${READING_IMPORT_LIMITS.markersPerImport.toLocaleString("ja-JP")}件まで）。章ごとに分けて書き出してください。`,
} as const;

/** 読み取れなかった理由。 */
type ReadErrorReason = keyof typeof READ_ERROR_MESSAGES;

/**
 * 投げられたものから、読み取れなかった理由を取り出す。
 * @param error 投げられたもの
 * @returns 理由
 */
function reasonOf(error: unknown): ReadErrorReason {
  const reason = (error as { reason?: unknown } | null)?.reason;
  return typeof reason === "string" && reason in READ_ERROR_MESSAGES
    ? (reason as ReadErrorReason)
    : "broken";
}

/**
 * 取りこむ中身（ログインしているとき）。
 * @returns 画面の要素
 */
function Import() {
  const navigate = useNavigate();
  const inputId = useId();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<ReadErrorReason>();
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string>();
  const abort = useRef<AbortController | undefined>(undefined);
  // 画面を離れたら読み取りをやめる（離れたあとに確かめの画面へ引き戻さない）
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  /**
   * PDF を選んだとき：端末の中で読み、確かめの画面へ移る。
   * @param event 選んだ出来事
   */
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || reading) return;
    setReadError(undefined);
    if (file.size > READING_IMPORT_LIMITS.fileBytes) {
      setReadError("too-large");
      return;
    }
    setReading(true);
    setProgress(undefined);
    abort.current = new AbortController();
    try {
      const { readGoodNotesPdf } = await import("./import/pdf.ts");
      const result = await readGoodNotesPdf(file, {
        onProgress: (done, total) => setProgress({ done, total }),
        signal: abort.current.signal,
      });
      if (!mounted.current) return;
      const fitted = fitMarkersToLimits(result.markers);
      const markers = await mergeDuplicateMarkers(fitted.markers);
      if (markers.length === 0) throw Object.assign(new Error("empty"), { reason: "empty" });
      if (markers.length > READING_IMPORT_LIMITS.markersPerImport) {
        throw Object.assign(new Error("too-many"), { reason: "too-many" });
      }
      if (!mounted.current) return;
      setImportDraft({
        source: "goodnotes",
        fileName: file.name,
        markers,
        bookId: null,
        skippedLines: [],
        skippedCount: fitted.skipped,
      });
      await navigate({ to: "/reading/import/confirm" });
    } catch (error) {
      if (mounted.current) setReadError(reasonOf(error));
    } finally {
      if (mounted.current) setReading(false);
    }
  };

  /**
   * 貼った文を読み、確かめの画面へ移る。
   * @param event 送る出来事
   */
  const onPaste = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parsePastedMarkers(pasted);
    if (result.markers.length === 0) {
      setPasteError("取りこむ行がありません。1行に1つずつ貼ってください。");
      return;
    }
    if (result.markers.length > READING_IMPORT_LIMITS.markersPerImport) {
      setPasteError(READ_ERROR_MESSAGES["too-many"]);
      return;
    }
    setImportDraft({
      source: "paste",
      fileName: null,
      markers: await mergeDuplicateMarkers(result.markers),
      bookId: null,
      skippedLines: result.tooLongLines,
      skippedCount: 0,
    });
    await navigate({ to: "/reading/import/confirm" });
  };

  return (
    <Page title="取りこむ" lead="書き出したファイルを選ぶか、コピーした文を貼ります。">
      <section aria-labelledby="reading-import-file" className="flex flex-col gap-xs">
        <h2 id="reading-import-file" className="text-l font-bold">
          GoodNotes の PDF
        </h2>
        <p className="text-m">
          ファイルはこの端末の中で読みます。送るのは、マーカーとコメントだけです。
        </p>
        <Disclosure summary="GoodNotes からの書き出し方">
          <ol className="list-decimal pl-s text-m">
            <li>本の「共有」を押す</li>
            <li>「PDF」で書き出し、ファイルに保存する</li>
            <li>保存したファイルを、下の「ファイルを選ぶ」で選ぶ</li>
          </ol>
        </Disclosure>
        {reading ? (
          <p aria-live="polite" aria-busy="true" className="text-m text-text-sub">
            {progress
              ? `読み取っています…（${progress.done} / ${progress.total} ページ）`
              : "読み取りの準備をしています…"}
          </p>
        ) : null}
        {readError ? (
          <ResponseMessage tone="danger">{READ_ERROR_MESSAGES[readError]}</ResponseMessage>
        ) : null}
        <ButtonRow>
          {reading ? (
            <Button onClick={() => abort.current?.abort()}>読み取りをやめる</Button>
          ) : (
            <label htmlFor={inputId} className={buttonVariants({ variant: "primary" })}>
              ファイルを選ぶ
              <input
                id={inputId}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => void onFile(event)}
              />
            </label>
          )}
        </ButtonRow>
      </section>
      <section aria-labelledby="reading-import-paste" className="flex flex-col gap-xs">
        <h2 id="reading-import-paste" className="text-l font-bold">
          貼り付ける
        </h2>
        <form
          noValidate
          onSubmit={(event) => void onPaste(event)}
          className="flex max-w-form flex-col gap-xs"
        >
          <Field
            label="マーカーの文（1行に1つ）"
            description="行の頭に「p.38」と書くとページ、「//」の後ろはコメントになります。"
            error={pasteError}
          >
            <Textarea
              rows={6}
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setPasteError(undefined);
              }}
            />
          </Field>
          <ButtonRow>
            <Button type="submit">確かめる</Button>
          </ButtonRow>
        </form>
      </section>
    </Page>
  );
}

/**
 * 取りこむ画面。
 * @returns 画面の要素
 */
export function ImportPage() {
  return (
    <SessionGate>
      <Import />
    </SessionGate>
  );
}
