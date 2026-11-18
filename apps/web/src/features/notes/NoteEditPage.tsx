// メモの編集の画面。保存の結果はボタンの近くに出す。削除は確かめの枠で、何が消えるか・元に戻せないことを書いてから行い、
// 消したら一覧へ移って画面の上の知らせの帯で伝える（EXPERIENCE.md 3「消す」「送った結果」）。
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { deleteNote, noteQuery, notesKey, notesQuery, updateNote } from "./api.ts";
import { NoteForm } from "./NoteForm.tsx";

const routeApi = getRouteApi("/notes/$noteId");

/**
 * メモの編集の画面。
 * @returns 画面の要素
 */
export function NoteEditPage() {
  const { noteId } = routeApi.useParams();
  const query = useQuery(noteQuery(noteId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  if (query.isPending) {
    return (
      <Page title="メモの編集">
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      </Page>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page title={notFound ? "メモが見つかりません" : "メモの編集"}>
        <div className="flex flex-col items-start gap-xxs">
          <ResponseMessage tone="danger">
            {notFound
              ? "消されたか、URL が違う可能性があります。一覧から選び直してください。"
              : `メモを読みこめませんでした。${errorMessage(query.error)}`}
          </ResponseMessage>
          {notFound ? null : <Button onClick={() => void query.refetch()}>もう一度</Button>}
          <Link to="/notes" className="text-text-link underline underline-offset-2">
            メモの一覧へ戻る
          </Link>
        </div>
      </Page>
    );
  }

  const note = query.data;

  /**
   * 削除する（確かめの枠の「削除」）。消したメモをこの画面が読み直さないよう（404・読みこみ中が一瞬出ない）、
   * 一覧から先に除き、一覧へ移ってから、消したメモの問い合わせを捨てる。
   */
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteNote(note.id);
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
      return;
    }
    const noteKey = noteQuery(note.id).queryKey;
    await queryClient.cancelQueries({ queryKey: noteKey });
    queryClient.setQueryData(notesQuery().queryKey, (current) =>
      current ? { items: current.items.filter((item) => item.id !== note.id) } : current,
    );
    showNotice({ tone: "success", message: "メモを削除しました。", path: "/notes" });
    await navigate({ to: "/notes" });
    queryClient.removeQueries({ queryKey: noteKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: notesKey, exact: true });
  };

  return (
    <Page title="メモの編集">
      <NoteForm
        // ほかのメモへ移ったら、フォームを作り直す（保存したあとは作り直さない。結果の文を残すため）
        key={note.id}
        initial={{ title: note.title, body: note.body }}
        submitLabel="保存"
        pendingLabel="保存しています…"
        successMessage="保存しました。"
        onSubmit={async (input) => {
          const saved = await updateNote(note.id, input);
          queryClient.setQueryData(noteQuery(note.id).queryKey, saved);
          await queryClient.invalidateQueries({ queryKey: notesKey, exact: true });
        }}
      />
      <section
        aria-labelledby="note-delete-heading"
        className="flex flex-col items-start gap-xxs border-t border-border pt-s"
      >
        <h2 id="note-delete-heading" className="text-l leading-tight font-bold">
          メモの削除
        </h2>
        <p className="text-m">削除したメモは元に戻せません。</p>
        <Button
          variant="danger"
          onClick={() => {
            setDeleteError(undefined);
            setConfirmOpen(true);
          }}
        >
          削除
        </Button>
      </section>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="メモを削除しますか"
        confirmLabel="削除"
        pendingLabel="削除しています…"
        pending={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
      >
        <p>「{note.title}」を削除します。削除したメモは元に戻せません。</p>
      </ConfirmDialog>
    </Page>
  );
}
