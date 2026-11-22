// 画面のファイルを返すこと（1つのコンテナで画面と /api を同じ源で返す。AD-8）の入口。
export {
  CAMERA_PATH_PREFIXES,
  HSTS_MAX_AGE_SECONDS,
  HTML_CACHE,
  allowsCamera,
  WEB_CSP_DIRECTIVES,
  isApiPath,
  serveWeb,
  webSecureHeaders,
} from "./web.ts";
