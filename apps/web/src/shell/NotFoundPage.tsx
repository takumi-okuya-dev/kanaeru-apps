// 見つからない画面（外枠の中に出す）。何が起きたか・どうすればよいかを書く（EXPERIENCE.md 2）。
import { Link } from "@tanstack/react-router";
import { Page } from "../lib/page.tsx";

/**
 * 見つからない画面。
 * @returns 画面の要素
 */
export function NotFoundPage() {
  return (
    <Page title="ページが見つかりません">
      <p className="text-m">
        URL が違うか、ページが消された可能性があります。
        <Link to="/" className="text-text-link underline">
          はじめの画面へ戻る
        </Link>
      </p>
    </Page>
  );
}
