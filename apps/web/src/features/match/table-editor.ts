// 試合表を直して送る（担当の端末だけ。AD-28）。
// - 直すと、画面の中身（問い合わせの入れ物）をすぐ書きかえ、送りを順に1つずつ送る（前の送りの答えを待つ。古い順）
// - 送りは、最後にサーバーが受けた版（もとにした版）と、変更の ID（乱数）を付ける。答えの版を次の送りのもとにする
// - 409（ほかの端末が直した・担当が替わった）などで送れなかったら、残りの送りを止めて知らせ、サーバーの試合表を読み直す
//   （ネットなしで端末に残して送り直すのは、ネットなしで開く段〈AD-27〉で足す【仮決め】research R5）
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveTable, takeEditor } from "./api.ts";
import { deviceId } from "./device.ts";
import { MATCH_QUERY_KEYS, useMatchTable } from "./queries.ts";

/** 送りの状態。 */
export type SaveState =
  { status: "saved" } | { status: "saving" } | { status: "failed"; message: string };

/** 直す内容（中身とくじの種）。 */
export type TableDraft = { content: MatchTableContent; seed: number };

/** useTableEditor が返すもの。 */
export type TableEditor = {
  /** 試合表の問い合わせ */
  query: ReturnType<typeof useMatchTable>;
  /** この端末が担当の端末か */
  isEditor: boolean;
  /** 送りの状態 */
  save: SaveState;
  /** 直す（中身とくじの種を受け取って、新しい中身とくじの種を返す関数を渡す） */
  apply: (change: (draft: TableDraft) => TableDraft) => void;
  /** この端末を担当の端末にする */
  claim: () => Promise<void>;
};

/**
 * 試合表を読み、直して送る道具。
 * @param tableId 試合表の ID
 * @returns 試合表を直す道具
 */
export function useTableEditor(tableId: string): TableEditor {
  const queryClient = useQueryClient();
  const query = useMatchTable(tableId);
  const key = MATCH_QUERY_KEYS.table(tableId);
  const [save, setSave] = useState<SaveState>({ status: "saved" });
  const confirmed = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const generation = useRef(0);

  // 読みこんだ（読み直した）版を、次の送りのもとにする（送っている途中は答えの版を使う）
  const loadedVersion = query.data?.version;
  useEffect(() => {
    if (loadedVersion !== undefined && pending.current === 0) confirmed.current = loadedVersion;
  }, [loadedVersion]);

  const apply = useCallback(
    (change: (draft: TableDraft) => TableDraft) => {
      const current = queryClient.getQueryData<MatchTable>(key);
      if (!current) return;
      const next = change({ content: current.content, seed: current.seed });
      queryClient.setQueryData<MatchTable>(key, { ...current, ...next });
      pending.current += 1;
      setSave({ status: "saving" });
      const mine = generation.current;
      chain.current = chain.current.then(async () => {
        try {
          if (mine !== generation.current) return;
          const saved = await saveTable(tableId, {
            deviceId: deviceId(),
            baseVersion: confirmed.current ?? current.version,
            changeId: crypto.randomUUID(),
            seed: next.seed,
            content: next.content,
          });
          confirmed.current = saved.version;
          if (pending.current === 1) {
            queryClient.setQueryData<MatchTable>(key, saved);
            setSave({ status: "saved" });
          }
        } catch (caught) {
          if (mine !== generation.current) return;
          // 残りの送りを止め、サーバーの試合表を読み直す
          generation.current += 1;
          setSave({ status: "failed", message: errorMessage(caught) });
          await queryClient.invalidateQueries({ queryKey: key });
          confirmed.current = queryClient.getQueryData<MatchTable>(key)?.version;
        } finally {
          pending.current -= 1;
        }
      });
    },
    [key, queryClient, tableId],
  );

  const claim = useCallback(async () => {
    const taken = await takeEditor(tableId, deviceId());
    generation.current += 1;
    confirmed.current = taken.version;
    queryClient.setQueryData<MatchTable>(key, taken);
    setSave({ status: "saved" });
  }, [key, queryClient, tableId]);

  return {
    query,
    isEditor: query.data?.editorDeviceId === deviceId(),
    save,
    apply,
    claim,
  };
}
