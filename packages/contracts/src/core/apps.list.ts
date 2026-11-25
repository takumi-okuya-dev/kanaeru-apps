// アプリの登録（構成の決めごと AD-15）。この下に1行に1つだけ足す（docs/rules/parallel-development.md 3-1。merge=union）。
// 形：export const <key> = defineApp({ key: "<key>", name: "…", summary: "…", description: "…", icon: "…", domains: ["<領域>"], basePath: "/<key>", uses: [], accountData: "…" });
// 整形（Prettier）で行を折らないよう、このファイルは .prettierignore に入れてある。読む側（apps.ts の listApps）は、アプリを足しても直さない。
/* eslint-disable jsdoc/require-jsdoc -- 1行に1つの一覧（merge=union）なので、行の上に説明を置かない（説明は各行の name・summary・description） */
import { defineApp } from "./app-definition.ts";
export {};
export const reception = defineApp({ key: "reception", name: "受付", summary: "交流会の受付・アンケート", description: "交流会の受付を QR と LINE だけで済ませ、合計と困りごとのアンケートを集めます。", icon: "qr", domains: ["event", "reception", "survey", "booking"], basePath: "/admin/events", uses: [], accountData: "チェックイン・アンケートの回答・受付係の割り当て・名簿（持ち主の交流会の名簿と CSV の列の対応）" });
export const threads = defineApp({ key: "threads", name: "Threads", summary: "投稿の案・承認・自動投稿", description: "Threads の投稿の案をためて承認し、決めた時間に自動で投稿します。反応を取りこみ、次の案のプロンプトに生かします。", icon: "chat", domains: ["threads"], basePath: "/threads", uses: [], accountData: "運用アカウント・投稿の案・反応の記録" });
export const match = defineApp({ key: "match", name: "試合表", summary: "ダブルスの試合表づくり", description: "申込みの名簿から、同じ人とばかり組まない・休みが偏らないダブルスやシングルスの試合表を作って印刷します。", icon: "list", domains: ["match"], basePath: "/match", uses: ["reception"], accountData: "試合表（組織に入れていないもの）・前に入れたレベル" });
