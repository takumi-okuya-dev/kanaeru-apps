// 道具（MCP）が内側から呼んでよい窓口の一覧（core-021・AD-20）。ここに載らない道は、利用者の印があっても通さない（既定は拒否）。
// 形：道の型（Hono の routePath・":名前" の形）・動き・窓口が属するアプリの key・分類（今は read だけ）。
// 1行に1つだけ足す（merge=union）。読むだけ。書く窓口は、書く仕組みを作るときに足す（FR-025〜031）。
/**
 * 道具が呼べる窓口の1行（動き・道の型・アプリ・分類）。
 */
export type WindowAllowance = {
  /** 動き */
  method: "GET";
  /** Hono の道の型（例 /api/v1/events/:eventId/checkins/me） */
  routePath: string;
  /** 窓口が属するアプリの key（範囲は <key>:read） */
  appKey: string;
  /** 分類 */
  access: "read";
};

/** 許可リスト（1行に1つ。読むだけ）。 */
export const WINDOW_ALLOWLIST: readonly WindowAllowance[] = [
  {
    method: "GET",
    routePath: "/api/v1/events/:eventId/checkins/me",
    appKey: "reception",
    access: "read",
  },
];
