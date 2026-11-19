// アプリの登録（構成の決めごと AD-15）。この下に1行に1つだけ足す（docs/rules/parallel-development.md 3-1。merge=union）。
// 形：export const <key> = defineApp({ key: "<key>", name: "…", summary: "…", description: "…", icon: "…", domains: ["<領域>"], basePath: "/<key>", uses: [], accountData: "…" });
// 整形（Prettier）で行を折らないよう、このファイルは .prettierignore に入れてある。読む側（apps.ts の listApps）は、アプリを足しても直さない。
/* eslint-disable jsdoc/require-jsdoc -- 1行に1つの一覧（merge=union）なので、行の上に説明を置かない（説明は各行の name・summary・description） */
import { defineApp } from "./app-definition.ts";
export {};
export const reception = defineApp({ key: "reception", name: "受付", summary: "交流会の受付・アンケート", description: "交流会の受付を QR と LINE だけで済ませ、合計と困りごとのアンケートを集めます。", icon: "qr", domains: ["event", "reception", "survey"], basePath: "/admin/events", uses: [], accountData: "チェックイン・アンケートの回答・受付係の割り当て" });
