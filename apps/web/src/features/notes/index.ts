// メモの画面の入口（docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。ほかの領域は、ここからだけ読む。
// メモは、領域の作り方を見せる見本（docs/apps/notes.md）。プロダクトを始めたら、消すか作り替える。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる。Link の to が型で確かめられる）。
import type { WebFeature } from "../../lib/feature.ts";
import { noteEditRoute, noteNewRoute, notesRoute } from "./routes.ts";

/** メモの領域が出すもの。 */
export const feature = {
  id: "notes",
  routes: [notesRoute, noteNewRoute, noteEditRoute],
  nav: { label: "メモ", to: "/notes" },
} satisfies WebFeature;
