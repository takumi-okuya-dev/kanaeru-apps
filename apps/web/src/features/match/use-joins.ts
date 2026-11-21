// QR の受付の一覧を読み、担当の端末なら、まだ名簿に入れていない受付を名簿に入れる（AD-30：担当の端末が、つながったときに
// 受付の行を読んで名簿に足し、版を上げて送る）。受付の画面（M7）は5秒おきに読み直し、名簿と設定の画面は開いたときに1度読む。
// 受付から入った人を消すときは forgetJoinedPlayer を通す（消している途中の受付を入れ直さない・受付の行も消す）。
import { joinPlayerId } from "@workspace/contracts/match";
import type { MatchJoinList, MatchTable } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { deleteJoin, fetchJoins } from "./api.ts";
import { importJoins, joinIdOfPlayer } from "./joins.ts";
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

/** 消している（消した）受付から入った名簿の人の ID（試合表ごと。この画面を開いている間）。入れ直さない。 */
const forgotten = new Map<string, Set<string>>();

/**
 * 試合表の、入れ直さない名簿の人の ID。
 * @param tableId 試合表の ID
 * @returns ID の集まり
 */
function forgottenOf(tableId: string): Set<string> {
  let set = forgotten.get(tableId);
  if (!set) {
    set = new Set();
    forgotten.set(tableId, set);
  }
  return set;
}

/**
 * 受付から入った名簿の人を忘れる：入れ直さない印を付け、受付の一覧から外し、受付の行を消す（一覧がなければ読んでから）。
 * 名簿から消すのは呼ぶ側（担当の端末）。受付の行を消せなかったら印を外して投げる。
 * @param queryClient TanStack Query の入れ物
 * @param tableId 試合表の ID
 * @param playerId 名簿の人の ID（受付から入った人でなければ何もしない）
 * @returns 終わり
 * @throws {Error} 受付の行を消せなかったとき
 */
export async function forgetJoinedPlayer(
  queryClient: QueryClient,
  tableId: string,
  playerId: string,
): Promise<void> {
  if (!/^j[a-z0-9]{15}$/u.test(playerId)) return;
  const key = joinsQueryKey(tableId);
  const marks = forgottenOf(tableId);
  marks.add(playerId);
  queryClient.setQueryData<MatchJoinList>(key, (current) =>
    current
      ? { ...current, joins: current.joins.filter((join) => joinPlayerId(join.id) !== playerId) }
      : current,
  );
  try {
    const list = queryClient.getQueryData<MatchJoinList>(key) ?? (await fetchJoins(tableId));
    const joinId =
      joinIdOfPlayer(playerId, list.joins) ??
      joinIdOfPlayer(playerId, (await fetchJoins(tableId)).joins);
    if (joinId) await deleteJoin(tableId, joinId);
  } catch (caught) {
    marks.delete(playerId);
    throw caught;
  } finally {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * 受付の一覧を読み、担当の端末なら名簿に入れる。
 * @param table 試合表
 * @param editor 試合表を直す道具
 * @param poll 5秒おきに読み直すか（受付の画面）
 * @returns 受付の一覧の問い合わせと、名簿に入りきらない人数
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
  const marks = forgottenOf(table.id);
  const list = joins.data?.joins.filter((join) => !marks.has(joinPlayerId(join.id)));
  const result = list ? importJoins(table.content, list) : undefined;
  const added = result?.added ?? 0;
  const pendingCount = list
    ? list.filter((join) => !table.content.players.some((p) => p.id === joinPlayerId(join.id)))
        .length
    : 0;
  useEffect(() => {
    if (!isEditor || !list || added === 0) return;
    // 今の中身（送りの途中の変更を含む）から入れる。同じ受付は二度入らない。入れる人がいなければ送らない
    apply((draft) => ({ ...draft, content: importJoins(draft.content, list).content }));
  }, [apply, isEditor, list, added]);
  return { joins, overflow: Math.max(0, pendingCount - added) };
}
