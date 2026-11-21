// 試合表を直して送る（担当の端末だけ。AD-28）。
// - 直すと、画面の中身（問い合わせの入れ物）をすぐ書きかえ、端末（IndexedDB）に中身と変更を置いてから、古い順に1つずつ送る
//   （送りの列は offline/outbox.ts。試合表ごとに1つで、画面〈名簿と設定・試合表・印刷〉をまたいで続く）
// - 変更は、もとにした版と変更の ID（乱数）を付けて送る。電波がない間は端末に残し、つながったら古い順に送る（match-005。
//   match-002 research R5 の「端末に残さない」を変えた）。送り直しても同じ変更の ID なので二重にならない
// - 409（ほかの端末が直した・担当が替わった）などで送れなかったら、送りを止めて変更を端末に残し、知らせる。サーバーの中身を
//   読み直して出し、運営が「この端末の変更を捨てる」か「この端末の変更で上書きする」を選ぶまで直せない（AD-28）
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchTable, takeEditor } from "./api.ts";
import { deviceId } from "./device.ts";
import type { OutboxState } from "./offline/outbox.ts";
import { markSending, rememberTable, tableSync } from "./offline/table-sync.ts";
import { MATCH_QUERY_KEYS, useMatchTable } from "./queries.ts";

/** 送りの状態（送りの列の状態）。 */
export type SaveState = OutboxState;

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
  /** 端末に置いた中身を出しているなら、その時刻（ミリ秒。サーバーから読めていれば undefined） */
  deviceCopyAt: number | undefined;
  /** 送っていない変更を送り終えたあとにサーバーが持つ版（電波なしで渡す QR に入れる。読みこむ前は undefined） */
  expectedVersion: number | undefined;
  /**
   * 直す（中身とくじの種を受け取って、新しい中身とくじの種を返す関数を渡す。同じ呼び出しの中で1度だけ呼ぶ）。
   * 読みこむ前と、送りを止めている（held）間は直さず false を返す
   */
  apply: (change: (draft: TableDraft) => TableDraft) => boolean;
  /** この端末を担当の端末にする */
  claim: () => Promise<void>;
  /** 送りを止めたあと：この端末の送っていない変更を捨て、サーバーの中身に戻す */
  discard: () => Promise<void>;
  /** 送りを止めたあと：この端末の最後の中身で、サーバーの今の中身を上書きする（担当の端末だけ） */
  overwrite: () => Promise<void>;
};

/**
 * 試合表を読み、直して送る道具。
 * @param tableId 試合表の ID
 * @returns 試合表を直す道具
 */
export function useTableEditor(tableId: string): TableEditor {
  const queryClient = useQueryClient();
  const query = useMatchTable(tableId);
  const sync = tableSync(tableId);
  const subscribe = useCallback(
    (listener: () => void) => {
      sync.listeners.add(listener);
      return () => sync.listeners.delete(listener);
    },
    [sync],
  );
  const save = useSyncExternalStore(subscribe, () => sync.state);
  const deviceCopyAt = useSyncExternalStore(subscribe, () => sync.deviceCopyAt);
  const key = MATCH_QUERY_KEYS.table(tableId);

  // 送り終えたらサーバーの答え（札の状態などを含む）を入れ、送りを止めたらサーバーの中身を読み直す
  useEffect(() => {
    const queryKey = MATCH_QUERY_KEYS.table(tableId);
    sync.onSent = (saved, remaining) => {
      const current = queryClient.getQueryData<MatchTable>(queryKey);
      const next =
        remaining === 0 ? saved : current ? { ...current, version: saved.version } : saved;
      queryClient.setQueryData<MatchTable>(queryKey, next);
      rememberTable(next);
    };
    sync.onHeld = () => void queryClient.invalidateQueries({ queryKey });
    // つながったら送り直す（送るものがなく、端末の中身を出しているときは読み直す）
    const online = () => {
      if (sync.outbox.count() === 0 && sync.deviceCopyAt !== undefined) {
        void queryClient.invalidateQueries({ queryKey });
      }
      void sync.outbox.flush();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [queryClient, sync, tableId]);

  // 読みこんだ（読み直した）版を、次の送りのもとにする（送っていない変更があるときは、変更のもとの版を使う）
  const loadedVersion = query.data?.version;
  useEffect(() => {
    if (loadedVersion !== undefined && deviceCopyAt === undefined) {
      sync.outbox.observe(loadedVersion);
    }
  }, [deviceCopyAt, loadedVersion, sync]);

  const apply = useCallback(
    (change: (draft: TableDraft) => TableDraft) => {
      const current = queryClient.getQueryData<MatchTable>(key);
      if (!current || sync.outbox.isHeld()) return false;
      const next = change({ content: current.content, seed: current.seed });
      const table = { ...current, ...next };
      queryClient.setQueryData<MatchTable>(key, table);
      markSending(sync);
      rememberTable(table);
      void sync.outbox.enqueue(next, current.version);
      return true;
    },
    [key, queryClient, sync],
  );

  const claim = useCallback(async () => {
    const taken = await takeEditor(tableId, deviceId());
    sync.outbox.reset(taken.version);
    // 送っていない変更が残っていれば（前に担当でなくなった端末）、止めたまま残し、運営に選んでもらう
    if (sync.outbox.count() === 0) {
      queryClient.setQueryData<MatchTable>(key, taken);
      rememberTable(taken);
    } else {
      queryClient.setQueryData<MatchTable>(key, (current) =>
        current ? { ...current, editorDeviceId: taken.editorDeviceId } : taken,
      );
    }
  }, [key, queryClient, sync, tableId]);

  const discard = useCallback(async () => {
    await sync.outbox.discard();
    await queryClient.invalidateQueries({ queryKey: key });
  }, [key, queryClient, sync]);

  const overwrite = useCallback(async () => {
    const latest = sync.outbox.latest();
    if (!latest) return;
    const server = await fetchTable(tableId);
    queryClient.setQueryData<MatchTable>(key, {
      ...server,
      content: latest.content,
      seed: latest.seed,
    });
    await sync.outbox.overwrite(server.version);
  }, [key, queryClient, sync, tableId]);

  return {
    query,
    isEditor: query.data?.editorDeviceId === deviceId(),
    save,
    deviceCopyAt,
    expectedVersion:
      query.data === undefined
        ? undefined
        : Math.max(sync.outbox.expectedVersion() ?? 0, query.data.version),
    apply,
    claim,
    discard,
    overwrite,
  };
}
