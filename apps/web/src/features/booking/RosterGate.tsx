// 名簿の画面（A2・A3・S1）の入口の確かめ：使い方が「名簿を使う」の交流会だけ中身を出し、ほかは案内を出す（booking-001 research R1）。
import type { EventView } from "@workspace/contracts/event";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { useBookingSetting } from "./queries.ts";

/**
 * 名簿を使っていない交流会の案内（名簿を使う交流会なら中身を出す）。
 * @param props 交流会（event）・中身（children）
 * @param props.event 交流会（役目つき）
 * @param props.children 名簿を使う交流会で出す中身
 * @returns 画面の要素
 */
export function RosterGate({ event, children }: { event: EventView; children: React.ReactNode }) {
  const setting = useBookingSetting(event.id);
  if (setting.isPending) {
    return (
      <p role="status" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (setting.isError)
    return <ResponseMessage tone="danger">{errorMessage(setting.error)}</ResponseMessage>;
  if (setting.data.mode !== "roster") {
    return (
      <Page title="名簿" lead={event.name}>
        <p className="text-m">
          {event.myRole === "organizer"
            ? "この交流会は名簿を使っていません。準備の画面の「使い方」で「名簿を使う」を選ぶと使えます。"
            : "この交流会は名簿を使っていません。"}
        </p>
        {event.myRole === "organizer" ? (
          <Link
            to="/admin/events/$eventId/setup"
            params={{ eventId: event.id }}
            className={cn(buttonVariants({ variant: "secondary" }), "self-start")}
          >
            準備の画面を開く
          </Link>
        ) : null}
      </Page>
    );
  }
  return children;
}
