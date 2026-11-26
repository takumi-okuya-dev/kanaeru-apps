// 電波なしで渡す QR の中身（match-005）：Base45（RFC 9285）・試合表の行き来（property-based）・大きさ（1枚に入る表・つづきの QR・
// 入らない表）・本物の QR の模様を jsQR で読む・版の比べ方・受付の QR。
import fc from "fast-check";
import { MATCH_GROUP_KEYS, MATCH_LEVELS } from "@workspace/contracts/match";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import {
  HANDOFF_CHUNK_CHARS,
  HANDOFF_MAX_PARTS,
  HandoffCollector,
  HandoffFormatError,
  HandoffTooLargeError,
  compareHandoffVersion,
  decodeBase45,
  decodeJoinHandoff,
  decodeTableHandoff,
  deserializeTable,
  encodeBase45,
  encodeJoinHandoff,
  encodeTableHandoff,
  joinQrPlayerId,
  newJoinNonce,
  readHandoffPart,
  serializeTable,
  viewFromHandoff,
} from "./handoff.ts";
import type { HandoffTable } from "./handoff.ts";
import { decodeQrPixels } from "./qr-decode.ts";

/** 架空の呼び名（22人）。 */
const NAMES = [
  "高橋",
  "佐藤美",
  "佐藤健",
  "伊藤",
  "渡辺",
  "山本",
  "中村",
  "小林",
  "林",
  "清水",
  "木村",
  "山口",
  "橋本",
  "森",
  "池田",
  "石川",
  "前田",
  "藤田",
  "後藤",
  "岡田",
  "長谷川",
  "村上",
];

/**
 * 22人・4つの組・各8試合の試合表（Open Questions 10 の大きさ）。
 * @returns 試合表
 */
function typicalTable(): HandoffTable {
  const keys = ["advanced", "intermediate", "beginner", "novice"] as const;
  return {
    version: 12,
    hint: "0a1b2c3d",
    name: "12/13(日) 練習会",
    playDate: "2026-12-13",
    updatedAt: Date.UTC(2026, 11, 13, 4, 2),
    groups: keys.map((key, g) => {
      const members = NAMES.slice(g * 5, g * 5 + 6);
      return {
        key,
        games: Array.from({ length: 8 }, (_, i) => ({
          players: [0, 1, 2, 3].map((k) => members[(i + k) % members.length] as string),
          done: i < 3 || i === 5,
        })),
      };
    }),
  };
}

/**
 * QR の文字を、模様（uqr）から色の並びにして jsQR で読む（カメラ・写真で読むのと同じ道具）。
 * @param text QR に入れる文字
 * @param ecc 誤り訂正
 * @returns 読んだ文字と型（version）
 */
async function roundTripQr(text: string, ecc: "L" | "M") {
  const qr = encode(text, { ecc, border: 4 });
  const scale = 4;
  const width = qr.size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = qr.data[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? false;
      const offset = (y * width + x) * 4;
      pixels.fill(dark ? 0 : 255, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  return { decoded: await decodeQrPixels(pixels, width, width), version: qr.version };
}

describe("Base45（RFC 9285）", () => {
  it("RFC の例と同じ", () => {
    const text = (value: string) => encodeBase45(new TextEncoder().encode(value));
    expect(text("AB")).toBe("BB8");
    expect(text("Hello!!")).toBe("%69 VD92EX0");
    expect(text("base-45")).toBe("UJCLQE7W581");
    expect(new TextDecoder().decode(decodeBase45("QED8WEX0"))).toBe("ietf!");
  });

  it("どんなバイトも行って戻る（property-based）", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
      }),
    );
  });

  it("Base45 でない文字・長さは読まない", () => {
    expect(() => decodeBase45("a")).toThrow(HandoffFormatError);
    expect(() => decodeBase45("abc")).toThrow(HandoffFormatError);
    expect(() => decodeBase45("GGW")).toThrow(HandoffFormatError);
  });
});

/** 渡す試合表をでたらめに作る（呼び名は日本語・絵文字も入る）。 */
const tableArbitrary: fc.Arbitrary<HandoffTable> = fc
  .record({
    version: fc.integer({ min: 1, max: 1_000_000 }),
    hint: fc.option(fc.stringMatching(/^[0-9a-f]{8}$/u), { nil: null }),
    name: fc.string({ minLength: 1, maxLength: 60 }),
    days: fc.integer({ min: 0, max: 40_000 }),
    teamCount: fc.constantFrom(0, 2, 4, 6),
    minutes: fc.integer({ min: 0, max: 40_000_000 }),
    names: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 4,
      maxLength: 30,
    }),
    groupKeys: fc.uniqueArray(fc.constantFrom(...MATCH_GROUP_KEYS), { maxLength: 4 }),
    seed: fc.integer(),
  })
  .map((value) => {
    let state = value.seed >>> 0;
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state;
    };
    return {
      version: value.version,
      hint: value.hint,
      name: value.name,
      playDate: new Date(Date.UTC(2000, 0, 1) + value.days * 86_400_000).toISOString().slice(0, 10),
      updatedAt: value.minutes * 60_000,
      ...(value.teamCount > 0
        ? {
            teams: Array.from({ length: value.teamCount }, () =>
              Array.from(
                { length: 1 + (next() % 5) },
                () => value.names[next() % value.names.length] as string,
              ),
            ),
          }
        : {}),
      groups: value.groupKeys.map((key) => ({
        key,
        games: Array.from({ length: next() % 20 }, () => ({
          players: Array.from(
            { length: next() % 2 === 0 ? 4 : 2 },
            () => value.names[next() % value.names.length] as string,
          ),
          done: next() % 3 === 0,
        })),
      })),
    };
  });

describe("試合表の QR", () => {
  it("どんな試合表もバイトで行って戻る（property-based）", () => {
    fc.assert(
      fc.property(tableArbitrary, (table) => {
        expect(deserializeTable(serializeTable(table))).toEqual(table);
      }),
    );
  });

  it("QR の文字にして集め、組み立てて戻る（つづきの QR・順が入れかわっても）（property-based）", async () => {
    await fc.assert(
      fc.asyncProperty(tableArbitrary, fc.integer({ min: 40, max: 400 }), async (table, chunk) => {
        let texts: string[];
        try {
          texts = await encodeTableHandoff(table, chunk);
        } catch (caught) {
          expect(caught).toBeInstanceOf(HandoffTooLargeError);
          return;
        }
        const collector = new HandoffCollector();
        let data: string | undefined;
        for (const text of [...texts].reverse()) {
          const part = readHandoffPart(text);
          if (part?.kind !== "table") throw new Error("試合表の QR として読めません");
          data = collector.add(part).data ?? data;
        }
        expect(data).toBeDefined();
        expect(await decodeTableHandoff(data as string)).toEqual(table);
      }),
      { numRuns: 60 },
    );
  });

  it("22人・4つの組・各8試合の表は、1枚の QR に入り、本物の模様を jsQR で読んで戻る（Open Questions 10）", async () => {
    const table = typicalTable();
    const texts = await encodeTableHandoff(table);
    expect(texts).toHaveLength(1);
    const [text] = texts as [string];
    // 英数字の形だけ（QR の英数字の形に入る）
    expect(text).toMatch(/^[0-9A-Z $%*+\-./:]+$/u);
    const { decoded, version } = await roundTripQr(text, "L");
    expect(decoded).toBe(text);
    expect(version).toBeLessThanOrEqual(15);
    const part = readHandoffPart(decoded as string);
    if (part?.kind !== "table") throw new Error("試合表の QR として読めません");
    expect(await decodeTableHandoff(part.data)).toEqual(table);
  });

  it("1枚の大きさは 20 型（97 マス）までに収まり、本物の模様で読める", async () => {
    const data = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
      .repeat(30)
      .slice(0, HANDOFF_CHUNK_CHARS);
    const text = `KM1.11.ABCD.${data}`;
    const { decoded, version } = await roundTripQr(text, "L");
    expect(version).toBeLessThanOrEqual(20);
    expect(decoded).toBe(text);
  });

  it("大きな表（150人・長い呼び名）は、つづきの QR に分けるか、上限を超えれば渡せないと知らせる", async () => {
    const big: HandoffTable = {
      ...typicalTable(),
      groups: [
        {
          key: "all",
          games: Array.from({ length: 60 }, (_, i) => ({
            players: [0, 1, 2, 3].map((k) =>
              `参加者${String((i * 4 + k) % 150).padStart(3, "0")}さんの長い呼び名ですよ`.slice(
                0,
                20,
              ),
            ),
            done: false,
          })),
        },
      ],
    };
    const texts = await encodeTableHandoff(big);
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.length).toBeLessThanOrEqual(HANDOFF_MAX_PARTS);
    expect(texts.every((text) => text.length <= HANDOFF_CHUNK_CHARS + 12)).toBe(true);
    await expect(encodeTableHandoff(big, 50)).rejects.toBeInstanceOf(HandoffTooLargeError);
  });

  it("ほかの束の1枚が来たら、その束から集め直す", async () => {
    const a = await encodeTableHandoff(typicalTable(), 100);
    const b = await encodeTableHandoff({ ...typicalTable(), version: 13 }, 100);
    const collector = new HandoffCollector();
    const first = readHandoffPart(a[0] as string);
    const second = readHandoffPart(b[1] as string);
    if (first?.kind !== "table" || second?.kind !== "table") throw new Error("読めません");
    expect(collector.add(first).have).toBe(1);
    expect(collector.add(second)).toMatchObject({ have: 1, total: b.length });
    expect(collector.collected()).toEqual([2]);
  });

  it("ありえない値（版0・長すぎる呼び名・前の形の1試合の長さ0）の試合表の QR は読まない", () => {
    const base = typicalTable();
    expect(() => deserializeTable(serializeTable({ ...base, version: 0 }))).toThrow(
      HandoffFormatError,
    );
    expect(() => deserializeTable(serializeTable(base, { minutesPerGame: 0 }), true)).toThrow(
      HandoffFormatError,
    );
    const long = {
      ...base,
      groups: [{ key: "all" as const, games: [{ players: ["あ".repeat(21), "い"], done: false }] }],
    };
    expect(() => deserializeTable(serializeTable(long))).toThrow(HandoffFormatError);
  });

  it("前の形（1試合の長さあり・チームなし。形の印1・2）の QR も読み、1試合の長さは読み捨てる（match-009）", async () => {
    const base = typicalTable();
    const legacy = serializeTable(base, { minutesPerGame: 15 });
    expect(deserializeTable(legacy, true)).toEqual(base);
    const data = encodeBase45(Uint8Array.from([1, ...legacy]));
    await expect(decodeTableHandoff(data)).resolves.toEqual(base);
  });

  it("ミニゲームのチームの呼び名も渡せる（match-009）", async () => {
    const withTeams = { ...typicalTable(), teams: [["高橋", "佐藤"], ["伊藤"]] };
    const parts = await encodeTableHandoff(withTeams);
    const part = readHandoffPart(parts[0] as string);
    if (part?.kind !== "table") throw new Error("読めません");
    await expect(decodeTableHandoff(part.data)).resolves.toEqual(withTeams);
  });

  it("試合表の QR でない文字・崩れた中身は読まない", async () => {
    expect(readHandoffPart("https://example.com/match/view/x")).toBeUndefined();
    expect(readHandoffPart("KM1.21.ABCD.ABC")).toBeUndefined();
    await expect(decodeTableHandoff("ZZZZZZ")).rejects.toBeInstanceOf(HandoffFormatError);
  });

  it("見るだけのページの中身にする（組の言葉を付ける）", () => {
    const view = viewFromHandoff(typicalTable(), "2026-12-13T14:59:59.999Z");
    expect(view.version).toBe(12);
    expect(view.groups.map((group) => group.label)).toEqual(["上級", "中級", "初級", "入門"]);
    expect(view.groups[0]?.games[0]).toEqual({
      players: ["高橋", "佐藤美", "佐藤健", "伊藤"],
      done: true,
    });
  });
});

describe("版の比べ方", () => {
  it("今より新しい版のときだけ取り込む", () => {
    expect(compareHandoffVersion(5, undefined)).toBe("newer");
    expect(compareHandoffVersion(6, 5)).toBe("newer");
    expect(compareHandoffVersion(5, 5)).toBe("same");
    expect(compareHandoffVersion(4, 5)).toBe("older");
  });
});

describe("受付の QR", () => {
  it("呼び名とレベルが行って戻り、本物の模様で読める（property-based）", async () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(
            (name) => name.trim() === name && name.length > 0 && !/[\p{Cc}\p{Cf}]/u.test(name),
          ),
        fc.constantFrom(...MATCH_LEVELS),
        fc.stringMatching(/^[0-9a-f]{8}$/u),
        (nickname, level, hint) => {
          const nonce = newJoinNonce();
          const text = encodeJoinHandoff({ hint, nickname, level, nonce });
          expect(decodeJoinHandoff(text)).toEqual({ hint, nickname, level, nonce });
          const part = readHandoffPart(text);
          expect(part).toEqual({ kind: "join", join: { hint, nickname, level, nonce } });
        },
      ),
      { numRuns: 50 },
    );
    const text = encodeJoinHandoff({
      hint: "deadbeef",
      nickname: "石川",
      level: "novice",
      nonce: newJoinNonce(),
    });
    expect((await roundTripQr(text, "M")).decoded).toBe(text);
  });

  it("名簿の人の ID は乱数から決まる（同じ QR を2回読んでも同じ人）", () => {
    const nonce = newJoinNonce();
    expect(nonce).toMatch(/^[0-9a-f]{15}$/u);
    expect(joinQrPlayerId(nonce)).toBe(`q${nonce}`);
    expect(joinQrPlayerId(nonce)).toMatch(/^[a-z0-9]{1,16}$/u);
  });

  it("受付の窓口で通らない呼び名（21文字・制御文字・空白だけ）の QR は読まない（外から作れるため）", () => {
    const make = (nickname: string) =>
      encodeJoinHandoff({ hint: "deadbeef", nickname, level: "novice", nonce: newJoinNonce() });
    expect(decodeJoinHandoff(make("あ".repeat(21)))).toBeUndefined();
    expect(decodeJoinHandoff(make("石川\u0007"))).toBeUndefined();
    expect(decodeJoinHandoff(make("石\u202e川"))).toBeUndefined();
    expect(decodeJoinHandoff(make("   "))).toBeUndefined();
    expect(decodeJoinHandoff(make(" 石川 "))?.nickname).toBe("石川");
  });

  it("形の違う受付の QR は読まない", () => {
    expect(decodeJoinHandoff("KJ1.")).toBeUndefined();
    expect(decodeJoinHandoff("KJ1.ZZ")).toBeUndefined();
    expect(decodeJoinHandoff("KM1.11.ABCD.X")).toBeUndefined();
  });
});
