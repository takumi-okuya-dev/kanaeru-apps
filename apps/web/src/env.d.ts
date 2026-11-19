// 組み立てのときに埋める値（vite.config.ts の define）。

/** 画面に出す名前（設定の APP_NAME）。 */
declare const __APP_NAME__: string;

/** LIFF ID（設定の VITE_LIFF_ID。公開してよい値）。空なら LINE につながない仮の LIFF で動く（lib/liff.ts）。 */
declare const __LIFF_ID__: string;
