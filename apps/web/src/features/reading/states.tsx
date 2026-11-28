// 読書記録の画面の読みこみ中と、読みこめなかったときの形（EXPERIENCE.md の「読みこみ」「失敗」）。
// 失敗の文は API の文（利用者の値を含まない）をそのまま出し、「もう一度」で読み直す。
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { errorMessage } from "../../lib/api.ts";

/**
 * 読みこみ中の印。
 * @returns 要素
 */
export function Loading() {
  return (
    <p aria-busy="true" className="text-m text-text-sub">
      読みこんでいます…
    </p>
  );
}

/** LoadError が受け取るもの。 */
export type LoadErrorProps = {
  /** 投げられたもの */
  error: unknown;
  /** 読み直す */
  onRetry: () => void;
};

/**
 * 読みこめなかったときの文と「もう一度」。
 * @param props 投げられたもの（error）・読み直す（onRetry）
 * @returns 要素
 */
export function LoadError({ error, onRetry }: LoadErrorProps) {
  return (
    <div className="flex flex-col items-start gap-xxs">
      <p role="alert" className="text-m text-danger-text">
        {errorMessage(error)}
      </p>
      <ButtonRow>
        <Button onClick={onRetry}>もう一度</Button>
      </ButtonRow>
    </div>
  );
}
