// 当日の直しの枠（モックアップ M2 の「人を選んで直す」「分け方と試合の形」。PRD FR-M14・FR-M6・FR-M10。match-003・match-009）。
// - 人を選んで直す：人を選び、「来なかった・来た・帰る」を押すと、その人の組のこれからの試合だけを組み直す（day-of.ts）
// - 分け方と試合の形を変える（レベル別〈なし・4つ・3つ・2つ〉・分けない・ミニゲーム〈コート数〉・試合の形）：変えると何が変わるか（残す試合・移す試合・組から外す終わった試合・組み直す試合）を先に出し、
//   押すと終わった試合をできるだけ残して組み直す（regroup.ts）
// どちらも担当の端末だけが開く（呼ぶ側がボタンを出し分ける）。呼ぶ側は開いている間だけ描く（開くたびに今の値から始める）。
import {
  MATCH_FORMATS,
  MATCH_FORMAT_LABELS,
  MATCH_GROUPING_LABELS,
  MATCH_LEVEL_GROUPINGS,
  MATCH_LEVEL_LABELS,
  MINI_COURTS_MAX,
  MatchSettings as MatchSettingsSchema,
  PLAYER_STATUS_LABELS,
} from "@workspace/contracts/match";
import type {
  MatchFormat,
  MatchLevelGrouping,
  MatchSettings,
  MatchTable,
} from "@workspace/contracts/match";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { Input, inputClassName } from "@workspace/ui/components/input";
import { useState } from "react";
import type * as React from "react";
import { ATTENDANCE_ACTION_LABELS, actionsFor, groupOfPlayer } from "./day-of.ts";
import type { AttendanceAction } from "./day-of.ts";
import { miniSummary } from "./mini-game.ts";
import { groupsOf } from "./plan.ts";
import { changeSettings, describeSettingsChange } from "./regroup.ts";

/**
 * Field の中に置く選ぶ欄（名前と説明を欄に結ぶ）。
 * @param props 値（value）・変えたとき（onChange）・選択肢（children）
 * @param props.value 選んだ値
 * @param props.onChange 変えたとき
 * @param props.children 選択肢
 * @returns 欄の要素
 */
function FieldSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-l`}
      value={value}
      onChange={(change) => onChange(change.target.value)}
    >
      {children}
    </select>
  );
}

/** AttendanceDialog が受け取るもの。 */
type AttendanceDialogProps = {
  /** 開いているか */
  open: boolean;
  /** 開け閉め */
  onOpenChange: (open: boolean) => void;
  /** 試合表 */
  table: MatchTable;
  /** 直し方を押したとき（人の ID と直し方） */
  onApply: (playerId: string, action: AttendanceAction) => void;
};

/**
 * 人を選んで直す枠（来なかった・来た・帰る）。
 * @param props 開いているか（open）・開け閉め（onOpenChange）・試合表（table）・押したとき（onApply）
 * @returns 枠の要素
 */
export function AttendanceDialog({ open, onOpenChange, table, onApply }: AttendanceDialogProps) {
  const [selected, setSelected] = useState("");
  const { content } = table;
  const groups = groupsOf(content);
  const player = content.players.find((entry) => entry.id === selected);
  const group = player ? groupOfPlayer(content, player.id) : undefined;
  const noLevel = content.players.filter((entry) => entry.level === null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected("");
        onOpenChange(next);
      }}
      title="人を選んで直す"
      description="その人の組の、これからの試合だけを組み直します。チェックの付いた試合は変えません。今の試合も、入る人がみな出られるならそのまま残します。"
      footer={<Button onClick={() => onOpenChange(false)}>やめる</Button>}
    >
      <div className="flex flex-col gap-xs">
        <Field label="人">
          <FieldSelect value={selected} onChange={setSelected}>
            <option value="">選んでください</option>
            {groups.map((entry) => (
              <optgroup key={entry.key} label={entry.label}>
                {content.players
                  .filter((person) => person.level !== null && entry.levels.includes(person.level))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {`${person.nickname}（${PLAYER_STATUS_LABELS[person.status]}）`}
                    </option>
                  ))}
              </optgroup>
            ))}
            {noLevel.length > 0 ? (
              <optgroup label="レベルなし">
                {noLevel.map((person) => (
                  <option key={person.id} value={person.id}>
                    {`${person.nickname}（${PLAYER_STATUS_LABELS[person.status]}）`}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </FieldSelect>
        </Field>
        {player ? (
          <div className="flex flex-col gap-xxs">
            <p className="text-m">
              {`${player.nickname}：今は「${PLAYER_STATUS_LABELS[player.status]}」・${
                player.level ? MATCH_LEVEL_LABELS[player.level] : "レベルなし"
              }${group ? `（${group.label}の組）` : ""}`}
            </p>
            <div className="flex flex-wrap gap-xxs">
              {actionsFor(player.status).map((action) => (
                <Button
                  key={action}
                  variant={action === actionsFor(player.status)[0] ? "primary" : undefined}
                  onClick={() => {
                    onApply(player.id, action);
                    setSelected("");
                  }}
                >
                  {ATTENDANCE_ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/** RegroupDialog が受け取るもの。 */
type RegroupDialogProps = {
  /** 開いているか */
  open: boolean;
  /** 開け閉め */
  onOpenChange: (open: boolean) => void;
  /** 試合表 */
  table: MatchTable;
  /** 変えるを押したとき（新しい設定） */
  onApply: (next: MatchSettings) => void;
};

/** レベル別の選び（なしと4つ・3つ・2つ）。 */
type LevelChoice = MatchLevelGrouping | "off";

/**
 * 分け方と試合の形を当日に変える枠（何が変わるかを先に出す。match-009 research R5）。
 * @param props 開いているか（open）・開け閉め（onOpenChange）・試合表（table）・押したとき（onApply）
 * @returns 枠の要素
 */
export function RegroupDialog({ open, onOpenChange, table, onApply }: RegroupDialogProps) {
  const { settings } = table.content;
  const [format, setFormat] = useState<MatchFormat>(settings.format);
  const [levels, setLevels] = useState<LevelChoice>(settings.levels ?? "off");
  const [ungrouped, setUngrouped] = useState(settings.ungrouped);
  const [mini, setMini] = useState(settings.courts !== null);
  const [courts, setCourts] = useState(String(settings.courts ?? 2));
  const parsed = MatchSettingsSchema.safeParse({
    ...settings,
    format,
    levels: levels === "off" ? null : levels,
    ungrouped,
    courts: mini ? Number(courts) : null,
  });
  const next = parsed.success ? parsed.data : undefined;
  const issue = parsed.success ? undefined : parsed.error.issues[0]?.message;
  const report = next ? changeSettings(table.content, next).report : undefined;
  const lines = report ? describeSettingsChange(report, true) : [];
  // 組み合わせが変わる・コート数が変わる（チームを組めていないミニゲームを外すときも）・まだのチーム分けを作るときに押せる
  // まだチームのないミニゲームを足すとき、来る人がチームの数より少なければ分けられない
  const miniShort =
    next !== undefined &&
    mini &&
    !table.content.mini &&
    miniSummary({ ...table.content, settings: next })?.short === true;
  const changed =
    report !== undefined &&
    next !== undefined &&
    (report.regrouped ||
      next.courts !== settings.courts ||
      (mini && !table.content.mini && !miniShort));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="分け方と試合の形"
      description="当日に変えても、終わった試合はできるだけ残し、まだの試合だけを組み直します。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>やめる</Button>
          <Button
            variant="primary"
            disabled={!next || !changed}
            onClick={() => {
              if (next) onApply(next);
            }}
          >
            変えて組み直す
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xs">
        <ChoiceChips
          label="試合の形"
          options={MATCH_FORMATS.map((value) => ({ value, label: MATCH_FORMAT_LABELS[value] }))}
          value={format}
          onValueChange={setFormat}
        />
        <ChoiceChips
          label="レベル別"
          options={[
            { value: "off" as const, label: "しない" },
            ...MATCH_LEVEL_GROUPINGS.map((value) => ({
              value,
              label: MATCH_GROUPING_LABELS[value],
            })),
          ]}
          value={levels}
          onValueChange={setLevels}
        />
        <label className="flex min-h-l items-center gap-xxs text-m">
          <input
            type="checkbox"
            checked={ungrouped}
            onChange={(change) => setUngrouped(change.target.checked)}
            className="size-s accent-primary"
          />
          分けない（全員で1つ）もする
        </label>
        <label className="flex min-h-l items-center gap-xxs text-m">
          <input
            type="checkbox"
            checked={mini}
            onChange={(change) => setMini(change.target.checked)}
            className="size-s accent-primary"
          />
          ミニゲームもする
        </label>
        {mini ? (
          <Field label="コート数">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MINI_COURTS_MAX}
              value={courts}
              onChange={(change) => setCourts(change.target.value)}
            />
          </Field>
        ) : null}
        {issue ? <p className="text-s text-danger-text">{issue}</p> : null}
        {miniShort ? (
          <p className="text-s text-danger-text">
            来る人がチームの数（コート数×2）より少ないため、ミニゲームのチームは分けられません。
          </p>
        ) : null}
        <section
          aria-label="変わること"
          className="flex flex-col gap-x3s rounded-md bg-surface-sunken p-xs"
        >
          <h3 className="text-m font-bold">変わること</h3>
          {lines.length === 0 ? (
            <p className="text-m text-text-sub">
              {mini && !table.content.mini && !miniShort
                ? "ミニゲームのチームを分けます。"
                : "今と同じです。"}
            </p>
          ) : (
            <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
