// 一覧画面の行の印（DESIGN.md の flag-same-name・flag-manual）。色だけにせず、ことばとアイコンで伝える。
// 札は @workspace/ui の Badge を使い、印ごとの地とふちと文字だけを tokens.css の名前で重ねる。
import { Badge } from "@workspace/ui/components/badge";

/**
 * 「同じ名前があります」の印（注意の黄色の地・注意のアイコン・ことば）。
 * @returns 印の要素
 */
export function SameNameFlag() {
  return (
    <Badge className="gap-x3s border-transparent bg-warning text-text">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-xs shrink-0"
      >
        <path d="M10 3l8 14H2z" />
        <path d="M10 8.5v4" />
        <path d="M10 15v.2" />
      </svg>
      同じ名前があります
    </Badge>
  );
}

/**
 * 手でのチェックインの印（くぼみの地に、手で入れたことと入れた人。FR-7）。入れた人の名前が長くても折り返す。
 * @param props 入れた人の表示名（enteredByName。わからなければ null）
 * @param props.enteredByName 入れた人の表示名
 * @returns 印の要素
 */
export function ManualFlag({ enteredByName }: { enteredByName: string | null }) {
  return (
    <Badge className="shrink border-border bg-surface-sunken font-normal break-words whitespace-normal text-text-sub">
      {enteredByName ? `手でのチェックイン（入れた人：${enteredByName}）` : "手でのチェックイン"}
    </Badge>
  );
}
