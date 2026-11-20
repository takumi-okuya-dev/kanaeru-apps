// Meta のデータの削除の状況の画面（threads-010。ログインなし。Meta が利用者に見せる URL）。確認のコードで、受け付けた・削除したを出す。
import { DATA_DELETION_STATUS_LABELS } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { ApiError } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { fetchDataDeletion } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

const deletionRouteApi = getRouteApi("/threads/data-deletion/$code");

/**
 * データの削除の状況の道の画面。
 * @returns 画面の要素
 */
export function DataDeletionRoute() {
  const { code } = deletionRouteApi.useParams();
  const query = useQuery({
    queryKey: [...THREADS_QUERY_KEYS.all, "data-deletion", code],
    queryFn: () => fetchDataDeletion(code),
    retry: false,
  });
  if (query.isPending) return <Loading />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <Page
          title="この確認のコードは見つかりません"
          lead="URL が違う可能性があります。Meta から届いた URL をそのまま開いてください。"
        />
      );
    }
    return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  }
  const status = query.data;
  return (
    <Page
      title="データの削除の状況"
      lead="Threads の運用アプリに、Meta から届いたデータの削除の要求の状況です。"
    >
      <dl className="grid grid-cols-1 gap-xxs text-m wide:grid-cols-2">
        <dt className="font-bold">確認のコード</dt>
        <dd className="break-all">{code}</dd>
        <dt className="font-bold">状況</dt>
        <dd>{DATA_DELETION_STATUS_LABELS[status.status]}</dd>
        <dt className="font-bold">受け付けた日時</dt>
        <dd>{jstDateTime(status.receivedAt)}</dd>
        {status.completedAt ? (
          <>
            <dt className="font-bold">削除した日時</dt>
            <dd>{jstDateTime(status.completedAt)}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-s text-text-sub">
        削除するのは、その Threads
        のアカウントにつないだ運用アカウントと、そこにためた戦略・投稿の案・反応などです。
      </p>
    </Page>
  );
}
