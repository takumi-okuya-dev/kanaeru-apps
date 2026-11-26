// 参考の投稿を足す枠と直す枠（threads-012。めぐるの components/research/ReferencePostAddDialog.tsx・ReferencePostFormDialog.tsx・
// ExplainOne.tsx の振る舞いを写した）。
// - 足す：1件入れるたびに「ためる」で上に並べ、最後に「n件を足す」で、ためた分と入れている分を1回で足す（1回に20件・残りの数まで）
// - 直す：全部の欄を直せる。読んだ版と同じときだけ保存する。1件だけ「なぜ良いか」を外の AI に頼み、答えを欄に入れられる
// - どちらも、入れた内容があるまま閉じるときは確かめる（EXPERIENCE.md「消す前は確かめる」。めぐるの破棄の確かめ）
import { REFERENCE_BATCH_MAX, isBlank } from "@workspace/contracts/threads";
import type { ReferencePost } from "@workspace/contracts/threads";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { createReferencePosts, fetchExplainPrompt, updateReferencePost } from "./api.ts";
import { CopyButton } from "./CopyButton.tsx";
import { ReferencePostFields } from "./ReferencePostFields.tsx";
import {
  EMPTY_REFERENCE_FORM,
  checkReferenceForm,
  sameReferenceForm,
  toReferenceForm,
} from "./reference-post-form.ts";
import type { ReferenceForm } from "./reference-post-form.ts";

/**
 * 本文の書き出し（1行目の40文字まで）。
 * @param body 本文
 * @returns 書き出し
 */
function excerpt(body: string): string {
  const line = body.trim().split("\n")[0] ?? "";
  return [...line].length > 40 ? `${[...line].slice(0, 40).join("")}…` : line;
}

/**
 * 欄の値と、1つの欄を変える道具（変えた欄の誤りは消す）。
 * @param initial はじめの値
 * @returns 値・変える道具・誤り
 */
function useReferenceForm(initial: ReferenceForm) {
  const [form, setForm] = useState<ReferenceForm>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  /**
   * 1つの欄を変える。
   * @param key 欄
   * @param value 値
   */
  const setField = <K extends keyof ReferenceForm>(key: K, value: ReferenceForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  return { form, setForm, setField, errors, setErrors };
}

/** 閉じる前の確かめの枠が受け取るもの。 */
type DiscardConfirmProps = {
  /** 開いているか */
  open: boolean;
  /** 残る */
  onStay: () => void;
  /** 捨てて閉じる */
  onDiscard: () => void;
  /** 題 */
  title: string;
  /** 本文 */
  children: string;
};

/**
 * 入れた内容を捨てて閉じるかの確かめ。
 * @param props 開いているか・残る・捨てる・題・本文
 * @returns 枠の要素
 */
function DiscardConfirm({ open, onStay, onDiscard, title, children }: DiscardConfirmProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      title={title}
      confirmLabel="捨てて閉じる"
      cancelLabel="入力に戻る"
      onConfirm={onDiscard}
    >
      {children}
    </ConfirmDialog>
  );
}

/** AddReferenceDialog が受け取るもの。 */
export type AddReferenceDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** あと何件足せるか */
  remaining: number;
  /** 閉じる */
  onClose: () => void;
  /** 足したあと（足した数） */
  onSaved: (count: number) => Promise<void>;
};

/**
 * 参考の投稿を足す枠（ためてまとめて足す）。
 * @param props 運用アカウントの ID・残りの数・閉じる・足したあと
 * @returns 枠の要素
 */
export function AddReferenceDialog({
  accountId,
  remaining,
  onClose,
  onSaved,
}: AddReferenceDialogProps) {
  const { form, setForm, setField, errors, setErrors } = useReferenceForm(EMPTY_REFERENCE_FORM);
  const [queue, setQueue] = useState<{ form: ReferenceForm; key: number }[]>([]);
  // ためたあとは、引き継いだキーワード・媒体が「はじめの値」になる
  const [baseline, setBaseline] = useState<ReferenceForm>(EMPTY_REFERENCE_FORM);
  const [nextKey, setNextKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [confirmClose, setConfirmClose] = useState(false);

  const cap = Math.min(remaining, REFERENCE_BATCH_MAX);
  const hasBody = !isBlank(form.body);
  const edited = !sameReferenceForm(form, baseline);
  const total = queue.length + (hasBody ? 1 : 0);
  const dirty = queue.length > 0 || edited;
  const canQueue = hasBody && queue.length + 1 <= cap;

  /** ためる（キーワードと媒体は、次の投稿のために残す）。 */
  const enqueue = () => {
    if (pending || !canQueue) return;
    const check = checkReferenceForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setQueue((current) => [...current, { form, key: nextKey }]);
    setNextKey(nextKey + 1);
    const next = { ...EMPTY_REFERENCE_FORM, keyword: form.keyword, platform: form.platform };
    setForm(next);
    setBaseline(next);
  };

  /** ためた分と入れている分を足す。 */
  const submit = async () => {
    if (pending) return;
    setFailure(undefined);
    if (total === 0) {
      setErrors({ body: "本文を入れてください。" });
      return;
    }
    if (total > cap) {
      setFailure(`1回に足せるのは${cap.toString()}件までです。ためた投稿を外してください。`);
      return;
    }
    const items = queue.map((item) => item.form);
    // 本文がなくても、はじめの値から変えた欄があれば、黙って捨てないよう確かめる
    if (hasBody || edited) {
      const check = checkReferenceForm(form);
      if (!check.ok) {
        setErrors(check.errors);
        return;
      }
      items.push(form);
    }
    const inputs = items.map((item) => {
      const check = checkReferenceForm(item);
      if (!check.ok) throw new Error("ためた投稿の形が合いません。");
      return check.input;
    });
    setPending(true);
    try {
      await createReferencePosts(accountId, inputs);
      await onSaved(inputs.length);
      onClose();
    } catch (caught) {
      setFailure(`足せませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  /** 閉じる（入れた内容があれば確かめる）。 */
  const requestClose = () => {
    if (pending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      title="参考の投稿を足す"
      description="Threads で見つけた反応の良い投稿を、何件かためてまとめて足せます。"
      footer={
        <>
          <Button onClick={requestClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            aria-disabled={pending || undefined}
          >
            {pending
              ? "足しています…"
              : queue.length === 0
                ? "足す"
                : `${total.toString()}件を足す`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <p className="text-s text-text-sub">
          何件かまとめて足すときは、1件入れるたびに「この投稿をためて、次の投稿を入れる」を押します。最後に「n件を足す」で、ためた分も一緒に足します。
        </p>
        {queue.length > 0 ? (
          <section aria-label={`ためた投稿（${queue.length.toString()}件）`}>
            <h3 className="text-m font-bold">ためた投稿（{queue.length}件）</h3>
            <ul className="flex flex-col gap-xxs">
              {queue.map((item) => (
                <li
                  key={item.key}
                  className="flex items-start gap-xxs rounded-md border border-border bg-surface-sunken p-xxs"
                >
                  <span className="min-w-0 flex-1 text-s break-words">
                    {excerpt(item.form.body)}
                  </span>
                  <Button
                    size="small"
                    aria-label={`「${excerpt(item.form.body)}」を外す`}
                    aria-disabled={pending || undefined}
                    onClick={() => {
                      if (!pending)
                        setQueue((current) => current.filter((entry) => entry.key !== item.key));
                    }}
                  >
                    外す
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ReferencePostFields
          key={nextKey}
          form={form}
          setField={setField}
          errors={errors}
          disabled={pending}
          whyGoodNote="空のままで大丈夫です。足したあとに、解説がまだの参考の投稿をまとめて AI に解説してもらえます。"
        />
        <div className="flex flex-col items-start gap-xxs border-t border-border pt-xs">
          {/* 本文の中の「ためる」は、下の「n件を足す」と見分けやすいよう左に置く（右寄せの ButtonRow にしない） */}
          <div>
            <Button aria-disabled={pending || !canQueue || undefined} onClick={enqueue}>
              ＋この投稿をためて、次の投稿を入れる
            </Button>
          </div>
          <p className="text-s text-text-sub">
            参考の投稿はあと{remaining}件まで足せます
            {cap === REFERENCE_BATCH_MAX && queue.length + 1 > cap
              ? `。1回に足せるのは${REFERENCE_BATCH_MAX.toString()}件までです`
              : ""}
          </p>
        </div>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <DiscardConfirm
        open={confirmClose}
        onStay={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false);
          onClose();
        }}
        title="足していない投稿があります"
      >
        ためた投稿と入れている内容は、閉じると消えます。
      </DiscardConfirm>
    </Dialog>
  );
}

/** ExplainOne が受け取るもの。 */
type ExplainOneProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 参考の投稿の ID */
  postId: string;
  /** 貼った解説を「なぜ良いか」に入れる */
  onUse: (text: string) => void;
  /** 貼った解説の欄（閉じる前の確かめに使うため、呼ぶ側が持つ） */
  paste: string;
  /** 貼った解説を変える */
  setPaste: (value: string) => void;
};

/**
 * 1件の「なぜ良いか」を外の AI に頼む欄（プロンプトを作ってコピーし、答えを貼って欄に入れる。保存は枠の「保存」で）。
 * @param props 運用アカウントの ID・参考の投稿の ID・欄に入れる・貼った解説と変える道具
 * @returns 欄の要素
 */
function ExplainOne({ accountId, postId, onUse, paste, setPaste }: ExplainOneProps) {
  const [prompt, setPrompt] = useState<string>();
  const [failure, setFailure] = useState<string>();

  /** プロンプトを作る。 */
  const make = async () => {
    setFailure(undefined);
    try {
      setPrompt((await fetchExplainPrompt(accountId, postId)).prompt);
    } catch (caught) {
      setFailure(`作れませんでした。${errorMessage(caught)}`);
    }
  };

  return (
    <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
      <h3 className="text-m font-bold">AI に「なぜ伸びたか」を解説してもらう</h3>
      <p className="text-s text-text-sub">
        プロンプトを外の AI
        に送り、返ってきた解説を貼ります。画像の投稿なら、画像も一緒に送ってください。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button onClick={() => void make()}>解説のプロンプトを作る</Button>
        </ButtonRow>
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      {prompt ? (
        <>
          <Field label="解説のプロンプト（1件）">
            <Textarea readOnly rows={5} value={prompt} />
          </Field>
          <CopyButton text={prompt} label="プロンプトをコピー" />
        </>
      ) : null}
      <Field label="AI の解説を貼る">
        <Textarea rows={3} value={paste} onChange={(change) => setPaste(change.target.value)} />
      </Field>
      <ButtonRow>
        <Button
          aria-disabled={paste.trim() === "" || undefined}
          onClick={() => {
            if (paste.trim() === "") return;
            onUse(paste.trim());
            setPaste("");
          }}
        >
          なぜ良いかに入れる
        </Button>
      </ButtonRow>
    </div>
  );
}

/** EditReferenceDialog が受け取るもの。 */
export type EditReferenceDialogProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 直す参考の投稿 */
  post: ReferencePost;
  /** 閉じる */
  onClose: () => void;
  /** 保存したあと */
  onSaved: () => Promise<void>;
};

/**
 * 参考の投稿を直す枠。
 * @param props 運用アカウントの ID・直す参考の投稿・閉じる・保存したあと
 * @returns 枠の要素
 */
export function EditReferenceDialog({
  accountId,
  post,
  onClose,
  onSaved,
}: EditReferenceDialogProps) {
  const initial = toReferenceForm(post);
  const { form, setField, errors, setErrors } = useReferenceForm(initial);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = !sameReferenceForm(form, initial) || paste.trim() !== "";

  /** 保存する。 */
  const save = async () => {
    if (pending) return;
    setFailure(undefined);
    const check = checkReferenceForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setPending(true);
    try {
      await updateReferencePost(accountId, post.id, check.input, post.version);
      await onSaved();
      onClose();
    } catch (caught) {
      setFailure(`保存できませんでした。${errorMessage(caught)}`);
    } finally {
      setPending(false);
    }
  };

  /** 閉じる（直した内容があれば確かめる）。 */
  const requestClose = () => {
    if (pending) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      title="参考の投稿を直す"
      footer={
        <>
          <Button onClick={requestClose} aria-disabled={pending || undefined}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            aria-disabled={pending || undefined}
          >
            {pending ? "保存しています…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xxs">
          <Badge>ID:{post.shortId}</Badge>
        </div>
        <ReferencePostFields
          form={form}
          setField={setField}
          errors={errors}
          disabled={pending}
          whyGoodExtra={
            <ExplainOne
              accountId={accountId}
              postId={post.id}
              onUse={(text) => setField("whyGood", text)}
              paste={paste}
              setPaste={setPaste}
            />
          }
        />
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <DiscardConfirm
        open={confirmClose}
        onStay={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false);
          onClose();
        }}
        title="保存していない変更があります"
      >
        直した内容は、閉じると消えます。
      </DiscardConfirm>
    </Dialog>
  );
}
