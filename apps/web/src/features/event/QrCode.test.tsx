// QR の表示：中身ごとに点の並びが決まり、まわりに4モジュールの余白、一辺は 240px 以上、名前で読み上げる。
import { render, screen } from "@testing-library/react";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { QR_MIN_SIZE, QR_QUIET_ZONE, QrCode, qrPath } from "./QrCode.tsx";

/** 試しの中身。 */
const VALUE =
  "https://miniapp.line.me/1234567890-AbCdEfGh/e/0193a1b2-0000-7000-8000-000000000000/checkin";

describe("QR の表示", () => {
  it("暗い点の数だけ正方形を描き、まわりに4モジュールの余白を空ける", () => {
    const { data, size } = encode(VALUE, { ecc: "M", border: 0 });
    const dark = data.flat().filter(Boolean).length;
    const { d, size: modules } = qrPath(VALUE);
    expect(modules).toBe(size + QR_QUIET_ZONE * 2);
    expect(d.match(/M/g)).toHaveLength(dark);
    // 左上の位置の印（暗い）は、余白のぶんずれた所から始まる
    expect(d.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1z`)).toBe(true);
  });

  it("中身が違えば、点の並びも違う", () => {
    expect(qrPath(VALUE).d).not.toBe(qrPath(VALUE.replace("checkin", "survey")).d);
  });

  it("名前で読み上げ、一辺は 240px より小さくしない", () => {
    render(<QrCode value={VALUE} label="受付QR" size={100} />);
    const image = screen.getByRole("img", { name: "受付QR" });
    expect(image).toHaveAttribute("width", String(QR_MIN_SIZE));
    expect(image).toHaveAttribute("data-qr-value", VALUE);
  });
});
