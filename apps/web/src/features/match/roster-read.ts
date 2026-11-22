// フォームの回答（スプレッドシートから貼った表・CSV のファイル）から名簿を読む（PRD FR-M30・FR-M1・FR-M2）。画面の中だけで読み、
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
const NAME_HEADERS = [/^氏名/u, /^お名前/u, /^名前/u, /氏名/u, /名前/u];

/** レベルの列とみなす見出し。 */
const LEVEL_HEADERS = [/レベル/u, /level/iu];

/** タイムスタンプの列とみなす見出し。 */
const TIMESTAMP_HEADERS = [/^タイムスタンプ/u, /^timestamp/iu];

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

/** レベルの言葉（フォームの「1上級」〜「4入門」の数字を先に見る）。 */
const LEVEL_WORDS: readonly [string, MatchLevel][] = [
  ["上級", "advanced"],
  ["中級", "intermediate"],
  ["初級", "beginner"],
  ["入門", "novice"],
];

/**
 * レベルの欄を読む（先頭の数字 1〜4 か、上級・中級・初級・入門の言葉）。
 * @param raw 欄の値
 * @returns レベル（読めなければ null）
 */
export function readLevel(raw: string): MatchLevel | null {
  const text = raw.normalize("NFKC").trim();
  const digit = /^([1-4])/u.exec(text);
  if (digit) return MATCH_LEVELS[Number(digit[1]) - 1] ?? null;
  for (const [word, level] of LEVEL_WORDS) if (text.includes(word)) return level;
  return null;
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
 * タイムスタンプを比べられる形にする（Google フォームの「2026/11/01 10:00:00」など。数字だけを桁をそろえて並べる）。
 * @param raw 欄の値
 * @returns 比べる文字（読めなければ空）
 */
function timestampKey(raw: string): string {
  const parts = raw.normalize("NFKC").match(/\d+/gu);
  if (!parts) return "";
  return parts.map((part) => part.padStart(4, "0")).join("");
}

/**
 * 読んだ表から名簿を作る（同じ氏名はタイムスタンプの新しいほう。タイムスタンプがなければ下の行）。
 * 名前の列が見つからないときは、1列目を名前とみなす（見出しのない名前だけの貼り付けは、1行目を見出しとして読まないよう
 * 呼ぶ側が readPastedNames を使う）。
 * @param parsed 読んだ表（lib/csv-read.ts の parseCsv の答え）
 * @returns 名簿を読んだ結果
 */
export function readRoster(parsed: ParsedCsv): RosterReadResult {
  const { headers, rows } = parsed;
  const nameIndex = Math.max(0, findColumn(headers, NAME_HEADERS));
  const levelIndex = findColumn(headers, LEVEL_HEADERS);
  const timestampIndex = findColumn(headers, TIMESTAMP_HEADERS);
  const latest = new Map<string, { person: ReadPerson; order: number; stamp: string }>();
  let skipped = 0;
  let replaced = 0;
  rows.forEach((row, order) => {
    const fullName = (row.cells[nameIndex] ?? "").trim().replace(/\s+/gu, " ");
    if (!fullName) {
      if (row.cells.some((cell) => cell.trim() !== "")) skipped += 1;
      return;
    }
    const level = levelIndex >= 0 ? readLevel(row.cells[levelIndex] ?? "") : null;
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
  const people = [...latest.values()]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.person);
  return {
    people,
    columns: {
      name: headers[nameIndex] ?? null,
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
