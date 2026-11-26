// MCP の宛先（RFC 8707 の resource）の正規の形（FR-007・AD-21）。
// kanaeru の宛先は必ず「画面の源 + /api/mcp」。末尾のスラッシュ・大文字の源・別の道は受けない。
/**
 * 画面の源（設定 WEB_URL）から、正規の宛先の文字列を作る。
 * @param webUrl 設定の画面の URL（例 https://kanaeru.example）
 * @returns 正規の宛先（例 https://kanaeru.example/api/mcp）
 */
export function canonicalMcpResource(webUrl: string): string {
  return `${new URL(webUrl).origin}/api/mcp`;
}

/**
 * 要求の resource が、この kanaeru の /api/mcp か。
 * @param resource 要求の resource（省略されていれば空の文字列）
 * @param webUrl 設定の画面の URL
 * @returns 正規の宛先と完全一致なら true
 */
export function isCanonicalMcpResource(resource: string, webUrl: string): boolean {
  return resource === canonicalMcpResource(webUrl);
}
