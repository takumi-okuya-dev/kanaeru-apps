// メモの一覧の画面。読みこみ中・失敗・空・一覧の4つの状態を、EXPERIENCE.md 4 の型で出す。
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { notesQuery } from "./api.ts";
import { formatDateTime } from "./format.ts";

/**
 * 追加の画面へのリンク（主の操作）。
 * @returns リンクの要素
 */
function AddNoteLink() {
  return (
    <Link to="/notes/new" className={buttonVariants({ variant: "primary" })}>
      メモを追加
    </Link>
  );
}

/**
 * メモの一覧の画面。
 * @returns 画面の要素
 */
export function NotesListPage() {
  const query = useQuery(notesQuery());
  const items = query.data?.items;
  const empty = items !== undefined && items.length === 0;
  return (
    <Page
      title="メモ"
      lead="メモは、領域の作り方を見せる見本です。"
      // 空のときは、空の状態の中に同じ操作を1つだけ出す（主の操作を並べない）
      actions={empty ? undefined : <AddNoteLink />}
    >
      {query.isPending ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <ResponseMessage tone="danger">
            メモを読みこめませんでした。{errorMessage(query.error)}
          </ResponseMessage>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-start gap-xs rounded-md border border-border bg-surface p-s">
          <h2 className="text-l leading-tight font-bold">まだメモがありません</h2>
          <p className="text-m">「メモを追加」から、最初のメモを作れます。</p>
          <AddNoteLink />
        </div>
      ) : (
        <Table>
          <TableCaption className="sr-only">メモの一覧（新しく直した順）</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>題</TableHead>
              <TableHead>直した日時</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((note) => (
              <TableRow key={note.id}>
                <TableCell>
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: note.id }}
                    className="text-text-link underline underline-offset-2"
                  >
                    {note.title}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateTime(note.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Page>
  );
}
