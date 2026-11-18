// 一覧画面の行の印（DESIGN.md の flag-same-name・flag-manual）。色だけにせず、ことばとアイコンで伝える。

/**
 * 「同じ名前があります」の印（注意の黄色の地・注意のアイコン・ことば）。
 * @returns 印の要素
 */
export function SameNameFlag() {
  return (
    <span className="inline-flex items-center gap-x3s rounded-sm bg-warning px-x3s text-xs font-bold text-text">
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
    </span>
  );
}

/**
 * 手でのチェックインの印（くぼみの地に、手で入れたことと入れた人。FR-7）。
 * @param props 入れた人の表示名（enteredByName。わからなければ null）
 * @param props.enteredByName 入れた人の表示名
 * @returns 印の要素
 */
export function ManualFlag({ enteredByName }: { enteredByName: string | null }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-surface-sunken px-x3s text-xs text-text-sub">
      {enteredByName ? `手でのチェックイン（入れた人：${enteredByName}）` : "手でのチェックイン"}
    </span>
  );
}
