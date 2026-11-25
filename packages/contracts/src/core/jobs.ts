// 共通の定期の仕事の窓口の約束（POST /api/v1/jobs/tick。core-017）。領域ごとの状態と時間だけを返す（数や中身は返さない）。
import { z } from "zod";

/** 領域の定期の仕事のその回の状態。ran：動いた・skipped：時間外・off：アプリが切・failed：投げた。 */
export const JobTickStatus = z.enum(["ran", "skipped", "off", "failed"]);

/** 共通の定期の仕事の窓口の答え。 */
export const JobTickResult = z.object({
  jobs: z.array(
    z.object({
      /** 領域の名前 */
      domain: z.string(),
      status: JobTickStatus,
      /** かかった時間（ミリ秒。動かさなかったときは 0） */
      durationMs: z.number().int().nonnegative(),
    }),
  ),
});

/** 共通の定期の仕事の窓口の答えの型。 */
export type JobTickResult = z.infer<typeof JobTickResult>;
