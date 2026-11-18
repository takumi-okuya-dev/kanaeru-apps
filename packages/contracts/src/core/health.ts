// 動いているかの約束（GET /api/v1/health）。名前や中身は返さない。
import { z } from "zod";

/** 動いているかの答え。 */
export const Health = z.object({ status: z.literal("ok") });

/** 動いているかの答えの型。 */
export type Health = z.infer<typeof Health>;
