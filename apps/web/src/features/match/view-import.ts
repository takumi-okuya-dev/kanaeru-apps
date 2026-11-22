// 見るだけのページ（P1）で、電波なしで渡された試合表の QR を取り込むかの決め方（AD-28・match-005 R8・R9）。状態を持たない関数だけ。
// - 取り込むのは、同じ試合表（見るだけの札の印が合う）で、今出している表より新しい版のときだけ
// - サーバーから読んだ表があるときは、QR の表を先に出すのは「版が大きく、かつ QR を作った時刻がサーバーの最後の保存より前でない」
//   ときだけ（運営が送っていない変更を捨てた・いたずらで大きな版の QR を作られたときも、サーバーで次に保存されたら戻る）
// - QR の時刻は分の単位に丸めてある（HANDOFF_TIME_UNIT_MS）。丸めた時刻 t の QR は [t, t+1分) のどこかで作られたので、
//   サーバーの保存がその中なら、QR のほうが新しいかもしれないとみなす（同じ分にサーバーで保存した直後の QR を落とさない）
// - 取り込んだと出すのは、取り込んだ表が実際に画面に出るときだけ（出さないなら、出さない理由を出す）
import type { MatchView } from "@workspace/contracts/match";
import { HANDOFF_TIME_UNIT_MS, compareHandoffVersion, viewFromHandoff } from "./handoff.ts";
import type { HandoffTable } from "./handoff.ts";

/** QR の時刻が端末の時刻より先でよい幅（ミリ秒。これより先の QR は取り込まない）。 */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/**
 * QR で受け取った表を、サーバーから読んだ表より先に出すか。
 * @param qr QR で受け取った表
 * @param server サーバーから読んだ表
 * @returns 先に出すなら true
 */
export function isHandoffNewer(qr: MatchView, server: MatchView): boolean {
  return (
    qr.version > server.version &&
    Date.parse(qr.updatedAt) + HANDOFF_TIME_UNIT_MS > Date.parse(server.updatedAt)
  );
}

/** 取り込むかを決めるときに見るもの。 */
export type HandoffImportContext = {
  /** この見るだけのページの札の印（tokenHint） */
  hint: string;
  /** 今出している表（なければ undefined） */
  current: MatchView | undefined;
  /** サーバーから読んだ表（なければ undefined） */
  server: MatchView | undefined;
  /** 今の時刻（ミリ秒） */
  now: number;
  /** 取り込んだ表の見られる期限（今の表の期限。なければ試合の日の終わり） */
  expiresAt: string;
};

/** 取り込むかを決めた結果。 */
export type HandoffImportDecision =
  | { kind: "import"; view: MatchView; text: string }
  | { kind: "reject"; tone: "info" | "danger"; text: string };

/**
 * 渡された試合表を取り込むかを決める（取り込むなら、画面に出す中身と、出す文を返す）。
 * @param table 渡された試合表
 * @param context 札の印・今の表・サーバーの表・今の時刻・期限
 * @returns 取り込むか・出す文
 */
export function decideHandoffImport(
  table: HandoffTable,
  context: HandoffImportContext,
): HandoffImportDecision {
  if (table.hint === null || table.hint !== context.hint) {
    return {
      kind: "reject",
      tone: "danger",
      text: "この試合表の QR ではありません（別の試合表か、運営がリンクを作り直しました）。運営に新しいリンクを聞いてください。",
    };
  }
  if (table.updatedAt > context.now + FUTURE_TOLERANCE_MS) {
    return {
      kind: "reject",
      tone: "danger",
      text: "この QR の時刻が、この端末の時刻より先になっています。運営の端末の時刻を確かめてください。",
    };
  }
  const compared = compareHandoffVersion(table.version, context.current?.version);
  if (compared !== "newer") {
    return {
      kind: "reject",
      tone: "info",
      text:
        compared === "same"
          ? `もう同じ版（版 ${table.version}）の表が入っています。`
          : `この端末の表のほうが新しいため、取り込みませんでした（QR は版 ${table.version}）。`,
    };
  }
  const view = viewFromHandoff(table, context.expiresAt);
  if (context.server && !isHandoffNewer(view, context.server)) {
    return {
      kind: "reject",
      tone: "info",
      text: `この QR（版 ${table.version}）を作ったあとに、サーバーで試合表が保存されています。サーバーから読んだ表を出したまま、取り込みませんでした。`,
    };
  }
  return { kind: "import", view, text: `版 ${table.version} の表を取り込みました。` };
}

/** 端末に置いた表（最後に読んだ表か、QR で受け取った表）。 */
export type SavedView = {
  /** 中身 */
  view: MatchView;
  /** 読んだ時刻（ミリ秒） */
  readAt: number;
  /** QR で受け取った表か（match-005） */
  source?: "qr";
};

/**
 * 出す表を選ぶ（サーバーから読んだ表と、端末に置いた表〈QR で受け取った表を含む〉）。読めればサーバーの表を出し、
 * QR で受け取った表は isHandoffNewer のときだけ先に出す。
 * @param fromServer サーバーから読んだ表
 * @param saved 端末に置いた表
 * @returns 出す表
 */
export function newerView(
  fromServer: SavedView | undefined,
  saved: SavedView | undefined,
): SavedView | undefined {
  if (!fromServer) return saved;
  if (saved?.source === "qr" && isHandoffNewer(saved.view, fromServer.view)) return saved;
  return fromServer;
}
