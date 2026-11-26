// 設定 › 運営 › アプリの台帳（/settings/apps。運営者だけ。core-005・AD-16）。
// 登録されたアプリごとに1行：アプリの名前と属する領域・公開の状態のチップ（切・運営者だけ・公開）・今見える人。
// チップを押すと、その場で保存する（デプロイは要らない）。結果は、その行のチップのそばに出す（EXPERIENCE.md 3）。
// 保存できなければ、チップを前の状態に戻し、理由を出す。保存したら、外枠のアプリの切り替えとナビを読み直す。
import type { AppSettingView, AppVisibility } from "@workspace/contracts/suite";
import {
  APP_VISIBILITIES,
  APP_VISIBILITY_AUDIENCES,
  APP_VISIBILITY_DESCRIPTIONS,
  APP_VISIBILITY_LABELS,
} from "@workspace/contracts/suite";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, useSession } from "../account/index.ts";
import { OperatorOnlyPage } from "./OperatorOnlyPage.tsx";
import { updateAppSetting } from "./api.ts";
import { SUITE_QUERY_KEYS, useAppSettings } from "./queries.ts";

/** チップの選択肢（画面の順）。 */
const OPTIONS = APP_VISIBILITIES.map((value) => ({ value, label: APP_VISIBILITY_LABELS[value] }));

/** 行の結果の文。 */
type RowResult = { tone: "success" | "danger"; message: string };

/**
 * 台帳の1行。
 * @param props 台帳の行（setting）
 * @returns 行の要素
 */
function LedgerRow({ setting }: { setting: AppSettingView }) {
  const queryClient = useQueryClient();
  // 保存の間だけ選んだ値を出し、ふだんは読み直した台帳の値に従う（ほかのタブ・ほかの運営者の変更も映す）
  const [optimistic, setOptimistic] = useState<AppVisibility | undefined>();
  const [result, setResult] = useState<RowResult | undefined>();
  const [pending, setPending] = useState(false);
  const value = optimistic ?? setting.visibility;

  const change = async (next: AppVisibility) => {
    if (pending || next === value) return;
    setOptimistic(next);
    setPending(true);
    setResult(undefined);
    try {
      await updateAppSetting(setting.key, { visibility: next });
      setResult({ tone: "success", message: `「${APP_VISIBILITY_LABELS[next]}」にしました。` });
      // 切り替え・ナビ・すべてのアプリにすぐ効かせる（台帳も読み直す）
      await queryClient.invalidateQueries({ queryKey: SUITE_QUERY_KEYS.all });
    } catch (caught) {
      setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setOptimistic(undefined);
      setPending(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="align-top">
        <p className="text-m font-bold">{setting.name}</p>
        <p className="text-s text-text-sub">{setting.domains.join("・")}</p>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-x3s" aria-busy={pending ? true : undefined}>
          <ChoiceChips
            label={`${setting.name}の公開の状態`}
            labelHidden
            options={OPTIONS}
            value={value}
            onValueChange={(next) => void change(next)}
          />
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </TableCell>
      <TableCell className="align-top text-m">{APP_VISIBILITY_AUDIENCES[value]}</TableCell>
    </TableRow>
  );
}

/**
 * 台帳の中身（運営者だけ）。
 * @returns 要素
 */
function LedgerContent() {
  const session = useSession();
  const isOperator = session.status === "authenticated" && session.account.isOrganizer;
  const query = useAppSettings(isOperator);
  if (session.status !== "authenticated") return null;
  if (!isOperator) return <OperatorOnlyPage />;
  return (
    <Page
      title="アプリの台帳"
      lead="アプリごとに、だれに見せるかを決めます。変えるとすぐに効きます（デプロイは要りません）。運営者だけが開ける画面です。"
    >
      {query.isPending ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m">{errorMessage(query.error)}</p>
          <ButtonRow>
            <Button onClick={() => void query.refetch()}>もう一度</Button>
          </ButtonRow>
        </div>
      ) : (
        // 狭い画面では、表を枠の中で横に動かす（チップを縦に積まない。EXPERIENCE.md 7）
        <Table aria-label="アプリの台帳" className="min-w-form">
          <TableHeader>
            <TableRow>
              <TableHead>アプリ</TableHead>
              <TableHead>公開の状態</TableHead>
              <TableHead>今見える人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.apps.map((setting) => (
              <LedgerRow key={setting.key} setting={setting} />
            ))}
          </TableBody>
        </Table>
      )}
      <dl aria-label="公開の状態の意味" className="flex flex-col gap-xxs text-s">
        {APP_VISIBILITIES.map((visibility) => (
          <div key={visibility} className="flex flex-wrap gap-x-xs">
            <dt className="font-bold">{APP_VISIBILITY_LABELS[visibility]}</dt>
            <dd className="text-text-sub">{APP_VISIBILITY_DESCRIPTIONS[visibility]}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}

/**
 * アプリの台帳の画面。
 * @returns 画面の要素
 */
export function LedgerPage() {
  return (
    <SessionGate>
      <LedgerContent />
    </SessionGate>
  );
}
