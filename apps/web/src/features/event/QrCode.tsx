// QR の表示（DESIGN.md の qr-display。research R8）。
// 点の並びは uqr（依存なし）で作り、React で SVG の1つの path に描く（HTML の文字を差しこまない）。
// 点は {colors.text}、地は {colors.surface}。墨や色つきにしない。まわりに4モジュール分の余白を必ず空ける。
import { encode } from "uqr";

/** まわりの余白（モジュールの数）。 */
export const QR_QUIET_ZONE = 4;

/** 画面に出すときの最小の一辺（px。DESIGN.md の min-size-screen）。 */
export const QR_MIN_SIZE = 240;

/**
 * QR の点の並びを、SVG の path の道筋にする（暗い点ごとに1つの正方形）。
 * @param value QR に入れる文字
 * @returns 道筋と、余白を含めた一辺のモジュールの数
 */
export function qrPath(value: string): { d: string; size: number } {
  const { data, size } = encode(value, { ecc: "M", border: 0 });
  const commands: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) commands.push(`M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`);
    });
  });
  return { d: commands.join(""), size: size + QR_QUIET_ZONE * 2 };
}

/** QR が受け取るもの。 */
export type QrCodeProps = {
  /** QR に入れる文字（URL） */
  value: string;
  /** 読み上げる名前（例：受付QR） */
  label: string;
  /** 一辺の大きさ（px。既定は 240。これより小さくしない） */
  size?: number;
  /** 追加の class */
  className?: string;
};

/**
 * QR。
 * @param props 中身（value）・読み上げる名前（label）・大きさ（size）
 * @returns QR の要素（SVG）
 */
export function QrCode({ value, label, size = QR_MIN_SIZE, className }: QrCodeProps) {
  const { d, size: modules } = qrPath(value);
  const side = Math.max(size, QR_MIN_SIZE);
  return (
    <svg
      role="img"
      aria-label={label}
      data-qr-value={value}
      viewBox={`0 0 ${modules} ${modules}`}
      width={side}
      height={side}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={modules} height={modules} className="fill-surface" />
      <path d={d} className="fill-text" />
    </svg>
  );
}
