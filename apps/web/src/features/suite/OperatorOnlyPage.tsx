// 運営者だけの画面を、運営者でない人が開いたとき（何が起きたか・どうすればよいか。EXPERIENCE.md 2）。
import { Link } from "@tanstack/react-router";
import { Page } from "../../lib/page.tsx";
import { PRODUCT_NAME } from "@workspace/contracts/core";

/**
 * 運営者だけの画面の、運営者でないときの画面。
 * @returns 画面の要素
 */
export function OperatorOnlyPage() {
  return (
    <Page
      title="運営者だけが開ける画面です"
      lead={`この画面は、${PRODUCT_NAME} の運営者だけが使えます。`}
    >
      <p className="text-m">
        <Link to="/settings" className="text-text-link underline">
          設定の一覧へ戻る
        </Link>
      </p>
    </Page>
  );
}
