// QR（見るだけのページ・受付のページの URL。AD-26・AD-30）。uqr（event と suite も使う依存）で模様を作り、SVG の1つの path で
// 描く（HTML をそのまま差しこまない。印刷の版の SVG の中にも置ける）。形は event の QrCode（DESIGN.md の qr-display：点は text、
// 地は surface、まわりに4モジュールの余白、画面では一辺 240px 以上）にそろえた。印刷の版の中に置くため、領域に写した。
import { encode } from "uqr";

/** QR の模様（1マスを1とした path と、周りの余白を含む一辺のマスの数）。 */
export type QrPattern = {
  /** 黒いマスの path（SVG の d） */
  path: string;
  /** 一辺のマスの数（周りの余白を含む） */
  size: number;
};

/** 周りの余白（マスの数。読み取りに要る静かな帯）。 */
const QUIET_ZONE = 4;

/** 画面に出すときの最小の一辺（px。DESIGN.md の min-size-screen）。 */
const MIN_SCREEN_SIZE = 240;

/**
 * 文字から QR の模様を作る（誤り訂正は M）。
 * @param text 入れる文字（URL）
 * @returns 模様
 */
export function qrPattern(text: string): QrPattern {
  const { data, size } = encode(text, { ecc: "M", border: 0 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    });
  });
  return { path, size: size + QUIET_ZONE * 2 };
}

/**
 * QR の SVG の中身（ほかの SVG の中に置く。左上が 0,0・一辺 size の正方形）。
 * @param props 模様（pattern）・一辺の長さ（size）・左上の位置（x・y）
 * @param props.pattern 模様
 * @param props.size 一辺の長さ（置く先の SVG の単位）
 * @param props.x 左の位置
 * @param props.y 上の位置
 * @returns SVG の要素
 */
export function QrGroup({
  pattern,
  size,
  x,
  y,
}: {
  pattern: QrPattern;
  size: number;
  x: number;
  y: number;
}) {
  const scale = size / pattern.size;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} shapeRendering="crispEdges">
      <rect width={pattern.size} height={pattern.size} className="fill-surface" />
      <path d={pattern.path} className="fill-text" />
    </g>
  );
}

/**
 * QR の画像（画面に出す SVG。一辺 240px）。
 * @param props 入れる文字（text）・読み上げの名前（label）・class（className）
 * @param props.text 入れる文字（URL）
 * @param props.label 読み上げの名前（例：「見るだけのページの QR」）
 * @param props.className 追加の class
 * @returns SVG の要素
 */
export function QrCode({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const pattern = qrPattern(text);
  return (
    <svg
      viewBox={`0 0 ${pattern.size} ${pattern.size}`}
      width={MIN_SCREEN_SIZE}
      height={MIN_SCREEN_SIZE}
      role="img"
      aria-label={label}
      data-qr-value={text}
      className={className}
    >
      <QrGroup pattern={pattern} size={pattern.size} x={0} y={0} />
    </svg>
  );
}
