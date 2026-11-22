// 予約の領域の入口（docs/apps/booking.md・docs/rules/coding.md 6-6）。受付アプリの4つ目の領域（AD-23）。土台（app.ts）は
// routes・withdrawal・eventLinkRestriction を読む。依存は booking → reception → event の一方向で、reception は booking を読まない。
// ほかのアプリに出すのは、確定した申込みの名簿（名前と account だけ）の listApplicantRoster だけ（試合表が前もって名簿を
// 入れる。AD-23 の 2026-11-22 の直し・match-006）。チェックインした人は reception の index.ts が出す。
// 知らせ（booking-002。AD-24）：公式アカウントの設定・Webhook・紐づけ・連絡のメールアドレスの窓口。業務の関数 sendNotice は
// booking の中（自前の申込み〈booking-003〉・キャンセル待ち〈booking-004〉）が呼ぶ。
// 自前の申込みページ（booking-003）：申込みページ・申し込む・取り消す・自分の申込み・部の予定・案内の同意・メールで申し込む・札。
// 定員とキャンセル待ち（booking-004）：定員と枠・手で打診・送った知らせ・変更と中止・打診への返事・定期の窓口（/jobs/tick）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { bookingRoutes } from "./routes.ts";
import { bookingApplyRoutes } from "./routes-apply.ts";
import { bookingNotifyRoutes } from "./routes-notify.ts";
import { bookingWaitlistRoutes } from "./routes-waitlist.ts";
import { bookingWebhookRoutes } from "./routes-webhook.ts";

// ほかのアプリが読むもの：確定した申込みの名簿（名前と account だけ。メールアドレス・媒体・案内の同意は出さない。AD-23）
export { listApplicantRoster } from "./repository.ts";
export type { ApplicantRosterRow } from "./repository.ts";
// 退会の手順（AD-22。名簿は外部キーで消えるので、確かめの中身だけ。research R11）
export { bookingWithdrawal as withdrawal } from "./withdrawal.ts";
// 交流会の招待のリンクを絞る決まり（「部員だけ」の回。組み立てが event の要約の窓口に渡す。AD-5・research R8）
export { bookingEventLinkRestriction as eventLinkRestriction } from "./event-links.ts";

/**
 * 予約の領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return bookingRoutes(deps)
    .route("/", bookingNotifyRoutes(deps))
    .route("/", bookingWebhookRoutes(deps))
    .route("/", bookingApplyRoutes(deps))
    .route("/", bookingWaitlistRoutes(deps));
}
