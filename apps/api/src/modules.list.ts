// 領域（modules/<領域>/）の登録。この下に1行に1つだけ足す（docs/rules/parallel-development.md 3-1。merge=union）。
// 形：export * as <領域> from "./modules/<領域>/index.ts";
// app.ts はこの一覧を読んでつなぐので、領域を足しても app.ts は直さない。0行でもモジュールとして読める。
export {};
export * as account from "./modules/account/index.ts";
export * as event from "./modules/event/index.ts";
