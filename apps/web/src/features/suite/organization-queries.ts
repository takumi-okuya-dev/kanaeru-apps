// 組織の問い合わせ（suite-001）。鍵は suite の問い合わせの下（SUITE_QUERY_KEYS.all）に置く。
// 役割・人・招待を変えたら、その組織と一覧を読み直す。
import { useQuery } from "@tanstack/react-query";
import {
  fetchInvitePreview,
  fetchOrganization,
  fetchOrganizationInvite,
  fetchOrganizations,
} from "./organization-api.ts";

/** 組織の問い合わせの鍵。 */
export const ORGANIZATION_QUERY_KEYS = {
  /** 組織の問い合わせのすべて */
  all: ["suite", "organizations"] as const,
  /** 入っている組織の一覧 */
  list: ["suite", "organizations", "list"] as const,
  /**
   * 組織の画面。
   * @param organizationId 組織の ID
   * @returns 鍵
   */
  detail: (organizationId: string) => ["suite", "organizations", organizationId] as const,
  /**
   * 招待のリンク（管理者だけ）。
   * @param organizationId 組織の ID
   * @returns 鍵
   */
  invite: (organizationId: string) => ["suite", "organizations", organizationId, "invite"] as const,
  /**
   * 招待の確かめの画面。
   * @param token 招待の札
   * @returns 鍵
   */
  preview: (token: string) => ["suite", "organization-invites", token] as const,
};

/**
 * 入っている組織の一覧。
 * @returns 問い合わせ
 */
export function useOrganizations() {
  return useQuery({ queryKey: ORGANIZATION_QUERY_KEYS.list, queryFn: fetchOrganizations });
}

/**
 * 組織の画面。
 * @param organizationId 組織の ID
 * @returns 問い合わせ
 */
export function useOrganization(organizationId: string) {
  return useQuery({
    queryKey: ORGANIZATION_QUERY_KEYS.detail(organizationId),
    queryFn: () => fetchOrganization(organizationId),
  });
}

/**
 * 招待のリンク（管理者のときだけ読む）。
 * @param organizationId 組織の ID
 * @param enabled 読むか
 * @returns 問い合わせ
 */
export function useOrganizationInvite(organizationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ORGANIZATION_QUERY_KEYS.invite(organizationId),
    queryFn: () => fetchOrganizationInvite(organizationId),
    enabled,
  });
}

/**
 * 招待の確かめの画面の中身（読み直さない。入ったあとに「すでに入っています」へ変わらないように）。
 * @param token 招待の札
 * @returns 問い合わせ
 */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ORGANIZATION_QUERY_KEYS.preview(token),
    queryFn: () => fetchInvitePreview(token),
    staleTime: Infinity,
  });
}
