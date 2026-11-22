// 試合表の一覧を端末にも置く（電波がない・サーバーが答えないときは、最後に読んだ一覧を出す。match-005）。
// 一覧に入るのは名前・試合の日・組織の名前だけ（呼び名・名簿は入らない）。
import type { MatchTableList } from "@workspace/contracts/match";
import { ApiError, NetworkError } from "../../../lib/api.ts";
import { fetchTables } from "../api.ts";
import { offlineStore } from "./store.ts";

/** 置き場所の鍵。 */
const LIST_KEY = "tableList";

/** 端末に置いた一覧の形。 */
type StoredList = {
  /** 一覧 */
  list: MatchTableList;
  /** 置いた時刻（ミリ秒） */
  savedAt: number;
};

/** 端末に置いた一覧を出しているときの、置いた時刻（ミリ秒）。 */
let deviceListAt: number | undefined;

/**
 * 端末に置いた一覧を出しているか。
 * @returns 置いた時刻（サーバーから読めていれば undefined）
 */
export function tableListDeviceCopyAt(): number | undefined {
  return deviceListAt;
}

/**
 * 試合表の一覧を読む（問い合わせの queryFn）。読めたら端末に置き、電波がなければ最後に読んだ一覧を出す。
 * @returns 一覧
 * @throws {Error} 読めず、端末にも一覧がないとき（もとの誤り）
 */
export async function loadTableList(): Promise<MatchTableList> {
  try {
    const list = await fetchTables();
    deviceListAt = undefined;
    void offlineStore()
      .then((store) => store.writeMeta(LIST_KEY, { list, savedAt: Date.now() }))
      .catch(() => undefined);
    return list;
  } catch (caught) {
    const fallsBack =
      caught instanceof NetworkError || (caught instanceof ApiError && caught.status >= 500);
    if (!fallsBack) throw caught;
    const stored = await (
      await offlineStore()
    )
      .readMeta<StoredList>(LIST_KEY)
      .catch(() => undefined);
    if (!stored) throw caught;
    deviceListAt = stored.savedAt;
    return stored.list;
  }
}
