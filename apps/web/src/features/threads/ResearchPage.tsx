// 宣伝とリサーチ（threads-004。めぐるの戦略の「宣伝」「リサーチ」）：
// - 宣伝の投稿の割合（％）と、宣伝したい内容（イベントの情報は任意）。宣伝中で期限内のものが、案を作るプロンプトに入る
// - 参考の投稿（伸びている投稿）。「なぜ良いか」の解説は、外の AI に貼るプロンプトを作り、答えを貼り戻して保存する（AI の段階1）
// - リサーチのキーワード。キーワードの案も、外の AI に頼んで貼り戻し、選んだものだけを足す
// 入力の誤りは欄のそば、結果は押したボタンの近く、消す前は確かめる（EXPERIENCE.md）。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { getRouteApi } from "@tanstack/react-router";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { AccountGate } from "./AccountGate.tsx";
import { KeywordsSection } from "./KeywordsSection.tsx";
import { PromotionsSection } from "./PromotionsSection.tsx";
import { ReferenceSection } from "./ReferenceSection.tsx";

/**
 * 宣伝とリサーチの画面（ログインが要る・自分の運用アカウントだけ）。
 * @param props 運用アカウントの ID（accountId）
 * @param props.accountId 運用アカウントの ID
 * @returns 画面の要素
 */
export function ResearchPage({ accountId }: { accountId: string }) {
  return (
    <AccountGate accountId={accountId}>
      {(account: ThreadsAccount) => (
        <ThreadsPage
          title="宣伝とリサーチ"
          lead={`${account.name}：案を作る材料（宣伝・参考の投稿・キーワード）`}
        >
          <div className="flex max-w-form flex-col gap-l">
            <PromotionsSection accountId={account.id} />
            <ReferenceSection accountId={account.id} />
            <KeywordsSection accountId={account.id} />
          </div>
        </ThreadsPage>
      )}
    </AccountGate>
  );
}

const researchRouteApi = getRouteApi("/threads/accounts/$accountId/research");

/**
 * 宣伝とリサーチの道の画面（道の値を読む）。
 * @returns 画面の要素
 */
export function ResearchRoute() {
  const { accountId } = researchRouteApi.useParams();
  return <ResearchPage accountId={accountId} />;
}
