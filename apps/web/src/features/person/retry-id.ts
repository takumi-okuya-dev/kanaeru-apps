// 送り直しの ID（人を足す clientRequestId・書き足しの appendId。research R7）を決める。
// 答えが届かなかった送りを、同じ中身でもう一度送るときだけ同じ ID を使う（API は二重にしない）。中身を変えて送るときは
// 新しい ID にする（同じ ID だと、API が前の人を返す・書き足しを飛ばすのに、画面は保存できたと出してしまう）。
import { useRef } from "react";

/** 前の送り（ID と、その中身を JSON にしたもの）。 */
type Attempt = { id: string; key: string };

/**
 * 送る中身に使う ID を決める（前の送りと中身が同じなら前の ID、違えば新しい ID）。
 * @param previous 前の送り（なければ undefined）
 * @param content 送る中身（ID を除いたもの）
 * @param newId 新しい ID を作る関数
 * @returns この送りの ID と中身
 */
export function nextAttempt(
  previous: Attempt | undefined,
  content: unknown,
  newId: () => string = () => crypto.randomUUID(),
): Attempt {
  const key = JSON.stringify(content);
  return previous?.key === key ? previous : { id: newId(), key };
}

/**
 * 送り直しの ID を持つフック。
 * @returns 中身に使う ID を返す idFor と、保存できたあとに前の送りを忘れる reset
 */
export function useRetryId() {
  const attempt = useRef<Attempt | undefined>(undefined);
  return {
    /**
     * 送る中身に使う ID（同じ中身の送り直しは同じ ID）。
     * @param content 送る中身（ID を除いたもの）
     * @returns ID
     */
    idFor: (content: unknown): string => {
      attempt.current = nextAttempt(attempt.current, content);
      return attempt.current.id;
    },
    /** 保存できたあと、前の送りを忘れる（次は新しい ID）。 */
    reset: () => {
      attempt.current = undefined;
    },
  };
}
