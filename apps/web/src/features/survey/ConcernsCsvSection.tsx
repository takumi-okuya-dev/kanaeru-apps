// A5（書き出しと削除）に足す節「困りごとをCSVで書き出す」（主催者だけの画面。reception の差しこみの場所。research R11）。
// API が作る BOM つきの CSV を受け取り、保存させる（reception の参加者の CSV と同じ形）。
import type { EventView } from "@workspace/contracts/event";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { errorMessage } from "../../lib/api.ts";
import { downloadConcernsCsv } from "./api.ts";

/**
 * ファイルを保存させる（受け取った中身を、ブラウザの保存にわたす）。
 * @param blob 中身
 * @param filename ファイルの名前
 */
function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 困りごとの CSV の書き出しの節（見出し h2 から始める）。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 節の要素
 */
export function ConcernsCsvSection({ event }: { event: EventView }) {
  const mutation = useMutation({
    mutationFn: () => downloadConcernsCsv(event.id),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });
  return (
    <section aria-labelledby="data-survey-export" className="flex flex-col gap-xs">
      <h2 id="data-survey-export" className="text-l leading-tight font-bold">
        困りごとをCSVで書き出す
      </h2>
      <p className="text-s text-text-sub">
        名前・困りごと・月いくら・テスター・仕事の立場・職種を、Excel で開ける CSV にします。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          aria-disabled={mutation.isPending || undefined}
          onClick={() => {
            if (!mutation.isPending) mutation.mutate();
          }}
        >
          {mutation.isPending ? "書き出しています…" : "困りごとをCSVで書き出す"}
        </Button>
        {mutation.isSuccess ? (
          <ResponseMessage tone="success">{`${mutation.data.filename} を保存しました。`}</ResponseMessage>
        ) : null}
        {mutation.isError ? (
          <ResponseMessage tone="danger">
            {`書き出せませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </section>
  );
}
