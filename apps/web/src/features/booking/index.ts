// 予約の画面の入口（docs/apps/booking.md・docs/rules/coding.md 6-6）。受付アプリの4つ目の領域（AD-23）。組み立て（router.tsx）は feature を読む。
// event の準備の画面に「使い方」、reception の一覧画面に「名簿」の節を、持ち主が置いた差しこみの場所から出す（research R13）。
// ナビの「名簿」は、名簿を使う・自前で申込みを受ける交流会の中だけ（useNavItems）。参加者の申込みページ・札のページ・自分の申込みは
// 外枠のナビを出さない道（booking-003）。routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { registerSetupSection } from "../event/index.ts";
import { registerReceptionSection } from "../reception/index.ts";
import { ModeSection } from "./ModeSection.tsx";
import { useBookingNavItems } from "./nav-items.ts";
import { ReceptionRosterSection } from "./ReceptionRosterSection.tsx";
import { bookingSettingsPaths } from "@workspace/contracts/booking";
import {
  applyRoute,
  entryTokenRoute,
  lineLinkRoute,
  myBookingsRoute,
  notifySettingsRoute,
  organizationNotifySettingsRoute,
  rosterImportRoute,
  rosterMatchRoute,
  rosterRoute,
} from "./routes.ts";

registerSetupSection({ id: "booking-mode", Component: ModeSection });
registerReceptionSection({ id: "booking-roster", Component: ReceptionRosterSection });

/**
 * 予約の領域が出すもの（ナビは名簿を使う交流会の中だけ「名簿」）。設定の画面に「予約の知らせ」、組織の画面に
 * 「予約の知らせの設定」の入口を出す（booking-002。受付アプリが見えないときは suite が出さない）。
 */
export const feature = {
  id: "booking",
  routes: [
    rosterRoute,
    rosterImportRoute,
    rosterMatchRoute,
    notifySettingsRoute,
    organizationNotifySettingsRoute,
    lineLinkRoute,
    applyRoute,
    entryTokenRoute,
    myBookingsRoute,
  ],
  useNavItems: useBookingNavItems,
  settings: [
    {
      id: "booking-notify",
      label: "予約の知らせ",
      to: bookingSettingsPaths.notify(),
      group: "app",
      icon: "setup",
    },
  ],
  organization: {
    links: (organizationId: string) => [
      {
        label: "予約の知らせの設定（LINE・メール）",
        to: bookingSettingsPaths.notifyOrganization(organizationId),
      },
    ],
  },
} satisfies WebFeature;
