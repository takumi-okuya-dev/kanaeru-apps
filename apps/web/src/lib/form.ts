// 入力の欄の誤りの扱い（EXPERIENCE.md 3「入力の誤り」）：送ったときに、約束（zod）で確かめた誤りと、API が返した欄ごとの理由を
// 欄の名前ごとにまとめ、最初の誤りの欄にフォーカスを移す。
import type { z } from "zod";
import { ApiError } from "./api.ts";

/** 欄の名前ごとの誤りの文。 */
export type FieldErrors = Record<string, string>;

/**
 * zod の誤りを、欄の名前ごとの文にする（同じ欄の2つ目からは捨てる）。
 * @param issues zod の誤り
 * @returns 欄の名前ごとの文
 */
export function fieldErrorsFromIssues(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    errors[path] ??= issue.message;
  }
  return errors;
}

/**
 * API のエラーから、欄の名前ごとの文を取り出す（欄ごとの理由がなければ空）。
 * @param error 投げられたもの
 * @returns 欄の名前ごとの文
 */
export function fieldErrorsFromApi(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const errors: FieldErrors = {};
  for (const field of error.fields) errors[field.path] ??= field.message;
  return errors;
}

/**
 * フォームの中で、最初に誤りのある欄（aria-invalid）にフォーカスを移す。描き直したあとに呼ぶ。
 * @param form フォーム
 */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
