// 人物メモの画面の入口（docs/apps/person.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { usePersonNavItems } from "./nav-items.ts";
import {
  personCreateRoute,
  personListRoute,
  personMeetingRoute,
  personMeetingsRoute,
  personNoteRoute,
} from "./routes.ts";

/**
 * 人物メモの領域が出すもの。決まったナビ（nav）は出さない（はじめの画面〈/〉の行き先にしない）。
 * 人物メモの画面の中でだけ、外枠のナビに「人」「会った場」を出す（useNavItems）。
 */
export const feature = {
  id: "person",
  routes: [
    personListRoute,
    personCreateRoute,
    personNoteRoute,
    personMeetingsRoute,
    personMeetingRoute,
  ],
  useNavItems: usePersonNavItems,
} satisfies WebFeature;
