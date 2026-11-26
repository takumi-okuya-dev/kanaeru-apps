// ミニゲームのチーム分けの表（コートごとに2つのチーム。試合表・見るだけのページ・大きく映す。match-009）。
// コート1はチーム1と2、コート2はチーム3と4…（持ち主が決めた）。運営の画面はレベルの印と、来る人でない人の印を出す。
// 見るだけのページ・大きく映す画面は呼び名だけ（レベルは出さない。AD-26）。
// 直す形（担当の端末の「組み合わせを直す」。match-010）では、人を入れかえ・チームの枠に落としてほかのチームへ移せる。
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { useId } from "react";
import type { TeamSlot } from "./swap.ts";
import { DRAG_TYPE, SwapName } from "./SwapName.tsx";
import type { SwapEdit } from "./SwapName.tsx";

/** チームを直す道具（入れかえと、ほかのチームへ移す）。 */
export type MiniTeamsEdit = SwapEdit<TeamSlot> & {
  /** 人をほかのチームの最後へ移す */
  onMove: (from: TeamSlot, team: number) => void;
};

/** チームの1人（画面に出すもの）。 */
export type MiniMember = {
  /** 呼び名 */
  name: string;
  /** 名前の後ろの印（運営の画面のレベル・「帰った」など。なければ出さない） */
  note?: string;
  /** 来る人でない（薄く出す） */
  away?: boolean;
};

/**
 * ミニゲームのチーム分けの表。
 * @param props チーム（teams）・字の大きさ（size）・直す道具（edit）
 * @param props.teams チームごとの人（コートの順に2つずつ）
 * @param props.size 字の大きさ（大きく映す画面は large）
 * @param props.edit 直す形の道具（なければ文字だけ）
 * @returns 表の要素
 */
export function MiniTeams({
  teams,
  size = "normal",
  edit,
}: {
  teams: readonly (readonly MiniMember[])[];
  size?: "normal" | "large";
  edit?: MiniTeamsEdit | undefined;
}) {
  const baseId = useId();
  const courts = Math.ceil(teams.length / 2);
  return (
    <div className={cn("grid grid-cols-1 gap-xs", size === "normal" && "wide:grid-cols-2")}>
      {Array.from({ length: courts }, (_, court) => (
        <section
          key={court}
          aria-labelledby={`${baseId}-court-${court}`}
          className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
        >
          <h3
            id={`${baseId}-court-${court}`}
            className={cn("font-bold", size === "large" ? "text-xl" : "text-l")}
          >
            コート {court + 1}
          </h3>
          <div className="grid grid-cols-2 gap-xs">
            {[court * 2, court * 2 + 1].map((index) => (
              <div
                key={index}
                className="flex min-w-0 flex-col gap-x3s"
                onDragOver={(dragEvent) => {
                  if (edit && dragEvent.dataTransfer.types.includes(DRAG_TYPE)) {
                    dragEvent.preventDefault();
                  }
                }}
                onDrop={(dragEvent) => {
                  const raw = dragEvent.dataTransfer.getData(DRAG_TYPE);
                  if (!edit || !raw) return;
                  dragEvent.preventDefault();
                  edit.onMove(JSON.parse(raw) as TeamSlot, index);
                }}
              >
                <h4 className={cn("font-bold", size === "large" ? "text-l" : "text-m")}>
                  チーム {index + 1}
                </h4>
                <ul className="flex flex-col gap-x3s">
                  {(teams[index] ?? []).map((member, position) => (
                    <li
                      key={position}
                      className={cn(
                        "flex min-w-0 flex-wrap items-baseline gap-x3s",
                        size === "large" ? "text-xl" : "text-m",
                        member.away && "text-text-sub line-through",
                      )}
                    >
                      {edit ? (
                        <SwapName
                          name={member.name}
                          slot={{ team: index, index: position }}
                          edit={edit}
                          same={(a, b) => a.team === b.team && a.index === b.index}
                          label={`チーム${index + 1}の${member.name}`}
                        />
                      ) : (
                        <span className="truncate">{member.name}</span>
                      )}
                      {member.note ? (
                        <span className="text-xs text-text-sub no-underline">{member.note}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {edit?.picked && edit.picked.team !== index ? (
                  <div>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        if (edit.picked) edit.onMove(edit.picked, index);
                      }}
                    >
                      {`チーム ${index + 1} へ移す`}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
