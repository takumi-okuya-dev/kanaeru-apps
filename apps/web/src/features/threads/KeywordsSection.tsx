// 宣伝とリサーチの画面の「リサーチのキーワード」の節（threads-004。キーワードの案も外の AI に頼んで貼り戻し、選んだものだけを足す）。
// threads-012：キーワードを直せる（枠）・「Threads で検索」のリンク・上限の知らせ（めぐるの pages/research.tsx のキーワード）。
import { ResearchKeywordInput, parseKeywordIdeas } from "@workspace/contracts/threads";
import type { KeywordIdea, ResearchKeyword } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues } from "../../lib/form.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { createKeywords, deleteKeyword, fetchKeywordIdeaPrompt } from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";
import { EditKeywordDialog } from "./KeywordDialog.tsx";
import { threadsSearchUrl } from "./reference-post-form.ts";
import { THREADS_QUERY_KEYS, useKeywords } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 欄ごとの誤り。 */
type Errors = Record<string, string | undefined>;

/** 節が受け取るもの。 */
type SectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

// ---- キーワード ----

/** キーワードの案の問題の文。 */
const IDEA_PROBLEMS: Record<NonNullable<KeywordIdea["problem"]>, string> = {
  too_long: "長すぎます",
  registered: "登録済み",
  duplicate: "重なっています",
};

/**
 * リサーチのキーワードの節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
export function KeywordsSection({ accountId }: SectionProps) {
  const queryClient = useQueryClient();
  const query = useKeywords(accountId);
  const [keyword, setKeyword] = useState("");
  const [purpose, setPurpose] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<Result>();
  const [ideaPrompt, setIdeaPrompt] = useState<string>();
  const [ideaAnswer, setIdeaAnswer] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [ideaResult, setIdeaResult] = useState<Result>();
  const [removing, setRemoving] = useState<ResearchKeyword>();
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string>();
  const [editing, setEditing] = useState<ResearchKeyword>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const keywords = query.data.items;
  const limit = query.data.limit;
  const atLimit = keywords.length >= limit;
  const ideas =
    ideaAnswer.trim() === ""
      ? []
      : parseKeywordIdeas(
          ideaAnswer,
          keywords.map((item) => item.keyword),
        );

  /**
   * 足す。
   * @param submitEvent 送る出来事
   */
  const add = async (submitEvent: React.FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setResult(undefined);
    const input = ResearchKeywordInput.safeParse({ keyword, purpose });
    if (!input.success) {
      setErrors(fieldErrorsFromIssues(input.error.issues));
      return;
    }
    setErrors({});
    try {
      await createKeywords(accountId, [input.data]);
      await refresh();
      setKeyword("");
      setPurpose("");
      setResult({ tone: "success", message: `「${input.data.keyword}」を足しました。` });
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (fields["items.0.keyword"]) setErrors({ keyword: fields["items.0.keyword"] });
      else setResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    }
  };

  /** キーワードの案のプロンプトを作る。 */
  const makeIdeaPrompt = async () => {
    try {
      setIdeaPrompt((await fetchKeywordIdeaPrompt(accountId)).prompt);
    } catch (caught) {
      setIdeaResult({ tone: "danger", message: `作れませんでした。${errorMessage(caught)}` });
    }
  };

  /** 選んだ案を足す。 */
  const addIdeas = async () => {
    setIdeaResult(undefined);
    const items = ideas
      .filter((idea) => idea.problem === null && chosen.has(idea.keyword))
      .map((idea) => ({ keyword: idea.keyword, purpose: idea.purpose }));
    if (items.length === 0) {
      setIdeaResult({ tone: "danger", message: "足すキーワードを選んでください。" });
      return;
    }
    try {
      await createKeywords(accountId, items);
      await refresh();
      setIdeaAnswer("");
      setChosen(new Set());
      setIdeaResult({ tone: "success", message: `${items.length}個のキーワードを足しました。` });
    } catch (caught) {
      setIdeaResult({ tone: "danger", message: `足せませんでした。${errorMessage(caught)}` });
    }
  };

  /** 消す（確かめの枠から）。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemoveError(undefined);
    setRemovePending(true);
    try {
      await deleteKeyword(accountId, removing.id);
      await refresh();
      setRemoving(undefined);
      setResult({ tone: "success", message: `「${removing.keyword}」を消しました。` });
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <section aria-labelledby="threads-keywords" className="flex flex-col gap-xs">
      <h2 id="threads-keywords" className="text-l font-bold">
        リサーチのキーワード
      </h2>
      <p className="text-m">Threads の検索に入れて、参考の投稿を探すための言葉です。</p>
      {keywords.length === 0 ? (
        <p className="text-m text-text-sub">まだキーワードはありません。</p>
      ) : (
        <ul aria-label="キーワードの一覧" className="flex flex-col gap-xxs">
          {keywords.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-xxs">
              <span className="text-m font-bold">{item.keyword}</span>
              {item.purpose ? <span className="text-s text-text-sub">{item.purpose}</span> : null}
              <a
                href={threadsSearchUrl(item.keyword)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`「${item.keyword}」を Threads で検索（新しいタブ）`}
                className="text-s text-text-link underline"
              >
                Threads で検索
              </a>
              <Button
                variant="text"
                size="small"
                aria-label={`「${item.keyword}」を直す`}
                onClick={() => {
                  setResult(undefined);
                  setEditing(item);
                }}
              >
                直す
              </Button>
              <Button
                variant="text"
                size="small"
                aria-label={`「${item.keyword}」を消す`}
                onClick={() => setRemoving(item)}
              >
                消す
              </Button>
            </li>
          ))}
        </ul>
      )}
      {atLimit ? (
        <p role="status" className="rounded-md border border-border bg-surface-sunken p-xs text-m">
          足せる上限（{limit}個）に達しています。いらないものを消してから足してください。
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={(submitEvent) => void add(submitEvent)}
        className="flex flex-col gap-xs"
      >
        <Field label="足すキーワード" error={errors.keyword} required>
          <Input value={keyword} onChange={(change) => setKeyword(change.target.value)} />
        </Field>
        <Field label="狙い" error={errors.purpose}>
          <Input value={purpose} onChange={(change) => setPurpose(change.target.value)} />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit">キーワードを足す</Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
      <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
        <h3 className="text-m font-bold">キーワードの案を外の AI に出してもらう</h3>
        <div>
          <Button onClick={() => void makeIdeaPrompt()}>キーワードの案のプロンプトを作る</Button>
        </div>
        {ideaPrompt ? (
          <>
            <Field label="キーワードの案のプロンプト">
              <Textarea readOnly rows={5} value={ideaPrompt} />
            </Field>
            <CopyButton text={ideaPrompt} label="プロンプトをコピー" />
            <Field
              label="AI のキーワードの案の答え"
              description="「キーワード｜狙い」の行をそのまま貼ります。"
            >
              <Textarea
                rows={5}
                value={ideaAnswer}
                onChange={(change) => setIdeaAnswer(change.target.value)}
              />
            </Field>
            {ideas.length > 0 ? (
              <fieldset className="flex flex-col gap-x3s">
                <legend className="text-m font-bold">足す案を選ぶ</legend>
                {ideas.map((idea, index) => (
                  // 読み取った順で見分ける（同じ言葉が並ぶことがある）
                  <label
                    key={`${idea.keyword}-${index.toString()}`}
                    className="flex min-h-l items-center gap-xxs text-m"
                  >
                    <input
                      type="checkbox"
                      className="size-s accent-primary"
                      disabled={idea.problem !== null}
                      checked={idea.problem === null && chosen.has(idea.keyword)}
                      onChange={(change) =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (change.target.checked) next.add(idea.keyword);
                          else next.delete(idea.keyword);
                          return next;
                        })
                      }
                    />
                    {idea.keyword}
                    {idea.purpose ? `（${idea.purpose}）` : ""}
                    {idea.problem ? `：${IDEA_PROBLEMS[idea.problem]}` : ""}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-col items-start gap-xxs">
          {ideaPrompt ? (
            <Button variant="primary" onClick={() => void addIdeas()}>
              選んだキーワードを足す
            </Button>
          ) : null}
          {ideaResult ? (
            <ResponseMessage tone={ideaResult.tone}>{ideaResult.message}</ResponseMessage>
          ) : null}
        </div>
      </div>
      {editing ? (
        <EditKeywordDialog
          accountId={accountId}
          keyword={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async (saved) => {
            await refresh();
            setResult({ tone: "success", message: `「${saved.keyword}」を保存しました。` });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={`「${removing?.keyword ?? ""}」を消します`}
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        消したキーワードは元に戻せません。
      </ConfirmDialog>
    </section>
  );
}
