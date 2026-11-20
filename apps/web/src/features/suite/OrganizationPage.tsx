// 設定 › 組織 › 組織の画面（/settings/organizations/{id}。suite-001・PRD 組織 4.1〜4.4・FR-O52〜FR-O55）。
// - 組織の人（表示名・役割・入った日）は組織の人の全員に出す。見ている人に「あなた」、管理者には前に見てから入った人に「新しい人」
// - 管理者だけ：役割の切り替え（メンバー⇔編集者）・外す・招待のリンクと QR・管理者を引き継ぐ・名前を直す・組織を消す
// - 抜ける：編集者・メンバーはいつでも。管理者は引き継ぐ人を選んでから（選ぶまで押せない）。ほかに誰もいなければ、組織を消すよう案内する
// - アプリが足す入口（lib/organization.ts）は、見えるアプリの分だけ出す
// 判定の正は API（suite の requireOrganizationRole）。ここは出し分けるだけ。結果は押したボタンのそば、画面が変わるときだけ知らせの帯。
import type { OrganizationDetail, OrganizationMemberView } from "@workspace/contracts/suite";
import { ORGANIZATION_ROLE_LABELS, OrganizationNameInput } from "@workspace/contracts/suite";
import { useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useRef, useState } from "react";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromApi, fieldErrorsFromIssues, focusFirstInvalid } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { visibleOrganizationExtensions } from "../../lib/organization.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { OrganizationQr } from "./OrganizationQr.tsx";
import {
  deleteOrganization,
  leaveOrganization,
  removeMember,
  renameOrganization,
  rotateOrganizationInvite,
  setMemberRole,
  transferOrganizationAdmin,
} from "./organization-api.ts";
import { joinLinkValue } from "./organization-links.ts";
import { ORGANIZATION_ROUTE_PATTERNS } from "./organization-paths.ts";
import {
  ORGANIZATION_QUERY_KEYS,
  useOrganization,
  useOrganizationInvite,
} from "./organization-queries.ts";
import { useVisibleApps } from "./queries.ts";

/** 入った日の見せ方（日本時間の「2026年11月20日」）。 */
const JST_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 押したボタンのそばに出す結果。 */
type Result = { tone: "success" | "danger"; message: string };

/**
 * 組織の問い合わせを読み直す（その組織と一覧）。
 * @returns 読み直す関数
 */
function useRefreshOrganizations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
}

/**
 * まとまりの見出しと中身。
 * @param props 見出しの ID（id）・見出し（title）・中身（children）
 * @param props.id 見出しの ID
 * @param props.title 見出し
 * @param props.children 中身
 * @returns まとまりの要素
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-xxs">
      <h2 id={id} className="text-l leading-tight font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 組織の人を選ぶ欄（Field の中で使う）。
 * @param props 選べる人（members）・選んだ人（value）・選んだとき（onChange）
 * @param props.members 選べる人
 * @param props.value 選んだ人の ID（まだなら ""）
 * @param props.onChange 選んだとき
 * @returns 欄の要素
 */
function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: readonly OrganizationMemberView[];
  value: string;
  onChange: (value: string) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      <option value="">選んでください</option>
      {members.map((member) => (
        <option key={member.accountId} value={member.accountId}>
          {`${member.displayName || "名前のない人"}（${ORGANIZATION_ROLE_LABELS[member.role]}）`}
        </option>
      ))}
    </select>
  );
}

/**
 * 組織の人の1行（管理者には、自分以外の人の操作を出す）。
 * @param props 組織（organization）・人（member）・外すの確かめを開く（onRemove）
 * @param props.organization 組織
 * @param props.member 人
 * @param props.onRemove 外すの確かめを開く
 * @returns 行の要素
 */
function MemberRow({
  organization,
  member,
  onRemove,
}: {
  organization: OrganizationDetail;
  member: OrganizationMemberView;
  onRemove: (member: OrganizationMemberView) => void;
}) {
  const refresh = useRefreshOrganizations();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | undefined>();
  const canManage = organization.myRole === "admin" && !member.isMe && member.role !== "admin";
  const nextRole = member.role === "member" ? "editor" : "member";
  const name = member.displayName || "名前のない人";

  const changeRole = async () => {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    try {
      await setMemberRole(organization.id, member.accountId, { role: nextRole });
      setResult({
        tone: "success",
        message: `${name}さんを${ORGANIZATION_ROLE_LABELS[nextRole]}にしました。`,
      });
      await refresh();
    } catch (caught) {
      setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <li
      className="flex flex-col gap-x3s border-b border-border px-xs py-xxs last:border-b-0"
      aria-label={name}
    >
      <div className="flex flex-wrap items-center gap-xxs">
        <span className="min-w-0 text-m font-bold break-words">{name}</span>
        {member.isMe ? <Badge>あなた</Badge> : null}
        {member.isNew ? <Badge variant="success">新しい人</Badge> : null}
      </div>
      <p className="text-s text-text-sub">
        {ORGANIZATION_ROLE_LABELS[member.role]}・{JST_DATE.format(new Date(member.joinedAt))}
        に入った
      </p>
      {canManage ? (
        <div className="flex flex-col items-start gap-x3s" aria-busy={pending || undefined}>
          <div className="flex flex-wrap gap-xxs">
            <Button aria-disabled={pending || undefined} onClick={() => void changeRole()}>
              {nextRole === "editor" ? "編集者にする" : "メンバーに戻す"}
            </Button>
            <Button variant="danger" onClick={() => onRemove(member)}>
              外す
            </Button>
          </div>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * 組織の人の一覧と、外すの確かめ。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function MembersSection({ organization }: { organization: OrganizationDetail }) {
  const refresh = useRefreshOrganizations();
  const [target, setTarget] = useState<OrganizationMemberView | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<Result | undefined>();
  const editors = organization.members.filter((member) => member.role === "editor").length;

  const remove = async () => {
    if (!target) return;
    setPending(true);
    setError(undefined);
    try {
      await removeMember(organization.id, target.accountId);
      setResult({
        tone: "success",
        message: `${target.displayName || "名前のない人"}さんを外しました。`,
      });
      setTarget(undefined);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section id="organization-members-heading" title="組織の人">
      <p className="text-s text-text-sub">
        組織の人どうしで、表示名と役割が見えます。{organization.members.length}人（上限
        {organization.memberLimit}人）・編集者{editors}人（上限{organization.editorLimit}人）
      </p>
      <ul className="flex flex-col rounded-md border border-border bg-surface">
        {organization.members.map((member) => (
          <MemberRow
            key={member.accountId}
            organization={organization}
            member={member}
            onRemove={(next) => {
              setError(undefined);
              setResult(undefined);
              setTarget(next);
            }}
          />
        ))}
      </ul>
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => {
          if (!open) setTarget(undefined);
        }}
        title={`${target?.displayName || "名前のない人"}さんを外しますか`}
        confirmLabel="外す"
        pendingLabel="外しています…"
        pending={pending}
        error={error}
        onConfirm={() => void remove()}
      >
        <p>
          外すと、その人のアプリの中の担当と、その人が組織に入れていた記録の「組織に入れる」が消えます。記録とそのデータは、その人の個人のものとして残ります。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 招待のリンクと QR（管理者だけ）。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function InviteSection({ organization }: { organization: OrganizationDetail }) {
  const queryClient = useQueryClient();
  const query = useOrganizationInvite(organization.id, true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState<"done" | "failed">();

  const rotate = async () => {
    setPending(true);
    setError(undefined);
    try {
      const invite = await rotateOrganizationInvite(organization.id);
      queryClient.setQueryData(ORGANIZATION_QUERY_KEYS.invite(organization.id), invite);
      setConfirming(false);
      setCopied(undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (query.isPending) {
    return (
      <Section id="organization-invite-heading" title="招待のリンク">
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      </Section>
    );
  }
  if (query.isError) {
    return (
      <Section id="organization-invite-heading" title="招待のリンク">
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      </Section>
    );
  }
  const { token, createdAt } = query.data;
  const link = token ? joinLinkValue(token) : undefined;

  /** リンクを写す。 */
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <Section id="organization-invite-heading" title="招待のリンク">
      <p className="text-s text-text-sub">
        リンクか QR
        を、組織に入ってほしい人に送ってください。開いて「入る」を押すと、メンバーとして入ります。リンクは何人でも使え、期限はありません。
      </p>
      {link ? (
        <div className="flex flex-col items-start gap-xxs">
          <p
            data-testid="organization-invite-link"
            className="max-w-full rounded-sm border border-border-input bg-surface px-xxs py-x3s text-m break-all"
          >
            {link}
          </p>
          <OrganizationQr value={link} label={`組織「${organization.name}」の招待のQR`} />
          <div className="flex flex-wrap gap-xxs">
            <Button onClick={() => void copy()}>リンクを写す</Button>
            <Button
              onClick={() => {
                setError(undefined);
                setConfirming(true);
              }}
            >
              作り直す
            </Button>
          </div>
          {copied === "done" ? (
            <ResponseMessage tone="success">写しました。</ResponseMessage>
          ) : null}
          {copied === "failed" ? (
            <ResponseMessage tone="danger">
              写せませんでした。リンクの文字を選んで写してください。
            </ResponseMessage>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m">
            {createdAt
              ? "このリンクは、もう一度出せません。作り直すと新しいリンクが出ます（前のリンクは使えなくなります）。"
              : "まだ招待のリンクはありません。"}
          </p>
          <Button
            aria-disabled={pending || undefined}
            onClick={() => {
              if (pending) return;
              if (createdAt) {
                setError(undefined);
                setConfirming(true);
              } else void rotate();
            }}
          >
            {createdAt ? "作り直す" : "招待のリンクを作る"}
          </Button>
          {error && !confirming ? (
            <ResponseMessage tone="danger">{`作れませんでした。${error}`}</ResponseMessage>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="招待のリンクを作り直しますか"
        confirmLabel="作り直す"
        pendingLabel="作り直しています…"
        pending={pending}
        error={error}
        onConfirm={() => void rotate()}
      >
        <p>
          作り直すと、前のリンクと QR
          はすぐに使えなくなります。すでに入った人は、そのまま組織にいます。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 管理者を引き継ぐ（抜けない。前の管理者は編集者になる）。引き継いだあとは管理者でなくなるので、結果の文だけを残す。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function TransferSection({ organization }: { organization: OrganizationDetail }) {
  const refresh = useRefreshOrganizations();
  const others = organization.members.filter((member) => !member.isMe);
  const [successor, setSuccessor] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<Result | undefined>();
  if (organization.myRole !== "admin") {
    return result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null;
  }
  if (others.length === 0) return null;
  const chosen = others.find((member) => member.accountId === successor);

  const transfer = async () => {
    if (!chosen) return;
    setPending(true);
    setError(undefined);
    try {
      await transferOrganizationAdmin(organization.id, { accountId: chosen.accountId });
      setConfirming(false);
      setResult({
        tone: "success",
        message: `${chosen.displayName || "名前のない人"}さんに管理者を引き継ぎました。あなたは編集者になりました。`,
      });
      setSuccessor("");
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section id="organization-transfer-heading" title="管理者を引き継ぐ">
      <p className="text-s text-text-sub">
        組織を抜けずに、管理者だけをほかの人に渡します。あなたは編集者になり、アプリの中の担当はそのまま効きます。
      </p>
      <Field label="新しい管理者" error={fieldError}>
        <MemberSelect members={others} value={successor} onChange={setSuccessor} />
      </Field>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          onClick={() => {
            setResult(undefined);
            if (!chosen) {
              setFieldError("引き継ぐ人を選んでください。");
              return;
            }
            setFieldError(undefined);
            setError(undefined);
            setConfirming(true);
          }}
        >
          管理者を引き継ぐ
        </Button>
        {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="管理者を引き継ぎますか"
        confirmLabel="引き継ぐ"
        pendingLabel="引き継いでいます…"
        danger={false}
        pending={pending}
        error={error}
        onConfirm={() => void transfer()}
      >
        <p>
          {`${chosen?.displayName || "名前のない人"}さんが管理者になり、あなたは編集者になります。招待・役割の切り替え・人を外す・組織を消すは、新しい管理者だけができるようになります。`}
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 組織の名前を直す（管理者だけ）。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function RenameSection({ organization }: { organization: OrganizationDetail }) {
  const refresh = useRefreshOrganizations();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(organization.name);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Result | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setResult(undefined);
    const parsed = OrganizationNameInput.safeParse({ name });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await renameOrganization(organization.id, parsed.data);
      setResult({ tone: "success", message: "名前を直しました。" });
      await refresh();
    } catch (caught) {
      const fields = fieldErrorsFromApi(caught);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setResult({ tone: "danger", message: errorMessage(caught) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Section id="organization-rename-heading" title="組織の名前">
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-xs"
      >
        <Field label="組織の名前" required error={errors.name} description="50文字まで">
          <Input value={name} onChange={(change) => setName(change.target.value)} />
        </Field>
        <div className="flex flex-col items-start gap-xxs">
          <Button type="submit" aria-disabled={pending || undefined}>
            {pending ? "保存しています…" : "名前を保存する"}
          </Button>
          {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
        </div>
      </form>
    </Section>
  );
}

/**
 * 組織を抜ける（管理者は引き継ぐ人を選んでから。ほかに誰もいなければ、組織を消すよう案内する）。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function LeaveSection({ organization }: { organization: OrganizationDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = organization.myRole === "admin";
  const others = organization.members.filter((member) => !member.isMe);
  const [successor, setSuccessor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const chosen = others.find((member) => member.accountId === successor);
  const blocked = isAdmin && !chosen;

  const leave = async () => {
    setPending(true);
    setError(undefined);
    try {
      await leaveOrganization(
        organization.id,
        isAdmin && chosen ? { successorAccountId: chosen.accountId } : {},
      );
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
      showNotice({
        tone: "success",
        message: `組織「${organization.name}」を抜けました。`,
        path: ORGANIZATION_ROUTE_PATTERNS.list,
      });
      await navigate({ to: ORGANIZATION_ROUTE_PATTERNS.list });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  if (isAdmin && others.length === 0) {
    return (
      <Section id="organization-leave-heading" title="組織を抜ける">
        <p className="text-m">
          ほかに誰もいないので、管理者を引き継げません。抜けるときは、下の「組織を消す」で組織を消してください。
        </p>
      </Section>
    );
  }

  return (
    <Section id="organization-leave-heading" title="組織を抜ける">
      <p className="text-s text-text-sub">
        抜けると、あなたが組織に入れていた記録は組織から外れ、あなたの個人のものに戻ります。あなたのアプリの中の担当も消えます。
      </p>
      {isAdmin ? (
        <>
          <p className="text-m">
            管理者がいなくなると、招待や役割の切り替えができなくなるので、引き継ぐ人を選んでください。
          </p>
          <Field label="引き継ぐ人">
            <MemberSelect members={others} value={successor} onChange={setSuccessor} />
          </Field>
        </>
      ) : null}
      <div className="flex flex-col items-start gap-xxs">
        <Button
          variant="danger"
          aria-disabled={blocked || undefined}
          onClick={() => {
            if (blocked) return;
            setError(undefined);
            setConfirming(true);
          }}
        >
          {isAdmin ? "引き継いで抜ける" : "組織を抜ける"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="組織を抜けますか"
        confirmLabel={isAdmin ? "引き継いで抜ける" : "抜ける"}
        pendingLabel="抜けています…"
        pending={pending}
        error={error}
        onConfirm={() => void leave()}
      >
        <p>
          {isAdmin && chosen
            ? `${chosen.displayName || "名前のない人"}さんに管理者を引き継いでから、組織「${organization.name}」を抜けます。`
            : `組織「${organization.name}」を抜けます。`}
          もう一度入るには、管理者から招待のリンクをもらってください。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 組織を消す（管理者だけ）。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素
 */
function DeleteSection({ organization }: { organization: OrganizationDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      await deleteOrganization(organization.id);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEYS.all });
      showNotice({
        tone: "success",
        message: `組織「${organization.name}」を消しました。`,
        path: ORGANIZATION_ROUTE_PATTERNS.list,
      });
      await navigate({ to: ORGANIZATION_ROUTE_PATTERNS.list });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };

  return (
    <Section id="organization-delete-heading" title="組織を消す">
      <p className="text-s text-text-sub">
        組織の人・招待のリンク・アプリの中の担当と「組織に入れる」がすべて消えます。アプリの記録とそのデータは、持ち主の個人のものとして残ります。
      </p>
      <div>
        <Button
          variant="danger"
          onClick={() => {
            setError(undefined);
            setConfirming(true);
          }}
        >
          組織を消す
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`組織「${organization.name}」を消しますか`}
        confirmLabel="組織を消す"
        pendingLabel="消しています…"
        pending={pending}
        error={error}
        onConfirm={() => void remove()}
      >
        <p>
          組織の人{organization.members.length}
          人・招待のリンク・アプリの中の担当と「組織に入れる」が消えます。アプリの記録は、持ち主の個人のものとして残ります。元に戻せません。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * アプリが足す、アプリの組織の画面への入口（見えるアプリの分だけ）。
 * @param props 組織（organization）
 * @param props.organization 組織
 * @returns まとまりの要素（入口がなければ null）
 */
function AppLinksSection({ organization }: { organization: OrganizationDetail }) {
  const { status, apps } = useVisibleApps();
  const links = visibleOrganizationExtensions(
    status === "success" ? new Set(apps.map((app) => app.key)) : null,
  ).flatMap((extension) => extension.links?.(organization.id) ?? []);
  if (links.length === 0) return null;
  return (
    <Section id="organization-apps-heading" title="アプリでの組織">
      <ul className="flex flex-col gap-xxs">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="text-m text-text-link underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * 組織の画面の中身。
 * @param props 組織の ID（organizationId）
 * @param props.organizationId 組織の ID
 * @returns 要素
 */
function OrganizationContent({ organizationId }: { organizationId: string }) {
  const query = useOrganization(organizationId);
  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <Page title="組織が見つかりません" lead={errorMessage(query.error)}>
          <div>
            <Link to={ORGANIZATION_ROUTE_PATTERNS.list} className="text-m text-text-link underline">
              組織の一覧へ
            </Link>
          </div>
        </Page>
      );
    }
    return (
      <Page title="読みこめませんでした" lead={errorMessage(query.error)}>
        <div>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </div>
      </Page>
    );
  }
  const organization = query.data;
  const isAdmin = organization.myRole === "admin";
  return (
    <Page
      title={organization.name}
      lead={`あなたの役割：${ORGANIZATION_ROLE_LABELS[organization.myRole]}`}
    >
      <div>
        <Link to={ORGANIZATION_ROUTE_PATTERNS.list} className="text-s text-text-link underline">
          組織の一覧へ戻る
        </Link>
      </div>
      <AppLinksSection organization={organization} />
      <MembersSection organization={organization} />
      {isAdmin ? <InviteSection organization={organization} /> : null}
      <TransferSection organization={organization} />
      {isAdmin ? <RenameSection key={organization.name} organization={organization} /> : null}
      <LeaveSection organization={organization} />
      {isAdmin ? <DeleteSection organization={organization} /> : null}
    </Page>
  );
}

/** OrganizationPage が受け取るもの。 */
export type OrganizationPageProps = {
  /** 組織の ID（道の値） */
  organizationId: string;
};

/**
 * 設定 › 組織 › 組織の画面。
 * @param props 組織の ID（organizationId）
 * @returns 画面の要素
 */
export function OrganizationPage({ organizationId }: OrganizationPageProps) {
  return (
    <SessionGate>
      <OrganizationContent organizationId={organizationId} />
    </SessionGate>
  );
}

const organizationRouteApi = getRouteApi(ORGANIZATION_ROUTE_PATTERNS.detail);

/**
 * 組織の画面の道の部品（道の organizationId を渡す）。
 * @returns 画面の要素
 */
export function OrganizationRoute() {
  const { organizationId } = organizationRouteApi.useParams();
  return <OrganizationPage organizationId={organizationId} />;
}
