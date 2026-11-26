// 確かめの枠（EXPERIENCE.md 3「ダイアログ」「消す」）。消す・送る・元に戻せない操作の前にだけ出す。
// shadcn/ui（Base UI の形）の AlertDialog を、値だけ直したもの。幕を押しても閉じない（Base UI の AlertDialog の既定）。
// 開くと「キャンセル」にフォーカスを置く（うっかり Enter で消さない）。確かめのボタンは押しても閉じない（呼ぶ側が、
// 処理に成功したら open を false にする）。処理中は Esc・キャンセルで閉じず、確かめのボタンを押せない形にする。
import { buttonRowEndClassName } from "./button-row.tsx";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef } from "react";
import type * as React from "react";
import { Button } from "./button.tsx";
import { dialogBackdropClassName, dialogPopupClassName } from "./dialog.tsx";
import { ResponseMessage } from "./response-message.tsx";

/** 確かめの枠が受け取るもの。 */
export type ConfirmDialogProps = {
  /** 開いているか（呼ぶ側が持つ） */
  open: boolean;
  /** 開く・閉じるを伝える（処理中は、閉じる求めを出さない） */
  onOpenChange: (open: boolean) => void;
  /** 題（例：メモを削除しますか） */
  title: string;
  /** 本文（何が消えるか・元に戻せるか） */
  children: React.ReactNode;
  /** 確かめのボタンの名前（動詞。例：削除） */
  confirmLabel: string;
  /** 処理中の名前（例：削除しています。既定は confirmLabel） */
  pendingLabel?: string;
  /** やめるボタンの名前（既定：キャンセル） */
  cancelLabel?: string;
  /** 確かめのボタンを危ないの色にするか（既定 true） */
  danger?: boolean;
  /** 処理中か */
  pending?: boolean;
  /** 失敗の理由（枠の中のボタンの上に出す） */
  error?: string | undefined;
  /** 確かめのボタンを押した（枠は自分で閉じない） */
  onConfirm: () => void;
};

/**
 * 確かめの枠。
 * @param props 開いているか（open）・開く閉じるの知らせ（onOpenChange）・題と本文・ボタンの名前・処理中・失敗の理由・確かめ（onConfirm）
 * @returns 枠の要素
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = "キャンセル",
  danger = true,
  pending = false,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdropClassName} />
        <AlertDialog.Popup
          data-slot="confirm-dialog"
          initialFocus={cancelRef}
          className={dialogPopupClassName}
        >
          <AlertDialog.Title className="text-l leading-tight font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description render={<div />} className="text-m text-text">
            {children}
          </AlertDialog.Description>
          {error ? <ResponseMessage tone="danger">{error}</ResponseMessage> : null}
          <div className={buttonRowEndClassName}>
            <Button
              ref={cancelRef}
              type="button"
              variant="secondary"
              aria-disabled={pending ? true : undefined}
              onClick={() => {
                if (!pending) onOpenChange(false);
              }}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={danger ? "danger" : "primary"}
              aria-disabled={pending ? true : undefined}
              aria-busy={pending ? true : undefined}
              onClick={() => {
                if (!pending) onConfirm();
              }}
            >
              {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
