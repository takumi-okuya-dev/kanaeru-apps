// 今の利用者が、今の運用アカウントでできること（threads-013。PRD 組織 5.2）。AccountGate が GET /access で読んで渡す。
// 画面の出し分けだけに使う（判定の正は API。権限が足りない操作は API が 403 で断る）。
// 読む前と、チームに入れていない自分の運用アカウントでは、すべてできる（今の個人の運用の画面を変えない）。
import type { ThreadsAccountAccess } from "@workspace/contracts/threads";
import { createContext, useContext } from "react";

/** できること。 */
export type ThreadsCan = ThreadsAccountAccess["can"];

/** すべてできる（持ち主・読む前）。 */
export const FULL_CAN: ThreadsCan = {
  readContent: true,
  readPrivate: true,
  writeContent: true,
  review: true,
  manage: true,
  activity: true,
};

/** 今の運用アカウントでの関わり（AccountGate が渡す。読む前・運用アカウントの外は null）。 */
export const ThreadsAccessContext = createContext<ThreadsAccountAccess | null>(null);

/**
 * 今の運用アカウントでの関わりを読む（読む前・運用アカウントの外は null）。
 * @returns 関わり
 */
export function useThreadsAccess(): ThreadsAccountAccess | null {
  return useContext(ThreadsAccessContext);
}

/**
 * 今の運用アカウントでできること（読む前・運用アカウントの外は、すべてできる）。
 * @returns できること
 */
export function useThreadsCan(): ThreadsCan {
  return useContext(ThreadsAccessContext)?.can ?? FULL_CAN;
}
