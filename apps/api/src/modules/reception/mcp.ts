// 受付の MCP の道具（core-021・AD-20）。道具は窓口（画面と同じ HTTP の道）を呼ぶだけ。権限は窓口の守りが決める。
// 最初の道具は「自分のチェックイン」（参加者が自分の記録を読む）。範囲は reception:read。
import { z } from "zod";
import type { McpTool } from "../../kernel/mcp-tool.ts";

/**
 * 受付の道具の一覧（組み立てが集める）。
 * @returns 道具
 */
export function mcpTools(): readonly McpTool[] {
  return [
    {
      name: "reception_my_checkin",
      description: "交流会（eventId）での、ログインした本人のチェックインを読む。まだなら null。",
      access: "read",
      requiredScope: "reception:read",
      inputSchema: z.object({ eventId: z.uuid() }),
      run: async (input, ctx) => {
        const { eventId } = input as { eventId: string };
        const response = await ctx.request(`/api/v1/events/${eventId}/checkins/me`);
        if (!response.ok) throw new Error(`窓口が ${response.status} を返しました`);
        return response.text();
      },
    },
  ];
}
