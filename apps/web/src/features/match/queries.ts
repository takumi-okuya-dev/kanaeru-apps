// 試合表の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "match" で始める。
// 試合表は担当の端末が直して送るので、画面が直している間に読み直して上書きしないよう、自分からは読み直さない（AD-28）。
import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationOptions, fetchTable, fetchTables } from "./api.ts";

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
};

/**
 * 試合表の一覧を読む。
 * @returns 問い合わせ
 */
export function useMatchTables() {
  return useQuery({ queryKey: MATCH_QUERY_KEYS.list, queryFn: fetchTables, retry: false });
}

/**
 * 入れられる組織を読む。
 * @returns 問い合わせ
 */
export function useOrganizationOptions() {
  return useQuery({ queryKey: MATCH_QUERY_KEYS.organizations, queryFn: fetchOrganizationOptions });
}

/**
 * 試合表を読む（自分からは読み直さない）。
 * @param tableId 試合表の ID
 * @returns 問い合わせ
 */
export function useMatchTable(tableId: string) {
  return useQuery({
    queryKey: MATCH_QUERY_KEYS.table(tableId),
    queryFn: () => fetchTable(tableId),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false,
  });
}
