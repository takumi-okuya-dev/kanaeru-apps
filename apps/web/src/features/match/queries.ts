// 試合表の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "match" で始める。
// 試合表は担当の端末が直して送るので、画面が直している間に読み直して上書きしないよう、自分からは読み直さない（AD-28）。
// 試合表と一覧は端末にも置き、電波がないときは端末の中身を出す（match-005。offline/table-sync.ts・offline/table-list.ts）。
import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationOptions, fetchOrganizerEvents, fetchReceptionRoster } from "./api.ts";
import { loadTableList } from "./offline/table-list.ts";
import { loadTable } from "./offline/table-sync.ts";

/** 試合表の問い合わせの鍵。 */
export const MATCH_QUERY_KEYS = {
  /** 試合表のすべての問い合わせ */
  all: ["match"] as const,
  /** 試合表の一覧 */
  list: ["match", "list"] as const,
  /** 入れられる組織 */
  organizations: ["match", "organizations"] as const,
  /**
   * 試合表（ナビもこの鍵を読む）。
   * @param tableId 試合表の ID
   * @returns 鍵
   */
  table: (tableId: string) => ["match", "table", tableId] as const,
  /** 自分が主催者の受付の交流会（match-006） */
  receptionEvents: ["match", "reception-events"] as const,
  /**
   * 受付の交流会から入れられる人（match-006）。
   * @param tableId 試合表の ID
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  receptionRoster: (tableId: string, eventId: string) =>
    ["match", "reception-roster", tableId, eventId] as const,
};

/**
 * 試合表の一覧を読む。
 * @returns 問い合わせ
 */
export function useMatchTables() {
  return useQuery({
    queryKey: MATCH_QUERY_KEYS.list,
    queryFn: loadTableList,
    retry: false,
    // 電波がなくても読みにいき、端末に置いた一覧に切りかえる（止めて待たない）
    networkMode: "always",
  });
}

/**
 * 入れられる組織を読む。
 * @returns 問い合わせ
 */
export function useOrganizationOptions() {
  return useQuery({ queryKey: MATCH_QUERY_KEYS.organizations, queryFn: fetchOrganizationOptions });
}

/**
 * 試合表を読む（自分からは読み直さない。電波がなければ端末の中身。送っていない変更を重ねる）。
 * @param tableId 試合表の ID
 * @returns 問い合わせ
 */
export function useMatchTable(tableId: string) {
  return useQuery({
    queryKey: MATCH_QUERY_KEYS.table(tableId),
    queryFn: () => loadTable(tableId),
    // 電波がなくても読みにいき、端末の中身に切りかえる（止めて待たない。match-005）
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false,
  });
}

/**
 * 自分が主催者の受付の交流会を読む（受付の交流会から入れる枠を開いている間だけ。match-006）。
 * @param enabled 読むか（枠が開いているときだけ）
 * @returns 問い合わせ
 */
export function useOrganizerEvents(enabled: boolean) {
  return useQuery({
    queryKey: MATCH_QUERY_KEYS.receptionEvents,
    queryFn: fetchOrganizerEvents,
    enabled,
    retry: false,
  });
}

/**
 * 受付の交流会から入れられる人を読む（交流会を選んだら。チェックインは増えるので、開くたびに読み直す。match-006）。
 * @param tableId 試合表の ID
 * @param eventId 選んだ交流会の ID（まだなら undefined）
 * @returns 問い合わせ
 */
export function useReceptionRoster(tableId: string, eventId: string | undefined) {
  return useQuery({
    queryKey: MATCH_QUERY_KEYS.receptionRoster(tableId, eventId ?? ""),
    queryFn: () => fetchReceptionRoster(tableId, eventId ?? ""),
    enabled: eventId !== undefined,
    retry: false,
    staleTime: 0,
    // 名前を枠の外に残さず、選び直したときに古い名簿を出さない
    gcTime: 0,
  });
}
