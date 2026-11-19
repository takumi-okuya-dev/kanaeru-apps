// 設定の画面の「操作の記録」の節（threads-005）：承認・却下・設定の保存・自動投稿などを、新しい順に100件まで（90日で消える）。
import { ACTIVITY_KINDS, ACTIVITY_KIND_LABELS } from "@workspace/contracts/threads";
import type { ActivityKind } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { useState } from "react";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { useActivity } from "./queries.ts";

/** 絞りこみの選択肢（すべて＋種類）。 */
const OPTIONS: { value: ActivityKind | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  ...ACTIVITY_KINDS.map((value) => ({ value, label: ACTIVITY_KIND_LABELS[value] })),
];

/**
 * 操作の記録の節。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 節の要素
 */
export function ActivitySection({ accountId }: { accountId: string }) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const query = useActivity(accountId, kind);
  return (
    <section aria-labelledby="threads-activity" className="flex flex-col gap-xs">
      <h2 id="threads-activity" className="text-l font-bold">
        操作の記録
      </h2>
      <p className="text-s text-text-sub">
        新しい順に100件まで出します。90日を過ぎた記録は消えます。
      </p>
      <ChoiceChips label="表示する記録" options={OPTIONS} value={kind} onValueChange={setKind} />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <p className="text-m">まだ記録はありません。</p>
      ) : (
        <ul aria-label="操作の記録" className="flex flex-col gap-xxs">
          {query.data.items.map((item) => (
            <li key={item.id} className="flex flex-col border-b border-border pb-xxs text-m">
              <span>
                {item.label}
                {item.itemCount > 1 ? `（${item.itemCount}件）` : ""}
                {item.summary ? `：${item.summary}` : ""}
              </span>
              <span className="text-s text-text-sub">
                {jstDateTime(item.createdAt)}・{ACTIVITY_KIND_LABELS[item.kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
