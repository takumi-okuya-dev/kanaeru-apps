// 予約の画面の入口（docs/apps/booking.md・docs/rules/coding.md 6-6）。受付アプリの4つ目の領域（AD-23）。組み立て（router.tsx）は feature を読む。
// event の準備の画面に「使い方」、reception の一覧画面に「名簿」の節を、持ち主が置いた差しこみの場所から出す（research R13）。
// ナビの「名簿」は、名簿を使う交流会の中だけ（useNavItems）。routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { registerSetupSection } from "../event/index.ts";
import { registerReceptionSection } from "../reception/index.ts";
import { ModeSection } from "./ModeSection.tsx";
import { useBookingNavItems } from "./nav-items.ts";
import { ReceptionRosterSection } from "./ReceptionRosterSection.tsx";
import { rosterImportRoute, rosterMatchRoute, rosterRoute } from "./routes.ts";

registerSetupSection({ id: "booking-mode", Component: ModeSection });
registerReceptionSection({ id: "booking-roster", Component: ReceptionRosterSection });

/** 予約の領域が出すもの（ナビは名簿を使う交流会の中だけ「名簿」）。 */
export const feature = {
  id: "booking",
  routes: [rosterRoute, rosterImportRoute, rosterMatchRoute],
  useNavItems: useBookingNavItems,
} satisfies WebFeature;
