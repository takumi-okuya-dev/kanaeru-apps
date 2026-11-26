// 組み合わせを直す形の名前のボタン（試合表の名前・ミニゲームのチームの人。match-010）。
// 押して選ぶ・もう一度押すとやめる・ほかの名前を押すと入れかえる・ドラッグして相手の名前の上に落とす・Esc でやめる。
// スマホのブラウザはドラッグの知らせを送らないので、押して入れかえる形を同じボタンに持たせる。選んだ名前は aria-pressed。
import { cn } from "@workspace/ui/lib/cn";

/** 組み合わせを直す形の道具（押した名前・押したとき・落としたとき）。 */
export type SwapEdit<Slot> = {
  /** 先に押した名前の場所（まだなら null） */
  picked: Slot | null;
  /** 名前を押した（1人目なら選び、2人目なら入れかえる） */
  onSelect: (slot: Slot) => void;
  /** 名前を、ほかの名前の上に落とした */
  onDrop: (from: Slot, to: Slot) => void;
  /** 選ぶのをやめる（Esc） */
  onCancel: () => void;
};

/** ドラッグで渡す値の種類（ほかのページからのドラッグを受けない）。 */
export const DRAG_TYPE = "application/x-kanaeru-match-slot";

/**
 * 直す形の名前のボタン（押して選ぶ・もう一度押すとやめる・ほかの名前を押すと入れかえる・ドラッグして落とす・Esc でやめる）。
 * @param props 名前（name）・場所（slot）・直す道具（edit）・同じ場所か（same）・読み上げの名前（label）・墨の地の行か（inverted）
 * @param props.name 名前
 * @param props.slot 名前の場所
 * @param props.edit 直す形の道具
 * @param props.same 2つの場所が同じか
 * @param props.label 読み上げの名前
 * @param props.inverted 墨の地の行（今の試合）か
 * @returns ボタンの要素
 */
export function SwapName<Slot>({
  name,
  slot,
  edit,
  same,
  label,
  inverted = false,
}: {
  name: string;
  slot: Slot;
  edit: SwapEdit<Slot>;
  same: (a: Slot, b: Slot) => boolean;
  label: string;
  inverted?: boolean;
}) {
  const picked = edit.picked !== null && same(edit.picked, slot);
  return (
    // button 要素は Firefox がドラッグを始めないので、role="button" の div にする（Enter・Space で押せる）
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-pressed={picked}
      aria-label={label}
      onClick={() => edit.onSelect(slot)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Escape") edit.onCancel();
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          edit.onSelect(slot);
        }
      }}
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.setData(DRAG_TYPE, JSON.stringify(slot));
        dragEvent.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(dragEvent) => {
        if (dragEvent.dataTransfer.types.includes(DRAG_TYPE)) dragEvent.preventDefault();
      }}
      onDrop={(dragEvent) => {
        const raw = dragEvent.dataTransfer.getData(DRAG_TYPE);
        if (!raw) return;
        dragEvent.preventDefault();
        // 外の枠（チームへ移す）に知らせを渡さない
        dragEvent.stopPropagation();
        edit.onDrop(JSON.parse(raw) as Slot, slot);
      }}
      className={cn(
        "w-full cursor-grab truncate rounded-sm border border-dashed px-x3s text-left select-none",
        inverted ? "border-on-primary" : "border-border-input",
        picked && "border-2 border-solid border-warning bg-warning text-text",
      )}
    >
      {name}
    </div>
  );
}
