// 読書記録の画面の入口（docs/apps/reading.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { useReadingNavItems } from "./nav-items.ts";
import {
  readingAddBookRoute,
  readingBookRoute,
  readingConfirmRoute,
  readingImportRoute,
  readingShelfRoute,
} from "./routes.ts";

/**
 * 読書記録の領域が出すもの。決まったナビ（nav）は出さない（はじめの画面〈/〉の行き先にしない）。
 * 読書記録の画面の中でだけ、外枠のナビに「本棚」を出す（useNavItems）。
 */
export const feature = {
  id: "reading",
  routes: [
    readingShelfRoute,
    readingAddBookRoute,
    readingBookRoute,
    readingImportRoute,
    readingConfirmRoute,
  ],
  useNavItems: useReadingNavItems,
} satisfies WebFeature;
