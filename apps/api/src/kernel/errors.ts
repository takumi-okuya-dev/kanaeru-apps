// API のエラー。
// code → 状態の番号はここで決め、文言は @workspace/contracts/core（領域のものは領域の約束）から読む。
// 投げられたものを応答のエラーに読みかえるのは toAppError の1か所（DB に届かないときの 503 DB_UNAVAILABLE も。AD-10）。
import "@hono/zod-openapi";
import {
  CORE_ERROR_MESSAGES,
  ErrorBody as ErrorBodyContract,
  coreErrorMessage,
} from "@workspace/contracts/core";
import type { CoreErrorCode, ErrorBody, FieldError } from "@workspace/contracts/core";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isDbUnavailable } from "./pg-errors.ts";

/** 土台の code と、状態の番号。 */
export const CORE_ERROR_STATUS = {
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DB_UNAVAILABLE: 503,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<CoreErrorCode, ContentfulStatusCode>;

/** 領域のエラーの決め方（code・状態の番号・文言。文言は領域の contracts に置く）。 */
export type DomainErrorSpec = {
  /** 機械が読む印（英語の大文字） */
  code: string;
  /** 状態の番号 */
  status: ContentfulStatusCode;
  /** 画面にそのまま出せる日本語 */
  message: string;
};

/**
 * 決まった形で返すエラー。処理の中で投げると、組み立ての中のエラーの処理が、エラーの本文の形にして返す。
 * 文に利用者の値（名前・メール・入力の値）を入れない。
 */
export class AppError extends Error {
  /** 機械が読む印 */
  readonly code: string;
  /** 状態の番号 */
  readonly status: ContentfulStatusCode;
  /** 入力が合わないときの欄ごとの理由 */
  readonly fields: FieldError[] | undefined;

  /**
   * code から状態の番号と文言を決める（DB_UNAVAILABLE の文は、作った時刻の日本時間で選ぶ。coreErrorMessage）。
   * @param spec 土台の code か、領域のエラーの決め方（@workspace/contracts/<領域> の *_ERRORS の値）
   * @param options 入力が合わないときの欄ごとの理由
   */
  constructor(spec: CoreErrorCode | DomainErrorSpec, options: { fields?: FieldError[] } = {}) {
    const resolved =
      typeof spec === "string"
        ? { code: spec, status: CORE_ERROR_STATUS[spec], message: coreErrorMessage(spec) }
        : spec;
    super(resolved.message);
    this.name = "AppError";
    this.code = resolved.code;
    this.status = resolved.status;
    this.fields = options.fields;
  }
}

/** 状態の番号を、土台の code に読みかえる表（CORE_ERROR_STATUS の逆引き。HTTPException に使う）。 */
const STATUS_TO_CODE: ReadonlyMap<number, CoreErrorCode> = new Map(
  (Object.entries(CORE_ERROR_STATUS) as [CoreErrorCode, number][]).map(([code, status]) => [
    status,
    code,
  ]),
);

/**
 * 投げられたものを、応答に使うエラーに読みかえる（組み立ての onError が呼ぶ。読みかえはここだけに置く）。
 * - AppError はそのまま
 * - HTTPException は、状態の番号に合う土台の code
 * - DB の層（Drizzle の命令・pg の接続）から来た、DB に届かない（拒否・つなぐのが時間切れ・止まっている・切られた）エラーは
 *   503 DB_UNAVAILABLE（どの領域の窓口でも。見分けは kernel/pg-errors.ts の isDbUnavailable）。
 *   LINE への fetch の失敗など、DB の層から来ていないものは読みかえない（領域が扱わなければ INTERNAL）
 * @param error 投げられたもの
 * @returns 応答に使うエラー（予期しないものは undefined。呼ぶ側が INTERNAL にしてログに残す）
 */
export function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error;
  if (error instanceof HTTPException) {
    const code = STATUS_TO_CODE.get(error.status);
    return code ? new AppError(code) : undefined;
  }
  if (isDbUnavailable(error)) return new AppError("DB_UNAVAILABLE");
  return undefined;
}

/**
 * エラーの本文を作る。
 * @param error 返すエラー
 * @param requestId 要求の ID
 * @returns エラーの本文
 */
export function toErrorBody(error: AppError, requestId: string): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  };
}

/** OpenAPI の文書のエラーの本文（約束の形に、文書の名前 Error を付けたもの）。 */
const ErrorBodySchema = ErrorBodyContract.openapi("Error");

/** OpenAPI の文書のエラーの例に入れる、要求の ID（仮の値）。 */
const EXAMPLE_REQUEST_ID = "0193a1b2-0000-7000-8000-000000000000";

/**
 * 道の定義（createRoute）の、エラーの応答の書き方。例（code と文言）も文書に出す。
 * @param code 返す土台の code
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
export function errorResponse(code: CoreErrorCode, description: string) {
  const example: ErrorBody = {
    error: {
      code,
      message: CORE_ERROR_MESSAGES[code],
      requestId: EXAMPLE_REQUEST_ID,
      ...(code === "INVALID_INPUT"
        ? { fields: [{ path: "title", message: "題を入れてください。" }] }
        : {}),
    },
  };
  return {
    description,
    content: { "application/json": { schema: ErrorBodySchema, example } },
  } as const;
}

/**
 * 領域のエラーの応答の書き方（例に、領域の code と文言を出す）。
 * @param spec 領域のエラーの決め方（@workspace/contracts/<領域> の *_ERRORS の値）
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
export function domainErrorResponse(spec: DomainErrorSpec, description: string) {
  const example: ErrorBody = {
    error: { code: spec.code, message: spec.message, requestId: EXAMPLE_REQUEST_ID },
  };
  return {
    description,
    content: { "application/json": { schema: ErrorBodySchema, example } },
  } as const;
}
