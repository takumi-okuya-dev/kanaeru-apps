// 秘密の箱（構成の決めごと AD-18：業務を知らず、状態を持たない技術の道具）。外のサービスのトークンなどを DB に持つ前に包む。
// - AES-256-GCM（Web Crypto）。開けるときに同じ「ひもづけ」（AAD。例：記録の ID）が要るので、包んだ値を別の行へ写しても開けない
// - IV は包むたびに12バイトを新しく作る（使い回さない）
// - 鍵は版ごとの鍵の束（{"1":"<32バイトの base64>"}）。包むときは今の版を使い、開けるときは包んだ版を使う（鍵を替えても古い値を開ける）
// 業務の言葉やほかの包みを読まない（eslint.config.js で止める）。鍵・平文をエラーの文に入れない。

/** 鍵の束の形が合わない・今の版の鍵がない・包んだ版の鍵がないときのエラー（文に鍵の値を入れない）。 */
export class KeyRingError extends Error {
  /**
   * エラーを作る。
   * @param message 何が合わないか（日本語）
   */
  constructor(message: string) {
    super(message);
    this.name = "KeyRingError";
  }
}

/** 包んだ値（暗号文・IV・包んだ鍵の版）。DB にはこの3つを持つ。 */
export type SealedValue = {
  /** 暗号文（認証のしるしを含む） */
  ciphertext: Uint8Array;
  /** 包むたびに作る12バイト */
  iv: Uint8Array;
  /** 包んだ鍵の版 */
  keyVersion: number;
};

/** 秘密の箱。 */
export type SecretBox = {
  /** 今の鍵の版（包むときに使う） */
  readonly currentVersion: number;
  /**
   * 包む。
   * @param plaintext 包む値
   * @param binding ひもづけ（開けるときにも同じ値が要る）
   * @returns 包んだ値
   */
  seal(plaintext: string, binding: string): Promise<SealedValue>;
  /**
   * 開ける。
   * @param sealed 包んだ値
   * @param binding 包んだときのひもづけ
   * @returns もとの値
   * @throws {KeyRingError} 包んだ版の鍵がないとき
   * @throws {Error} ひもづけが違う・暗号文が書きかえられているとき（Web Crypto の OperationError）
   */
  open(sealed: SealedValue, binding: string): Promise<string>;
};

/** IV の長さ（バイト）。 */
const IV_BYTES = 12;

/** 鍵の長さ（バイト。AES-256）。 */
const KEY_BYTES = 32;

/** base64 の形。 */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * base64 をバイトにする。
 * @param value base64
 * @returns バイト（形が合わなければ null）
 */
function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64.test(value) || value.length % 4 !== 0) return null;
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * 鍵の束を読む。
 * @param keyRingJson 版ごとの鍵の JSON（{"1":"<32バイトの base64>"}）
 * @returns 版と鍵の組
 * @throws {KeyRingError} 形が合わないとき
 */
function parseKeyRing(keyRingJson: string): Map<number, Uint8Array<ArrayBuffer>> {
  let raw: unknown;
  try {
    raw = JSON.parse(keyRingJson);
  } catch {
    throw new KeyRingError('鍵の束は {"1":"<32バイトの base64>"} の形の JSON にしてください。');
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new KeyRingError('鍵の束は {"1":"<32バイトの base64>"} の形の JSON にしてください。');
  }
  const ring = new Map<number, Uint8Array<ArrayBuffer>>();
  for (const [version, value] of Object.entries(raw)) {
    const number = Number(version);
    if (!/^[1-9]\d{0,4}$/.test(version) || typeof value !== "string") {
      throw new KeyRingError(`鍵の版「${version}」は1以上の整数にし、鍵は文字で書いてください。`);
    }
    const bytes = fromBase64(value);
    if (!bytes || bytes.length !== KEY_BYTES) {
      throw new KeyRingError(
        `版 ${number} の鍵は、${KEY_BYTES}バイトを base64 にした文字にしてください。`,
      );
    }
    ring.set(number, bytes);
  }
  if (ring.size === 0) throw new KeyRingError("鍵の束に、鍵を1つ以上入れてください。");
  return ring;
}

/**
 * 鍵の束と今の版を確かめて、秘密の箱を作る（設定の確かめにも使う）。
 * @param keyRingJson 版ごとの鍵の JSON（{"1":"<32バイトの base64>"}）
 * @param currentVersion 今の鍵の版（包むときに使う）
 * @returns 秘密の箱
 * @throws {KeyRingError} 鍵の束の形が合わない・今の版の鍵がないとき
 */
export function createSecretBox(keyRingJson: string, currentVersion: number): SecretBox {
  const ring = parseKeyRing(keyRingJson);
  if (!ring.has(currentVersion)) {
    throw new KeyRingError(`今の鍵の版 ${currentVersion} が、鍵の束にありません。`);
  }
  const imported = new Map<number, Promise<CryptoKey>>();
  const encoder = new TextEncoder();

  /**
   * 版の鍵を読みこむ（1回だけ）。
   * @param version 鍵の版
   * @returns 鍵
   * @throws {KeyRingError} その版の鍵がないとき
   */
  const keyFor = (version: number): Promise<CryptoKey> => {
    const raw = ring.get(version);
    if (!raw) throw new KeyRingError(`鍵の版 ${version} が、鍵の束にありません。`);
    let key = imported.get(version);
    if (!key) {
      key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
      imported.set(version, key);
    }
    return key;
  };

  return {
    currentVersion,
    async seal(plaintext, binding) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(binding) },
        await keyFor(currentVersion),
        encoder.encode(plaintext),
      );
      return { ciphertext: new Uint8Array(ciphertext), iv, keyVersion: currentVersion };
    },
    async open(sealed, binding) {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(sealed.iv),
          additionalData: encoder.encode(binding),
        },
        await keyFor(sealed.keyVersion),
        new Uint8Array(sealed.ciphertext),
      );
      return new TextDecoder().decode(plaintext);
    },
  };
}
