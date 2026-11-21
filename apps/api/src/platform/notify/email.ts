// メールの送り手の差しこみ口（Open Questions 8：送信のサービスは決まっていない）。サービスを決めたら、この形の送り手を1つ足し、
// 組み立て（app.ts）で createNotifier に渡す（領域は直さない）。送り主のアドレス（kanaeru のドメイン）は送り手が持つ。
import type { EmailMessage } from "../../kernel/notifier.ts";

/** メールの送り手（送信のサービスの包み）。 */
export type EmailSender = {
  /**
   * 1通送る。宛先・本文をログに出さない。
   * @param message 中身（送り主の名前・返信先・宛先・題・本文）
   * @returns sent（受け取られた）か failed
   */
  send(message: EmailMessage): Promise<"sent" | "failed">;
};
