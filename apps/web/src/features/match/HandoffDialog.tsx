// M4 電波なしで渡す（試合表の画面から。FR-M24・AD-28。match-005）。今の試合表（呼び名と組み合わせと進み具合と版の番号だけ）を
// QR にして出す。見るだけのページを前に開いたスマホが「QR を読む」で読むと、ネットなしで表が入る（今より新しい版のときだけ）。
// 1枚に入らなければ、つづきの QR を2秒おきに切りかえて出す（前へ・次へ・止めるも押せる）。上限に入らなければ渡せないと出す。
import type { MatchTable } from "@workspace/contracts/match";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useState } from "react";
import { formatClock } from "./format.ts";
import { HandoffTooLargeError, encodeTableHandoff, handoffOfTable } from "./handoff.ts";
import { QrCode } from "./qr.tsx";

/** つづきの QR を切りかえる間（ミリ秒）。 */
const ROTATE_MS = 2_000;
/** 画面に出す QR の一辺（px）。 */
const HANDOFF_QR_SIZE = 400;

/** HandoffDialog が受け取るもの。 */
type HandoffDialogProps = {
  /** 開いているか */
  open: boolean;
  /** 開く・閉じる */
  onOpenChange: (open: boolean) => void;
  /** 試合表（送っていない変更を含む） */
  table: MatchTable;
  /** 渡す版 */
  version: number;
};

/**
 * 電波なしで渡す QR の枠。
 * @param props 開いているか・開く閉じる・試合表・渡す版
 * @returns 枠の要素
 */
export function HandoffDialog({ open, onOpenChange, table, version }: HandoffDialogProps) {
  const [madeAt, setMadeAt] = useState(() => Date.now());
  const [texts, setTexts] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const noLink = table.links.viewHint === null;

  useEffect(() => {
    if (noLink) return;
    let live = true;
    // 表が変わるたびに、その時刻で作り直す（見るだけのページは、この時刻から今の試合を見込む）
    const now = Date.now();
    encodeTableHandoff(handoffOfTable(table, version, now))
      .then((made) => {
        if (!live) return;
        setMadeAt(now);
        setTexts(made);
        setIndex(0);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        setError(
          caught instanceof HandoffTooLargeError
            ? caught.message
            : "QR を作れませんでした。大きく映す画面か、印刷した紙で見てもらってください。",
        );
      });
    return () => {
      live = false;
    };
  }, [noLink, table, version]);

  const total = texts?.length ?? 0;
  useEffect(() => {
    if (total <= 1 || paused) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % total), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, total]);

  const text = texts?.[index % Math.max(1, total)];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="電波なしで渡す"
      description="スマホで読むと、今の試合表が入ります（前に見るだけのページを開いたスマホだけ）。入るのは呼び名と組み合わせと進み具合だけです。"
      footer={<Button onClick={() => onOpenChange(false)}>閉じる</Button>}
    >
      {noLink ? (
        <ResponseMessage tone="danger">
          見るだけのリンクがまだありません。先に「見るだけのページ」でリンクを作り、参加者に1度開いてもらってください（QR
          を読めるのは、そのページを開いたことのあるスマホだけです）。
        </ResponseMessage>
      ) : error ? (
        <ResponseMessage tone="danger">{error}</ResponseMessage>
      ) : !text ? (
        <p aria-busy="true" className="text-m text-text-sub">
          QR を作っています…
        </p>
      ) : (
        <div className="flex flex-col items-center gap-xxs">
          <QrCode
            text={text}
            ecc="L"
            size={HANDOFF_QR_SIZE}
            label={total > 1 ? `試合表の QR（${index + 1}/${total}枚目）` : "試合表の QR"}
            className="h-auto w-full max-w-full"
          />
          <p className="text-s text-text-sub">
            {`${formatClock(madeAt)} の表（版 ${version}）・組み直したら読み直してもらってください。`}
          </p>
          {total > 1 ? (
            <div className="flex flex-wrap items-center justify-center gap-xxs">
              <p role="status" className="text-m font-bold">{`${index + 1}/${total}枚目`}</p>
              <Button size="small" onClick={() => setIndex((index - 1 + total) % total)}>
                前へ
              </Button>
              <Button size="small" onClick={() => setPaused(!paused)}>
                {paused ? "切りかえる" : "止める"}
              </Button>
              <Button size="small" onClick={() => setIndex((index + 1) % total)}>
                次へ
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
