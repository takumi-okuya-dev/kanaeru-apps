// リポジトリのルート（守りの確かめの手順が、ファイルを読む・命令を流す所）。
import { fileURLToPath } from "node:url";

/** リポジトリのルートの道。 */
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
