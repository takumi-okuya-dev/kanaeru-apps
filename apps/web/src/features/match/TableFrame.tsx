// 試合表の中の画面（名簿と設定・試合表・印刷）の共通の枠：試合表を読み、担当の端末でなければ「見るだけ」の帯と
// 「この端末で直す」を出し、送りの状態（保存しています・保存しました・保存できませんでした）を出す（AD-28）。
// 担当の受け渡し（match-003）：どの端末が担当か（端末の短い名前）を出し、受け取るのは、つながっているときだけ・確かめてから。
// 電波がないとき（match-005）：「電波なし・HH:MM に保存（つながったら送ります）」と、まだ送っていない変更の数を出す。
// 送りを止めたとき（409 など）は、端末に残った変更の数と「捨てる」「上書きする」を出す（AD-28）。
import type { MatchTable } from "@workspace/contracts/match";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { deviceId, deviceLabel } from "./device.ts";
import { formatClock } from "./format.ts";
import { MATCH_LOGIN_PATH, MatchGate } from "./MatchGate.tsx";
import { useOnline } from "./online.ts";
import { useTableEditor } from "./table-editor.ts";
import type { SaveState, TableEditor } from "./table-editor.ts";

/**
 * 送りを止めたとき（409・直せない誤り）の知らせと、捨てる・上書きするの選び方（AD-28：送っていない変更は端末に残して知らせる）。
 * @param props 送りの状態（save）・試合表を直す道具（editor）
 * @param props.save 止めた状態
 * @param props.editor 試合表を直す道具
 * @returns 要素
 */
function HeldStatus({
  save,
  editor,
}: {
  save: Extract<SaveState, { status: "held" }>;
  editor: TableEditor;
}) {
  const [confirm, setConfirm] = useState<"discard" | "overwrite">();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const online = useOnline();

  /**
   * 選んだものを行う。
   * @param action 捨てる・上書きする
   */
  const run = (action: "discard" | "overwrite") => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    (action === "discard" ? editor.discard() : editor.overwrite())
      .catch((caught: unknown) => setFailure(errorMessage(caught)))
      .finally(() => setPending(false));
  };

  return (
    <div className="flex flex-col gap-xxs" role="group" aria-label="送れなかった変更">
      <ResponseMessage tone="danger">{`保存できませんでした。${save.message}`}</ResponseMessage>
      <p className="text-m">
        {`この端末に、まだ送っていない変更が${save.count}件残っています（${formatClock(save.savedAt)} まで）。画面にはサーバーの今の試合表を出しています。`}
      </p>
      <div className="flex flex-wrap items-center gap-xxs">
        <Button
          size="small"
          aria-disabled={pending || undefined}
          onClick={() => !pending && setConfirm("discard")}
        >
          この端末の変更を捨てる
        </Button>
        <Button
          size="small"
          aria-disabled={pending || !editor.isEditor || !online || undefined}
          onClick={() => !pending && editor.isEditor && online && setConfirm("overwrite")}
        >
          この端末の変更で上書きする
        </Button>
        {!editor.isEditor ? (
          <p className="text-s text-text-sub">
            上書きするときは、先に「この端末で直す」で担当を受け取ってください。
          </p>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={confirm !== undefined}
        onOpenChange={(open) => !open && setConfirm(undefined)}
        title={
          confirm === "overwrite"
            ? "この端末の変更で上書きしますか？"
            : "この端末の変更を捨てますか？"
        }
        confirmLabel={confirm === "overwrite" ? "上書きする" : "捨てる"}
        onConfirm={() => {
          const action = confirm;
          setConfirm(undefined);
          if (action) run(action);
        }}
      >
        <p className="text-m">
          {confirm === "overwrite"
            ? "サーバーの今の試合表を、この端末で最後に直した試合表で置きかえます。ほかの端末で直したところは消えます。"
            : "この端末でまだ送っていない変更を消し、サーバーの今の試合表に戻します。消した変更は戻せません。"}
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * 送りの状態の文（担当の端末だけに出す。止めたときは担当でなくても出す）。
 * @param props 送りの状態（save）・試合表を直す道具（editor）
 * @param props.save 送りの状態
 * @param props.editor 試合表を直す道具
 * @returns 文の要素
 */
function SaveStatus({ save, editor }: { save: SaveState; editor: TableEditor }) {
  if (save.status === "held") return <HeldStatus save={save} editor={editor} />;
  if (save.status === "unauthenticated") {
    return (
      <ResponseMessage tone="danger">
        {`ログインが切れたため、まだ送れていません（変更${save.count}件は、この端末に残っています）。`}
        <a href={MATCH_LOGIN_PATH} className="text-text-link underline">
          ログインし直す
        </a>
        と送ります。
      </ResponseMessage>
    );
  }
  const text =
    save.status === "sending"
      ? "保存しています…"
      : save.status === "waiting"
        ? save.reason === "offline"
          ? `電波なし・${formatClock(save.savedAt)} に保存（つながったら送ります）。まだ送っていない変更：${save.count}件`
          : `サーバーにつながらないため、${formatClock(save.savedAt)} にこの端末に保存しました（あとで送り直します）。まだ送っていない変更：${save.count}件`
        : editor.deviceCopyAt !== undefined
          ? `電波なし・この端末に置いた ${formatClock(editor.deviceCopyAt)} の試合表です。直すと、この端末に保存し、つながったら送ります。`
          : `この端末（${deviceLabel(deviceId())}）が担当です。直したところは、この端末から保存されます。`;
  return (
    <p
      role="status"
      className={cn(
        "text-s",
        save.status === "waiting" || editor.deviceCopyAt !== undefined
          ? "rounded-md border border-warning bg-surface px-xs py-xxs text-text"
          : "text-text-sub",
      )}
    >
      {text}
    </p>
  );
}

/**
 * 担当の端末でないときの帯（見るだけ・この端末で直す）。
 * @param props 試合表を直す道具（editor）
 * @param props.editor 試合表を直す道具
 * @returns 帯の要素
 */
function ViewerBanner({ editor }: { editor: TableEditor }) {
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failure, setFailure] = useState<string>();
  const online = useOnline();
  const current = editor.query.data?.editorDeviceId ?? null;
  const mine = deviceLabel(deviceId());

  /** 担当を受け取る（つながっているときだけ）。 */
  const claim = () => {
    if (pending) return;
    setPending(true);
    setFailure(undefined);
    editor
      .claim()
      .catch((caught: unknown) => setFailure(`担当にできませんでした。${errorMessage(caught)}`))
      .finally(() => setPending(false));
  };

  return (
    <div className="flex flex-col gap-xxs rounded-md border border-warning bg-surface p-xs">
      <p className="text-m">
        この端末は見るだけです。試合表を直せるのは、担当の端末1台だけです（ほかの端末で直したものと食い違わないように）。
      </p>
      <p className="text-s text-text-sub">
        {current
          ? `今の担当：${deviceLabel(current)}（この端末は ${mine}）`
          : `担当の端末はまだ決まっていません（この端末は ${mine}）`}
      </p>
      <div className="flex flex-wrap items-center gap-xxs">
        <Button
          size="small"
          aria-disabled={pending || !online || undefined}
          onClick={() => {
            if (pending || !online) return;
            setConfirmOpen(true);
          }}
        >
          {pending ? "担当にしています…" : "この端末で直す"}
        </Button>
        {!online ? (
          <p className="text-s text-text-sub">
            担当を受け取れるのは、この端末がつながっているときだけです。電波のある所で押してください。
          </p>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="この端末を担当にしますか？"
        confirmLabel="この端末で直す"
        onConfirm={() => {
          setConfirmOpen(false);
          claim();
        }}
      >
        <p className="text-m">
          {`担当を${mine}に移します。${current ? `今の担当（${deviceLabel(current)}）は見るだけになり、まだ送っていない変更があれば、その端末に「保存できませんでした」と出ます。` : ""}担当の端末を持つ人に、声をかけてから移してください。`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * 担当の端末なら送りの状態、そうでなければ「見るだけ」の帯（ページの題の下に置く）。
 * @param props 試合表を直す道具（editor）
 * @param props.editor 試合表を直す道具
 * @returns 要素
 */
export function EditorState({ editor }: { editor: TableEditor }) {
  if (editor.isEditor) return <SaveStatus save={editor.save} editor={editor} />;
  // 担当を移されたあとに送れなかったときは、なぜ保存できなかったかと、残った変更の扱いも出す（AD-28）
  return (
    <>
      {editor.save.status === "held" ? <SaveStatus save={editor.save} editor={editor} /> : null}
      <ViewerBanner editor={editor} />
    </>
  );
}

/** TableFrame が受け取るもの。 */
export type TableFrameProps = {
  /** 試合表の ID */
  tableId: string;
  /** 読めたときに出す中身（試合表と直す道具を受け取る） */
  children: (table: MatchTable, editor: TableEditor) => React.ReactNode;
};

/**
 * 試合表の中の画面の枠。
 * @param props 試合表の ID（tableId）・中身（children）
 * @returns 画面の要素
 */
export function TableFrame({ tableId, children }: TableFrameProps) {
  const editor = useTableEditor(tableId);
  return <MatchGate query={editor.query}>{(table) => children(table, editor)}</MatchGate>;
}
