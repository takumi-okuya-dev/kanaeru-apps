// 偽の Threads の API を立ち上げる（E2E と手元の確かめ用。本番では動かさない）。
// 口の番号は FAKE_THREADS_PORT（既定は 9790）。API の設定 THREADS_API_BASE_URL を http://127.0.0.1:<番号> にして使う。
// 利用者を1人（e2e_user）足しておく。トークンは POST /__control/tokens（{"userId":"9001"}）で作る。
import { serve } from "@hono/node-server";
import { createFakeThreads } from "./fake-threads.ts";

const port = Number(process.env.FAKE_THREADS_PORT ?? 9790);
const fake = createFakeThreads();
fake.addUser({ id: "9001", username: "e2e_user", name: "E2E User" });
serve({ fetch: fake.app.fetch, port, hostname: "127.0.0.1" });
console.log(`偽の Threads を http://127.0.0.1:${port} で立ち上げました。`);
