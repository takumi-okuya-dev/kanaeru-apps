// 名簿の行の「送った知らせ」（主催者だけ。種類・手段・結果・時刻だけ。相手のアドレスと本文は出さない。booking-004 research R13）。
// 開いたときに読む（画面を開いただけでは読まない）。
import {
  NOTICE_KIND_LABELS,
  NOTICE_METHOD_LABELS,
  NOTICE_RESULT_LABELS,
} from "@workspace/contracts/booking";
import { useQuery } from "@tanstack/react-query";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { errorMessage } from "../../lib/api.ts";
import { formatEventDateTime } from "../event/index.ts";
import { fetchNoticeLog } from "./waitlist-api.ts";

/**
 * 送った知らせの一覧。
 * @param props 交流会の ID・行の ID・行の名前
 * @param props.eventId 交流会の ID
 * @param props.entryId 行の ID
 * @param props.name 行の名前（見出しに使う）
 * @returns 一覧の要素
 */
export function NoticeLog({
  eventId,
  entryId,
  name,
}: {
  eventId: string;
  entryId: string;
  name: string;
}) {
  const query = useQuery({
    queryKey: ["booking", "notices", eventId, entryId] as const,
    queryFn: () => fetchNoticeLog(eventId, entryId),
  });
  return (
    <section
      aria-label={`${name}さんに送った知らせ`}
      className="flex flex-col gap-x3s rounded-sm border border-border bg-surface-over p-xxs"
    >
      {query.isPending ? (
        <p className="text-s text-text-sub">読みこんでいます…</p>
      ) : query.isError ? (
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      ) : query.data.notices.length === 0 ? (
        <p className="text-s text-text-sub">まだ知らせを送っていません。</p>
      ) : (
        <ul className="flex flex-col gap-x3s">
          {query.data.notices.map((notice) => (
            <li key={`${notice.createdAt}-${notice.kind}`} className="text-s break-words">
              {`${formatEventDateTime(notice.createdAt)} ${NOTICE_KIND_LABELS[notice.kind]}・${NOTICE_METHOD_LABELS[notice.method]}・${NOTICE_RESULT_LABELS[notice.result]}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
