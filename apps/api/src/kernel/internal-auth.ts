// 窓口を内側から呼ぶときの利用者の印（core-021・AD-20）。
// 道具（MCP）は、窓口を HTTP の要求で呼ぶ。その要求に、呼んだ利用者と範囲を「プロセスの中の印」として結ぶ。
// 外からの要求には、この印は作れない（対応表は Request の実体に結ぶので、見出しでは偽れない）。
// 札（Bearer）を窓口に流さない理由：MCP の札は /api/mcp 宛て（RFC 8707・FR-007）だから。

/** 印の中身：呼んだ利用者と、その範囲。 */
export type InternalAuth = {
  /** account の ID */
  accountId: string;
  /** 範囲（例 reception:read） */
  scopes: readonly string[];
};

const registry = new WeakMap<Request, InternalAuth>();

/**
 * 窓口を、利用者の印つきで呼ぶ（道具の窓口の呼び出し。kernel の土台だけが使う）。
 * @param app 窓口（組み立てた API）
 * @param request 要求
 * @param auth 利用者と範囲
 * @returns 応答
 */
export function fetchAsInternal(
  app: { request(input: Request): Response | Promise<Response> },
  request: Request,
  auth: InternalAuth,
): Promise<Response> {
  registry.set(request, auth);
  return Promise.resolve(app.request(request));
}

/**
 * 要求についている内側の印を読む（なければ undefined）。
 * @param request 要求（c.req.raw）
 * @returns 印
 */
export function internalAuthOf(request: Request): InternalAuth | undefined {
  return registry.get(request);
}
