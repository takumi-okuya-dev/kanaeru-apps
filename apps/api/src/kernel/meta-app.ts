// アプリの Meta のアプリ（設定 THREADS_APP_ID・THREADS_APP_SECRET）の道具。秘密の値は領域に渡さず、使う形だけを渡す
// （kernel/http.ts の DomainRouteDeps.metaApp。秘密の箱・定期の仕事の合言葉と同じ考え方）。
// - Meta の Webhook の signed_request（「base64url の署名.base64url の JSON」。署名は秘密の値による HMAC-SHA256）を確かめる
// - トークンの交換の要求の値に、アプリの ID と秘密の値を足す（Threads の API への要求にだけ使う）
import { createHmac, timingSafeEqual } from "node:crypto";

/** 確かめた signed_request の中身。 */
export type SignedRequestPayload = {
  /** Threads のユーザーの ID */
  userId: string;
  /** Meta が知らせを出した時刻（なければ undefined） */
  issuedAt: Date | undefined;
};

/** Meta のアプリの道具。 */
export type MetaApp = {
  /** アプリの ID（秘密ではない。認可の URL に入る） */
  appId: string;
  /**
   * signed_request を確かめて中身を返す。形・署名・中身が合わなければ null。
   * @param signedRequest Meta から受け取った値
   * @returns 中身か null
   */
  verifySignedRequest(signedRequest: string): SignedRequestPayload | null;
  /**
   * トークンの交換の要求の値に、client_id と client_secret を足す。
   * @param params 要求の値
   * @returns 足した値（Threads の API への要求にだけ使う。ログに出さない）
   */
  withClientCredentials(params: Record<string, string>): URLSearchParams;
};

/**
 * base64url を読む。
 * @param value base64url の文字
 * @returns バイト
 */
function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Meta のアプリの道具を作る。
 * @param app アプリの ID と秘密の値（設定。なければ undefined）
 * @returns 道具（設定がなければ undefined）
 */
export function createMetaApp(
  app: { appId: string; appSecret: string } | undefined,
): MetaApp | undefined {
  if (!app) return undefined;
  const { appId, appSecret } = app;
  return {
    appId,
    verifySignedRequest(signedRequest) {
      const parts = signedRequest.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      const [signaturePart, payloadPart] = parts as [string, string];
      const expected = createHmac("sha256", appSecret).update(payloadPart).digest();
      const signature = fromBase64Url(signaturePart);
      if (signature.length !== expected.length || !timingSafeEqual(signature, expected))
        return null;
      let payload: unknown;
      try {
        payload = JSON.parse(fromBase64Url(payloadPart).toString("utf8"));
      } catch {
        return null;
      }
      if (typeof payload !== "object" || payload === null) return null;
      const record = payload as Record<string, unknown>;
      if (
        record.algorithm !== undefined &&
        (typeof record.algorithm !== "string" || record.algorithm.toUpperCase() !== "HMAC-SHA256")
      )
        return null;
      const userId = record.user_id;
      if (typeof userId !== "string" && typeof userId !== "number") return null;
      return {
        userId: String(userId),
        issuedAt:
          typeof record.issued_at === "number" ? new Date(record.issued_at * 1000) : undefined,
      };
    },
    withClientCredentials(params) {
      return new URLSearchParams({ ...params, client_id: appId, client_secret: appSecret });
    },
  };
}

/**
 * テストと偽の Meta のための signed_request を作る（本番のコードは使わない）。
 * @param appSecret 秘密の値
 * @param payload 中身
 * @returns signed_request
 */
export function signRequestForTest(appSecret: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", appSecret).update(body).digest("base64url");
  return `${signature}.${body}`;
}
