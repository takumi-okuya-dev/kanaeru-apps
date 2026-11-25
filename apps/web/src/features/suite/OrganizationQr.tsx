// 組織の招待の QR（DESIGN.md の qr-display）。event の QrCode と同じ描き方（suite は event を読めないので写した。
// 2つ目が要るときに lib へ移す候補）。点の並びは uqr で作り、React で SVG の1つの path に描く（HTML の文字を差しこまない）。
import { encode } from "uqr";

/** まわりの余白（モジュールの数）。 */
const QUIET_ZONE = 4;

/** 画面に出すときの最小の一辺（px。DESIGN.md の min-size-screen）。 */
const MIN_SIZE = 240;

/**
 * QR の点の並びを、SVG の path の道筋にする（暗い点ごとに1つの正方形）。
 * @param value QR に入れる文字
 * @returns 道筋と、余白を含めた一辺のモジュールの数
 */
function qrPath(value: string): { d: string; size: number } {
  const { data, size } = encode(value, { ecc: "M", border: 0 });
  const commands: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) commands.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`);
    });
  });
  return { d: commands.join(""), size: size + QUIET_ZONE * 2 };
}

/**
 * 組織の招待の QR。
 * @param props QR に入れる文字（value）・読み上げる名前（label）
 * @param props.value QR に入れる文字（URL）
 * @param props.label 読み上げる名前
 * @returns QR の要素（SVG）
 */
export function OrganizationQr({ value, label }: { value: string; label: string }) {
  const { d, size } = qrPath(value);
  return (
    <svg
      role="img"
      aria-label={label}
      data-qr-value={value}
      viewBox={`0 0 ${size} ${size}`}
      width={MIN_SIZE}
      height={MIN_SIZE}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} className="fill-surface" />
      <path d={d} className="fill-text" />
    </svg>
  );
}
