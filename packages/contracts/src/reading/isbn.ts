// ISBN の読み方（10桁・13桁・ハイフンと空白あり）。zod を読まない。持つ形は13桁の数字（data-model）。

/**
 * ISBN-13 の確かめの数字。
 * @param first12 先頭の12桁
 * @returns 確かめの数字（0〜9）
 */
function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * 入れた文を ISBN として読む（ハイフンと空白を除いて10桁か13桁。10桁は13桁に直す。確かめの数字が合わなければ読まない）。
 * @param value 入れた文
 * @returns 13桁の数字（ISBN でなければ null）
 */
export function toIsbn13(value: string): string | null {
  const compact = value.replace(/[-\s‐－ー]/gu, "").toUpperCase();
  if (/^97[89]\d{10}$/u.test(compact)) {
    return isbn13CheckDigit(compact.slice(0, 12)) === Number(compact[12]) ? compact : null;
  }
  if (/^\d{9}[\dX]$/u.test(compact)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const digit = compact[i] === "X" ? 10 : Number(compact[i]);
      sum += digit * (10 - i);
    }
    if (sum % 11 !== 0) return null;
    const first12 = `978${compact.slice(0, 9)}`;
    return `${first12}${isbn13CheckDigit(first12)}`;
  }
  return null;
}
