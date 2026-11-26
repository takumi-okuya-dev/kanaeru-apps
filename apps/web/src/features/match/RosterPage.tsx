// M1 名簿と設定（/match/tables/$tableId）。モックアップの M1。
// - 名簿の入れ方（空のときは1行の説明つきのカード、入ったあとは「名簿を足す・入れ直す」から開く。match-011）：受付の交流会から（チェックインした人か申込みの名簿。前に入れたレベルを使う。FR-M4・match-006）・
//   フォームの回答をスプレッドシートからコピーして貼り付ける（主な入れ方。FR-M30）・CSV のファイルを読む（FR-M1）・
//   1人足す（FR-M3）。貼った表と CSV は画面の中で読み（lib/csv-read.ts）、名簿に入れる前に列の確かめ（ColumnCheckDialog.tsx。
//   match-008）で氏名・レベル・回答の日時の列を確かめ、その3つだけを使う。メール・ラケット・
//   きっかけ・要望は読まず、サーバーにも送らない。氏名も送らず、呼び名（姓から作る。FR-M2）とレベルだけを送る（Constitution II）。
//   氏名は、この画面を開いている間だけ「氏名（入れたもの）」の列に出す
// - 名簿の表は「名簿の一覧（N人）」の開け閉めの中に入れ、初めは閉じておく（人数が多いとスクロールが長くなるため）。
//   受付の交流会・貼り付け・CSV から取り込んだ直後は開いて、入った人を見せる
// - 1人ずつ：呼び名・レベル・当日の印（来る・遅れて来る・来ない）を直せる。消せる
// - 設定：試合の数・試合の形・分け方（レベル別〈4つ・3つ・2つ〉・分けない・ミニゲーム〈コート数〉を組み合わせる。match-009）。
//   組ごとの人数と試合の数・ミニゲームのチームの数を出す
// - 「試合表を作る」（作ってあれば「組み直す」。終わった試合は残す）で組み、試合表の画面へ移る
// - 題の下に手順（① 名簿を入れる → ② 分け方と試合の数を選ぶ → ③ 試合表を作る。RosterSteps.tsx。match-011）
// 直すたびに担当の端末から保存する（AD-28。table-editor.ts）。担当でない端末は見るだけ。
// QR の受付で入った人は、担当の端末で開くと名簿に入る（use-joins.ts。match-004）。同じ呼び名の人には「同じ名前」の印。
import {
  GAMES_MAX,
  MATCH_FORMATS,
  MATCH_FORMAT_LABELS,
  MATCH_GROUPING_LABELS,
  MATCH_LEVEL_GROUPINGS,
  MATCH_LEVELS,
  MATCH_LEVEL_LABELS,
  MatchSettings,
  MINI_COURTS_MAX,
  NICKNAME_MAX,
  PLAYERS_PER_GAME,
  PLAYER_STATUSES,
  PLAYER_STATUS_LABELS,
  ROSTER_MAX,
} from "@workspace/contracts/match";
import type {
  MatchSettings as MatchSettingsValue,
  MatchFormat,
  MatchLevel,
  MatchLevelGrouping,
  MatchPlayer,
  MatchTable,
  PlayerStatus,
} from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useId, useRef, useState } from "react";
import { decodeCsv, parseCsv } from "../../lib/csv-read.ts";
import type { ParsedCsv } from "../../lib/csv-read.ts";
import { fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { showNotice } from "../../lib/notice.ts";
import { Page } from "../../lib/page.tsx";
import { formatPlayDate, settingsText } from "./format.ts";
import { MATCH_ROUTE_PATTERNS, matchPaths } from "./paths.ts";
import { miniSummary } from "./mini-game.ts";
import { hasDoneGames, rebuild, summarizeGroups } from "./plan.ts";
import { changeSettings, describeSettingsChange } from "./regroup.ts";
import { MATCH_QUERY_KEYS } from "./queries.ts";
import { forgetJoinedPlayer, useJoins } from "./use-joins.ts";
import { addPlayer, countRoster, importPeople, removePlayer, updatePlayer } from "./roster-edit.ts";
import type { ImportMode } from "./roster-edit.ts";
import { assignNicknames } from "./roster-read.ts";
import type { RosterReadResult } from "./roster-read.ts";
import { ColumnCheckDialog } from "./ColumnCheckDialog.tsx";
import { ReceptionImportDialog } from "./ReceptionImportDialog.tsx";
import { ReceptionEventNote } from "./ReceptionEventNote.tsx";
import { RosterSteps } from "./RosterSteps.tsx";
import { rosterSteps } from "./steps.ts";
import { EditorState, TableFrame } from "./TableFrame.tsx";
import type { TableEditor } from "./table-editor.ts";

/** 読む CSV のファイルの大きさの上限（バイト）。 */
const CSV_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** RosterBody などが受け取るもの。 */
type BodyProps = {
  /** 試合表 */
  table: MatchTable;
  /** 試合表を直す道具 */
  editor: TableEditor;
};

/**
 * 読んだ結果の文（入れた人数と、入れなかった行）。
 * @param result 名簿を読んだ結果
 * @param added 入れた人数
 * @returns 文
 */
function importSummary(result: RosterReadResult, added: number): string {
  const notes: string[] = [];
  if (result.replaced > 0) notes.push(`同じ氏名の古い回答 ${result.replaced}件は入れていません`);
  if (result.skipped > 0) notes.push(`氏名が空の行 ${result.skipped}件は入れていません`);
  if (!result.columns.level) notes.push("レベルの列がないので、レベルは名簿で選んでください");
  return `${added}人を名簿に入れました。${notes.length > 0 ? `（${notes.join("。")}）` : ""}`;
}

/**
 * 名簿の入れ方（受付の交流会から・貼り付け・CSV・1人足す）。
 * @param props 試合表（table）・直す道具（editor）・氏名を覚える関数（onNames）
 * @param props.onNames 入れた人の ID と氏名・入れ方（画面を開いている間だけ見せる）
 * @returns 要素
 */
function ImportActions({
  table,
  editor,
  onNames,
}: BodyProps & { onNames: (names: Map<string, string>, mode: ImportMode) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [receptionOpen, setReceptionOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const [methodsOpen, setMethodsOpen] = useState(false);
  // 名簿が空になった・入ったら、「名簿を足す・入れ直す」は閉じた形から始める
  const [rosterShown, setRosterShown] = useState(table.content.players.length > 0);
  if (rosterShown !== table.content.players.length > 0) {
    setRosterShown(table.content.players.length > 0);
    setMethodsOpen(false);
  }
  const methodsId = useId();
  const [pending, setPending] = useState<{
    parsed: ParsedCsv;
    mode: ImportMode;
    sourceLabel: string;
    /** 読むたびに変える印（列の確かめの枠の選びを、表ごとに作り直す） */
    key: number;
  }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const disabled = !editor.isEditor;
  const hasRoster = table.content.players.length > 0;
  /** 名簿の入れ方（よく使うものを上に。カードの説明は1行で、いつ使うかが分かる言葉にする。match-011）。 */
  const methods = [
    {
      key: "paste",
      label: "フォームから貼り付ける",
      note: "Google フォームの回答を、スプレッドシートからコピーして貼る",
      recommended: true,
      run: () => setPasteOpen(true),
    },
    {
      key: "reception",
      label: "受付の交流会から",
      note: "受付アプリでチェックインした人・申込みの名簿を入れる",
      recommended: false,
      run: () => setReceptionOpen(true),
    },
    {
      key: "csv",
      label: "Google フォームの CSV を読む",
      note: "フォームの回答の画面から「CSV をダウンロード」したファイルを選ぶ",
      recommended: false,
      run: () => fileRef.current?.click(),
    },
    {
      key: "add",
      label: "1人足す",
      note: "人が少ないとき・当日に来た人を、手で1人ずつ",
      recommended: false,
      run: () => setAddOpen(true),
    },
  ];

  /**
   * 貼った文字かファイルの文字を表として読み、列の確かめの枠を開く。
   * @param raw 貼った文字か、ファイルの文字
   * @param importMode 入れ方
   * @param sourceLabel 読んだもの（ファイルの名前か「貼り付けた表」）
   * @returns 表が読めたら true
   */
  const readText = (raw: string, importMode: ImportMode, sourceLabel: string): boolean => {
    const parsed = parseCsv(raw, { delimiter: "auto" });
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setMessage({
        tone: "danger",
        text: "表が読めませんでした。フォームの回答の表を、見出しの行ごとコピーして貼り付けてください。",
      });
      return false;
    }
    setMessage(undefined);
    setPending({ parsed, mode: importMode, sourceLabel, key: Date.now() });
    return true;
  };

  /**
   * 列の確かめのあと、読んだ名簿を入れる。
   * @param result 名簿を読んだ結果（列の確かめで選んだ列で読んだもの）
   * @param importMode 入れ方
   * @returns 入れられたら null。入れられなければ理由の文（列の確かめの枠の中に出す）
   */
  const importText = (result: RosterReadResult, importMode: ImportMode): string | null => {
    if (result.people.length === 0) {
      return "氏名の列が読めませんでした。フォームの回答の表を、見出しの行ごとコピーして貼り付けてください。";
    }
    const keep = importMode === "append" ? table.content.players.map((p) => p.nickname) : [];
    const named = assignNicknames(result.people, keep);
    const base = importMode === "append" ? table.content.players.length : 0;
    if (base + named.length > ROSTER_MAX) {
      return `名簿は${ROSTER_MAX}人までです。人数を減らしてから入れてください。`;
    }
    // 今の中身（apply が渡す、送りの途中の変更を含む中身）から作る。氏名は作った ID と結ぶ
    let fullNames = new Map<string, string>();
    const applied = editor.apply((draft) => {
      const imported = importPeople(draft.content, named, importMode);
      fullNames = imported.fullNames;
      return { ...draft, content: imported.content };
    });
    if (!applied) {
      return "送れなかった変更が端末に残っているため、今は入れられません。この枠を閉じ、画面の上の知らせで、捨てるか上書きするかを選んでください。";
    }
    setMessage({ tone: "success", text: importSummary(result, named.length) });
    onNames(fullNames, importMode);
    return null;
  };

  return (
    <div className="flex flex-col gap-xxs">
      {hasRoster ? (
        // 名簿が入ったあとは、ボタン1つから入れ方を開く（画面をすっきりさせる。match-011）
        <div className="flex flex-col items-start gap-xxs">
          <Button
            size="small"
            disabled={disabled}
            aria-expanded={methodsOpen}
            aria-controls={methodsId}
            onClick={() => setMethodsOpen(!methodsOpen)}
          >
            {methodsOpen ? "名簿を足す・入れ直す（閉じる）" : "名簿を足す・入れ直す"}
          </Button>
          {methodsOpen ? (
            <div id={methodsId} className="flex flex-wrap gap-xxs">
              {methods.map((method) => (
                <Button
                  key={method.key}
                  size="small"
                  disabled={disabled}
                  onClick={() => {
                    setMethodsOpen(false);
                    method.run();
                  }}
                >
                  {method.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        // 名簿が空のときは、入れ方を1行の説明つきのカードで並べ、よく使うものを上に（match-011）
        <ul aria-label="名簿の入れ方" className="grid grid-cols-1 gap-xxs wide:grid-cols-2">
          {methods.map((method) => (
            <li key={method.key}>
              <Button
                disabled={disabled}
                onClick={method.run}
                className="h-auto w-full flex-col items-start gap-x3s py-xxs text-left whitespace-normal"
              >
                <span className="flex flex-wrap items-center gap-xxs text-m font-bold">
                  {method.label}
                  {method.recommended ? <Badge>よく使う</Badge> : null}
                </span>
                <span className="text-s font-normal text-text-sub">{method.note}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV のファイル"
          className="hidden"
          onChange={(change) => {
            const file = change.target.files?.[0];
            change.target.value = "";
            if (!file) return;
            if (file.size > CSV_FILE_MAX_BYTES) {
              setMessage({ tone: "danger", text: "ファイルが大きすぎます（5MB まで）。" });
              return;
            }
            void file.arrayBuffer().then((buffer) => {
              readText(decodeCsv(buffer), hasRoster ? "append" : "replace", file.name);
            });
          }}
        />
      </div>
      {message ? <ResponseMessage tone={message.tone}>{message.text}</ResponseMessage> : null}
      <Dialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        title="フォームの回答を貼り付ける"
        description="Google フォームの回答のスプレッドシートで、見出しの行ごと表を選んでコピーし、ここに貼り付けます。次に、どの列を読むかを確かめます（氏名・レベル・回答の日時だけを読み、メールアドレスや要望は読みません）。"
        footer={
          <>
            <Button onClick={() => setPasteOpen(false)}>やめる</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (readText(text, hasRoster ? mode : "replace", "貼り付けた表")) {
                  setPasteOpen(false);
                  setText("");
                }
              }}
            >
              次へ（列を確かめる）
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-xs">
          <Field label="貼り付ける表">
            <Textarea rows={8} value={text} onChange={(change) => setText(change.target.value)} />
          </Field>
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
        </div>
      </Dialog>
      <ColumnCheckDialog
        key={pending?.key ?? 0}
        parsed={pending?.parsed}
        sourceLabel={pending?.sourceLabel ?? ""}
        onClose={() => setPending(undefined)}
        onImport={(result) => (pending ? importText(result, pending.mode) : null)}
      />
      <AddPlayerDialog open={addOpen} onOpenChange={setAddOpen} editor={editor} />
      <ReceptionImportDialog
        table={table}
        editor={editor}
        open={receptionOpen}
        onOpenChange={setReceptionOpen}
        onImported={(result) => {
          setMessage({ tone: "success", text: result.message });
          onNames(result.fullNames, result.mode);
        }}
      />
    </div>
  );
}

/**
 * 1人足す枠。
 * @param props 開いているか（open）・開け閉め（onOpenChange）・直す道具（editor）
 * @param props.open 開いているか
 * @param props.onOpenChange 開け閉め
 * @param props.editor 試合表を直す道具
 * @returns 枠の要素
 */
function AddPlayerDialog({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: TableEditor;
}) {
  const [nickname, setNickname] = useState("");
  const [level, setLevel] = useState<MatchLevel | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="1人足す"
      description="試合表に出る呼び名と、レベルを入れます。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>やめる</Button>
          <Button
            variant="primary"
            onClick={() => {
              const next: FieldErrors = {};
              const trimmed = nickname.trim();
              if (!trimmed) next.nickname = "呼び名を入れてください。";
              else if ([...trimmed].length > NICKNAME_MAX) {
                next.nickname = `呼び名は${NICKNAME_MAX}文字までにしてください。`;
              }
              if (!level) next.level = "レベルを選んでください。";
              setErrors(next);
              if (Object.keys(next).length > 0 || !level) return;
              editor.apply((draft) => ({
                ...draft,
                content: addPlayer(draft.content, { nickname: trimmed, level }),
              }));
              setNickname("");
              setLevel(null);
              onOpenChange(false);
            }}
          >
            足す
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <Field label="呼び名" error={errors.nickname} required>
          <Input
            autoComplete="off"
            value={nickname}
            onChange={(change) => setNickname(change.target.value)}
          />
        </Field>
        <ChoiceChips
          label="レベル"
          options={MATCH_LEVELS.map((value) => ({ value, label: MATCH_LEVEL_LABELS[value] }))}
          value={level}
          onValueChange={setLevel}
          error={errors.level}
        />
      </div>
    </Dialog>
  );
}

/**
 * 呼び名の欄（直して欄を離れるか Enter で保存する）。
 * @param props 名簿の人（player）・直せるか（disabled）・保存する関数（onCommit）
 * @param props.player 名簿の人
 * @param props.disabled 直せないなら true
 * @param props.onCommit 保存する関数
 * @returns 欄の要素
 */
function NicknameInput({
  player,
  disabled,
  onCommit,
}: {
  player: MatchPlayer;
  disabled: boolean;
  onCommit: (nickname: string) => void;
}) {
  const [value, setValue] = useState(player.nickname);
  const [synced, setSynced] = useState(player.nickname);
  if (synced !== player.nickname) {
    setSynced(player.nickname);
    setValue(player.nickname);
  }
  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || [...trimmed].length > NICKNAME_MAX) {
      setValue(player.nickname);
      return;
    }
    if (trimmed !== player.nickname) onCommit(trimmed);
  };
  return (
    <input
      aria-label={`${player.nickname}の呼び名`}
      className={`${inputClassName} min-w-xl font-bold`}
      value={value}
      disabled={disabled}
      maxLength={NICKNAME_MAX}
      onChange={(change) => setValue(change.target.value)}
      onBlur={commit}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter") commit();
      }}
    />
  );
}

/**
 * 名簿の表。
 * @param props 試合表（table）・直す道具（editor）・貼った人の氏名（fullNames）
 * @param props.fullNames 名簿の人の ID → 氏名（貼った画面を開いている間だけ）
 * @returns 要素
 */
function RosterTable({
  table,
  editor,
  fullNames,
  onRemoved,
}: BodyProps & { fullNames: Map<string, string>; onRemoved: (playerId: string) => void }) {
  const players = table.content.players;
  const disabled = !editor.isEditor;
  const showNames = fullNames.size > 0;
  // 同じ呼び名の人（受付で入った人と、貼った人など。AD-30「同じ名前」の印）
  const nameCounts = new Map<string, number>();
  for (const player of players) {
    const key = player.nickname.normalize("NFKC").replace(/\s+/gu, "");
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const isDuplicate = (nickname: string) =>
    (nameCounts.get(nickname.normalize("NFKC").replace(/\s+/gu, "")) ?? 0) > 1;
  if (players.length === 0) {
    return (
      <p className="text-m text-text-sub">
        まだ名簿はありません。上の入れ方から1つ選んで入れてください。
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse bg-surface text-s">
        <thead>
          <tr className="bg-head text-left">
            {showNames ? (
              <th className="px-xxs py-xxs font-bold whitespace-nowrap">氏名（入れたもの）</th>
            ) : null}
            <th className="px-xxs py-xxs font-bold whitespace-nowrap">呼び名（試合表に出る）</th>
            <th className="px-xxs py-xxs font-bold whitespace-nowrap">レベル</th>
            <th className="px-xxs py-xxs font-bold whitespace-nowrap">当日</th>
            <th className="px-xxs py-xxs font-bold whitespace-nowrap">
              <span className="sr-only">消す</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="border-t border-border align-middle">
              {showNames ? (
                <td className="px-xxs py-xxs whitespace-nowrap">
                  {fullNames.get(player.id) ?? ""}
                </td>
              ) : null}
              <td className="px-xxs py-xxs">
                <div className="flex flex-col gap-x3s">
                  <NicknameInput
                    player={player}
                    disabled={disabled}
                    onCommit={(nickname) =>
                      editor.apply((draft) => ({
                        ...draft,
                        content: updatePlayer(draft.content, player.id, { nickname }),
                      }))
                    }
                  />
                  {player.nameCheck ? <Badge>姓と名の間に空白がありません</Badge> : null}
                  {isDuplicate(player.nickname) ? <Badge>同じ名前</Badge> : null}
                </div>
              </td>
              <td className="px-xxs py-xxs">
                <select
                  aria-label={`${player.nickname}のレベル`}
                  aria-invalid={player.level === null || undefined}
                  className={`${inputClassName} min-h-l`}
                  value={player.level ?? ""}
                  disabled={disabled}
                  onChange={(change) => {
                    const level = change.target.value as MatchLevel;
                    editor.apply((draft) => ({
                      ...draft,
                      content: updatePlayer(draft.content, player.id, { level }),
                    }));
                  }}
                >
                  {player.level === null ? <option value="">選んでください</option> : null}
                  {MATCH_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {MATCH_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-xxs py-xxs">
                <select
                  aria-label={`${player.nickname}の当日`}
                  className={`${inputClassName} min-h-l`}
                  value={player.status}
                  disabled={disabled}
                  onChange={(change) => {
                    const status = change.target.value as PlayerStatus;
                    editor.apply((draft) => ({
                      ...draft,
                      content: updatePlayer(draft.content, player.id, { status }),
                    }));
                  }}
                >
                  {PLAYER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PLAYER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-xxs py-xxs">
                <Button
                  size="small"
                  variant="text"
                  disabled={disabled}
                  aria-label={`${player.nickname}を名簿から消す`}
                  onClick={() => {
                    const applied = editor.apply((draft) => ({
                      ...draft,
                      content: removePlayer(draft.content, player.id),
                    }));
                    if (applied) onRemoved(player.id);
                  }}
                >
                  消す
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 時刻・分の欄（直して欄を離れたら、設定として確かめて保存する）。
 * @param props 名前（label）・値（value）・種類（type）・誤り（error）・直せないか（disabled）・保存する関数（onCommit）
 * @param props.label 欄の名前
 * @param props.value 今の値
 * @param props.type 欄の種類（time か number）
 * @param props.error 誤りの文
 * @param props.disabled 直せないなら true
 * @param props.onCommit 保存する関数
 * @returns 欄の要素
 */
function SettingInput({
  label,
  value,
  type,
  error,
  disabled,
  onCommit,
  min,
  max,
}: {
  label: string;
  value: string;
  type: "number";
  error: string | undefined;
  disabled: boolean;
  onCommit: (value: string) => void;
  min: number;
  max: number;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Field label={label} error={error}>
      <Input
        type={type}
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(change) => setDraft(change.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </Field>
  );
}

/**
 * 設定と分け方ごとの試合と「試合表を作る」。
 * @param props 試合表（table）・直す道具（editor）
 * @returns 要素
 */
function SettingsCard({ table, editor }: BodyProps) {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<{
    next: MatchSettingsValue;
    lines: string[];
  }>();
  const [failure, setFailure] = useState<string>();
  const { settings } = table.content;
  const disabled = !editor.isEditor;
  const summaries = summarizeGroups(table.content);
  const mini = miniSummary(table.content);
  // 組んだか・レベルのない人の数は、手順（steps.ts）と同じ決め方を使う
  const steps = rosterSteps(table.content);
  const planned = steps.done.includes("build");
  const noLevel = steps.noLevel;

  /**
   * 設定を確かめる（誤りは欄のそば）。
   * @param patch 直す欄
   * @returns 確かめた設定（誤りなら undefined）
   */
  const checkSettings = (patch: Record<string, unknown>) => {
    const parsed = MatchSettings.safeParse({ ...settings, ...patch });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return undefined;
    }
    setErrors({});
    return parsed.data;
  };

  /**
   * 設定を保存する（分け方か試合の形が変わったら、終わった試合をできるだけ残して組み合わせを移す。regroup.ts）。
   * @param next 確かめた設定
   */
  const saveSettings = (next: MatchSettingsValue) => {
    editor.apply((draft) => ({ ...draft, content: changeSettings(draft.content, next).content }));
  };

  /**
   * 設定を変える（組み合わせが変わるときは、何が変わるかを先に確かめる）。
   * @param patch 直す欄
   */
  const requestSettings = (patch: Record<string, unknown>) => {
    const next = checkSettings(patch);
    if (!next) return;
    const { report } = changeSettings(table.content, next);
    if ((report.regrouped && (report.dropped > 0 || report.doneTotal > 0)) || report.miniCleared) {
      setPendingSettings({ next, lines: describeSettingsChange(report, false) });
    } else saveSettings(next);
  };

  /** 組んで、試合表の画面へ移る。 */
  const generate = () => {
    if (summaries.every((summary) => summary.games === 0) && (!mini || mini.short)) {
      setFailure(
        `組める組がありません。${PLAYERS_PER_GAME[settings.format]}人以上が来る組を作るか、ミニゲームのコート数を減らしてください。`,
      );
      return;
    }
    setFailure(undefined);
    editor.apply((draft) => ({ ...draft, content: rebuild(draft.content, draft.seed) }));
    const path = matchPaths.board(table.id);
    const miniNote = mini?.short
      ? `ミニゲームは、来る人がチームの数（${mini.teams}）より少ないため、チームを分けていません。`
      : "";
    showNotice({
      tone: "success",
      message: `${planned ? "まだの試合を組み直しました。" : "試合表を作りました。"}${miniNote}`,
      path,
    });
    void navigate({ to: "/match/tables/$tableId/board", params: { tableId: table.id } });
  };

  return (
    <section
      aria-labelledby="match-settings"
      className="flex flex-col gap-xs rounded-md border border-border bg-surface p-xs"
    >
      <h2 id="match-settings" tabIndex={-1} className="scroll-mt-s text-l font-bold outline-none">
        試合の設定
      </h2>
      <div className="grid grid-cols-1 gap-xs wide:grid-cols-3">
        <SettingInput
          label="試合の数（1つの組）"
          type="number"
          min={1}
          max={GAMES_MAX}
          value={String(settings.gameCount)}
          error={errors.gameCount}
          disabled={disabled}
          onCommit={(value) => requestSettings({ gameCount: Number(value) })}
        />
      </div>
      {disabled ? (
        <dl className="flex flex-col gap-x3s text-m">
          <div className="flex flex-wrap gap-xxs">
            <dt className="font-bold">試合の形</dt>
            <dd>{MATCH_FORMAT_LABELS[settings.format]}</dd>
          </div>
          <div className="flex flex-wrap gap-xxs">
            <dt className="font-bold">分け方</dt>
            <dd>{settingsText(settings)}</dd>
          </div>
        </dl>
      ) : (
        <>
          <ChoiceChips
            label="試合の形"
            options={MATCH_FORMATS.map((value) => ({ value, label: MATCH_FORMAT_LABELS[value] }))}
            value={settings.format}
            onValueChange={(format: MatchFormat) => {
              requestSettings({ format });
            }}
          />
          <fieldset
            className="flex flex-col gap-xxs"
            aria-describedby={errors.levels ? "match-sets-error" : "match-sets-help"}
          >
            <legend className="text-m font-bold">分け方</legend>
            <p id="match-sets-help" className="text-s text-text-sub">
              いくつでも組み合わせられます（例：レベル別と分けないの両方）。あとから変えられます。変えたら「組み直す」を押してください。
            </p>
            <label className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                checked={settings.levels !== null}
                onChange={(change) =>
                  requestSettings({ levels: change.target.checked ? "four" : null })
                }
                className="size-s accent-primary"
              />
              レベル別
            </label>
            {settings.levels !== null ? (
              <ChoiceChips
                label="レベル別の分け方"
                labelHidden
                className="pl-m"
                options={MATCH_LEVEL_GROUPINGS.map((value) => ({
                  value,
                  label: MATCH_GROUPING_LABELS[value],
                }))}
                value={settings.levels}
                onValueChange={(levels: MatchLevelGrouping) => {
                  requestSettings({ levels });
                }}
              />
            ) : null}
            <label className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                checked={settings.ungrouped}
                onChange={(change) => requestSettings({ ungrouped: change.target.checked })}
                className="size-s accent-primary"
              />
              分けない（全員で1つ・レベルの差をならす）
            </label>
            <label className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                checked={settings.courts !== null}
                onChange={(change) => requestSettings({ courts: change.target.checked ? 2 : null })}
                className="size-s accent-primary"
              />
              ミニゲーム（コート数×2 のチームに、レベルを均して分ける）
            </label>
            {settings.courts !== null ? (
              <div className="max-w-menu pl-m">
                <SettingInput
                  label="コート数"
                  type="number"
                  min={1}
                  max={MINI_COURTS_MAX}
                  value={String(settings.courts)}
                  error={errors.courts}
                  disabled={disabled}
                  onCommit={(value) => requestSettings({ courts: Number(value) })}
                />
              </div>
            ) : null}
            {errors.levels ? (
              <p id="match-sets-error" className="text-s text-danger-text">
                {errors.levels}
              </p>
            ) : null}
          </fieldset>
        </>
      )}
      <div className="flex flex-col gap-x3s">
        <h3 className="text-m font-bold">分け方ごとの試合</h3>
        <ul className="flex flex-col gap-x3s text-m">
          {summaries.map((summary) => (
            <li key={summary.group.key} className="flex flex-wrap justify-between gap-xxs">
              <span className="font-bold">
                {summary.group.key === "all" ? "全員（分けない）" : summary.group.label}
              </span>
              <span className={summary.short ? "text-danger-text" : "text-text-sub"}>
                {summary.short
                  ? `${summary.players}人（${PLAYERS_PER_GAME[settings.format]}人に足りないので組めません。一緒にする分け方にしてください）`
                  : `${summary.players}人・${summary.games}試合`}
              </span>
            </li>
          ))}
          {mini ? (
            <li className="flex flex-wrap justify-between gap-xxs">
              <span className="font-bold">ミニゲーム</span>
              <span className={mini.short ? "text-danger-text" : "text-text-sub"}>
                {mini.short
                  ? `${mini.players}人（${mini.teams}チームに1人以上入るには、来る人が${mini.teams}人要ります）`
                  : `${mini.players}人・${mini.teams}チーム・1チーム${mini.min === mini.max ? mini.min : `${mini.min}〜${mini.max}`}人`}
              </span>
            </li>
          ) : null}
        </ul>
        {noLevel > 0 ? (
          <p className="text-s text-danger-text">{`レベルを選んでいない人が${noLevel}人います。選ぶまで試合に入りません。`}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          id="match-build"
          variant="primary"
          disabled={disabled}
          onClick={() => {
            if (hasDoneGames(table.content)) setConfirmOpen(true);
            else generate();
          }}
        >
          {planned ? "組み直す" : "試合表を作る"}
        </Button>
        {planned ? (
          <p className="text-s text-text-sub">名簿や設定を変えたら「組み直す」を押してください。</p>
        ) : null}
        {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      </div>
      <ConfirmDialog
        open={pendingSettings !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingSettings(undefined);
        }}
        title="組み合わせが変わります。変えますか？"
        confirmLabel="変える"
        onConfirm={() => {
          if (pendingSettings) saveSettings(pendingSettings.next);
          setPendingSettings(undefined);
        }}
      >
        <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
          {(pendingSettings?.lines ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="まだの試合を組み直しますか？"
        confirmLabel="組み直す"
        onConfirm={() => {
          setConfirmOpen(false);
          generate();
        }}
      >
        <p className="text-m">
          チェックの付いた試合（と、それより前の試合）はそのまま残し、その先だけを組み直します。
        </p>
      </ConfirmDialog>
    </section>
  );
}

/**
 * 名簿と設定の中身。
 * @param props 試合表（table）・直す道具（editor）
 * @returns 画面の要素
 */
function RosterBody({ table, editor }: BodyProps) {
  const [fullNames, setFullNames] = useState<Map<string, string>>(new Map());
  // 名簿を取り込んだ回数（取り込んだら名簿の一覧を開き直して、入った人を見せる）
  const [imports, setImports] = useState(0);
  const queryClient = useQueryClient();
  // QR の受付で入った人を名簿に入れる（担当の端末。開いたときに1度読む。match-004）
  useJoins(table, editor, false);

  /**
   * 名簿から消した人が受付で入った人なら、受付の行も消す（消さないと、次に読んだときにまた名簿に入る）。
   * 終わった試合に入っていて「来ない」にしただけのときは消さない。
   * @param playerId 名簿の人の ID
   */
  const removeJoin = (playerId: string) => {
    const stillListed = queryClient
      .getQueryData<MatchTable>(MATCH_QUERY_KEYS.table(table.id))
      ?.content.players.some((player) => player.id === playerId);
    if (stillListed) return;
    void forgetJoinedPlayer(queryClient, table.id, playerId).catch(() => undefined);
  };

  const counts = countRoster(table.content.players);
  const levels = MATCH_LEVELS.map(
    (level) => `${MATCH_LEVEL_LABELS[level]} ${counts.byLevel[level]}`,
  ).join("・");
  return (
    <Page title={table.name} lead={formatPlayDate(table.playDate)}>
      <ReceptionEventNote source={table.content.receptionEvent} link={table.receptionEvent} />
      <EditorState editor={editor} />
      <RosterSteps table={table} />
      <section aria-labelledby="match-roster" className="flex flex-col gap-xs">
        <h2 id="match-roster" tabIndex={-1} className="scroll-mt-s text-l font-bold outline-none">
          名簿
        </h2>
        <ImportActions
          table={table}
          editor={editor}
          onNames={(names, mode) => {
            setFullNames((before) => (mode === "append" ? new Map([...before, ...names]) : names));
            setImports((count) => count + 1);
          }}
        />
        <p className="flex flex-wrap gap-x-s text-m text-text-sub">
          <span>
            <b className="text-text">{counts.present}人</b>（{levels}）
          </span>
          {counts.late > 0 ? <span>遅れて来る {counts.late}人</span> : null}
          {counts.absent > 0 ? <span>来ない {counts.absent}人</span> : null}
          {counts.left > 0 ? <span>帰った {counts.left}人</span> : null}
          {counts.checks > 0 ? <span>確かめる所 {counts.checks}件</span> : null}
        </p>
        {table.content.players.length > 0 ? (
          // 人数が多いとスクロールが長くなるので、名簿の表は初めは閉じておく（持ち主が決めた）。
          // 取り込んだ直後は開く（入った人と確かめる所を見せる）
          <Disclosure
            key={imports}
            defaultOpen={imports > 0}
            variant="heading"
            summary={`名簿の一覧（${table.content.players.length}人）`}
          >
            <RosterTable
              table={table}
              editor={editor}
              fullNames={fullNames}
              onRemoved={removeJoin}
            />
          </Disclosure>
        ) : (
          <RosterTable table={table} editor={editor} fullNames={fullNames} onRemoved={removeJoin} />
        )}
        <p className="text-s text-text-sub">
          氏名はこの端末の画面にだけ出し、保存しません。保存するのは呼び名・レベル・当日の印だけです。「遅れて来る」「来ない」「帰った」の人は試合に入りません。当日は、試合表の画面の「人を選んで直す」を使うと、その人の組のこれからの試合だけを組み直します。
        </p>
      </section>
      <SettingsCard table={table} editor={editor} />
    </Page>
  );
}

/**
 * 名簿と設定の画面（道の部品）。
 * @returns 画面の要素
 */
export function RosterRoute() {
  const { tableId } = useParams({ from: MATCH_ROUTE_PATTERNS.roster });
  return (
    <TableFrame tableId={tableId}>
      {(table, editor) => <RosterBody table={table} editor={editor} />}
    </TableFrame>
  );
}
