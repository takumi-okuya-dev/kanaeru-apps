// QR の受付の一覧を読み、担当の端末なら、まだ名簿に入れていない受付を名簿に入れる（AD-30：担当の端末が、つながったときに
// 受付の行を読んで名簿に足し、版を上げて送る）。受付の画面（M7）は5秒おきに読み直し、名簿と設定の画面は開いたときに1度読む。
import type { MatchTable } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchJoins } from "./api.ts";
import { importJoins, pendingJoins } from "./joins.ts";
import { useOnline } from "./online.ts";
import type { TableEditor } from "./table-editor.ts";

/**
 * 受付の一覧の問い合わせの鍵。
 * @param tableId 試合表の ID
 * @returns 鍵
 */
export function joinsQueryKey(tableId: string) {
  return ["match", "joins", tableId] as const;
}

/** 受付の画面で読み直す間（ミリ秒。一覧の画面の更新は5秒おき。Consistency Conventions）。 */
const POLL_MS = 5_000;

/**
 * 受付の一覧を読み、担当の端末なら名簿に入れる。
 * @param table 試合表
 * @param editor 試合表を直す道具
 * @param poll 5秒おきに読み直すか（受付の画面）
 * @returns 受付の一覧の問い合わせ
 */
export function useJoins(table: MatchTable, editor: TableEditor, poll: boolean) {
  const online = useOnline();
  const joins = useQuery({
    queryKey: joinsQueryKey(table.id),
    queryFn: () => fetchJoins(table.id),
    refetchInterval: poll && online ? POLL_MS : false,
    refetchOnWindowFocus: poll,
    retry: false,
  });
  const { apply, isEditor } = editor;
  const list = joins.data?.joins;
  const waiting = list ? pendingJoins(table.content, list).length : 0;
  useEffect(() => {
    if (!isEditor || !list || waiting === 0) return;
    // 今の中身（送りの途中の変更を含む）から入れる。同じ受付は二度入らない
    apply((draft) => ({ ...draft, content: importJoins(draft.content, list).content }));
  }, [apply, isEditor, list, waiting]);
  return { joins, waiting };
}
