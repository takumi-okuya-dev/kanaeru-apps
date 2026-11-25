// アカウントの画面の入口（docs/apps/account.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// ほかの領域は、ここからだけ読む（AD-12：今の利用者は useSession、ログインが要る画面は SessionGate で包む）。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { devLoginRoute } from "./routes.ts";

export { SessionGate } from "./SessionGate.tsx";
export type { SessionGateProps } from "./SessionGate.tsx";
export { requestFriendship } from "./friendship.ts";
export { fetchWithdrawalPreview } from "./api.ts";
export {
  SESSION_QUERY_KEY,
  signOut,
  useKnownAccount,
  useSession,
  withdrawAccount,
} from "./session.ts";
export type { SessionState } from "./session.ts";

/** アカウントの領域が出すもの（ナビには出さない）。 */
export const feature = {
  id: "account",
  routes: [devLoginRoute],
} satisfies WebFeature;
