// テストの見本の PDF（goodnotes-sample.pdf）を作る手順（research R14。作り方は README.md）。
// GoodNotes から書き出した PDF の形（ページに焼きこんだ半透明の太い線・本と違う書体のテキストボックス・ページの上の柱）を写した、
// 架空の文だけの2ページの PDF を、依存を足さずに PDF の文を手で組み立てて書き出す。本物の本の文は使わない。
// 書体は埋めこまない（日本語の CID 書体の名前と、決まった CMap〈UniJIS-UCS2-H〉だけを書く）ので、数 KB で済み、
// pdf.js は CMap を読まないと文字を取れない（CMap の読みこみも一緒に確かめられる）。
// 流し方（apps/web で）：pnpm exec node src/features/reading/import/__fixtures__/make-sample.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** ページの大きさ（pt。A5 に近い形）。 */
const PAGE = { width: 420, height: 595 };
/** 本文の字の大きさと、1字の幅（書体の既定の幅 1000 の字を使うので、字の大きさと同じ）。 */
const BODY_SIZE = 10;
/** 本文の行の左の端（pt）。 */
const BODY_LEFT = 50;

/**
 * 文字を UTF-16BE の16進にする（UniJIS-UCS2-H の CMap で読む字の並び）。
 * @param text 文字（BMP の字だけ）
 * @returns PDF の16進の文字列（<…>）
 */
function hex(text: string): string {
  let out = "";
  for (const char of text) {
    out += (char.codePointAt(0) ?? 0).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${out}>`;
}

/**
 * 文字を置く命令。
 * @param font 書体の名前（/F1 は本文・/F2 はテキストボックス）
 * @param size 字の大きさ（pt）
 * @param x 左の端（pt）
 * @param y 字の下の線（pt。ページの下から）
 * @param text 文字
 * @returns 命令の文
 */
function text(font: "F1" | "F2", size: number, x: number, y: number, text: string): string {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${hex(text)} Tj ET`;
}

/**
 * 本文の n 字目から m 字目の手前までに引く、半透明の黄色の太い線（手書きらしく、少し揺らした点を通る）。
 * @param y 字の下の線（pt）
 * @param from 線の始まりの字（0から）
 * @param to 線の終わりの字の次（0から）
 * @param scale 座標を割る数（CTM で拡大して描く線を確かめるため。1なら拡大しない）
 * @returns 命令の文
 */
function marker(y: number, from: number, to: number, scale = 1): string {
  const left = BODY_LEFT + from * BODY_SIZE + 2;
  const right = BODY_LEFT + to * BODY_SIZE - 2;
  const middle = y + BODY_SIZE * 0.38;
  const points = [
    [left, middle],
    [left + (right - left) * 0.3, middle + 0.4],
    [left + (right - left) * 0.7, middle - 0.3],
    [right, middle + 0.2],
  ].map(([px = 0, py = 0]) => `${round(px / scale)} ${round(py / scale)}`);
  const path = `${points[0]} m ${points.slice(1).join(" l ")} l S`;
  const matrix = scale === 1 ? "" : `${scale} 0 0 ${scale} 0 0 cm `;
  return `q ${matrix}1 1 0 RG /GS1 gs ${round(12 / scale)} w 1 J 1 j ${path} Q`;
}

/**
 * 小数を3けたにそろえる。
 * @param value 数
 * @returns 文字
 */
function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * 本文の行を置く命令（上から順に 18pt ずつ下げる）。
 * @param top いちばん上の行の字の下の線（pt）
 * @param lines 行の文
 * @returns 命令の文
 */
function bodyLines(top: number, lines: string[]): string[] {
  return lines.map((line, index) => text("F1", BODY_SIZE, BODY_LEFT, top - index * 18, line));
}

// 1ページ目：柱「1.2（全角の空白）見本の節」とページ番号 13。マーカー2つ（1行目の頭・4行目の真ん中）と、その下のテキストボックス
const page1 = [
  text("F1", 9, 40, 560, "1.2　見本の節"),
  text("F1", 9, 362, 560, "13"),
  ...bodyLines(520, [
    "架空の本の見本です。ここから本文が始まります。",
    "この文は試しのためだけに書いたものです。",
    "どの本にも載っていない、作り物の文章です。",
    "前置きの文、二つ目のしるしの文、後ろの文。",
    "しるしのない行は、取り出されません。",
    "ページの下には、手書きのメモを置きます。",
  ]),
  marker(520, 0, 10),
  marker(466, 6, 15),
  // ペンの細い線（不透明・幅 1pt）はマーカーとみなさない
  "q 0 0 0 RG 1 w 50 425 m 300 425 l S Q",
  text("F2", 9, 120, 400, "あとで読み返したいところ"),
].join("\n");

// 2ページ目：柱とページ番号 14。マーカー1つ（2行目の頭。座標を半分にして CTM で2倍に描く）
const page2 = [
  text("F1", 9, 40, 560, "14"),
  text("F1", 9, 300, 560, "1.2　見本の節"),
  ...bodyLines(520, [
    "二ページ目の見本の文です。",
    "三つ目のしるしは、この行の頭から引きます。",
    "おしまいの行です。",
  ]),
  marker(502, 0, 8, 2),
].join("\n");

/**
 * 書体（Type0・CID 書体・書体の説明）の3つのもの。
 * @param name 書体の名前
 * @param first 最初のものの番号
 * @returns PDF のものの本文（3つ）
 */
function font(name: string, first: number): string[] {
  return [
    `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /UniJIS-UCS2-H /DescendantFonts [${first + 1} 0 R] >>`,
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /FontDescriptor ${first + 2} 0 R /DW 1000 >>`,
    `<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>`,
  ];
}

/**
 * 中身の流れ（stream）のものの本文。
 * @param content 命令の文
 * @returns PDF のものの本文
 */
function stream(content: string): string {
  return `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
}

const resources =
  "<< /Font << /F1 7 0 R /F2 10 0 R >> /ExtGState << /GS1 13 0 R >> /ProcSet [/PDF /Text] >>";
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources ${resources} /Contents 5 0 R >>`,
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources ${resources} /Contents 6 0 R >>`,
  stream(page1),
  stream(page2),
  // 本文は明朝の書体、テキストボックスは GoodNotes の既定の書体（HiraginoSans-W3）の名前にする
  ...font("Ryumin-Light", 7),
  ...font("HiraginoSans-W3", 10),
  "<< /Type /ExtGState /CA 0.5 /ca 0.5 >>",
];

let pdf = "%PDF-1.7\n";
const offsets: number[] = [];
objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const out = fileURLToPath(new URL("./goodnotes-sample.pdf", import.meta.url));
writeFileSync(out, pdf, "latin1");
