// 知らせを送る道具の入口（AD-18・AD-24。業務を知らない技術の道具）。組み立てが createNotifier で作り、
// 領域は DomainRouteDeps.notifier（型は kernel/notifier.ts）で受け取る。Webhook の署名の確かめも、ここから読む。
export type { EmailSender } from "./email.ts";
export { FAKE_OUTBOX_MAX } from "./fake.ts";
export { decideDelivery } from "./guard.ts";
export type { DeliveryDecision, NotifyPolicy } from "./guard.ts";
export { LINE_API_BASE_URL } from "./line-client.ts";
export { FAKE_BOT_USER_ID, FAKE_PROFILE_NAME, createNotifier } from "./notifier.ts";
export type { NotifierDeps } from "./notifier.ts";
export { verifyLineSignature } from "./signature.ts";
