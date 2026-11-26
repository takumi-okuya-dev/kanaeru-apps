// 印刷の版の大きさを決める（PRD FR-M19・モックアップ R1・M5）。状態を持たない関数だけ。
// 1つの組を紙1枚に、名前の列に縦線を引いて並べる。字の大きさと行の高さは、選んだ紙1枚にちょうど収まるよう自動で合わせる
// （試合が少ないときは大きく、多いときは小さく。持ち主が決めた）。ただし大きくなりすぎないよう、名前の字は行の高さの
// 45%・上限 MAX_FONT_MM まで、題は上限 16mm まで（刷ると大きすぎた。持ち主が決めた）。
// 版は SVG で描き、大きさはどれも紙の上の mm で決める（画面の値ではないので tokens.css に置かない。research R10）。

/** 紙の大きさの code（A5〜A2・B5〜B3。B は日本の JIS の B 列）。 */
export const PAPER_SIZES = ["a5", "b5", "a4", "b4", "a3", "b3", "a2"] as const;

/** 紙の大きさ。 */
export type PaperSize = (typeof PAPER_SIZES)[number];

/** 紙の向き。 */
export const ORIENTATIONS = ["portrait", "landscape"] as const;

/** 紙の向き。 */
export type Orientation = (typeof ORIENTATIONS)[number];

/** 紙の大きさの画面の言葉。 */
export const PAPER_LABELS = {
  a5: "A5",
  b5: "B5",
  a4: "A4",
  b4: "B4",
  a3: "A3",
  b3: "B3",
  a2: "A2",
} as const satisfies Record<PaperSize, string>;

/** 紙の向きの画面の言葉。 */
export const ORIENTATION_LABELS = {
  portrait: "縦",
  landscape: "横",
} as const satisfies Record<Orientation, string>;

/** 紙の短い辺と長い辺（mm）。 */
const PAPER_MM = {
  a5: [148, 210],
  b5: [182, 257],
  a4: [210, 297],
  b4: [257, 364],
  a3: [297, 420],
  b3: [364, 515],
  a2: [420, 594],
} as const satisfies Record<PaperSize, readonly [number, number]>;

/** 紙の余白（mm。印刷の CSS の @page の margin と同じ）。 */
export const PAGE_MARGIN_MM = 8;

/** 刷る範囲が紙からはみ出して2枚目にならないための遊び（mm）。 */
const SAFETY_MM = 1;

/** 名前の字がこれより小さいと読みにくい（mm。約10ポイント）。大きい紙をすすめる【仮決め】。 */
export const MIN_READABLE_FONT_MM = 3.5;

/** 名前の字の大きさの上限（mm。約34ポイント）。試合が少ないときに字が大きくなりすぎないため。 */
export const MAX_FONT_MM = 12;

/** 名前の字の大きさの、行の高さに対する割合。 */
const FONT_TO_ROW = 0.45;

/** 題（組の名前）の字の大きさの上限（mm）。 */
const MAX_TITLE_MM = 16;

/** 既定の紙（A3 縦。PRD FR-M19【仮決め】）。 */
export const DEFAULT_PAPER: { size: PaperSize; orientation: Orientation } = {
  size: "a3",
  orientation: "portrait",
};

/**
 * 刷る範囲の大きさ（紙から余白を引いたもの。mm）。
 * @param size 紙の大きさ
 * @param orientation 向き
 * @returns 幅と高さ（mm）
 */
export function printableArea(
  size: PaperSize,
  orientation: Orientation,
): { width: number; height: number } {
  const [short, long] = PAPER_MM[size];
  const [width, height] = orientation === "portrait" ? [short, long] : [long, short];
  return {
    width: width - PAGE_MARGIN_MM * 2 - SAFETY_MM,
    height: height - PAGE_MARGIN_MM * 2 - SAFETY_MM,
  };
}

/**
 * 文字の幅を、字の大きさを1とした長さで見積もる（全角は1、半角は0.6）。
 * @param text 文字
 * @returns 幅（em）
 */
export function textWidthEm(text: string): number {
  let width = 0;
  for (const char of text) width += /[ -~\u00a0-\u00ff\uff61-\uff9f]/u.test(char) ? 0.6 : 1;
  return width;
}

/** 印刷の版の大きさ（どれも mm）。 */
export type SheetLayout = {
  /** 版の幅 */
  width: number;
  /** 版の高さ */
  height: number;
  /** 題（組の名前）の字の大きさ */
  titleSize: number;
  /** 題の下の説明の字の大きさ */
  subtitleSize: number;
  /** 表の上の端 */
  tableTop: number;
  /** 表の高さ */
  tableHeight: number;
  /** 1行の高さ */
  rowHeight: number;
  /** 試合の番号の列の幅 */
  numberWidth: number;
  /** 名前の列1つの幅 */
  nameWidth: number;
  /** 名前の字の大きさ */
  fontSize: number;
  /** 試合の番号の字の大きさ */
  numberSize: number;
  /** 下の「PaletKit で作った試合表」の字の大きさ */
  footerSize: number;
  /** 名前の字が小さすぎて読みにくい（大きい紙をすすめる） */
  tooSmall: boolean;
};

/**
 * 1つの組の印刷の版の大きさを決める（行が表の高さをちょうど埋め、名前がいちばん長い人も列に収まる字の大きさにする）。
 * @param input 紙・試合の数・1試合の人数・いちばん長い呼び名の幅
 * @param input.size 紙の大きさ
 * @param input.orientation 向き
 * @param input.rows 試合の数（行の数）
 * @param input.columns 1試合の人数（名前の列の数）
 * @param input.longestNameEm いちばん長い呼び名の幅（textWidthEm）
 * @returns 版の大きさ
 */
export function layoutSheet(input: {
  size: PaperSize;
  orientation: Orientation;
  rows: number;
  columns: number;
  longestNameEm: number;
}): SheetLayout {
  const { width, height } = printableArea(input.size, input.orientation);
  const titleSize = Math.min(height * 0.05, width * 0.07, MAX_TITLE_MM);
  const subtitleSize = Math.max(3, titleSize * 0.4);
  const tableTop = titleSize * 1.3 + subtitleSize * 1.8;
  const footerSize = Math.min(5, Math.max(3, height * 0.012));
  const tableHeight = height - tableTop - footerSize * 2;
  const rows = Math.max(1, input.rows);
  const rowHeight = tableHeight / rows;
  const digits = String(rows).length;
  const numberWidth = Math.max(width * 0.06, Math.min(rowHeight * 0.5, 12) * 0.6 * digits + 4);
  const nameWidth = (width - numberWidth) / Math.max(1, input.columns);
  const fontSize = Math.min(
    rowHeight * FONT_TO_ROW,
    MAX_FONT_MM,
    (nameWidth * 0.86) / Math.max(2, input.longestNameEm),
  );
  const numberSize = Math.min(fontSize * 0.7, (numberWidth * 0.8) / (digits * 0.6));
  return {
    width,
    height,
    titleSize,
    subtitleSize,
    tableTop,
    tableHeight,
    rowHeight,
    numberWidth,
    nameWidth,
    fontSize,
    numberSize,
    footerSize,
    tooSmall: fontSize < MIN_READABLE_FONT_MM,
  };
}

/** ミニゲームの印刷の版の大きさ（どれも mm。match-009）。 */
export type TeamsSheetLayout = {
  /** 版の幅 */
  width: number;
  /** 版の高さ */
  height: number;
  /** 題の字の大きさ */
  titleSize: number;
  /** 題の下の説明の字の大きさ */
  subtitleSize: number;
  /** コートの枠の並びの上の端 */
  gridTop: number;
  /** コートの枠の列の数 */
  cols: number;
  /** コートの枠の行の数 */
  rows: number;
  /** コートの枠1つの幅 */
  cellWidth: number;
  /** コートの枠1つの高さ */
  cellHeight: number;
  /** 枠の中の1行の高さ */
  lineHeight: number;
  /** 名前の字の大きさ */
  fontSize: number;
  /** 「コート N」「チーム N」の字の大きさ */
  headSize: number;
  /** 下の「PaletKit で作った試合表」の字の大きさ */
  footerSize: number;
  /** 名前の字が小さすぎて読みにくい（大きい紙をすすめる） */
  tooSmall: boolean;
};

/** ミニゲームの版の、1行の高さと名前の字の大きさの比。 */
const TEAM_LINE_TO_FONT = 1.6;

/**
 * ミニゲームの印刷の版の大きさを決める（コートの枠を並べ、枠の中を2つのチームの列に分ける。紙1枚に収め、字は上限まで）。
 * @param input 紙・コート数・1チームのいちばん多い人数・いちばん長い呼び名の幅
 * @param input.size 紙の大きさ
 * @param input.orientation 向き
 * @param input.courts コート数
 * @param input.members 1チームのいちばん多い人数
 * @param input.longestNameEm いちばん長い呼び名の幅（textWidthEm）
 * @returns 版の大きさ
 */
export function layoutTeamsSheet(input: {
  size: PaperSize;
  orientation: Orientation;
  courts: number;
  members: number;
  longestNameEm: number;
}): TeamsSheetLayout {
  const { width, height } = printableArea(input.size, input.orientation);
  const titleSize = Math.min(height * 0.05, width * 0.07, MAX_TITLE_MM);
  const subtitleSize = Math.max(3, titleSize * 0.4);
  const gridTop = titleSize * 1.3 + subtitleSize * 1.8;
  const footerSize = Math.min(5, Math.max(3, height * 0.012));
  const courts = Math.max(1, input.courts);
  const cols = courts === 1 ? 1 : width > height ? Math.min(3, courts) : 2;
  const rows = Math.ceil(courts / cols);
  const cellWidth = width / cols;
  // 枠の中は「コート N」「チーム N」の2行と、人の行。行の高さは上限までにし、枠は中身の高さに縮める（紙を埋めるまで広げない）
  const lines = Math.max(1, input.members) + 2.5;
  const lineHeight = Math.min(
    (height - gridTop - footerSize * 2) / rows / lines,
    MAX_FONT_MM * TEAM_LINE_TO_FONT,
  );
  const cellHeight = lineHeight * lines;
  const fontSize = Math.min(
    lineHeight / TEAM_LINE_TO_FONT,
    MAX_FONT_MM,
    (cellWidth * 0.45) / Math.max(2, input.longestNameEm),
  );
  const headSize = Math.min(fontSize * 1.1, lineHeight * 0.8);
  return {
    width,
    height,
    titleSize,
    subtitleSize,
    gridTop,
    cols,
    rows,
    cellWidth,
    cellHeight,
    lineHeight,
    fontSize,
    headSize,
    footerSize,
    tooSmall: fontSize < MIN_READABLE_FONT_MM,
  };
}
