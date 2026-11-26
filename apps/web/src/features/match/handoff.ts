// 電波なしで渡す QR の中身（FR-M24・AD-28〈電波なしで渡す QR〉・AD-30〈受付の QR〉。match-005）。状態を持たない関数だけ。
//
// ■ 試合表の QR（M4：担当の端末 → 見るだけのページ）
// - 入れるのは、版の番号・見るだけの札の印（SHA-256 の頭8文字。どの試合表かを見分ける。札は分からない）・試合表の名前と日付・
//   中身の時刻・組ごとの呼び名の組み合わせと終わったか・ミニゲームのチームの呼び名、だけ（レベル・氏名・名簿の人の ID は入れない。
//   AD-28）。match-009 から、中身の形の印は 3（そのまま）・4（縮めた）で、1試合の長さを外しチームを足した。前の形（印 1・2。
//   1試合の長さあり・チームなし）も読む
// - 呼び名は1度だけ並べて番号で指し、数は可変長の整数（varint）、終わったかはビットで持つ。縮むときは deflate（raw）で縮める
//   （CompressionStream があるブラウザだけ。縮まなければそのまま）
// - 文字は Base45（RFC 9285）にする。QR の英数字の形（1文字 5.5 ビット）にそのまま入り、バイトの形より小さく、読み取りの道具が
//   文字として返しても崩れない
// - 1枚に入らなければ、つづきの QR（最大 16 枚）に分ける。どの1枚にも「KM1.<何枚目><全部の枚数>.<束の印>.」の頭を付け、
//   読む側は全部そろったら組み立てる。16 枚でも入らなければ渡せない（大きく映す画面か紙で見てもらう）
//
// ■ 受付の QR（P3：参加者 → 運営の M7）
// - 「KJ1.」＋Base45（受付の札の印・レベル・参加者の端末が作る乱数・呼び名）。乱数から名簿の人の ID を決めるので、同じ QR を
//   2回読んでも1人しか入らない
import {
  MATCH_GROUPS,
  MATCH_GROUP_KEYS,
  MATCH_LEVELS,
  MINI_COURTS_MAX,
  matchGroupsOf,
  MatchJoinInput,
  NICKNAME_MAX,
  TABLE_NAME_MAX,
} from "@workspace/contracts/match";
import type { MatchGroupKey, MatchLevel, MatchTable, MatchView } from "@workspace/contracts/match";

/** Base45 の文字（RFC 9285）。 */
const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** 試合表の QR の頭。 */
const TABLE_PREFIX = "KM1.";
/** 受付の QR の頭。 */
const JOIN_PREFIX = "KJ1.";

/** 1枚の QR に入れる Base45 の文字の数（英数字の形・誤り訂正 L で 18 型〈91 マス〉。画面からスマホで読める大きさ）。 */
export const HANDOFF_CHUNK_CHARS = 1000;
/** つづきの QR の枚数の上限。 */
export const HANDOFF_MAX_PARTS = 16;

/** 渡す試合表の時刻の単位（ミリ秒。QR を小さくするため、時刻は分に丸めて入れる）。 */
export const HANDOFF_TIME_UNIT_MS = 60_000;

/** 戻したあとの大きさの上限（バイト。読む端末を重くする QR を止める）。 */
const MAX_INFLATED_BYTES = 256 * 1024;

/** 前の形の中身の印（先頭の1バイト。1試合の長さあり・チームなし。match-008 まで）：そのまま。 */
const FORMAT_RAW_V1 = 1;
/** 前の形の中身の印：deflate（raw）で縮めた。 */
const FORMAT_DEFLATE_V1 = 2;
/** 中身の形の印（1試合の長さなし・チームあり。match-009）：そのまま。 */
const FORMAT_RAW = 3;
/** 中身の形の印：deflate（raw）で縮めた。 */
const FORMAT_DEFLATE = 4;

/** 渡す試合表（見るだけのページに入れる形）。 */
export type HandoffTable = {
  /** 版の番号 */
  version: number;
  /** 見るだけの札の SHA-256 の頭8文字（16進。札がなければ null） */
  hint: string | null;
  /** 試合表の名前 */
  name: string;
  /** 試合の日（YYYY-MM-DD） */
  playDate: string;
  /** 中身の時刻（ミリ秒。分の単位に丸める〈HANDOFF_TIME_UNIT_MS〉。サーバーの時刻と比べるときは丸めた幅を見込む。view-import.ts） */
  updatedAt: number;
  /** 組ごとの試合（分け方の順） */
  groups: { key: MatchGroupKey; games: { players: string[]; done: boolean }[] }[];
  /** ミニゲームのチームごとの呼び名（組んでいなければ持たない。match-009） */
  teams?: string[][];
};

/** 受付の QR の中身。 */
export type HandoffJoin = {
  /** 受付の札の SHA-256 の頭8文字（16進） */
  hint: string;
  /** 呼び名 */
  nickname: string;
  /** レベル */
  level: MatchLevel;
  /** 参加者の端末が作る乱数（16進の15文字。名簿の人の ID に使う） */
  nonce: string;
};

/** 試合表が大きすぎて、QR の枚数の上限に入らない。 */
export class HandoffTooLargeError extends Error {
  /** 要る枚数 */
  readonly parts: number;

  /**
   * 要る枚数から作る。
   * @param parts 要る枚数
   */
  constructor(parts: number) {
    super(
      `試合表が大きく、QR ${HANDOFF_MAX_PARTS}枚に入りません（${parts}枚要ります）。大きく映す画面か、印刷した紙で見てもらってください。`,
    );
    this.name = "HandoffTooLargeError";
    this.parts = parts;
  }
}

/** QR の中身が読めない（形が違う・壊れている・この端末で開けない）。 */
export class HandoffFormatError extends Error {
  /**
   * 理由から作る。
   * @param message 理由
   */
  constructor(message = "試合表の QR ではないか、読み取りが崩れました。もう一度読んでください。") {
    super(message);
    this.name = "HandoffFormatError";
  }
}

/**
 * バイトを Base45 の文字にする（RFC 9285）。
 * @param bytes バイト
 * @returns 文字
 */
export function encodeBase45(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = (bytes[i] as number) * 256 + (bytes[i + 1] as number);
      out +=
        BASE45.charAt(n % 45) +
        BASE45.charAt(Math.floor(n / 45) % 45) +
        BASE45.charAt(Math.floor(n / 2025));
    } else {
      const n = bytes[i] as number;
      out += BASE45.charAt(n % 45) + BASE45.charAt(Math.floor(n / 45));
    }
  }
  return out;
}

/**
 * Base45 の文字をバイトに戻す。
 * @param text 文字
 * @returns バイト
 * @throws {HandoffFormatError} Base45 でない文字・長さ・値のとき
 */
export function decodeBase45(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new HandoffFormatError();
  const values = [...text].map((char) => {
    const value = BASE45.indexOf(char);
    if (value < 0) throw new HandoffFormatError();
    return value;
  });
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3) {
    const c = values[i] as number;
    const d = values[i + 1] as number;
    if (i + 2 < values.length) {
      const n = c + d * 45 + (values[i + 2] as number) * 2025;
      if (n > 0xffff) throw new HandoffFormatError();
      out.push(n >> 8, n & 0xff);
    } else {
      const n = c + d * 45;
      if (n > 0xff) throw new HandoffFormatError();
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}

/** バイトを書く道具（可変長の整数と文字）。 */
class ByteWriter {
  /** 書いたバイト */
  readonly bytes: number[] = [];

  /**
   * 1バイト書く。
   * @param value 0〜255
   */
  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  /**
   * 0以上の整数を可変長（7ビットずつ）で書く。
   * @param value 0以上の整数
   */
  varint(value: number): void {
    let rest = Math.max(0, Math.floor(value));
    while (rest >= 0x80) {
      this.bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.bytes.push(rest);
  }

  /**
   * 文字を、長さ（可変長）と UTF-8 で書く。
   * @param value 文字
   */
  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.varint(encoded.length);
    for (const byte of encoded) this.bytes.push(byte);
  }

  /**
   * 16進の文字をバイトで書く。
   * @param hex 16進（偶数の長さ）
   */
  hex(hex: string): void {
    for (let i = 0; i < hex.length; i += 2)
      this.bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
}

/** バイトを読む道具（足りなければ HandoffFormatError）。 */
class ByteReader {
  /** 読んだ位置 */
  private offset = 0;
  /** 読むバイト */
  private readonly bytesToRead: Uint8Array;

  /**
   * 読むバイトから作る。
   * @param bytes バイト
   */
  constructor(bytes: Uint8Array) {
    this.bytesToRead = bytes;
  }

  /**
   * 1バイト読む。
   * @returns 0〜255
   * @throws {HandoffFormatError} 足りないとき
   */
  u8(): number {
    const value = this.bytesToRead[this.offset];
    if (value === undefined) throw new HandoffFormatError();
    this.offset += 1;
    return value;
  }

  /**
   * 可変長の整数を読む。
   * @returns 整数
   * @throws {HandoffFormatError} 足りない・長すぎるとき
   */
  varint(): number {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 8; i += 1) {
      const byte = this.u8();
      value += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) return value;
      scale *= 0x80;
    }
    throw new HandoffFormatError();
  }

  /**
   * 文字を読む。
   * @returns 文字
   * @throws {HandoffFormatError} 足りない・UTF-8 でないとき
   */
  text(): string {
    const length = this.varint();
    if (this.offset + length > this.bytesToRead.length) throw new HandoffFormatError();
    const slice = this.bytesToRead.subarray(this.offset, this.offset + length);
    this.offset += length;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(slice);
    } catch {
      throw new HandoffFormatError();
    }
  }

  /**
   * バイトを16進で読む。
   * @param length バイトの数
   * @returns 16進
   */
  hex(length: number): string {
    let out = "";
    for (let i = 0; i < length; i += 1) out += this.u8().toString(16).padStart(2, "0");
    return out;
  }

  /**
   * 読み終えたか。
   * @returns 残りがなければ true
   */
  done(): boolean {
    return this.offset === this.bytesToRead.length;
  }
}

/**
 * 流れの道具でバイトを変える（CompressionStream・DecompressionStream）。
 * @param bytes バイト
 * @param stream 変える道具
 * @returns 変えたバイト
 */
async function transform(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const writer = (stream.writable as WritableStream<Uint8Array>).getWriter();
  void writer.write(bytes).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
    if (length > MAX_INFLATED_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new HandoffFormatError();
    }
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * 縮める（このブラウザで縮められなければ undefined）。
 * @param bytes バイト
 * @returns 縮めたバイト
 */
async function deflate(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === "undefined") return undefined;
  try {
    return await transform(bytes, new CompressionStream("deflate-raw"));
  } catch {
    return undefined;
  }
}

/**
 * 戻す。
 * @param bytes 縮めたバイト
 * @returns バイト
 * @throws {HandoffFormatError} このブラウザで戻せない・壊れているとき
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new HandoffFormatError(
      "このブラウザでは、この QR を開けません。ブラウザを新しくするか、大きく映す画面で見てください。",
    );
  }
  try {
    return await transform(bytes, new DecompressionStream("deflate-raw"));
  } catch {
    throw new HandoffFormatError();
  }
}

/** 2000-01-01 からの日の数の基準（ミリ秒）。 */
const DAY_ZERO = Date.UTC(2000, 0, 1);
/** 1日（ミリ秒）。 */
const DAY_MS = 86_400_000;

/**
 * 試合表をバイトにする（縮める前）。
 * @param table 渡す試合表
 * @param legacy 前の形（1試合の長さあり・チームなし）で書くときの1試合の長さ（前の形を読めるかの試験だけで使う）
 * @returns バイト
 */
export function serializeTable(
  table: HandoffTable,
  legacy?: { minutesPerGame: number },
): Uint8Array {
  const writer = new ByteWriter();
  const names: string[] = [];
  const index = new Map<string, number>();
  const remember = (name: string) => {
    if (!index.has(name)) {
      index.set(name, names.length);
      names.push(name);
    }
  };
  for (const group of table.groups) {
    for (const game of group.games) for (const name of game.players) remember(name);
  }
  if (!legacy) for (const team of table.teams ?? []) for (const name of team) remember(name);
  writer.varint(table.version);
  if (table.hint && /^[0-9a-f]{8}$/u.test(table.hint)) {
    writer.u8(1);
    writer.hex(table.hint);
  } else {
    writer.u8(0);
  }
  writer.text(table.name);
  const [year, month, day] = table.playDate.split("-").map(Number);
  writer.varint(
    Math.round((Date.UTC(year ?? 2000, (month ?? 1) - 1, day ?? 1) - DAY_ZERO) / DAY_MS),
  );
  if (legacy) writer.varint(legacy.minutesPerGame);
  writer.varint(Math.floor(table.updatedAt / HANDOFF_TIME_UNIT_MS));
  writer.varint(names.length);
  for (const name of names) writer.text(name);
  writer.varint(table.groups.length);
  for (const group of table.groups) {
    writer.u8(MATCH_GROUP_KEYS.indexOf(group.key));
    writer.varint(group.games.length);
    for (const game of group.games) {
      writer.u8(game.players.length);
      for (const name of game.players) writer.varint(index.get(name) ?? 0);
    }
    let bits = 0;
    group.games.forEach((game, gameIndex) => {
      if (game.done) bits |= 1 << (gameIndex % 8);
      if (gameIndex % 8 === 7 || gameIndex === group.games.length - 1) {
        writer.u8(bits);
        bits = 0;
      }
    });
  }
  if (!legacy) {
    const teams = table.teams ?? [];
    writer.varint(teams.length);
    for (const team of teams) {
      writer.varint(team.length);
      for (const name of team) writer.varint(index.get(name) ?? 0);
    }
  }
  return Uint8Array.from(writer.bytes);
}

/**
 * バイトを試合表に戻す。
 * @param bytes バイト
 * @param legacy 前の形（1試合の長さあり・チームなし）か
 * @returns 渡された試合表
 * @throws {HandoffFormatError} 形が違うとき
 */
export function deserializeTable(bytes: Uint8Array, legacy = false): HandoffTable {
  const reader = new ByteReader(bytes);
  const version = reader.varint();
  if (!Number.isSafeInteger(version) || version < 1) throw new HandoffFormatError();
  const hint = reader.u8() === 1 ? reader.hex(4) : null;
  const name = reader.text();
  if (name.length > TABLE_NAME_MAX) throw new HandoffFormatError();
  const date = new Date(DAY_ZERO + reader.varint() * DAY_MS);
  const playDate = date.toISOString().slice(0, 10);
  if (legacy) {
    // 前の形の1試合の長さ（もう使わないので読み捨てる）
    const minutesPerGame = reader.varint();
    if (minutesPerGame < 1 || minutesPerGame > 600) throw new HandoffFormatError();
  }
  const updatedAt = reader.varint() * HANDOFF_TIME_UNIT_MS;
  const nameCount = reader.varint();
  if (nameCount > 1000) throw new HandoffFormatError();
  const names = Array.from({ length: nameCount }, () => {
    const value = reader.text();
    if (value.length > NICKNAME_MAX) throw new HandoffFormatError();
    return value;
  });
  const groupCount = reader.varint();
  if (groupCount > MATCH_GROUP_KEYS.length) throw new HandoffFormatError();
  const groups: HandoffTable["groups"] = [];
  for (let g = 0; g < groupCount; g += 1) {
    const key = MATCH_GROUP_KEYS[reader.u8()];
    if (!key) throw new HandoffFormatError();
    const gameCount = reader.varint();
    if (gameCount > 1000) throw new HandoffFormatError();
    const games = Array.from({ length: gameCount }, () => {
      const size = reader.u8();
      if (size < 1 || size > 4) throw new HandoffFormatError();
      const players = Array.from({ length: size }, () => {
        const player = names[reader.varint()];
        if (player === undefined) throw new HandoffFormatError();
        return player;
      });
      return { players, done: false };
    });
    for (let start = 0; start < gameCount; start += 8) {
      const bits = reader.u8();
      for (let i = 0; i < 8 && start + i < gameCount; i += 1) {
        (games[start + i] as { done: boolean }).done = (bits & (1 << i)) !== 0;
      }
    }
    groups.push({ key, games });
  }
  let teams: string[][] | undefined;
  if (!legacy) {
    const teamCount = reader.varint();
    if (teamCount > MINI_COURTS_MAX * 2) throw new HandoffFormatError();
    if (teamCount > 0) {
      teams = Array.from({ length: teamCount }, () => {
        const size = reader.varint();
        if (size > 1000) throw new HandoffFormatError();
        return Array.from({ length: size }, () => {
          const player = names[reader.varint()];
          if (player === undefined) throw new HandoffFormatError();
          return player;
        });
      });
    }
  }
  if (!reader.done()) throw new HandoffFormatError();
  return { version, hint, name, playDate, updatedAt, groups, ...(teams ? { teams } : {}) };
}

/**
 * 文字から短い印（4文字の英数字）を作る（つづきの QR が同じ束かを見分ける）。
 * @param text 文字
 * @returns 印
 */
function batchId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
}

/**
 * 試合表を QR の文字にする（1枚か、つづきの数枚）。
 * @param table 渡す試合表
 * @param chunkChars 1枚に入れる Base45 の文字の数（テストで替える）
 * @returns QR に入れる文字（1枚目から順に）
 * @throws {HandoffTooLargeError} 枚数の上限に入らないとき
 */
export async function encodeTableHandoff(
  table: HandoffTable,
  chunkChars: number = HANDOFF_CHUNK_CHARS,
): Promise<string[]> {
  const raw = serializeTable(table);
  const compressed = await deflate(raw);
  const body =
    compressed && compressed.length < raw.length
      ? Uint8Array.from([FORMAT_DEFLATE, ...compressed])
      : Uint8Array.from([FORMAT_RAW, ...raw]);
  const data = encodeBase45(body);
  const total = Math.max(1, Math.ceil(data.length / chunkChars));
  if (total > HANDOFF_MAX_PARTS) throw new HandoffTooLargeError(total);
  const id = batchId(data);
  const mark = total.toString(36).toUpperCase();
  return Array.from({ length: total }, (_, index) => {
    const chunk = data.slice(index * chunkChars, (index + 1) * chunkChars);
    return `${TABLE_PREFIX}${(index + 1).toString(36).toUpperCase()}${mark}.${id}.${chunk}`;
  });
}

/** 読んだ1枚の QR。 */
export type HandoffPart =
  | { kind: "table"; index: number; total: number; id: string; data: string }
  | { kind: "join"; join: HandoffJoin };

/**
 * 読んだ文字が、どの QR のどの1枚かを見る。
 * @param text 読んだ文字
 * @returns 1枚（試合表・受付の QR でなければ undefined）
 */
export function readHandoffPart(text: string): HandoffPart | undefined {
  // 前後の空白を削らない（Base45 は空白も文字に使う）
  const value = text;
  if (value.startsWith(JOIN_PREFIX)) {
    const join = decodeJoinHandoff(value);
    return join ? { kind: "join", join } : undefined;
  }
  const match = /^KM1\.([1-9A-G])([1-9A-G])\.([0-9A-Z]{4})\.([0-9A-Z $%*+\-./:]+)$/u.exec(value);
  if (!match) return undefined;
  const index = Number.parseInt(match[1] as string, 36);
  const total = Number.parseInt(match[2] as string, 36);
  if (index > total || total > HANDOFF_MAX_PARTS) return undefined;
  return { kind: "table", index, total, id: match[3] as string, data: match[4] as string };
}

/** つづきの QR を集める道具（全部そろったら組み立てる）。 */
export class HandoffCollector {
  /** 集めている束の印 */
  private id: string | undefined;
  /** 集めた1枚（何枚目 → 中身） */
  private readonly parts = new Map<number, string>();
  /** 全部の枚数 */
  private total = 0;

  /**
   * 読んだ1枚を足す（ほかの束の1枚が来たら、その束から集め直す）。
   * @param part 試合表の QR の1枚
   * @returns 集めた枚数と全部の枚数、そろったら組み立てた Base45 の文字
   */
  add(part: Extract<HandoffPart, { kind: "table" }>): {
    have: number;
    total: number;
    data?: string;
  } {
    if (part.id !== this.id || part.total !== this.total) {
      this.id = part.id;
      this.total = part.total;
      this.parts.clear();
    }
    this.parts.set(part.index, part.data);
    if (this.parts.size < this.total) return { have: this.parts.size, total: this.total };
    const data = Array.from({ length: this.total }, (_, i) => this.parts.get(i + 1) ?? "").join("");
    return { have: this.total, total: this.total, data };
  }

  /**
   * 集めた1枚の番号（画面に「2/3 読みました」を出す）。
   * @returns 何枚目の並び
   */
  collected(): number[] {
    return [...this.parts.keys()].sort((a, b) => a - b);
  }
}

/**
 * 組み立てた Base45 の文字を、試合表に戻す。
 * @param data Base45 の文字（全部の1枚をつないだもの）
 * @returns 渡された試合表
 * @throws {HandoffFormatError} 形が違う・壊れている・このブラウザで戻せないとき
 */
export async function decodeTableHandoff(data: string): Promise<HandoffTable> {
  const body = decodeBase45(data);
  const format = body[0];
  const rest = body.subarray(1);
  if (format === FORMAT_RAW) return deserializeTable(rest);
  if (format === FORMAT_DEFLATE) return deserializeTable(await inflate(rest));
  if (format === FORMAT_RAW_V1) return deserializeTable(rest, true);
  if (format === FORMAT_DEFLATE_V1) return deserializeTable(await inflate(rest), true);
  throw new HandoffFormatError();
}

/**
 * 試合表から、渡す試合表を作る（見るだけのページの窓口と同じ形：分け方の組の順・呼び名の組み合わせと終わったか）。
 * @param table 試合表（content は送っていない変更を含む）
 * @param version 渡す版（送っていない変更があれば、送り終えたあとにサーバーが持つ版）
 * @param now 中身の時刻（ミリ秒）
 * @returns 渡す試合表
 */
export function handoffOfTable(table: MatchTable, version: number, now: number): HandoffTable {
  const { content } = table;
  const names = new Map(content.players.map((player) => [player.id, player.nickname]));
  return {
    version,
    hint: table.links.viewHint,
    name: table.name,
    playDate: table.playDate,
    updatedAt: Math.floor(now / HANDOFF_TIME_UNIT_MS) * HANDOFF_TIME_UNIT_MS,
    ...(content.mini
      ? { teams: content.mini.teams.map((team) => team.map((id) => names.get(id) ?? "")) }
      : {}),
    groups: matchGroupsOf(content.settings).map((group) => ({
      key: group.key,
      games: (content.plan.find((plan) => plan.key === group.key)?.games ?? []).map((game) => ({
        players: game.players.map((id) => names.get(id) ?? ""),
        done: game.done,
      })),
    })),
  };
}

/**
 * 組の言葉（分け方をまたいで、組の key から決める）。
 * @param key 組の key
 * @returns 言葉
 */
export function groupLabel(key: MatchGroupKey): string {
  for (const groups of Object.values(MATCH_GROUPS)) {
    const found = groups.find((group) => group.key === key);
    if (found) return found.label;
  }
  return key;
}

/**
 * 渡された試合表を、見るだけのページの中身にする。
 * @param table 渡された試合表
 * @param expiresAt 見られる期限（端末に置いた中身の期限。なければ試合の日の終わり）
 * @returns 見るだけのページの中身
 */
export function viewFromHandoff(table: HandoffTable, expiresAt: string): MatchView {
  return {
    name: table.name,
    playDate: table.playDate,
    version: table.version,
    groups: table.groups.map((group) => ({
      key: group.key,
      label: groupLabel(group.key),
      games: group.games,
    })),
    ...(table.teams ? { teams: table.teams } : {}),
    updatedAt: new Date(table.updatedAt).toISOString(),
    expiresAt,
  };
}

/**
 * 受け取ってよい版か（今より新しい版のときだけ取り込む。AD-28）。
 * @param incoming 渡された版
 * @param current 今の版（なければ undefined）
 * @returns 取り込むなら "newer"、同じなら "same"、古ければ "older"
 */
export function compareHandoffVersion(
  incoming: number,
  current: number | undefined,
): "newer" | "same" | "older" {
  if (current === undefined || incoming > current) return "newer";
  return incoming === current ? "same" : "older";
}

/**
 * 受付の QR の文字を作る。
 * @param join 受付の札の印・呼び名・レベル・乱数
 * @returns QR に入れる文字
 */
export function encodeJoinHandoff(join: HandoffJoin): string {
  const writer = new ByteWriter();
  writer.u8(1);
  writer.hex(join.hint);
  writer.u8(MATCH_LEVELS.indexOf(join.level));
  writer.hex(`0${join.nonce}`);
  writer.text(join.nickname);
  return `${JOIN_PREFIX}${encodeBase45(Uint8Array.from(writer.bytes))}`;
}

/**
 * 受付の QR の文字を読む。
 * @param text 読んだ文字
 * @returns 中身（形が違えば undefined）
 */
export function decodeJoinHandoff(text: string): HandoffJoin | undefined {
  if (!text.startsWith(JOIN_PREFIX)) return undefined;
  try {
    const reader = new ByteReader(decodeBase45(text.slice(JOIN_PREFIX.length)));
    if (reader.u8() !== 1) return undefined;
    const hint = reader.hex(4);
    const level = MATCH_LEVELS[reader.u8()];
    const nonce = reader.hex(8).slice(1);
    const nickname = reader.text();
    if (!level || !reader.done()) return undefined;
    // 受付の窓口と同じ決まり（1〜20文字・制御文字なし）。外から作れる QR なので、名簿に入れる前に確かめる
    const parsed = MatchJoinInput.safeParse({ nickname, level });
    if (!parsed.success) return undefined;
    return { hint, level: parsed.data.level, nonce, nickname: parsed.data.nickname };
  } catch {
    return undefined;
  }
}

/**
 * 受付の QR で入れた人の、名簿の人の ID（"q" と乱数の15文字。名簿の人の ID の形〈英小文字と数字の16文字まで〉）。
 * @param nonce 参加者の端末が作った乱数（16進の15文字）
 * @returns 名簿の人の ID
 */
export function joinQrPlayerId(nonce: string): string {
  return `q${nonce
    .toLowerCase()
    .replace(/[^0-9a-f]/gu, "")
    .slice(0, 15)}`;
}

/**
 * 受付の QR に入れる乱数を作る（16進の15文字）。
 * @returns 乱数
 */
export function newJoinNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(1);
}
