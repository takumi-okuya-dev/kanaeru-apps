// API の起動（本番・手元の入口）。手順は server.ts（E2E の立ち上げと同じ手順を使う）。
// API_HOST の既定は 127.0.0.1（手元の外から届かない）。容器で動かすときは設定で 0.0.0.0 にする。
import { startServer } from "./server.ts";

startServer();
