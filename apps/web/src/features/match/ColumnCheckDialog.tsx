// 名簿の取り込みの「列の確かめ」の枠（match-008）。貼り付け・CSV を読んだあと、名簿に入れる前に毎回出す。
// - 氏名・レベル・回答の日時の列を、見出しから自動で選んで見せ、選び直せる（レベルと日時は「読まない」も選べる）
// - 氏名の列が見つからなければ、知らせを出し、選ぶまで入れられない（1列目は使わない）
// - レベルの選択肢ごとに入れるレベルを見せ、選び直せる。読めない選択肢は選ぶ（「なし」も選べる）まで入れられない
// - 入れる前に、先頭の数人の氏名とレベル、人数、同じ氏名の古い回答の数を見せる
// 読むのは選んだ3つの列だけ（Constitution II）。氏名はこの画面の中だけで、サーバーには送らない。
import { MATCH_LEVELS, MATCH_LEVEL_LABELS } from "@workspace/contracts/match";
import type { MatchLevel } from "@workspace/contracts/match";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field, useFieldControl } from "@workspace/ui/components/field";
import { inputClassName } from "@workspace/ui/components/input";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type { ParsedCsv } from "../../lib/csv-read.ts";
import { detectColumns, levelChoices, readRoster } from "./roster-read.ts";
import type { ColumnSelection, LevelMap, RosterReadResult } from "./roster-read.ts";

/** 先に見せる人数。 */
const PREVIEW_COUNT = 3;

/** レベルの対応の欄の値（"" は未選択、"none" は「なし」〈名簿で選ぶ〉）。 */
type LevelPick = MatchLevel | "none" | "";

/** 列の確かめの枠が受け取るもの。 */
export type ColumnCheckDialogProps = {
  /** 読んだ表（なければ閉じている） */
  parsed: ParsedCsv | undefined;
  /** 読んだもの（ファイルの名前か「貼り付けた表」） */
  sourceLabel: string;
  /** 閉じるとき */
  onClose: () => void;
  /** 取り込むとき（入れられたら null。入れられなければ理由の文。枠の中に出し、枠は閉じない） */
  onImport: (result: RosterReadResult) => string | null;
};

/**
 * 列の確かめの枠。読んだ表が変わるたびに選びを作り直すため、呼ぶ側は表ごとに違う key を渡す。
 * @param props 読んだ表（parsed）・読んだもの（sourceLabel）・閉じるとき（onClose）・取り込むとき（onImport）
 * @returns 枠の要素
 */
export function ColumnCheckDialog({
  parsed,
  sourceLabel,
  onClose,
  onImport,
}: ColumnCheckDialogProps) {
  return (
    <Dialog
      open={parsed !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="どの列を読むか確かめてください"
      description={
        parsed
          ? `${sourceLabel}・${parsed.rows.length}行。見出しから自動で選びました。違っていたら選び直してください。ほかの列（メールアドレス・ラケット・要望など）は読みません。`
          : undefined
      }
    >
      {parsed ? <ColumnCheckBody parsed={parsed} onClose={onClose} onImport={onImport} /> : null}
    </Dialog>
  );
}

/**
 * 選択肢ごとの、はじめのレベルの対応。
 * @param parsed 読んだ表
 * @param levelIndex レベルの列
 * @returns 選択肢 → 欄の値
 */
function initialPicks(parsed: ParsedCsv, levelIndex: number): Record<string, LevelPick> {
  const picks: Record<string, LevelPick> = {};
  for (const choice of levelChoices(parsed, levelIndex).choices)
    picks[choice.value] = choice.level ?? "";
  return picks;
}

/**
 * 枠の中身（選び・レベルの対応・先に見せる人・取り込むボタン）。
 * @param props 読んだ表（parsed）・閉じるとき（onClose）・取り込むとき（onImport）
 * @param props.parsed 読んだ表
 * @param props.onClose 閉じるとき
 * @param props.onImport 取り込むとき
 * @returns 要素
 */
function ColumnCheckBody({
  parsed,
  onClose,
  onImport,
}: {
  parsed: ParsedCsv;
  onClose: () => void;
  onImport: (result: RosterReadResult) => string | null;
}) {
  const [failure, setFailure] = useState<string>();
  const [detected] = useState(() => detectColumns(parsed));
  const [selection, setSelection] = useState<ColumnSelection>(detected);
  const [picks, setPicks] = useState<Record<string, LevelPick>>(() =>
    initialPicks(parsed, detected.level),
  );

  const { choices, overflow } = levelChoices(parsed, selection.level);
  const unresolved = choices.filter((choice) => (picks[choice.value] ?? "") === "");
  const levelMap: LevelMap = new Map(
    choices.map((choice) => {
      const pick = picks[choice.value] ?? "";
      return [choice.value, pick === "" || pick === "none" ? null : pick];
    }),
  );
  const result = readRoster(parsed, selection, levelMap);
  const nameMissing = selection.name < 0;
  const ready = !nameMissing && unresolved.length === 0 && result.people.length > 0;
  const options = parsed.headers.map((header, index) => ({ value: String(index), label: header }));

  /**
   * レベルの列を選び直す（選択肢の対応を作り直す）。
   * @param index 列の番号（読まないなら -1）
   */
  const changeLevel = (index: number) => {
    setSelection((current) => ({ ...current, level: index }));
    setPicks(initialPicks(parsed, index));
  };

  return (
    <div className="flex flex-col gap-s">
      {nameMissing ? (
        <ResponseMessage tone="danger">
          氏名の列が見つかりませんでした。フォームの質問の名前が変わったのかもしれません。氏名の列を選んでください。
        </ResponseMessage>
      ) : null}
      <div className="flex flex-col gap-xs">
        <Field
          label="氏名の列"
          required
          description={
            nameMissing
              ? "選ぶと、下に先頭の数人を出します。日時やメールアドレスの列を選ぶと、ここで気づけます。"
              : selection.name === detected.name
                ? `見出し「${parsed.headers[detected.name] ?? ""}」から自動で選びました`
                : undefined
          }
          error={nameMissing ? "氏名の列を選んでください。" : undefined}
        >
          <ColumnSelect
            value={selection.name}
            options={options}
            emptyLabel="選んでください"
            onChange={(index) => setSelection((current) => ({ ...current, name: index }))}
          />
        </Field>
        <Field
          label="レベルの列"
          description={
            selection.level >= 0 && selection.level === detected.level
              ? `「${parsed.headers[detected.level] ?? ""}」を自動で選びました`
              : "読まないときは、名簿でレベルを選びます"
          }
        >
          <ColumnSelect
            value={selection.level}
            options={options}
            emptyLabel="読まない（名簿で選ぶ）"
            onChange={changeLevel}
          />
        </Field>
        <Field
          label="回答の日時の列"
          description="同じ人が2回答えたときに、新しいほうを使うために読みます"
        >
          <ColumnSelect
            value={selection.timestamp}
            options={options}
            emptyLabel="読まない（下の行を新しいとみなす）"
            onChange={(index) => setSelection((current) => ({ ...current, timestamp: index }))}
          />
        </Field>
      </div>

      {choices.length > 0 ? (
        <section className="flex flex-col gap-xxs" aria-labelledby="level-map-title">
          <h3 id="level-map-title" className="text-m font-bold">
            レベルの読み方
          </h3>
          <p className={`text-s ${unresolved.length > 0 ? "text-danger-text" : "text-text-sub"}`}>
            {unresolved.length > 0
              ? `読めない選択肢が${unresolved.length}つあります。どのレベルとして入れるか選んでください（「なし」なら名簿で選びます）。`
              : "選択肢ごとに、どのレベルとして入れるかです。言葉（上級・中級…）を数字より先に読みます。"}
          </p>
          <div className="grid grid-cols-2 items-center gap-x-xs gap-y-xxs">
            {choices.map((choice) => (
              <LevelPickRow
                key={choice.value}
                value={choice.value}
                pick={picks[choice.value] ?? ""}
                onChange={(pick) => setPicks((current) => ({ ...current, [choice.value]: pick }))}
              />
            ))}
          </div>
          {overflow > 0 ? (
            <p className="text-s text-text-sub">
              ほかに{overflow}
              個の値があります（自由記述の列かもしれません）。それらは言葉と数字で読み、読めないものはレベルなしで入れます。
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-xxs" aria-labelledby="preview-title">
        <h3 id="preview-title" className="text-m font-bold">
          {nameMissing ? "取り込む内容" : `取り込む内容（${result.people.length}人）`}
        </h3>
        {nameMissing ? (
          <p className="text-s text-text-sub">氏名の列を選ぶと、ここに出ます。</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {result.people.slice(0, PREVIEW_COUNT).map((person) => (
                <li
                  key={person.fullName}
                  className="grid grid-cols-2 gap-xs border-b border-border py-xxs text-m"
                >
                  <span>{person.fullName}</span>
                  <span>{person.level ? MATCH_LEVEL_LABELS[person.level] : "レベルなし"}</span>
                </li>
              ))}
            </ul>
            {result.people.length > PREVIEW_COUNT ? (
              <p className="text-s text-text-sub">ほか{result.people.length - PREVIEW_COUNT}人</p>
            ) : null}
            {result.replaced > 0 ? (
              <p className="text-s text-text-sub">
                同じ氏名の古い回答 {result.replaced}件は入れません。
              </p>
            ) : null}
          </>
        )}
      </section>

      {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      <div className="flex flex-wrap justify-end gap-xxs">
        <Button onClick={onClose}>やめる</Button>
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => {
            const error = onImport(result);
            if (error === null) onClose();
            else setFailure(error);
          }}
        >
          {nameMissing
            ? "取り込む（氏名の列を選んでください）"
            : unresolved.length > 0
              ? "取り込む（レベルを選んでください）"
              : `この列で${result.people.length}人を取り込む`}
        </Button>
      </div>
    </div>
  );
}

/**
 * 列を選ぶ欄（Field の中で使う）。
 * @param props 選んだ列（value）・列の一覧（options）・選ばないときの名前（emptyLabel）・選んだとき（onChange）
 * @param props.value 選んだ列（なければ -1）
 * @param props.options 列の一覧
 * @param props.emptyLabel 選ばないときの名前
 * @param props.onChange 選んだとき
 * @returns 欄の要素
 */
function ColumnSelect({
  value,
  options,
  emptyLabel,
  onChange,
}: {
  value: number;
  options: { value: string; label: string }[];
  emptyLabel: string;
  onChange: (index: number) => void;
}) {
  const control = useFieldControl();
  return (
    <select
      {...control}
      className={`${inputClassName} min-h-xl`}
      value={String(value)}
      onChange={(change) => onChange(Number(change.target.value))}
    >
      <option value="-1">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * レベルの対応の1行（フォームの選択肢と、入れるレベル）。
 * @param props 選択肢（value）・入れるレベル（pick）・選んだとき（onChange）
 * @param props.value フォームの選択肢
 * @param props.pick 入れるレベル（"" は未選択）
 * @param props.onChange 選んだとき
 * @returns 要素
 */
function LevelPickRow({
  value,
  pick,
  onChange,
}: {
  value: string;
  pick: LevelPick;
  onChange: (pick: LevelPick) => void;
}) {
  return (
    <>
      <span className="text-m">{value}</span>
      <select
        aria-label={`${value} のレベル`}
        aria-invalid={pick === "" ? true : undefined}
        className={`${inputClassName} min-h-xl`}
        value={pick}
        onChange={(change) => onChange(change.target.value as LevelPick)}
      >
        {pick === "" ? <option value="">選んでください</option> : null}
        {MATCH_LEVELS.map((level) => (
          <option key={level} value={level}>
            {MATCH_LEVEL_LABELS[level]}
          </option>
        ))}
        <option value="none">なし（名簿で選ぶ）</option>
      </select>
    </>
  );
}
