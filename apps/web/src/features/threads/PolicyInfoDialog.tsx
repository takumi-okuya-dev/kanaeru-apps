// 設定の「投稿のルール」の中の「Threads の規約への備え」（threads-012。めぐるの PolicyInfoDialog・PostingRulesSection を写した）。
// アプリが用意しているルール（プロンプトに入れるもの）と「規約に注意」の分類を、読むだけで出す。変えられない。
// 規約に触れないことを約束するものではない（枠の説明に書く）。
import {
  POLICY_CAUTIONS,
  POLICY_LIST_VERSION,
  POLICY_PROMPT_RULES,
} from "@workspace/contracts/threads";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { useState } from "react";

/**
 * 「Threads の規約への備え」の行と、押すと開く読むだけの枠。
 * @returns 要素
 */
export function PolicyInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-xxs rounded-md border border-border p-s">
      <p className="text-m font-bold">Threads の規約への備え</p>
      <p className="text-s text-text-sub">
        規約に触れやすい表現に「規約に注意」と出し、案を作るプロンプトにルールを入れています。
      </p>
      <div>
        <Button size="small" onClick={() => setOpen(true)}>
          規約への備えを見る
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Threads の規約への備え"
        description="アプリが用意しているルールです。変えたり止めたりはできません。規約に触れないことを約束するものではありません。"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            閉じる
          </Button>
        }
      >
        <div className="flex flex-col gap-s text-m">
          <section aria-labelledby="threads-policy-rules" className="flex flex-col gap-xxs">
            <h3 id="threads-policy-rules" className="font-bold">
              プロンプトに入れるルール
            </h3>
            <ul className="list-disc pl-m">
              {POLICY_PROMPT_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="threads-policy-cautions" className="flex flex-col gap-xxs">
            <h3 id="threads-policy-cautions" className="font-bold">
              「規約に注意」と出す表現
            </h3>
            <ul className="flex flex-col gap-xs">
              {POLICY_CAUTIONS.map((caution) => (
                <li key={caution.id} className="flex flex-col gap-x3s">
                  <p className="font-bold">{caution.label}</p>
                  <p className="text-text-sub">{caution.suggestion}</p>
                  <a
                    href={caution.policyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-s text-text-link underline"
                  >
                    {caution.policyName}（新しいタブで開きます）
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-s text-text-sub">
            {POLICY_LIST_VERSION} の時点の Meta のコミュニティ規定をもとにしています。
          </p>
        </div>
      </Dialog>
    </div>
  );
}
