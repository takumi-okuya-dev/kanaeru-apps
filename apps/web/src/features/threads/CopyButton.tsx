// 文をコピーするボタンと結果（外の AI に貼るプロンプトなど。threads-004 の宣伝とリサーチの画面から分けた）。
// ふつうは並べる所のボタン（ButtonRow）として置く。カードの中・欄ごとの小さな操作では small にして、行の中に置く（DESIGN.md の「ボタンの並べ方」）。
import { Button } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
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
  /** 大きさ（既定は並べる所のボタン。カードの中・欄ごとの小さな操作は small） */
  size?: "default" | "small";
};

/**
 * 文をコピーするボタンと結果。
 * @param props 文（text）・名前（label）・できたときの文（successMessage）・大きさ（size）
 * @returns 要素
 */
export function CopyButton({
  text,
  label,
  successMessage = "コピーしました。外の AI に貼ってください。",
  size = "default",
}: CopyButtonProps) {
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string }>();
  const button = (
    <Button
      size={size}
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
  );
  return (
    <div className="flex flex-col items-start gap-xxs">
      {size === "small" ? button : <ButtonRow>{button}</ButtonRow>}
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}
