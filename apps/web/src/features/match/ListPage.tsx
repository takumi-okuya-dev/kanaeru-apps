// M0 試合表の一覧（/match）。開ける試合表（自分のものと、管理者・編集者の組織に入れたもの）を試合の日の新しい順に出し、
// 名前から名簿と設定へ移る。主の操作は「試合表を作る」。試合の日から90日を過ぎた自分の試合表は、開いたときにサーバーが消す（AD-25）。
// 電波がないときは、この端末で最後に読んだ一覧を出す（match-005。開けるのは、この端末で開いたことのある試合表）。
import type { MatchTableList } from "@workspace/contracts/match";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Page } from "../../lib/page.tsx";
import { MatchGate } from "./MatchGate.tsx";
import { formatClock, formatPlayDate } from "./format.ts";
import { tableListDeviceCopyAt } from "./offline/table-list.ts";
import { useMatchTables } from "./queries.ts";

/**
 * 一覧の中身。
 * @param props 一覧（list）
 * @param props.list 試合表の一覧
 * @returns 画面の要素
 */
function TableList({ list }: { list: MatchTableList }) {
  const deviceAt = tableListDeviceCopyAt();
  return (
    <Page
      title="試合表"
      lead="名簿からレベル別の試合表を作り、印刷します。試合の日から90日を過ぎた試合表は消えます。"
      actions={
        <Link to="/match/new" className={buttonVariants({ variant: "primary" })}>
          試合表を作る
        </Link>
      }
    >
      {deviceAt !== undefined ? (
        <p
          role="status"
          className="rounded-md border border-warning bg-surface px-xs py-xxs text-s"
        >
          {`電波なし・この端末で ${formatClock(deviceAt)} に読んだ一覧です。開けるのは、この端末で開いたことのある試合表です。`}
        </p>
      ) : null}
      {list.tables.length === 0 ? (
        <p className="text-m text-text-sub">
          まだ試合表はありません。「試合表を作る」から始めてください。
        </p>
      ) : (
        <ul className="flex flex-col gap-xxs">
          {list.tables.map((table) => (
            <li
              key={table.id}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <Link
                to="/match/tables/$tableId"
                params={{ tableId: table.id }}
                className="text-l font-bold text-text-link underline"
              >
                {table.name}
              </Link>
              <p className="flex flex-wrap items-center gap-xxs text-m text-text-sub">
                <span>{formatPlayDate(table.playDate)}</span>
                {table.organization ? <Badge>組織「{table.organization.name}」</Badge> : null}
                {table.isOwner ? null : <span>（組織の人の試合表）</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

/**
 * 試合表の一覧の画面。
 * @returns 画面の要素
 */
export function ListPage() {
  const query = useMatchTables();
  return <MatchGate query={query}>{(list) => <TableList list={list} />}</MatchGate>;
}
