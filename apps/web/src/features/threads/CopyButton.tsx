// 文をコピーするボタンと結果（外の AI に貼るプロンプトなど。threads-004 の宣伝とリサーチの画面から分けた）。
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";

/** CopyButton が受け取るもの。 */
export type CopyButtonProps = {
  /** コピーする文 */
  text: string;
  /** ボタンの名前 */
  label: string;
  /** コピーできたときの文（既定は外の AI に貼る案内） */
  successMessage?: string;
};

/**
 * 文をコピーするボタンと結果。
 * @param props 文（text）・名前（label）・できたときの文（successMessage）
 * @returns 要素
 */
export function CopyButton({
  text,
  label,
  successMessage = "コピーしました。外の AI に貼ってください。",
}: CopyButtonProps) {
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  return (
    <div className="flex flex-col items-start gap-xxs">
      <Button
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => setResult({ tone: "success", message: successMessage }),
            () =>
              setResult({
                tone: "danger",
                message: "コピーできませんでした。欄の文を選んで、手でコピーしてください。",
              }),
          );
        }}
      >
        {label}
      </Button>
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}
