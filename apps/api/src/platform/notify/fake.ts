// 偽の送り手（手元とテスト。AD-24）：本物の API を呼ばず、送ったものを新しい順に覚えるだけ。
// 手元で紐づけを試すため、覚えたものは booking の開発の窓口（試験用のログインが入のときだけ）が読む。ログには手段と文字数だけを出す。
import type { FakeMessage } from "../../kernel/notifier.ts";

/** 覚える数の上限。 */
export const FAKE_OUTBOX_MAX = 50;

/** 偽の送り手の覚え。 */
export type FakeOutbox = {
  /**
   * 覚える（上限を超えたら古いものを捨てる）。
   * @param message 送ったもの（時刻はここで付ける）
   */
  push(message: Omit<FakeMessage, "at">): void;
  /**
   * 覚えたもの（新しい順）。
   * @returns 覚えたもの
   */
  list(): readonly FakeMessage[];
};

/**
 * 偽の送り手の覚えを作る。
 * @param now 今の時刻（テストで固定する）
 * @returns 覚え
 */
export function createFakeOutbox(now: () => Date = () => new Date()): FakeOutbox {
  const messages: FakeMessage[] = [];
  return {
    push(message) {
      messages.unshift({ ...message, at: now().toISOString() });
      if (messages.length > FAKE_OUTBOX_MAX) messages.length = FAKE_OUTBOX_MAX;
    },
    list: () => [...messages],
  };
}
