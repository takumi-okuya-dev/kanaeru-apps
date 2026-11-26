// M7 の「参加者の QR を読む」（P3 の QR を運営の端末のカメラで読み、名簿に入れる。AD-30・FR-M29。match-005）。
// - 電波がなくて受付を送れなかった参加者のスマホが、呼び名とレベルを入れた QR を出す。担当の端末で読むと名簿に入る
//   （ネットなしでも入る。送りは端末に残り、つながったら送る。AD-28）
// - 同じ試合表の受付の QR か（受付の札の印）を確かめる。違えば入れない（受付を作り直した・別の試合表）
// - 名簿の人の ID は QR の乱数から決まるので、同じ QR を2回読んでも1人しか入らない
// - QR から入れた人は、下に並べる（名簿と設定で直せる・消せる）
import type { MatchTable } from "@workspace/contracts/match";
import { MATCH_LEVEL_LABELS, ROSTER_MAX } from "@workspace/contracts/match";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Dialog } from "@workspace/ui/components/dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { joinQrPlayerId, readHandoffPart } from "./handoff.ts";
import { QrScanner } from "./QrScanner.tsx";
import type { TableEditor } from "./table-editor.ts";

/** 読んだ結果。 */
type ReadResult = { tone: "success" | "danger"; text: string };

/** JoinQrReader が受け取るもの。 */
type JoinQrReaderProps = {
  /** 試合表 */
  table: MatchTable;
  /** 試合表を直す道具 */
  editor: TableEditor;
  /** 今の受付の札の印（受付の一覧の hint。読めていなければ試合表の joinHint） */
  joinHint: string | null;
};

/**
 * 参加者の QR を読む部分。
 * @param props 試合表・直す道具・今の受付の札の印
 * @returns 要素
 */
export function JoinQrReader({ table, editor, joinHint }: JoinQrReaderProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReadResult>();
  const scanned = table.content.players.filter((player) => /^q[0-9a-f]{15}$/u.test(player.id));

  /**
   * 読んだ文字を受け取り、名簿に入れる（次の人も読めるよう、カメラは止めない）。
   * @param text 読んだ文字
   * @returns 続けて読む
   */
  const read = (text: string): "continue" => {
    const part = readHandoffPart(text);
    if (part?.kind !== "join") {
      setResult({
        tone: "danger",
        text: "受付の QR ではありません。参加者のスマホの「この QR を運営に見せてください」の QR を読んでください。",
      });
      return "continue";
    }
    const { join } = part;
    if (!joinHint || join.hint !== joinHint) {
      setResult({
        tone: "danger",
        text: "この試合表の受付の QR ではありません（受付のリンクを作り直したか、別の試合表です）。名前とレベルを聞いて、名簿と設定で入れてください。",
      });
      return "continue";
    }
    const id = joinQrPlayerId(join.nonce);
    const label = `${join.nickname}（${MATCH_LEVEL_LABELS[join.level]}）`;
    const seen = { outcome: "added" as "added" | "already" | "full" };
    const applied = editor.apply((draft) => {
      if (draft.content.players.some((player) => player.id === id)) {
        seen.outcome = "already";
        return draft;
      }
      if (draft.content.players.length >= ROSTER_MAX) {
        seen.outcome = "full";
        return draft;
      }
      return {
        ...draft,
        content: {
          ...draft.content,
          players: [
            ...draft.content.players,
            { id, nickname: join.nickname.trim(), level: join.level, status: "present" },
          ],
        },
      };
    });
    if (!applied) {
      setResult({
        tone: "danger",
        text: "送れなかった変更が端末に残っているため、今は名簿に入れられません。上の知らせで選んでください。",
      });
    } else if (seen.outcome === "already") {
      setResult({ tone: "success", text: `${label}は、もう名簿に入っています。` });
    } else if (seen.outcome === "full") {
      setResult({
        tone: "danger",
        text: `名簿の上限（${ROSTER_MAX}人）に達したため、${label}を入れられません。`,
      });
    } else {
      setResult({
        tone: "success",
        text: `${label}を名簿に入れました。続けて次の人の QR を読めます。`,
      });
    }
    return "continue";
  };

  return (
    <section aria-labelledby="match-join-qr" className="flex flex-col gap-xxs">
      <h2 id="match-join-qr" className="text-l font-bold">
        電波がなくて受付できなかった人
      </h2>
      <p className="text-s text-text-sub">
        参加者のスマホに出た
        QR（名前とレベル）を、この端末のカメラで読むと名簿に入ります。電波がなくても入ります。
      </p>
      <ButtonRow>
        <Button
          aria-disabled={!editor.isEditor || undefined}
          onClick={() => {
            if (!editor.isEditor) return;
            setResult(undefined);
            setOpen(true);
          }}
        >
          参加者の QR を読む
        </Button>
      </ButtonRow>
      {!editor.isEditor ? (
        <p className="text-s text-text-sub">参加者の QR を読めるのは、担当の端末です。</p>
      ) : null}
      {scanned.length > 0 ? (
        <ul aria-label="QR で入れた人" className="flex flex-wrap gap-xxs">
          {scanned.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-x3s rounded-md border border-border bg-surface px-xxs py-x3s"
            >
              <span className="text-m font-bold">{player.nickname}</span>
              {player.level ? <Badge>{MATCH_LEVEL_LABELS[player.level]}</Badge> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="参加者の QR を読む"
          description="参加者のスマホの「この QR を運営に見せてください」の QR を、枠に入れてください。"
          footer={<Button onClick={() => setOpen(false)}>閉じる</Button>}
        >
          <QrScanner onRead={read} />
          {result ? <ResponseMessage tone={result.tone}>{result.text}</ResponseMessage> : null}
        </Dialog>
      ) : null}
    </section>
  );
}
