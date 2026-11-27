// 分けたプロンプトのコピー：主のボタンにするのは、まだコピーしていないもののうち最初の1つだけ（DESIGN.md「1つのまとまりに主は1つ」）。

/**
 * 主のボタンにする部分の番号を決める。
 * @param count 部分の数
 * @param copied コピーした部分の番号
 * @returns 主にする番号（全部コピーしたら undefined）
 */
export function nextPartToCopy(count: number, copied: ReadonlySet<number>): number | undefined {
  for (let index = 0; index < count; index += 1) {
    if (!copied.has(index)) return index;
  }
  return undefined;
}
