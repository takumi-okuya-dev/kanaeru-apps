// すべてのアプリ（/apps。core-005）。見る人に見えるアプリをカードで並べる（登録の順）。
// 「開く」は、この端末で最後に使ったアプリ（なければ最初のアプリ）を主のボタン、ほかを二番のボタンにする（1つの画面に主の操作は1つ）。
// 運営者には、運営者だけに見えているアプリに札を付け、アプリの台帳への入口を出す。ログインの前でも公開のアプリを出す。
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { pickStartApp, readLastApp, startPathOf } from "../../lib/apps.ts";
import { Page } from "../../lib/page.tsx";
import { AppIconBox } from "./AppIconBox.tsx";
import { SUITE_QUERY_KEYS, useVisibleApps } from "./queries.ts";

/**
 * すべてのアプリの画面。
 * @returns 画面の要素
 */
export function AppsPage() {
  const { status, apps, isOperator } = useVisibleApps();
  const queryClient = useQueryClient();
  const lastKey = readLastApp();
  const primaryKey = pickStartApp(apps, lastKey)?.key;
  return (
    <Page title="すべてのアプリ" lead="ひとつのアカウントで、どのアプリも使えます。">
      <section aria-labelledby="apps-heading" className="flex flex-col gap-xs">
        <h2 id="apps-heading" className="text-l leading-tight font-bold">
          使えるアプリ
        </h2>
        {status === "pending" ? (
          <p aria-busy="true" className="text-m text-text-sub">
            読みこんでいます…
          </p>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-xxs">
            <p className="text-m">読みこめませんでした。時間をおいて、もう一度お試しください。</p>
            <ButtonRow>
              <Button
                onClick={() =>
                  void queryClient.invalidateQueries({ queryKey: SUITE_QUERY_KEYS.all })
                }
              >
                もう一度
              </Button>
            </ButtonRow>
          </div>
        ) : apps.length === 0 ? (
          <p className="text-m text-text-sub">使えるアプリはまだありません。</p>
        ) : (
          <ul className="grid gap-xs wide:grid-cols-2">
            {apps.map((app) => {
              const headingId = `app-${app.key}`;
              const operatorOnly = isOperator && app.visibility === "operator_only";
              return (
                <li
                  key={app.key}
                  aria-labelledby={headingId}
                  className="flex flex-col gap-xs rounded-md border border-border bg-surface p-s"
                >
                  <div className="flex items-start gap-xs">
                    <AppIconBox icon={app.icon} selected={app.key === primaryKey} />
                    <div className="flex min-w-0 flex-col gap-x3s">
                      <h3 id={headingId} className="text-l leading-tight font-bold">
                        {app.name}
                      </h3>
                      {app.key === lastKey ? (
                        <p className="text-s text-text-sub">最後に使ったアプリ</p>
                      ) : null}
                      {operatorOnly ? (
                        <div>
                          <Badge>運営者だけに見えています</Badge>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-m">{app.description}</p>
                  <ButtonRow>
                    <Link
                      to={startPathOf(app)}
                      aria-label={`開く：${app.name}`}
                      className={buttonVariants({
                        variant: app.key === primaryKey ? "primary" : "secondary",
                      })}
                    >
                      開く
                    </Link>
                  </ButtonRow>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {isOperator ? (
        <p className="text-s text-text-sub">
          公開の状態は、運営者が
          <Link to="/settings/apps" className="text-text-link underline">
            アプリの台帳
          </Link>
          で変えられます（運営者にだけ出ています）。
        </p>
      ) : null}
    </Page>
  );
}
