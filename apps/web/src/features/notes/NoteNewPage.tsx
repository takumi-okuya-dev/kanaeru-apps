// メモの追加の画面。追加できたら一覧へ移り、画面の上の知らせの帯で伝える（画面が切り替わるため。EXPERIENCE.md 3）。
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { createNote, notesKey } from "./api.ts";
import { NoteForm } from "./NoteForm.tsx";

/**
 * メモの追加の画面。
 * @returns 画面の要素
 */
export function NoteNewPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (
    <Page title="メモを追加">
      <NoteForm
        submitLabel="追加"
        pendingLabel="追加しています…"
        onSubmit={async (input) => {
          await createNote(input);
          await queryClient.invalidateQueries({ queryKey: notesKey });
          showNotice({ tone: "success", message: "メモを追加しました。", path: "/notes" });
          await navigate({ to: "/notes" });
        }}
      />
    </Page>
  );
}
