// 利用規約・プライバシーポリシーへのリンク（suite-002）。ほかの領域は suite の index.ts から読む。
// 本文（legal-content.ts）を読まないので、リンクを置いた画面の束に本文が入らない。
import { Link } from "@tanstack/react-router";
import { LEGAL_PATHS, LEGAL_TITLES } from "./legal-paths.ts";
import type { LegalDocumentKey } from "./legal-paths.ts";

/** LegalLink が受け取るもの。 */
export type LegalLinkProps = {
  /** どちらのページか */
  to: LegalDocumentKey;
  /** 新しいタブで開くか（入力の途中の画面から開くとき。新しいタブで開くことは、そばの文で伝える） */
  newTab?: boolean;
};

/**
 * 利用規約かプライバシーポリシーへのリンク（下線つき。名前はページの題）。
 * @param props どちらのページか（to）・新しいタブで開くか（newTab）
 * @returns リンクの要素
 */
export function LegalLink({ to, newTab = false }: LegalLinkProps) {
  return (
    <Link
      to={LEGAL_PATHS[to]}
      className="text-text-link underline"
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {LEGAL_TITLES[to]}
    </Link>
  );
}
