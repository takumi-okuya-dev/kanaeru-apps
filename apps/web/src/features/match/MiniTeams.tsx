// ミニゲームのチーム分けの表（コートごとに2つのチーム。試合表・見るだけのページ・大きく映す。match-009）。
// コート1はチーム1と2、コート2はチーム3と4…（持ち主が決めた）。運営の画面はレベルの印と、来る人でない人の印を出す。
// 見るだけのページ・大きく映す画面は呼び名だけ（レベルは出さない。AD-26）。
import { cn } from "@workspace/ui/lib/cn";
import { useId } from "react";

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
 * @param props チーム（teams）・字の大きさ（size）
 * @param props.teams チームごとの人（コートの順に2つずつ）
 * @param props.size 字の大きさ（大きく映す画面は large）
 * @returns 表の要素
 */
export function MiniTeams({
  teams,
  size = "normal",
}: {
  teams: readonly (readonly MiniMember[])[];
  size?: "normal" | "large";
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
              <div key={index} className="flex min-w-0 flex-col gap-x3s">
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
                      <span className="truncate">{member.name}</span>
                      {member.note ? (
                        <span className="text-xs text-text-sub no-underline">{member.note}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
