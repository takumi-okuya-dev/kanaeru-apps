// 画面の領域（features/<領域>/）の登録。この下に1行に1つだけ足す（docs/rules/parallel-development.md 3-1。merge=union）。
// 形：export * as <領域> from "./features/<領域>/index.ts";
// router.tsx はこの一覧を読んで道とナビをつなぐので、領域を足しても router.tsx は直さない。
export {};
export * as account from "./features/account/index.ts";
