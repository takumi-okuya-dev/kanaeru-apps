// フォームの回答（スプレッドシートから貼った表・CSV のファイル）から名簿を読む（PRD FR-M30・FR-M1・FR-M2・match-008）。画面の中だけで読み、
// サーバーには送らない。読むのは氏名・レベル・タイムスタンプだけで、メールアドレス・ラケット・きっかけ・要望などほかの列は読まない
// （Constitution II）。切り方（文字コード・区切り・引用符・見出し）は共通の lib/csv-read.ts、列の意味はここ（AD-29）。
import type { MatchLevel } from "@workspace/contracts/match";
import { MATCH_LEVELS, NICKNAME_MAX } from "@workspace/contracts/match";
import type { ParsedCsv } from "../../lib/csv-read.ts";

/** 読んだ1人（氏名は画面の中だけ。送るのは呼び名とレベル）。 */
export type ReadPerson = {
  /** 氏名（前後の空白を消したもの） */
  fullName: string;
  /** レベル（列がない・読めないときは null。名簿で入れる） */
  level: MatchLevel | null;
  /** 受付の交流会から入れた人の account（LINE でチェックイン・申込みした人だけ。前に入れたレベルを覚えるため。match-006） */
  accountId?: string;
};

/** 名簿を読んだ結果。 */
export type RosterReadResult = {
  /** 読んだ人（同じ氏名はタイムスタンプの新しいほう1人。並びは表の順） */
  people: ReadPerson[];
  /** 使った列（見出し。なければ null） */
  columns: { name: string | null; level: string | null; timestamp: string | null };
  /** 同じ氏名で、古いほうとして入れなかった行の数 */
  replaced: number;
  /** 氏名が空で入れなかった行の数 */
  skipped: number;
};

/** 名前の列とみなす見出し（上ほど先に選ぶ）。 */
const NAME_HEADERS = [/^氏名/u, /^お名前/u, /^名前/u, /^フルネーム/u, /^name$/iu, /氏名/u, /名前/u, /フルネーム/u, /full\s*name/iu];

/** レベルの列とみなす見出し。 */
const LEVEL_HEADERS = [/レベル/u, /level/iu];

/** タイムスタンプの列とみなす見出し。 */
const TIMESTAMP_HEADERS = [/^タイムスタンプ/u, /^timestamp/iu];

/** レベルの選択肢の対応を見せる数の上限（多い列は自由記述とみなし、残りは「なし」で入れる）。 */
export const LEVEL_CHOICES_MAX = 20;

/** 選択肢の言葉でレベルの列とみなす、読める行の割合。 */
const LEVEL_GUESS_RATIO = 0.8;

/**
 * 見出しから、決まりに合ういちばん先の列を選ぶ。
 * @param headers 見出し
 * @param patterns 見出しの決まり（上ほど先）
 * @returns 列の番号（なければ -1）
 */
function findColumn(headers: readonly string[], patterns: readonly RegExp[]): number {
  for (const pattern of patterns) {
    const index = headers.findIndex((header) => pattern.test(header));
    if (index >= 0) return index;
  }
  return -1;
}

/** レベルの言葉（言葉を数字より先に読む。選択肢の番号の振り方が変わっても、言葉どおりに読むため）。 */
const LEVEL_WORDS: readonly [string, MatchLevel][] = [
  ["上級", "advanced"],
  ["中級", "intermediate"],
  ["初級", "beginner"],
  ["入門", "novice"],
];

/**
 * 欄の値から、レベルの言葉だけで読む（数字は見ない）。
 * @param raw 欄の値
 * @returns レベル（言葉がなければ null）
 */
function readLevelWord(raw: string): MatchLevel | null {
  const text = raw.normalize("NFKC");
  for (const [word, level] of LEVEL_WORDS) if (text.includes(word)) return level;
  return null;
}

/**
 * レベルの欄を読む（上級・中級・初級・入門の言葉を先に、なければ先頭の数字 1〜4）。
 * @param raw 欄の値
 * @returns レベル（読めなければ null）
 */
export function readLevel(raw: string): MatchLevel | null {
  const word = readLevelWord(raw);
  if (word) return word;
  const digit = /^([1-4])/u.exec(raw.normalize("NFKC").trim());
  return digit ? (MATCH_LEVELS[Number(digit[1]) - 1] ?? null) : null;
}

/**
 * 同じ人とみなすための氏名のそろえ方（NFKC・空白を消す）。
 * @param name 氏名
 * @returns そろえた氏名
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}

/**
 * タイムスタンプを比べられる形にする。年・月・日・時・分・秒を桁をそろえて並べる。
 * 「午前・午後」「AM・PM」の付いた形（フォームの回答の画面から落とした CSV）は 24 時間に直す（午前12時は0時）。
 * @param raw 欄の値
 * @returns 比べる文字（読めなければ空）
 */
export function timestampKey(raw: string): string {
  const text = raw.normalize("NFKC");
  const parts = text.match(/\d+/gu);
  if (!parts) return "";
  const numbers = parts.map(Number);
  const pm = /午後|pm|p\.m\./iu.test(text);
  const am = /午前|am|a\.m\./iu.test(text);
  // 時は4つめの数（年・月・日・時）。12時間の形のときだけ直す
  if ((pm || am) && numbers.length >= 4) {
    const hour = numbers[3] ?? 0;
    numbers[3] = pm ? (hour % 12) + 12 : hour % 12;
  }
  // 「GMT+9」などの時差の数は、日時の6つのあとに来るので比べない
  return numbers
    .slice(0, 6)
    .map((value) => String(value).padStart(4, "0"))
    .join("");
}

/** 選んだ列（列の番号。読まないなら -1）。 */
export type ColumnSelection = {
  /** 氏名の列（見つからなければ -1。選ぶまで入れられない） */
  name: number;
  /** レベルの列（読まないなら -1） */
  level: number;
  /** 回答の日時の列（読まないなら -1。下の行を新しいとみなす） */
  timestamp: number;
};

/**
 * 列が、選択肢の言葉（上級・中級…）でほとんど読めるか（見出しに「レベル」がないときに、レベルの列を推しはかる）。
 * @param parsed 読んだ表
 * @param index 列の番号
 * @returns ほとんどの行で言葉が読めれば true
 */
function looksLikeLevelColumn(parsed: ParsedCsv, index: number): boolean {
  const values = parsed.rows.map((row) => (row.cells[index] ?? "").trim()).filter((value) => value !== "");
  if (values.length === 0) return false;
  const readable = values.filter((value) => readLevelWord(value) !== null).length;
  return readable / values.length >= LEVEL_GUESS_RATIO;
}

/**
 * 見出しから、氏名・レベル・日時の列を選ぶ（列の確かめの枠の、はじめの選び）。
 * 氏名の列が見つからないときは -1（1列目は使わない。日時やメールが名前として入らないように）。列が1つだけの表は、その列を氏名とみなす。
 * レベルは見出しで選び、なければ選択肢の言葉で推しはかる。
 * @param parsed 読んだ表
 * @returns 選んだ列
 */
export function detectColumns(parsed: ParsedCsv): ColumnSelection {
  const { headers } = parsed;
  let name = findColumn(headers, NAME_HEADERS);
  if (name < 0 && headers.length === 1) name = 0;
  let level = findColumn(headers, LEVEL_HEADERS);
  if (level < 0) {
    level = headers.findIndex((_, index) => index !== name && looksLikeLevelColumn(parsed, index));
  }
  const timestamp = findColumn(headers, TIMESTAMP_HEADERS);
  return { name, level, timestamp };
}

/** レベルの選択肢の1つ。 */
export type LevelChoice = {
  /** フォームの選択肢（欄の値。前後の空白を消したもの） */
  value: string;
  /** はじめに入れるレベル（読めなければ undefined。選ぶまで入れられない） */
  level: MatchLevel | undefined;
};

/**
 * レベルの列の選択肢（重ねない値。表の順）と、はじめに入れるレベル。多いときは先頭の LEVEL_CHOICES_MAX 件だけ。
 * @param parsed 読んだ表
 * @param levelIndex レベルの列（読まないなら -1）
 * @returns 選択肢と、ほかにあった選択肢の数
 */
export function levelChoices(
  parsed: ParsedCsv,
  levelIndex: number,
): { choices: LevelChoice[]; overflow: number } {
  if (levelIndex < 0) return { choices: [], overflow: 0 };
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of parsed.rows) {
    const value = (row.cells[levelIndex] ?? "").trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  const choices = values.slice(0, LEVEL_CHOICES_MAX).map((value) => ({
    value,
    level: readLevel(value) ?? undefined,
  }));
  return { choices, overflow: Math.max(0, values.length - LEVEL_CHOICES_MAX) };
}

/** レベルの対応（選択肢 → 入れるレベル。null は「なし」〈名簿で選ぶ〉）。 */
export type LevelMap = ReadonlyMap<string, MatchLevel | null>;

/**
 * 読んだ表から名簿を作る（同じ氏名はタイムスタンプの新しいほう。タイムスタンプがなければ下の行）。
 * 列を選ばなければ detectColumns の答えで読み、レベルは readLevel で読む。氏名の列がなければ人は空。
 * 読むのは選んだ3つの列だけで、ほかの列の値は持たない（Constitution II）。
 * @param parsed 読んだ表（lib/csv-read.ts の parseCsv の答え）
 * @param selection 選んだ列（なければ見出しから選ぶ）
 * @param levelMap レベルの対応（なければ readLevel で読む。対応にない選択肢は「なし」）
 * @returns 名簿を読んだ結果
 */
export function readRoster(
  parsed: ParsedCsv,
  selection: ColumnSelection = detectColumns(parsed),
  levelMap?: LevelMap,
): RosterReadResult {
  const { headers, rows } = parsed;
  const { name: nameIndex, level: levelIndex, timestamp: timestampIndex } = selection;
  const latest = new Map<string, { person: ReadPerson; order: number; stamp: string }>();
  let skipped = 0;
  let replaced = 0;
  const levelOf = (raw: string): MatchLevel | null => {
    const value = raw.trim();
    if (!levelMap) return readLevel(value);
    return levelMap.get(value) ?? null;
  };
  if (nameIndex >= 0) {
    rows.forEach((row, order) => {
      const fullName = (row.cells[nameIndex] ?? "").trim().replace(/\s+/gu, " ");
      if (!fullName) {
        if (row.cells.some((cell) => cell.trim() !== "")) skipped += 1;
        return;
      }
      const level = levelIndex >= 0 ? levelOf(row.cells[levelIndex] ?? "") : null;
      const stamp = timestampIndex >= 0 ? timestampKey(row.cells[timestampIndex] ?? "") : "";
      const key = nameKey(fullName);
      const before = latest.get(key);
      if (before) {
        replaced += 1;
        // 新しいほうを残す（同じか読めなければ下の行）。表の中の並びは、初めて出た行の位置のまま
        if (stamp >= before.stamp)
          latest.set(key, { person: { fullName, level }, order: before.order, stamp });
        return;
      }
      latest.set(key, { person: { fullName, level }, order, stamp });
    });
  }
  const people = [...latest.values()]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.person);
  return {
    people,
    columns: {
      name: nameIndex >= 0 ? (headers[nameIndex] ?? null) : null,
      level: levelIndex >= 0 ? (headers[levelIndex] ?? null) : null,
      timestamp: timestampIndex >= 0 ? (headers[timestampIndex] ?? null) : null,
    },
    replaced,
    skipped,
  };
}

/** 姓と名の間に空白がない氏名から作る、仮の呼び名の字数（多くの姓は2字。氏名をまるごとサーバーに送らないため）。 */
export const NO_SPACE_NICKNAME_LENGTH = 2;

/** 呼び名を作った1人。 */
export type NamedPerson = ReadPerson & {
  /** 呼び名 */
  nickname: string;
  /** 姓と名の間に空白がなく、確かめてほしい印 */
  nameCheck: boolean;
};

/**
 * 氏名を姓と名に分ける（半角・全角の空白で分ける。空白がなければ姓だけ）。
 * @param fullName 氏名
 * @returns 姓と名（名は空のことがある）
 */
function splitName(fullName: string): { family: string; given: string } {
  const [family = "", ...rest] = fullName.normalize("NFKC").trim().split(/\s+/u);
  return { family, given: rest.join("") };
}

/**
 * 呼び名を作る（FR-M2）。姓を呼び名にし、同じ姓が2人以上なら名の1字を足す（それでも同じなら、同じでなくなるまで名の字を足す）。
 * 姓と名の間に空白がない人は、氏名の頭の2字を仮の呼び名にして印を付ける（運営に確かめてもらう。氏名をまるごと送らない。
 * Constitution II）。
 * 名まで同じ人は、後の人に「2」「3」を足す。呼び名は20文字まで。
 * すでに名簿にいる人の呼び名とも重ならないようにする（後から貼った人に足す）。
 * @param people 読んだ人
 * @param taken すでに名簿にある呼び名
 * @returns 呼び名を作った人（並びはそのまま）
 */
export function assignNicknames(
  people: readonly ReadPerson[],
  taken: readonly string[] = [],
): NamedPerson[] {
  const parts = people.map((person) => splitName(person.fullName));
  const familyCount = new Map<string, number>();
  for (const { family, given } of parts) {
    if (given) familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
  }
  for (const name of taken) familyCount.set(name, (familyCount.get(name) ?? 0) + 1);
  const used = new Set(taken.map((name) => name.normalize("NFKC")));
  return people.map((person, index) => {
    const { family, given } = parts[index] as { family: string; given: string };
    let base: string;
    if (!given) {
      // 姓と名の間に空白がない氏名は、氏名をそのまま送らないよう、頭の2字を仮の呼び名にする（運営に確かめてもらう。research R8）
      base = [...family].slice(0, NO_SPACE_NICKNAME_LENGTH).join("");
    } else if ((familyCount.get(family) ?? 0) < 2) {
      base = family;
    } else {
      // 同じ姓の人と見分けられるまで、名の字を1つずつ足す
      const others = parts
        .filter((other, otherIndex) => otherIndex !== index && other.family === family)
        .map((other) => other.given);
      let length = 1;
      while (
        length < given.length &&
        others.some((other) => other.startsWith(given.slice(0, length)))
      ) {
        length += 1;
      }
      base = family + given.slice(0, length);
    }
    base = [...base].slice(0, NICKNAME_MAX).join("");
    let nickname = base;
    for (let n = 2; used.has(nickname); n += 1) {
      const suffix = String(n);
      nickname = [...base].slice(0, NICKNAME_MAX - suffix.length).join("") + suffix;
    }
    used.add(nickname);
    return { ...person, nickname, nameCheck: !given };
  });
}
