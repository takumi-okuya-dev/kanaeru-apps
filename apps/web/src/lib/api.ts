// API の呼び出し（Hono の RPC）。型は apps/api/src/client.ts から import type でだけ読む（lint の境界で止める）。
// エラーの本文から code と欄ごとの理由を読み（ApiError）、通信の誤り（応答なし）は NetworkError として分けて投げる。
// 401（未ログイン・セッション切れ）は、onUnauthenticated の受け手に知らせる（account がログインし直す。AD-12）。
import { CORE_ERROR_MESSAGES } from "@workspace/contracts/core";
import type { ErrorBody, FieldError } from "@workspace/contracts/core";
import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { Hono } from "hono";
import type { AppType } from "../../../api/src/client.ts";

/** API が返したエラー（エラーの本文の形）。画面は code で振る舞いを決め、message は表示に使う。 */
export class ApiError extends Error {
  /** 機械が読む印（例：NOT_FOUND） */
  readonly code: string;
  /** 状態の番号 */
  readonly status: number;
  /** 入力が合わないときの欄ごとの理由 */
  readonly fields: FieldError[];
  /** 要求の ID（問い合わせのときに使う） */
  readonly requestId: string | undefined;

  /**
   * エラーの本文から作る。
   * @param status 状態の番号
   * @param body エラーの本文
   */
  constructor(status: number, body: ErrorBody["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.fields = body.fields ?? [];
    this.requestId = body.requestId;
  }
}

/** 通信が届かなかった（応答がない）。入れた値は消さずに、この文を出す。 */
export class NetworkError extends Error {
  /**
   * 通信の誤りから作る。
   * @param cause もとの誤り
   */
  constructor(cause: unknown) {
    super("通信が切れました。つながったら、もう一度お試しください。", { cause });
    this.name = "NetworkError";
  }
}

/**
 * 本文の形がエラーの本文か。
 * @param value 本文
 * @returns エラーの本文なら true
 */
function isErrorBody(value: unknown): value is ErrorBody {
  const error = (value as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return typeof error?.code === "string" && typeof error.message === "string";
}

/** 401 を受けたときの受け手。 */
const unauthenticatedListeners = new Set<(error: ApiError) => void>();

/**
 * API が 401 を返したときに呼ばれる受け手を足す（account の領域がログインし直すために使う）。
 * @param listener 受け手（401 の ApiError を受け取る）
 * @returns 受け手を外す関数
 */
export function onUnauthenticated(listener: (error: ApiError) => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => {
    unauthenticatedListeners.delete(listener);
  };
}

/** request が受け取る応答（Hono の RPC の応答か、ふつうの Response）。 */
type ResponseLike = { ok: boolean; status: number; headers: Headers; json(): Promise<unknown> };

/** RPC の応答の型から、成功したときの本文の型を取り出す（ふつうの Response なら unknown）。 */
type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, infer _F>
    ? S extends SuccessStatusCode
      ? T
      : never
    : unknown;

/**
 * API を呼び、成功なら本文を返す。エラーの本文なら ApiError、応答がなければ NetworkError を投げる。
 * 401 なら、投げる前に onUnauthenticated の受け手に知らせる。
 * @param call API を呼ぶ関数（例：() => api.api.v1.health.$get()）
 * @returns 成功したときの本文（本文がなければ undefined）
 * @throws {ApiError} API がエラーを返したとき
 * @throws {NetworkError} 通信が届かなかったとき
 */
export async function request<R extends ResponseLike>(
  call: () => Promise<R>,
): Promise<SuccessBody<R>> {
  let response: R;
  try {
    response = await call();
  } catch (error) {
    throw new NetworkError(error);
  }
  if (response.status === 204) return undefined as SuccessBody<R>;
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isErrorBody(body)
      ? new ApiError(response.status, body.error)
      : new ApiError(response.status, {
          code: "INTERNAL",
          message: CORE_ERROR_MESSAGES.INTERNAL,
          requestId: response.headers.get("x-request-id") ?? "",
        });
    if (error.status === 401) for (const listener of unauthenticatedListeners) listener(error);
    throw error;
  }
  return body as SuccessBody<R>;
}

/**
 * 画面に出すエラーの文（ApiError と NetworkError はその文、ほかは決まった文）。
 * @param error 投げられたもの
 * @returns 画面に出す文
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return CORE_ERROR_MESSAGES.INTERNAL;
}

/**
 * API の呼び出しの道具を作る（同じ源の /api を呼ぶ）。
 * 型の引数は、土台の道（AppType。既定）か、領域の道（ModuleRoutes["<領域>"]）。
 * @param baseUrl 画面の源（既定は今の画面の源）
 * @returns 型つきの呼び出しの道具
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hono/client の hc と同じ型の制約
export function createApiClient<T extends Hono<any, any, any> = AppType>(
  baseUrl: string = window.location.origin,
) {
  return hc<T>(baseUrl, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, credentials: "same-origin" }),
  });
}
