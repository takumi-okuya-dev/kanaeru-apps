// 予約の知らせの文面（PRD FR-B80・FR-B86。booking-002）。業務の文面は booking が持つ（送る道具は platform/notify。AD-24）。
// 交流会の名前・日時（日本時間）・場所・自分の状態と、渡されたリンク（取り消し・返事・カレンダー）を入れる。
// 文面はログに出さない。LINE のテキストは5000文字までなので、長すぎるときは切る。
import { NOTICE_KIND_LABELS } from "@workspace/contracts/booking";
import type { NoticeKind } from "@workspace/contracts/booking";
import { LINE_LINK_TTL_DAYS } from "@workspace/contracts/booking";

/** LINE のテキストの上限（文字）。 */
export const NOTICE_TEXT_MAX = 5000;

/** 曜日（日本語）。 */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 日本時間の時差（ミリ秒）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 予約の知らせの種類（確かめのメッセージを除く）。 */
export type EntryNoticeKind = Exclude<NoticeKind, "test">;

/** 文面に入れる中身。 */
export type NoticeContext = {
  /** 公式アカウント・送り主の持ち主の名前（組織の名前か表示名） */
  holderName: string;
  /** 交流会の名前 */
  eventName: string;
  /** 交流会の始まり */
  startsAt: Date;
  /** 場所（なければ null） */
  venue: string | null;
  /** 申込みの今の状態（変更の知らせで使う） */
  entryStatus?: "confirmed" | "cancelled";
  /** 打診の返事の期限 */
  deadline?: Date;
  /** キャンセル待ちの何番目か */
  waitlistPosition?: number;
  /** 前の日時と場所（変更の知らせ） */
  previous?: { startsAt?: Date; venue?: string | null };
  /** リンク */
  links?: { entry?: string; respond?: string; calendar?: string };
};

/**
 * 日本時間の「11月28日（土）19:00」の形にする（サーバーの時刻帯に頼らない）。
 * @param instant 時刻
 * @returns 日本時間の日時の文字
 */
export function formatJstDateTime(instant: Date): string {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日（${WEEKDAYS[jst.getUTCDay()]}）${hours}:${minutes}`;
}

/**
 * 長すぎる文を、LINE のテキストの上限で切る。
 * @param text 文
 * @returns 上限までの文
 */
function clamp(text: string): string {
  return text.length <= NOTICE_TEXT_MAX ? text : `${text.slice(0, NOTICE_TEXT_MAX - 1)}…`;
}

/**
 * 友だち追加へのあいさつ（紐づけのリンクつき。research R4）。
 * @param holderName 公式アカウントの持ち主の名前
 * @param linkUrl 紐づけのリンク
 * @returns 文
 */
export function greetingText(holderName: string, linkUrl: string): string {
  return clamp(
    [
      "友だち追加ありがとうございます。",
      `${holderName}の交流会の予約の知らせ（申込みの確定・キャンセル待ちの繰り上げ・日時や場所の変更・中止）を、この LINE で受け取れます。`,
      "",
      `受け取るには、次のリンクを開いて LINE でログインし、「紐づける」を押してください（${LINE_LINK_TTL_DAYS}日のあいだ使えます）。`,
      linkUrl,
      "",
      "（kanaeru）",
    ].join("\n"),
  );
}

/**
 * 設定の画面の確かめのメッセージ。
 * @param holderName 公式アカウントの持ち主の名前
 * @returns 文
 */
export function testMessageText(holderName: string): string {
  return `確かめのメッセージです。${holderName}の交流会の予約の知らせは、この LINE に届きます。\n（kanaeru）`;
}

/**
 * 知らせの「あなたの状態」の言葉。
 * @param kind 種類
 * @param context 中身
 * @returns 状態の言葉
 */
function statusLine(kind: EntryNoticeKind, context: NoticeContext): string {
  switch (kind) {
    case "confirmed":
      return "確定";
    case "waitlisted":
      return context.waitlistPosition
        ? `キャンセル待ち（${context.waitlistPosition}番目）`
        : "キャンセル待ち";
    case "offered":
      return context.deadline
        ? `打診中（返事の期限：${formatJstDateTime(context.deadline)}）`
        : "打診中";
    case "offer_expired":
    case "cancelled_event":
      return "取り消し";
    case "changed":
      return context.entryStatus === "cancelled" ? "取り消し" : "確定";
  }
}

/**
 * 知らせの最初の段落（何が起きたか）。
 * @param kind 種類
 * @param context 中身
 * @returns 段落
 */
function leadLines(kind: EntryNoticeKind, context: NoticeContext): string[] {
  const holder = context.holderName;
  switch (kind) {
    case "confirmed":
      return [`${holder}の交流会の申込みが確定しました。当日は受付でお名前を伝えてください。`];
    case "waitlisted":
      return [
        `${holder}の交流会は満員のため、キャンセル待ちに入りました。席が空いたらお知らせします。`,
      ];
    case "offered":
      return [
        `${holder}の交流会に席が空きました。参加するかを、期限までに答えてください。`,
        "期限を過ぎると、次の方にお回しします。",
      ];
    case "offer_expired":
      return [
        `${holder}の交流会の返事の期限が過ぎたため、この申込みは取り消しになりました。`,
        "またの参加をお待ちしています。",
      ];
    case "changed": {
      const before: string[] = [];
      if (context.previous?.startsAt) {
        before.push(`前の日時：${formatJstDateTime(context.previous.startsAt)}`);
      }
      if (context.previous && "venue" in context.previous) {
        before.push(`前の場所：${context.previous.venue ?? "なし"}`);
      }
      return [
        `${holder}の交流会の日時や場所が変わりました。新しい日時と場所を確かめてください。`,
        ...before,
      ];
    }
    case "cancelled_event":
      return [`${holder}の交流会は中止になりました。申込みは取り消しになりました。`];
  }
}

/**
 * 知らせのリンクの行（渡されたものだけ）。
 * @param kind 種類
 * @param context 中身
 * @returns リンクの行
 */
function linkLines(kind: EntryNoticeKind, context: NoticeContext): string[] {
  const links = context.links ?? {};
  const lines: string[] = [];
  if (kind === "offered" && links.respond) lines.push(`返事をする：${links.respond}`);
  if (kind === "confirmed" && links.calendar) lines.push(`カレンダーに追加：${links.calendar}`);
  if (links.entry && kind !== "cancelled_event" && kind !== "offer_expired") {
    lines.push(`申込みを見る・取り消す：${links.entry}`);
  }
  return lines;
}

/**
 * 予約の知らせの本文（LINE とメールで同じ）。
 * @param kind 種類
 * @param context 中身
 * @returns 本文
 */
export function noticeText(kind: EntryNoticeKind, context: NoticeContext): string {
  const links = linkLines(kind, context);
  return clamp(
    [
      `【${NOTICE_KIND_LABELS[kind]}】${context.eventName}`,
      ...leadLines(kind, context),
      "",
      `日時：${formatJstDateTime(context.startsAt)}`,
      `場所：${context.venue ?? "（主催者からの案内を確かめてください）"}`,
      `あなたの状態：${statusLine(kind, context)}`,
      ...(links.length > 0 ? ["", ...links] : []),
      "",
      "（kanaeru）",
    ].join("\n"),
  );
}

/**
 * メールの題。
 * @param kind 種類
 * @param eventName 交流会の名前
 * @returns 題
 */
export function noticeSubject(kind: EntryNoticeKind, eventName: string): string {
  return `【${NOTICE_KIND_LABELS[kind]}】${eventName}`.slice(0, 200);
}

/**
 * メールの本文（知らせの本文に、返信の案内を足す）。
 * @param kind 種類
 * @param context 中身
 * @param hasReplyTo 返信先があるか
 * @returns 本文
 */
export function noticeEmailText(
  kind: EntryNoticeKind,
  context: NoticeContext,
  hasReplyTo: boolean,
): string {
  const footer = hasReplyTo
    ? `このメールに返信すると、${context.holderName}に届きます。`
    : "このメールには返信できません。";
  return `${noticeText(kind, context)}\n\n${footer}\nこのメールは、予約の知らせのために登録されたアドレスに kanaeru から送っています。`;
}

/**
 * メールの送り主の名前（research R8）。
 * @param holderName 持ち主の名前
 * @returns 送り主の名前
 */
export function senderName(holderName: string): string {
  return `${holderName}（kanaeru）`;
}
