// メモの画面の道（一覧・追加・編集）。どれも道の根（lib/router.ts の rootRoute）の子。
// 追加と編集の画面は、約束（zod）と確かめの枠（Base UI）を値で読むので、開いたときに別に読む（lazyRouteComponent）。
// 最初に読む JS は、gzip で約 165KB から約 129KB になる（2026-11-18 に測った）。
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../lib/router.ts";
import { NotesListPage } from "./NotesListPage.tsx";

/** メモの一覧（/notes）。 */
export const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesListPage,
});

/** メモの追加（/notes/new）。 */
export const noteNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/new",
  component: lazyRouteComponent(() => import("./NoteNewPage.tsx"), "NoteNewPage"),
});

/** メモの編集（/notes/$noteId）。 */
export const noteEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  component: lazyRouteComponent(() => import("./NoteEditPage.tsx"), "NoteEditPage"),
});
