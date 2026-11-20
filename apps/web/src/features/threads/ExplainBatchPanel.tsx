// 解説がまだの参考の投稿を、まとめて外の AI に解説してもらう欄（threads-004 の欄を threads-012 で分けた。
// めぐるの components/research/ExplainBatchPanel.tsx の振る舞いを写した）。
// 10件までのプロンプトを作ってコピーし、答えを1回貼ると【ID】で参考の投稿に結び付ける。保存する答えは1件ずつ外せる。
// ほかで解説が入って保存しなかった分は、数で知らせる。結果は押したボタンの近く（EXPERIENCE.md）。
import { EXPLAIN_BATCH_MAX, isBlank, parseExplanations } from "@workspace/contracts/threads";
import type { ExplanationProblem, ReferencePost } from "@workspace/contracts/threads";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { fetchExplainPrompt, saveExplanations } from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 解説の読み取りの問題の文。 */
const EXPLANATION_PROBLEMS: Record<ExplanationProblem, string> = {
  not_found: "ID が見つかりません",
  already_explained: "もう解説があります",
  duplicate: "同じ投稿が2回あります",
  empty: "解説が空です",
  too_long: "長すぎます",
};

/**
 * 文を n 文字までに縮める（空白はまとめる）。
 * @param text 文
 * @param max 文字数
 * @returns 縮めた文
 */
function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return [...flat].length > max ? `${[...flat].slice(0, max).join("")}…` : flat;
}

/** ExplainBatchPanel が受け取るもの。 */
export type ExplainBatchPanelProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** その運用アカウントの参考の投稿 */
  posts: readonly ReferencePost[];
  /** 保存したあと（読み直す） */
  onSaved: () => Promise<unknown>;
};

/**
 * まとめての解説の欄。
 * @param props 運用アカウントの ID・参考の投稿・保存したあと
 * @returns 欄の要素
 */
export function ExplainBatchPanel({ accountId, posts, onSaved }: ExplainBatchPanelProps) {
  const [prompt, setPrompt] = useState<{ text: string; pendingCount: number }>();
  const [promptError, setPromptError] = useState<string>();
  const [answer, setAnswer] = useState("");
  // 外した答え（読み取った順の番号）。答えを貼り直したら戻す
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>();
  const pendingCount = posts.filter((post) => isBlank(post.whyGood)).length;
  const batchCount = Math.min(pendingCount, EXPLAIN_BATCH_MAX);
  const parsed = answer.trim() === "" ? [] : parseExplanations(answer, [...posts]);
  const picked = parsed.filter(
    (item, index) => item.problem === null && item.id !== null && !excluded.has(index),
  );

  /** プロンプトを作る。 */
  const makePrompt = async () => {
    setPromptError(undefined);
    setResult(undefined);
    try {
      const made = await fetchExplainPrompt(accountId);
      setPrompt({ text: made.prompt, pendingCount: made.pendingCount });
    } catch (caught) {
      setPromptError(`作れませんでした。${errorMessage(caught)}`);
    }
  };

  /** 選んだ解説を保存する。 */
  const save = async () => {
    if (pending) return;
    setResult(undefined);
    if (picked.length === 0) {
      setResult({
        tone: "danger",
        message:
          "保存する解説がありません。【ID:…】の行と「@@@」の区切りを確かめるか、保存する答えを選んでください。",
      });
      return;
    }
    setPending(true);
    try {
      const saved = await saveExplanations(
        accountId,
        picked.map((item) => ({ id: item.id ?? "", whyGood: item.text })),
      );
      await onSaved();
      setAnswer("");
      setExcluded(new Set());
      if (saved.skipped.length === 0) setPrompt(undefined);
      setResult({
        tone: saved.skipped.length === 0 ? "success" : "danger",
        message:
          saved.skipped.length === 0
            ? `${saved.saved.length.toString()}件の解説を保存しました。`
            : `${saved.saved.length.toString()}件の解説を保存しました。${saved.skipped.length.toString()}件は、ほかで解説が入っていたか見つからないため保存しませんでした。`,
      });
    } catch (caught) {
      setResult({ tone: "danger", message: `保存できませんでした。${errorMessage(caught)}` });
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      id="explain"
      className="flex flex-col gap-xs rounded-md border border-border p-xs"
      aria-labelledby="threads-explain-batch"
    >
      <h3 id="threads-explain-batch" className="text-m font-bold">
        「なぜ良いか」をまとめて外の AI に解説してもらう
      </h3>
      <p className="text-s text-text-sub">
        解説がまだの参考の投稿：{pendingCount}件（1回に{EXPLAIN_BATCH_MAX}件まで）
      </p>
      {pendingCount > 0 ? (
        <div className="flex flex-col items-start gap-xxs">
          <Button onClick={() => void makePrompt()}>
            解説のプロンプトを作る（{batchCount}件）
          </Button>
          {promptError ? <ResponseMessage tone="danger">{promptError}</ResponseMessage> : null}
        </div>
      ) : null}
      {prompt ? (
        prompt.text === "" ? (
          <p className="text-m">解説がまだの参考の投稿はありません。</p>
        ) : (
          <>
            <Field
              label="解説のプロンプト"
              description={`解説がまだの投稿：${prompt.pendingCount.toString()}件（1回に${EXPLAIN_BATCH_MAX.toString()}件まで）`}
            >
              <Textarea readOnly rows={6} value={prompt.text} />
            </Field>
            <CopyButton text={prompt.text} label="プロンプトをコピー" />
          </>
        )
      ) : null}
      {prompt || answer !== "" ? (
        <>
          <Field
            label="AI の解説の答え"
            description="答えをそのまま貼ります。【ID:…】の行で投稿を見分けます。"
          >
            <Textarea
              rows={6}
              disabled={pending}
              value={answer}
              onChange={(change) => {
                setAnswer(change.target.value);
                setExcluded(new Set());
              }}
            />
          </Field>
          {parsed.length > 0 ? (
            <fieldset className="flex flex-col gap-xxs">
              <legend className="text-m font-bold">
                保存する解説を選ぶ（{parsed.length}件中{picked.length}件）
              </legend>
              {parsed.map((item, index) => {
                const post = posts.find((candidate) => candidate.id === item.id);
                const ok = item.problem === null && item.id !== null;
                return (
                  // 読み取った順で見分ける（ID がないブロックもある）
                  <label
                    key={`${item.shortId ?? "none"}-${index.toString()}`}
                    className="flex items-start gap-xxs rounded-md border border-border p-xxs text-s"
                  >
                    <input
                      type="checkbox"
                      className="mt-x3s size-s accent-primary"
                      disabled={!ok || pending}
                      checked={ok && !excluded.has(index)}
                      onChange={(change) =>
                        setExcluded((current) => {
                          const next = new Set(current);
                          if (change.target.checked) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                    />
                    <span className="flex min-w-0 flex-col gap-x3s">
                      <span className="text-text-sub">
                        {item.shortId ? `ID:${item.shortId}` : "ID なし"}
                        {post ? `：${shorten(post.body, 40)}` : ""}
                      </span>
                      {item.problem ? (
                        <span>
                          <Badge variant="danger">
                            保存しません（{EXPLANATION_PROBLEMS[item.problem]}）
                          </Badge>
                        </span>
                      ) : null}
                      <span className="break-words whitespace-pre-wrap">
                        {shorten(item.text, 120)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className="flex flex-col items-start gap-xxs">
            <Button
              variant="primary"
              onClick={() => void save()}
              aria-disabled={pending || undefined}
            >
              {pending ? "保存しています…" : `${picked.length.toString()}件の解説を保存`}
            </Button>
          </div>
        </>
      ) : null}
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}
