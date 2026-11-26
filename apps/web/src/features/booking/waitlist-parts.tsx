// 参加者の画面のキャンセル待ちと打診の部品（申込みページ・自分の申込み・札のページで共に使う。booking-004 research R16）。
// 状態の札（確定・キャンセル待ち〈n番目〉・打診中・取り消し）・状態の説明（期限・当日の空き）・「参加する」「辞退する」。
// 受付の約束（reception）を読まない（booking-003 R23）。ほかの人の名前は出さない（自分の何番目かと人数だけ）。
import type { EntryStanding, EntryStatus, PageSeats } from "@workspace/contracts/booking";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { errorMessage } from "../../lib/api.ts";
import { formatEventDateTime } from "../event/index.ts";

/**
 * 申込みの状態の札。
 * @param props 状態と何番目か
 * @param props.status 状態
 * @param props.waitlistPosition キャンセル待ちの何番目か
 * @returns 札の要素
 */
export function EntryStatusBadge({
  status,
  waitlistPosition,
}: {
  status: EntryStatus;
  waitlistPosition: number | null;
}) {
  if (status === "confirmed") return <Badge variant="success">確定</Badge>;
  if (status === "waitlisted") {
    return (
      <Badge>
        {waitlistPosition ? `キャンセル待ち（${waitlistPosition}番目）` : "キャンセル待ち"}
      </Badge>
    );
  }
  if (status === "offered") return <Badge variant="success">打診中</Badge>;
  return <Badge>取り消し</Badge>;
}

/**
 * 状態の説明（キャンセル待ち・打診中・当日の空き）。
 * @param props 状態と並び
 * @param props.status 状態
 * @param props.standing 並びと打診
 * @returns 説明の要素（確定・取り消しは null）
 */
export function StandingNote({
  status,
  standing,
}: {
  status: EntryStatus;
  standing: EntryStanding;
}) {
  if (status === "offered") {
    if (standing.offerExpired) {
      return (
        <p className="text-m">
          返事の期限が過ぎました。この申込みは取り消しになり、席は次の方にお回しします。
        </p>
      );
    }
    return (
      <p className="text-m font-bold">
        {`席が空きました。${standing.offerDeadline ? `${formatEventDateTime(standing.offerDeadline)}までに` : "期限までに"}、参加するかを答えてください。期限を過ぎると、次の方にお回しします。`}
      </p>
    );
  }
  if (status === "waitlisted") {
    return standing.canAccept ? (
      <p className="text-m font-bold">
        当日の空きがあります。先着で参加できます（埋まったら締め切ります）。
      </p>
    ) : (
      <p className="text-m">
        満員のため、キャンセル待ちに入っています。席が空いたら、先頭の方から順に、返事の期限つきでお知らせします。
      </p>
    );
  }
  return null;
}

/**
 * 「参加する」「辞退する」（打診中は両方、当日の空きのキャンセル待ちは参加するだけ）。
 * @param props 状態・並び・答える関数・答えたあと・主のボタンにするか
 * @param props.status 状態
 * @param props.standing 並びと打診
 * @param props.respond 答える関数
 * @param props.onDone 答えたあと（答え）
 * @param props.primary 「参加する」を主のボタンにするか（画面に1つだけのとき。枠の下の ButtonRow に並べる）
 * @returns ボタンの要素（押せないときは null）
 */
export function RespondButtons({
  status,
  standing,
  respond,
  onDone,
  primary = false,
}: {
  status: EntryStatus;
  standing: EntryStanding;
  respond: (answer: "accept" | "decline") => Promise<unknown>;
  onDone: (answer: "accept" | "decline") => Promise<void> | void;
  primary?: boolean;
}) {
  const mutation = useMutation({
    mutationFn: (answer: "accept" | "decline") => respond(answer),
    onSuccess: (_result, answer) => onDone(answer),
  });
  if (!standing.canAccept) return null;
  /** 参加すると答える。 */
  const accept = () => {
    if (!mutation.isPending) mutation.mutate("accept");
  };
  /** 辞退すると答える。 */
  const decline = () => {
    if (!mutation.isPending) mutation.mutate("decline");
  };
  return (
    <div className="flex flex-col items-start gap-xxs">
      {primary ? (
        // 画面に1つだけの申込み：枠の下の並び（二番の「辞退する」→ 主の「参加する」。DESIGN.md の「ボタンの並べ方」）
        <ButtonRow>
          {status === "offered" ? <Button onClick={decline}>辞退する</Button> : null}
          <Button variant="primary" aria-busy={mutation.isPending || undefined} onClick={accept}>
            参加する
          </Button>
        </ButtonRow>
      ) : (
        // 一覧のカードの中：カードの中の操作なので、並びに入れず行の中に置く
        <div className="flex flex-wrap gap-xxs">
          <Button size="small" aria-busy={mutation.isPending || undefined} onClick={accept}>
            参加する
          </Button>
          {status === "offered" ? (
            <Button variant="text" onClick={decline}>
              辞退する
            </Button>
          ) : null}
        </div>
      )}
      {mutation.isError ? (
        <ResponseMessage tone="danger">
          {`答えられませんでした。${errorMessage(mutation.error)}`}
        </ResponseMessage>
      ) : null}
    </div>
  );
}

/**
 * 申込みページの席の欄（残りの席・満員とキャンセル待ちの人数・当日の空き）。
 * @param props 席の欄
 * @param props.seats 席の欄
 * @returns 要素
 */
export function SeatsLine({ seats }: { seats: PageSeats }) {
  if (seats.sameDay) {
    return <p className="text-m font-bold">{`当日の空き：残り${seats.remaining}席（先着）`}</p>;
  }
  if (seats.remaining > 0) {
    return <p className="text-m font-bold">{`残り${seats.remaining}席`}</p>;
  }
  return (
    <p className="text-m">
      <span className="font-bold">{`満員です（キャンセル待ち${seats.waitlist}人）。`}</span>
      申し込むと、キャンセル待ちに入ります。
    </p>
  );
}
