// 受付の一覧画面（A3）の上の「名簿」の節（主催者・受付係。reception の差しこみの場所 registerReceptionSection から出す。
// booking-001 research R13）。使い方が「名簿を使う」か「自前で申込みを受ける」の交流会だけ、名簿に当てる画面と名簿への入口を出す（ほかは何も出さない）。
// ここで読んだ使い方を、外枠のナビの「名簿」も読む（同じ問い合わせの鍵）。
import type { EventView } from "@workspace/contracts/event";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { usesRoster } from "@workspace/contracts/booking";
import { useBookingSetting } from "./queries.ts";

/**
 * 「名簿」の節。
 * @param props 交流会（event）
 * @param props.event 交流会（役目つき）
 * @returns 節の要素（名簿を使わない交流会では null）
 */
export function ReceptionRosterSection({ event }: { event: EventView }) {
  const setting = useBookingSetting(event.id);
  if (!setting.data || !usesRoster(setting.data.mode)) return null;
  return (
    <section
      aria-labelledby="reception-roster"
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <h2 id="reception-roster" className="text-l leading-tight font-bold">
        名簿
      </h2>
      <p className="text-s text-text-sub">
        この交流会は名簿を使っています。チェックインした人を、名簿の人に当ててください。
      </p>
      {/* 枠の下の並び（二番の「名簿を見る」→ この節の主な操作「名簿に当てる」の順。同じ幅にそろえる） */}
      <ButtonRow>
        <Link
          to="/admin/events/$eventId/roster"
          params={{ eventId: event.id }}
          className={buttonVariants({ variant: "secondary" })}
        >
          名簿を見る
        </Link>
        <Link
          to="/admin/events/$eventId/roster/match"
          params={{ eventId: event.id }}
          className={buttonVariants({ variant: "secondary" })}
        >
          名簿に当てる
        </Link>
      </ButtonRow>
    </section>
  );
}
