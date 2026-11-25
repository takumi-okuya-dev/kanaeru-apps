// P2・P3 受付のページ（/match/join/$joinToken）。モックアップの P2・P3。PRD FR-M29。AD-30・Constitution 1.3.0 の例外。
// - ログインなし・ナビのない外枠（"bare"）・noindex。書けるのは名前（呼び名。試合表に出る）とレベルだけ（約束の strict）
// - 受付できたら「受付できました」と名前・レベルを出す
// - 電波がなくて送れないときは（P3。match-005）、名前とレベルを入れた QR を出し、運営の端末のカメラで読んでもらう（AD-30）。
//   つながったら自動で送る（運営が QR を読んだあとに届くと、名簿に「同じ名前」の印が付くので、運営が1つ消す。research R6）
// - 締め切られた・期限を過ぎた札は「受付は締め切られました」
import { MATCH_LEVEL_LABELS, MatchJoinInput, NICKNAME_MAX } from "@workspace/contracts/match";
import type { MatchLevel } from "@workspace/contracts/match";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useEffect, useState } from "react";
import { ApiError, NetworkError, errorMessage } from "../../lib/api.ts";
import { fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { Page } from "../../lib/page.tsx";
import { fetchJoinInfo, submitJoin } from "./api.ts";
import { formatPlayDate } from "./format.ts";
import { encodeJoinHandoff, newJoinNonce } from "./handoff.ts";
import { tokenHint } from "./link-store.ts";
import { QrCode } from "./qr.tsx";
import { useNoIndex } from "./no-index.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";

/** レベルの並び（見本 P2 のとおり、入門から）。 */
const LEVEL_ORDER: readonly MatchLevel[] = ["novice", "beginner", "intermediate", "advanced"];

/**
 * 受付のページ（道の部品）。
 * @returns 画面の要素
 */
export function JoinRoute() {
  const { joinToken } = useParams({ from: MATCH_ROUTE_PATTERNS.join });
  useNoIndex();
  const info = useQuery({
    queryKey: ["match", "join", joinToken],
    queryFn: () => fetchJoinInfo(joinToken),
    networkMode: "always",
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [nickname, setNickname] = useState("");
  const [level, setLevel] = useState<MatchLevel | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const send = useMutation({
    mutationFn: (input: MatchJoinInput) => submitJoin(joinToken, input),
    // 電波がなくても送りにいき、送れなければすぐ QR を出す（止めて待たない。P3）
    networkMode: "always",
  });
  // 電波がなくて送れなかった入力と、受付の QR に入れる乱数（同じ入力の QR は何度出しても同じ人）
  const [pending, setPending] = useState<{ input: MatchJoinInput; nonce: string }>();
  const [hint, setHint] = useState<string>();
  useEffect(() => {
    let live = true;
    void tokenHint(joinToken).then((value) => live && setHint(value));
    return () => {
      live = false;
    };
  }, [joinToken]);
  const offline = send.error instanceof NetworkError;
  // つながったら自動で送る（P3）
  const { mutate } = send;
  useEffect(() => {
    if (!offline || !pending) return;
    const retry = () => mutate(pending.input);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [mutate, offline, pending]);

  if (info.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (info.error || !info.data) {
    const closed = info.error instanceof ApiError && info.error.status === 404;
    return (
      <Page
        title={closed ? "受付は締め切られました" : "読みこめませんでした"}
        lead={errorMessage(info.error)}
      >
        {closed ? null : (
          <div>
            <Button onClick={() => void info.refetch()}>もう一度</Button>
          </div>
        )}
      </Page>
    );
  }
  const { data } = info;
  const lead = `${formatPlayDate(data.playDate)}・試合表の受付`;

  if (send.isSuccess) {
    return (
      <Page title="受付できました" lead={`${data.name}・${lead}`}>
        <p className="text-l">
          <b>{send.data.nickname}</b>・{MATCH_LEVEL_LABELS[send.data.level]}
        </p>
        <p className="text-m text-text-sub">
          試合表は、入口の QR
          か、運営が配るリンクから見られます。名前やレベルを直したいときは、運営に伝えてください。
        </p>
      </Page>
    );
  }

  if (offline && pending && hint) {
    const qrText = encodeJoinHandoff({
      hint,
      nickname: pending.input.nickname,
      level: pending.input.level,
      nonce: pending.nonce,
    });
    return (
      <Page title={data.name} lead={lead}>
        <ResponseMessage tone="danger">電波がないため、まだ送れていません。</ResponseMessage>
        <div className="flex flex-col items-center gap-xxs">
          <p className="text-l font-bold">この QR を運営に見せてください</p>
          <QrCode text={qrText} label="受付の QR（運営に見せる）" />
          <p className="text-l">
            <b>{pending.input.nickname}</b>・{MATCH_LEVEL_LABELS[pending.input.level]}
          </p>
          <p className="text-m text-text-sub">
            つながったら、自動で送ります。電波のある所で「もう一度送る」を押しても送れます。
          </p>
          <Button
            aria-disabled={send.isPending || undefined}
            onClick={() => !send.isPending && send.mutate(pending.input)}
          >
            {send.isPending ? "送っています…" : "もう一度送る"}
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page title={data.name} lead={lead}>
      <form
        noValidate
        className="flex max-w-form flex-col gap-xs"
        onSubmit={(submit) => {
          submit.preventDefault();
          if (send.isPending) return;
          const parsed = MatchJoinInput.safeParse({ nickname, level });
          if (!parsed.success) {
            setErrors(fieldErrorsFromIssues(parsed.error.issues));
            return;
          }
          setErrors({});
          setPending((current) =>
            current &&
            current.input.nickname === parsed.data.nickname &&
            current.input.level === parsed.data.level
              ? current
              : { input: parsed.data, nonce: newJoinNonce() },
          );
          send.mutate(parsed.data);
        }}
      >
        <Field label="名前" description="試合表に出ます" error={errors.nickname} required>
          <Input
            autoComplete="off"
            maxLength={NICKNAME_MAX}
            value={nickname}
            onChange={(change) => setNickname(change.target.value)}
          />
        </Field>
        <ChoiceChips
          label="レベル"
          options={LEVEL_ORDER.map((value) => ({ value, label: MATCH_LEVEL_LABELS[value] }))}
          value={level}
          onValueChange={setLevel}
          error={errors.level}
        />
        <div className="flex flex-col gap-xxs">
          <Button type="submit" variant="primary" aria-disabled={send.isPending || undefined}>
            {send.isPending ? "送っています…" : "受付する"}
          </Button>
          {offline ? (
            <ResponseMessage tone="danger">
              電波がないため、まだ送れていません。電波のある所でもう一度「受付する」を押すか、運営に名前とレベルを伝えてください。
            </ResponseMessage>
          ) : send.error ? (
            <ResponseMessage tone="danger">{errorMessage(send.error)}</ResponseMessage>
          ) : null}
        </div>
        <p className="text-s text-text-sub">名前とレベルは、その日の試合表のためだけに使います。</p>
      </form>
    </Page>
  );
}
