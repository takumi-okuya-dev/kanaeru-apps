// 受付の交流会から名簿を入れる枠（PRD FR-M4・見本の M0。match-006）。
// 1. 自分が主催者の交流会（event の一覧の主催者の行。試合表と同じ組織のもの。どちらも組織に入れていなければ自分の交流会）から選ぶ
// 2. 入れる人を選ぶ：チェックインした人（当日）か、確定した申込みの名簿（前もって）
// 3. 前に入れたレベル（AD-25）がある人は入り、ない人は名簿で選ぶ。名前から呼び名を作る決まりは貼り付けと同じ（FR-M2。
//    LINE の表示名で姓と名の間に空白がないときは、頭の2字にして「確かめてほしい」の印）
// 名前はこの画面にだけ出し、試合表には呼び名・レベルと、LINE でチェックイン・申込みした人の account だけを持つ（レベルを覚えるため）。
// 後ろに足すときは、もう名簿にいる account の人は入れない。
// 入れた交流会（名前と日時の写し）は中身に置き、名簿と設定・試合表の題の下と一覧に「受付：… から入れた」と出す（match-007）。
import { ROSTER_MAX } from "@workspace/contracts/match";
import type { MatchTable } from "@workspace/contracts/match";
import { jstDate } from "@workspace/contracts/core";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Dialog } from "@workspace/ui/components/dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { formatPlayDate } from "./format.ts";
import { useOrganizerEvents, useReceptionRoster } from "./queries.ts";
import { importPeople } from "./roster-edit.ts";
import type { ImportMode } from "./roster-edit.ts";
import { canImportEvent, pickReceptionPeople, toReadPerson } from "./reception-import.ts";
import { assignNicknames } from "./roster-read.ts";
import type { TableEditor } from "./table-editor.ts";

/** 入れる人の選び方（チェックインした人・確定した申込みの名簿）。 */
type ReceptionSource = "checkins" | "applicants";

/** 入れた結果（呼ぶ側が名簿の上に出す）。 */
export type ReceptionImported = {
  /** 入れた人の ID と名前（画面を開いている間だけ見せる） */
  fullNames: Map<string, string>;
  /** 入れ方 */
  mode: ImportMode;
  /** 結果の文 */
  message: string;
};

/**
 * 受付の交流会から名簿を入れる枠。
 * @param props 試合表（table）・直す道具（editor）・開いているか（open）・開け閉め（onOpenChange）・入れたとき（onImported）
 * @param props.table 試合表
 * @param props.editor 試合表を直す道具
 * @param props.open 開いているか
 * @param props.onOpenChange 開け閉め
 * @param props.onImported 入れたとき
 * @returns 枠の要素
 */
export function ReceptionImportDialog({
  table,
  editor,
  open,
  onOpenChange,
  onImported,
}: {
  table: MatchTable;
  editor: TableEditor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: ReceptionImported) => void;
}) {
  const organizerEvents = useOrganizerEvents(open);
  // 試合表と同じ組織（どちらも組織に入れていなければ自分の交流会）だけ（組織ごとに閉じる。research R8）
  const events = {
    ...organizerEvents,
    data: organizerEvents.data?.filter((event) => canImportEvent(event, table)),
  };
  const [eventId, setEventId] = useState<string>();
  const roster = useReceptionRoster(table.id, open ? eventId : undefined);
  const [chosenSource, setChosenSource] = useState<ReceptionSource>();
  const [mode, setMode] = useState<ImportMode>("replace");
  const [failure, setFailure] = useState<string>();
  const hasRoster = table.content.players.length > 0;
  const importMode = hasRoster ? mode : "replace";
  // 読み直している間は出さない（古い名簿のまま入れない）
  const data = roster.data?.event.id === eventId && !roster.isFetching ? roster.data : undefined;
  // 選んでいなければ、チェックインした人がいればそちら（当日）、いなければ申込みの名簿（前もって）
  const source: ReceptionSource =
    chosenSource ?? (data && data.checkins.length === 0 ? "applicants" : "checkins");
  const selected = data ? data[source] : [];
  const { people, alreadyListed } = pickReceptionPeople(selected, table, importMode);
  const known = people.filter((person) => person.level !== null).length;

  /** 閉じる（選んだものを戻す）。 */
  const close = () => {
    onOpenChange(false);
    setEventId(undefined);
    setChosenSource(undefined);
    setMode("replace");
    setFailure(undefined);
  };

  /** 名簿に入れる。 */
  const submit = () => {
    if (!data || people.length === 0 || !editor.isEditor) return;
    const keep = importMode === "append" ? table.content.players.map((p) => p.nickname) : [];
    const named = assignNicknames(people.map(toReadPerson), keep);
    const base = importMode === "append" ? table.content.players.length : 0;
    if (base + named.length > ROSTER_MAX) {
      setFailure(`名簿は${ROSTER_MAX}人までです。人数を減らしてから入れてください。`);
      return;
    }
    let fullNames = new Map<string, string>();
    // どの交流会から入れたかを、名前と日時の写しと一緒に中身に置く（送ったときにサーバーが試合表とつなぐ。match-007）
    const from = { eventId: data.event.id, name: data.event.name, startsAt: data.event.startsAt };
    const applied = editor.apply((draft) => {
      const imported = importPeople(draft.content, named, importMode, from);
      fullNames = imported.fullNames;
      return { ...draft, content: imported.content };
    });
    if (!applied) {
      setFailure(
        "送れなかった変更が端末に残っているため、今は入れられません。上の知らせで、捨てるか上書きするかを選んでください。",
      );
      return;
    }
    const notes: string[] = [];
    const unknown = named.filter((person) => person.level === null).length;
    if (unknown > 0) notes.push(`レベルのない${unknown}人は、名簿で選んでください`);
    const checks = named.filter((person) => person.nameCheck).length;
    if (checks > 0) notes.push(`名前に空白のない${checks}人は、呼び名を確かめてください`);
    if (alreadyListed > 0) notes.push(`もう名簿にいる${alreadyListed}人は入れていません`);
    onImported({
      fullNames,
      mode: importMode,
      message: `${named.length}人を名簿に入れました。${notes.length > 0 ? `（${notes.join("。")}）` : ""}`,
    });
    close();
  };

  /**
   * 交流会の選択肢の言葉（名前と日付）。
   * @param event 交流会
   * @param event.name 名前
   * @param event.startsAt 始まりの日時
   * @returns 言葉
   */
  const eventLabel = (event: { name: string; startsAt: string }) =>
    `${event.name}（${formatPlayDate(jstDate(new Date(event.startsAt)))}）`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="受付の交流会から入れる"
      description="受付アプリの交流会を選んで、チェックインした人か、予約の申込みの名簿を入れます。自分が主催者（持ち主か、組織の管理者・編集者）で、この試合表と同じ組織の交流会だけが出ます（組織に入れていない試合表には、自分の交流会）。名前はこの画面にだけ出し、試合表には呼び名とレベルだけを保存します。"
      footer={
        <>
          <Button onClick={close}>やめる</Button>
          <Button
            variant="primary"
            aria-disabled={people.length === 0 || !editor.isEditor || undefined}
            onClick={submit}
          >
            {`${people.length}人を名簿に入れる`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        {events.isPending ? <p className="text-m text-text-sub">交流会を読んでいます…</p> : null}
        {events.isError ? (
          <ResponseMessage tone="danger">
            {`交流会を読めませんでした。${errorMessage(events.error)}`}
          </ResponseMessage>
        ) : null}
        {events.data && events.data.length === 0 ? (
          <p className="text-m text-text-sub">
            入れられる交流会がありません（自分が主催者で、この試合表と同じ組織の交流会だけが出ます）。受付アプリで交流会を作るか、フォームの貼り付けか「1人足す」で名簿を作ってください。
          </p>
        ) : null}
        {events.data && events.data.length > 0 ? (
          <ChoiceChips
            label="交流会"
            options={events.data.map((event) => ({ value: event.id, label: eventLabel(event) }))}
            value={eventId ?? null}
            onValueChange={(value: string) => {
              setEventId(value);
              setChosenSource(undefined);
              setFailure(undefined);
            }}
          />
        ) : null}
        {eventId && roster.isFetching ? (
          <p className="text-m text-text-sub">入れられる人を読んでいます…</p>
        ) : null}
        {eventId && roster.isError ? (
          <ResponseMessage tone="danger">
            {`入れられる人を読めませんでした。${errorMessage(roster.error)}`}
          </ResponseMessage>
        ) : null}
        {data ? (
          <>
            <ChoiceChips
              label="入れる人"
              options={[
                { value: "checkins", label: `チェックインした人（${data.checkins.length}人）` },
                { value: "applicants", label: `申込みの名簿（${data.applicants.length}人）` },
              ]}
              value={source}
              onValueChange={(value: ReceptionSource) => setChosenSource(value)}
            />
            {hasRoster ? (
              <ChoiceChips
                label="今の名簿"
                options={[
                  { value: "replace", label: "置きかえる（組み合わせも消えます）" },
                  { value: "append", label: "後ろに足す" },
                ]}
                value={mode}
                onValueChange={setMode}
              />
            ) : null}
            <p className="text-m">
              {people.length === 0
                ? "入れられる人がいません。"
                : `レベル：${known}人は前の試合表から入ります。${people.length - known}人はまだないので、名簿で選んでください。`}
            </p>
          </>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
    </Dialog>
  );
}
