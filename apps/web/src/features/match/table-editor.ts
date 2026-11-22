// 試合表を直して送る（担当の端末だけ。AD-28）。
// - 直すと、画面の中身（問い合わせの入れ物）をすぐ書きかえ、送りを順に1つずつ送る（前の送りの答えを待つ。古い順）
// - 送りは、最後にサーバーが受けた版（もとにした版）と、変更の ID（乱数）を付ける。答えの版を次の送りのもとにする
// - 送りの列は試合表ごとに1つで、画面（名簿と設定・試合表・印刷）をまたいで続く（画面を移っても、送りの途中の版がずれない）
// - 409（ほかの端末が直した・担当が替わった）などで送れなかったら、残りの送りを止めて知らせ、サーバーの試合表を読み直す。
//   読み直している間は直せない（古い中身から作った変更で、サーバーの新しい中身を上書きしないため）
//   （ネットなしで端末に残して送り直すのは、ネットなしで開く段〈AD-27〉で足す【仮決め】research R5）
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
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
  /**
   * 直す（中身とくじの種を受け取って、新しい中身とくじの種を返す関数を渡す。同じ呼び出しの中で1度だけ呼ぶ）。
   * 読みこむ前と、送れなかったあとに読み直している間は直さず false を返す
   */
  apply: (change: (draft: TableDraft) => TableDraft) => boolean;
  /** この端末を担当の端末にする */
  claim: () => Promise<void>;
};

/** 試合表ごとの送りの列。 */
type Queue = {
  /** 送りの鎖（前の送りが終わってから次を送る） */
  chain: Promise<void>;
  /** 最後にサーバーが受けた版（まだ知らなければ undefined） */
  confirmed: number | undefined;
  /** 送っていない・送っている途中の数 */
  pending: number;
  /** 世代（送れなかったとき・担当を受け取ったときに上げ、前の世代の送りを捨てる） */
  generation: number;
  /** 読み直している途中か（この間は直せない） */
  recovering: boolean;
  /** 送りの状態 */
  save: SaveState;
  /** 状態の変わり目を知らせる相手 */
  listeners: Set<() => void>;
};

/** 試合表ごとの送りの列（画面をまたいで1つ）。 */
const queues = new Map<string, Queue>();

/**
 * 試合表の送りの列を返す（なければ作る）。
 * @param tableId 試合表の ID
 * @returns 送りの列
 */
function queueOf(tableId: string): Queue {
  let queue = queues.get(tableId);
  if (!queue) {
    queue = {
      chain: Promise.resolve(),
      confirmed: undefined,
      pending: 0,
      generation: 0,
      recovering: false,
      save: { status: "saved" },
      listeners: new Set(),
    };
    queues.set(tableId, queue);
  }
  return queue;
}

/**
 * 送りの状態を変えて知らせる。
 * @param queue 送りの列
 * @param save 新しい状態
 */
function setSave(queue: Queue, save: SaveState): void {
  queue.save = save;
  for (const listener of queue.listeners) listener();
}

/**
 * 送れなかったあと：残りの送りを止め、サーバーの試合表を読み直す（読み直すまで直せない）。
 * @param queryClient TanStack Query の入れ物
 * @param tableId 試合表の ID
 * @param queue 送りの列
 * @param message 知らせる文
 */
async function recover(
  queryClient: QueryClient,
  tableId: string,
  queue: Queue,
  message: string,
): Promise<void> {
  const key = MATCH_QUERY_KEYS.table(tableId);
  queue.generation += 1;
  queue.recovering = true;
  setSave(queue, { status: "failed", message });
  try {
    await queryClient.invalidateQueries({ queryKey: key });
    queue.confirmed = queryClient.getQueryData<MatchTable>(key)?.version;
  } finally {
    queue.recovering = false;
    for (const listener of queue.listeners) listener();
  }
}

/**
 * 試合表を読み、直して送る道具。
 * @param tableId 試合表の ID
 * @returns 試合表を直す道具
 */
export function useTableEditor(tableId: string): TableEditor {
  const queryClient = useQueryClient();
  const query = useMatchTable(tableId);
  const queue = queueOf(tableId);
  const save = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        queue.listeners.add(listener);
        return () => queue.listeners.delete(listener);
      },
      [queue],
    ),
    () => queue.save,
  );

  // 読みこんだ（読み直した）版を、次の送りのもとにする（送っている途中は答えの版を使う）
  const loadedVersion = query.data?.version;
  useEffect(() => {
    if (loadedVersion !== undefined && queue.pending === 0 && !queue.recovering) {
      queue.confirmed = Math.max(queue.confirmed ?? 0, loadedVersion);
    }
  }, [loadedVersion, queue]);

  const apply = useCallback(
    (change: (draft: TableDraft) => TableDraft) => {
      const key = MATCH_QUERY_KEYS.table(tableId);
      const current = queryClient.getQueryData<MatchTable>(key);
      if (!current || queue.recovering) return false;
      const next = change({ content: current.content, seed: current.seed });
      queryClient.setQueryData<MatchTable>(key, { ...current, ...next });
      queue.pending += 1;
      setSave(queue, { status: "saving" });
      const mine = queue.generation;
      queue.chain = queue.chain.then(async () => {
        try {
          if (mine !== queue.generation) return;
          const saved = await saveTable(tableId, {
            deviceId: deviceId(),
            baseVersion: queue.confirmed ?? current.version,
            changeId: crypto.randomUUID(),
            seed: next.seed,
            content: next.content,
          });
          if (mine !== queue.generation) return;
          queue.confirmed = saved.version;
          if (queue.pending === 1) {
            queryClient.setQueryData<MatchTable>(key, saved);
            setSave(queue, { status: "saved" });
          }
        } catch (caught) {
          if (mine !== queue.generation) return;
          await recover(queryClient, tableId, queue, errorMessage(caught));
        } finally {
          queue.pending -= 1;
        }
      });
      return true;
    },
    [queryClient, queue, tableId],
  );

  const claim = useCallback(async () => {
    const taken = await takeEditor(tableId, deviceId());
    queue.generation += 1;
    queue.confirmed = taken.version;
    queryClient.setQueryData<MatchTable>(MATCH_QUERY_KEYS.table(tableId), taken);
    setSave(queue, { status: "saved" });
  }, [queryClient, queue, tableId]);

  return {
    query,
    isEditor: query.data?.editorDeviceId === deviceId(),
    save,
    apply,
    claim,
  };
}
