// 管理者・編集者・メンバーが Threads でできることの図（threads-013。PRD 組織 FR-T33。めぐるの team/RoleDiagram.tsx の中身を写した）。
// 「このアカウントのチーム」のカードの下と、Threads の組織の画面から開く。読むだけの枠。
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { useState } from "react";

/** 役割ごとにできること。 */
const ROLES: readonly { name: string; points: readonly string[] }[] = [
  {
    name: "持ち主",
    points: [
      "運用アカウントのすべての操作（承認・設定・Threads への接続・消す）",
      "組織に入れる・外す、組織に見せる、担当の人に承認を任せる",
    ],
  },
  {
    name: "管理者",
    points: [
      "招待・役割の切り替え・担当を決める",
      "組織の運用状況（投稿の数・伸び・最後に動いた日）を見る",
      "ほかの人の運用アカウントの中身は、自分を担当にしたときか、見せてもらったときだけ",
    ],
  },
  {
    name: "編集者（担当の人）",
    points: [
      "担当の運用アカウントで、投稿の案と戦略を作る・直す",
      "承認・却下は、持ち主に任されたときだけ",
      "担当の運用アカウントの運用状況を見る",
    ],
  },
  {
    name: "メンバー",
    points: ["持ち主が組織に見せた運用アカウントの、投稿の案と戦略を読むだけ"],
  },
];

/**
 * 役割でできることの図を開くボタンと枠。
 * @returns 要素
 */
export function RoleDiagram() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="small" variant="text" onClick={() => setOpen(true)}>
        役割でできること
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="役割でできること"
        description="どの役割でも、NGワードの確かめと人による承認は省けません。設定・接続・消すのは持ち主だけです。"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            閉じる
          </Button>
        }
      >
        <ul className="flex flex-col gap-s text-m">
          {ROLES.map((role) => (
            <li key={role.name} className="flex flex-col gap-x3s">
              <p className="font-bold">{role.name}</p>
              <ul className="list-disc pl-m">
                {role.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
