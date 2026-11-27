// 宣伝とリサーチの画面の「参考の投稿」の節（threads-004。threads-012 でめぐるの pages/research.tsx の参考投稿にそろえた）：
// - 一覧：媒体・鮮度・解説の有無の印、キーワード、閲覧数といいね、足した日時、「投稿を開く」、長い本文は「もっと見る」
// - 足す：枠で何件かためてまとめて足す（1回に20件まで。URL・反応の数・投稿者・メモ・なぜ良いかも入れられる）
// - 直す：枠で全部の欄を直せる。「なぜ良いか：未入力」を押しても直す枠が開く
// - 「なぜ良いか」は、外の AI に貼るプロンプトで作り、答えを貼り戻して保存する（まとめてか1件ずつ。AI の段階1）
// 入力の誤りは欄のそば、結果は押したボタンの近く、消す前は確かめる（EXPERIENCE.md）。
import { jstDateTime } from "@workspace/contracts/core";
import { FRESHNESS_LEVELS, REFERENCE_PLATFORMS } from "@workspace/contracts/threads";
import type { ReferencePost } from "@workspace/contracts/threads";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { deleteReferencePost } from "./api.ts";
import { ExplainBatchPanel } from "./ExplainBatchPanel.tsx";
import { AddReferenceDialog, EditReferenceDialog } from "./ReferencePostDialogs.tsx";
import { ResearchGuide } from "./ResearchGuide.tsx";
import { THREADS_QUERY_KEYS, useReferencePosts } from "./queries.ts";
import { metricsLine } from "./reference-post-form.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/** 節が受け取るもの。 */
type SectionProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/** 開いている枠。 */
type OpenDialog = { kind: "add" } | { kind: "edit"; post: ReferencePost } | null;

/**
 * 本文が長い（6行か240文字を超える）か。
 * @param body 本文
 * @returns 長ければ true
 */
function isLongBody(body: string): boolean {
  return body.split("\n").length > 6 || body.length > 240;
}

/** ReferenceCard が受け取るもの。 */
type ReferenceCardProps = {
  /** 参考の投稿 */
  post: ReferencePost;
  /** 直す枠を開く */
  onEdit: () => void;
  /** 消す確かめを開く */
  onRemove: () => void;
};

/**
 * 参考の投稿の1件。
 * @param props 参考の投稿・直す・消す
 * @returns 要素
 */
function ReferenceCard({ post, onEdit, onRemove }: ReferenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const long = isLongBody(post.body);
  const platform = REFERENCE_PLATFORMS.find((item) => item.value === post.platform)?.label;
  const freshness = FRESHNESS_LEVELS.find((item) => item.value === post.freshness)?.label;
  const metrics = metricsLine(post.metrics);
  const explained = post.whyGood.trim() !== "";
  return (
    <li className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs">
      <div className="flex flex-wrap items-center gap-xxs">
        <Badge>ID:{post.shortId}</Badge>
        <Badge>{platform}</Badge>
        <Badge variant={post.freshness === "latest" ? "success" : "neutral"}>{freshness}</Badge>
        <Badge variant={explained ? "success" : "neutral"}>
          {explained ? "解説あり" : "解説なし"}
        </Badge>
      </div>
      <p
        className={
          long && !expanded
            ? "line-clamp-6 text-m break-words whitespace-pre-wrap"
            : "text-m break-words whitespace-pre-wrap"
        }
      >
        {post.body}
      </p>
      {long ? (
        <div>
          <Button
            variant="text"
            size="small"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "閉じる" : "もっと見る"}
          </Button>
        </div>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-xs gap-y-x3s text-s text-text-sub">
        {post.keyword ? <span>キーワード：{post.keyword}</span> : null}
        {metrics ? <span>{metrics}</span> : null}
        <span>足した日時：{jstDateTime(post.createdAt)}</span>
        {post.postUrl ? (
          <a
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-link underline"
          >
            投稿を開く（新しいタブ）
          </a>
        ) : null}
      </p>
      {explained ? (
        <p className="rounded-md bg-surface-sunken p-xxs text-s break-words whitespace-pre-wrap">
          <span className="font-bold">なぜ良いか：</span>
          {post.whyGood}
        </p>
      ) : (
        <div>
          <Button variant="text" size="small" onClick={onEdit}>
            なぜ良いか：未入力
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-xxs">
        <Button size="small" onClick={onEdit}>
          直す
        </Button>
        <Button variant="text" size="small" onClick={onRemove}>
          消す
        </Button>
      </div>
    </li>
  );
}

/**
 * 参考の投稿の節。
 * @param props 運用アカウントの ID（accountId）
 * @returns 節の要素
 */
export function ReferenceSection({ accountId }: SectionProps) {
  const queryClient = useQueryClient();
  const query = useReferencePosts(accountId);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [result, setResult] = useState<Result>();
  const [removing, setRemoving] = useState<ReferencePost>();
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  /**
   * 読み直す。
   * @returns 読み直しの終わり
   */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  const posts = query.data.items;
  const limit = query.data.limit;
  const atLimit = posts.length >= limit;

  /** 消す（確かめの枠から）。 */
  const confirmRemove = async () => {
    if (!removing || removePending) return;
    setRemoveError(undefined);
    setRemovePending(true);
    try {
      await deleteReferencePost(accountId, removing.id);
      await refresh();
      setRemoving(undefined);
      setResult({ tone: "success", message: "参考の投稿を消しました。" });
    } catch (caught) {
      setRemoveError(`消せませんでした。${errorMessage(caught)}`);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <section aria-labelledby="threads-references" className="flex flex-col gap-xs">
      <h2 id="threads-references" className="text-l font-bold">
        参考の投稿
      </h2>
      <p className="text-m">
        Threads
        で反応の良い投稿を見つけたら残します。投稿と「なぜ良いか」が、案を作るプロンプトに入ります（新しいものから10件）。
      </p>
      <ResearchGuide />
      {atLimit ? (
        <p role="status" className="rounded-md border border-border bg-surface-sunken p-xs text-m">
          足せる上限（{limit}件）に達しています。いらないものを消してから足してください。
        </p>
      ) : null}
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            variant="primary"
            aria-disabled={atLimit || undefined}
            onClick={() => {
              if (atLimit) return;
              setResult(undefined);
              setDialog({ kind: "add" });
            }}
          >
            参考の投稿を足す
          </Button>
        </ButtonRow>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
      {posts.length === 0 ? (
        <p className="text-m text-text-sub">
          まだ参考の投稿はありません。Threads で見つけた反応の良い投稿を残しましょう。
        </p>
      ) : (
        <ul aria-label="参考の投稿の一覧" className="flex flex-col gap-xs">
          {posts.map((post) => (
            <ReferenceCard
              key={post.id}
              post={post}
              onEdit={() => {
                setResult(undefined);
                setDialog({ kind: "edit", post });
              }}
              onRemove={() => setRemoving(post)}
            />
          ))}
        </ul>
      )}
      <ExplainBatchPanel accountId={accountId} posts={posts} onSaved={refresh} />
      {dialog?.kind === "add" ? (
        <AddReferenceDialog
          accountId={accountId}
          remaining={Math.max(0, limit - posts.length)}
          onClose={() => setDialog(null)}
          onSaved={async (count) => {
            await refresh();
            setResult({
              tone: "success",
              message: `参考の投稿を${count.toString()}件足しました。`,
            });
          }}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EditReferenceDialog
          accountId={accountId}
          post={dialog.post}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await refresh();
            setResult({ tone: "success", message: "参考の投稿を保存しました。" });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title="参考の投稿を消します"
        confirmLabel="消す"
        pendingLabel="消しています…"
        pending={removePending}
        error={removeError}
        onConfirm={() => void confirmRemove()}
      >
        消した参考の投稿は元に戻せません。
      </ConfirmDialog>
    </section>
  );
}
