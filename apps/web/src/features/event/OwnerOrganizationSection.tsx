// 準備の画面の「持ち主と組織」（event-002。PRD 受付アプリの予約 UJ-6・research R6）。
// 持ち主の名前と、交流会を入れる組織（入っている組織か「入れない（個人）」）を出す。組織に入れる・外すのは持ち主だけで、
// 持ち主でない主催者には今の組織と、その旨だけを出す。送った結果は押したボタンの近く（ResponseMessage）。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Loading } from "./EventAccessGate.tsx";
import { fetchEventOrganization, setEventOrganization } from "./api.ts";
import { EVENT_QUERY_KEYS } from "./queries.ts";

/** 「入れない（個人）」の選択肢の値（組織の ID は uuid なので重ならない）。 */
const PERSONAL = "personal";

/** 説明の文。 */
const EXPLANATION =
  "組織に入れると、その組織の管理者と編集者も、この交流会を管理できます。メンバーは部員になります。持ち主は変わりません。";

/** OwnerOrganizationSection が受け取るもの。 */
export type OwnerOrganizationSectionProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * 持ち主と組織のまとまり（見出し h2 つき）。
 * @param props 交流会の ID（eventId）
 * @returns まとまりの要素
 */
export function OwnerOrganizationSection({ eventId }: OwnerOrganizationSectionProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: EVENT_QUERY_KEYS.organization(eventId),
    queryFn: () => fetchEventOrganization(eventId),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>();
  const mutation = useMutation({
    mutationFn: (organizationId: string | null) => setEventOrganization(eventId, organizationId),
    onSuccess: async (state) => {
      queryClient.setQueryData(EVENT_QUERY_KEYS.organization(eventId), state);
      setSelected(null);
      setSaved(
        state.organization
          ? `組織「${state.organization.name}」に入れました。`
          : "組織から外しました。この交流会は、あなたの個人のものです。",
      );
      // 主催者の範囲が変わるので、交流会と一覧を読み直す
      await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });

  return (
    <section aria-labelledby="setup-owner" className="flex flex-col gap-xs">
      <h2 id="setup-owner" className="text-l leading-tight font-bold">
        持ち主と組織
      </h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      ) : (
        <>
          <dl className="flex flex-col gap-x3s text-m">
            <div className="flex flex-wrap gap-x-xs">
              <dt className="text-text-sub">持ち主</dt>
              <dd>
                {query.data.owner
                  ? `${query.data.owner.displayName || "名前のない人"}${query.data.isOwner ? "（あなた）" : ""}`
                  : "まだいません"}
              </dd>
            </div>
            {query.data.isOwner ? null : (
              <div className="flex flex-wrap gap-x-xs">
                <dt className="text-text-sub">組織</dt>
                <dd>{query.data.organization?.name ?? "入れていません（個人）"}</dd>
              </div>
            )}
          </dl>
          <p className="text-s text-text-sub">{EXPLANATION}</p>
          {query.data.isOwner ? (
            <div className="flex flex-col items-start gap-xxs">
              <ChoiceChips
                label="入れる組織"
                options={[
                  ...query.data.options.map((option) => ({ value: option.id, label: option.name })),
                  { value: PERSONAL, label: "入れない（個人）" },
                ]}
                value={selected ?? query.data.organization?.id ?? PERSONAL}
                onValueChange={(value) => {
                  setSelected(value);
                  setSaved(undefined);
                  mutation.reset();
                }}
                description={
                  query.data.options.length === 0
                    ? "入っている組織がありません。組織は、設定の「組織」から作れます。"
                    : undefined
                }
              />
              <ButtonRow>
                <Button
                  aria-disabled={mutation.isPending || undefined}
                  onClick={() => {
                    if (mutation.isPending) return;
                    const value = selected ?? query.data.organization?.id ?? PERSONAL;
                    mutation.mutate(value === PERSONAL ? null : value);
                  }}
                >
                  {mutation.isPending ? "保存しています…" : "保存"}
                </Button>
              </ButtonRow>
              {saved ? <ResponseMessage tone="success">{saved}</ResponseMessage> : null}
              {mutation.isError ? (
                <ResponseMessage tone="danger">
                  {`保存できませんでした。${errorMessage(mutation.error)}`}
                </ResponseMessage>
              ) : null}
            </div>
          ) : (
            <p className="text-m">組織に入れる・外すのは、持ち主だけです。</p>
          )}
        </>
      )}
    </section>
  );
}
