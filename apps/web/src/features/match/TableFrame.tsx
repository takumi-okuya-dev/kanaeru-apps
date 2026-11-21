// 試合表の中の画面（名簿と設定・試合表・印刷）の共通の枠：試合表を読み、担当の端末でなければ「見るだけ」の帯と
// 「この端末で直す」を出し、送りの状態（保存しています・保存しました・保存できませんでした）を出す（AD-28）。
import type { MatchTable } from "@workspace/contracts/match";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { MatchGate } from "./MatchGate.tsx";
import { useTableEditor } from "./table-editor.ts";
import type { SaveState, TableEditor } from "./table-editor.ts";

/**
 * 送りの状態の文（担当の端末だけに出す）。
 * @param props 送りの状態（save）
 * @param props.save 送りの状態
 * @returns 文の要素
 */
function SaveStatus({ save }: { save: SaveState }) {
  if (save.status === "failed") {
    return (
      <ResponseMessage tone="danger">{`保存できませんでした。${save.message}`}</ResponseMessage>
    );
  }
  return (
    <p role="status" className="text-s text-text-sub">
      {save.status === "saving" ? "保存しています…" : "直したところは、この端末から保存されます。"}
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
  const [failure, setFailure] = useState<string>();
  return (
    <div className="flex flex-col gap-xxs rounded-md border border-warning bg-surface p-xs">
      <p className="text-m">
        この端末は見るだけです。試合表を直せるのは、担当の端末1台だけです（ほかの端末で直したものと食い違わないように）。
      </p>
      <div className="flex flex-wrap items-center gap-xxs">
        <Button
          size="small"
          aria-disabled={pending || undefined}
          onClick={() => {
            if (pending) return;
            setPending(true);
            setFailure(undefined);
            editor
              .claim()
              .catch((caught: unknown) =>
                setFailure(`担当にできませんでした。${errorMessage(caught)}`),
              )
              .finally(() => setPending(false));
          }}
        >
          {pending ? "担当にしています…" : "この端末で直す"}
        </Button>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
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
  return editor.isEditor ? <SaveStatus save={editor.save} /> : <ViewerBanner editor={editor} />;
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
