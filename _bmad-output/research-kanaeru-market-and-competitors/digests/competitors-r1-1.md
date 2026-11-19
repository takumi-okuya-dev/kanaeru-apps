# Competitors r1-1 — LINE受付 / イベント基盤 / ニーズ収集 / コミュニティツール
accessed: 2026-11-19 (all items). Tool budget ~22 calls used. Snippet-only items (search-engine summary, page not opened) are marked [snippet].

## B1. LINE-based reception / check-in / attendance

- Lステップ has an イベント予約「来場管理」: the attendee shows a 来場QR delivered in LINE; staff scan it in a smartphone browser (no app needed), and the screen shows the name and party size from the reservation. Target: businesses running a LINE公式アカウント (marketing/CRM), not hobby meetups. — https://linestep.jp/lp/01/features52.html , https://linestep.jp/2026/07/04/qr_code_reception_system/ — Maneql (Lステップ) — 2026-10 (article dated 2026-10-13, prices as of 2026-06) — confidence high (feature) — class: feature
- Lステップ prices (tax incl., monthly): フリー 0円 (200 messages), スタート 5,000円 (5,000 messages), スタンダード 21,780円, プロ 32,780円. The source doesn't say which plan includes 来場管理 (要確認). Weakness for small meetups: a monthly fee, the attendee must friend an OA, and it's built around 配信 rather than meetup ops. — https://linestep.jp/2026/07/04/qr_code_reception_system/ — Maneql — 2026-10 — medium (vendor's own blog, not the pricing page) — pricing
- The same Lステップ roundup of 15 QR受付 systems: almost all are office or trade-show tools (展示会受付.com 10万円 initial + 2万円/month; Q-PASS from 8万円/event; ラクネコ from 5,000円/month; MOT 29,800円 + 8,080円/month). Peatix is the only meetup-grade one, and Lステップ is the only LINE-native one. Read: there's no free, LINE-native, meetup-sized reception tool in this list. — same URL — Maneql — 2026-10 — medium — pricing/feature
- L Message (エルメ) has 4 reservation types (サロン個人/サロンスタッフ/レッスン/イベント予約) plus a separate「QRコードアクション」. I couldn't confirm a QR check-in at the door for イベント予約 (要確認). — https://lme.jp/manual/reservation_type/ , https://lme.jp/manual/category/reserve/event/ — ミショナ (L Message) — page seen 2026-11 [snippet] — low — feature
- GENEROSITY (listed on the LINEヤフー partner directory) is an invitation service covering application through 来場管理, with QR reception on the day. Price not shown; it looks enterprise/agency oriented (要確認). — https://www.lycbiz.com/jp/partner/technology/line/generosity — LINEヤフー for Business — page seen 2026-11 [snippet] — low — feature
- QRGO (入退室管理, not event-specific): 3,300円 / 16,500円 / 55,000円 per month (tax incl.). — https://www.shopowner-support.net/customer_attraction_information/online/linebiz/qrgo/ — shopowner-support — page seen 2026-11 [snippet] — low — pricing
- LINE native group features (投票 / 日程調整 / イベント) are free and need no extra app, but tallying is manual and they don't capture registration source, payment, or a survey. 調整さん adds 定員, キャンセル待ち, 遅刻/早退; the comparison articles also cover 伝助 and サークルスクエア. — https://atsoho.com/blog/line-attendance-check , https://atsoho.com/blog/attendance-check-apps-free , https://lme.jp/media/line/attendance-confirmation — Atsoho / L Message media — page seen 2026-11 [snippet] — medium — feature
- Not opened but relevant: LINE 15周年 (2026-07) announced PayPayアカウント連携 for sending and receiving PayPay balance and 割り勘 inside talk rooms, "Agent i in chat" (within 2026), and「LINE公式アカウント AIモード」. This could make in-LINE PayPay collection native, which is both a threat and an opportunity for the PayPay/cash tally (要確認: release status). — https://realsound.jp/tech/2026/07/post-2448460.html/amp — Real Sound Tech — 2026-07 [snippet] — medium — feature
- LINE VOOM ends 2026-09-30 (LINEヤフー announced 2026-07-15). This signals LINEヤフー is pruning non-core surfaces. — via ITmedia keyword page https://www.itmedia.co.jp/keywords/service_close.html — ITmedia — 2026-07 [snippet] — medium — traction

## B2. Uncertainties confirmed

- **connpass launched paid organizer plans on 2026-11-04** (biggest change). フリー 0円; コミュニティ 1,980円/month or 19,800円/year (1 group, card payment); スタンダード 19,800円/month or 198,000円/year (up to 3 groups); エンタープライズ 要相談. Paid plans add GA4連携. グループメッセージ per group per month: Free 7,000 / Community 20,000 / Standard and Enterprise unlimited. API interval: Free 12 seconds (100 requests/day) / 6s / 2s / 1s. The release doesn't mention check-in, surveys, or CSV changes in the paid tiers. — https://prtimes.jp/main/html/rd/p/000000029.000025386.html — BeProud (PR TIMES) — 2026-11 — high — pricing
- connpass announced the plans in advance on 2026-08-05: a cap on free group messages (7,000/month, group-wide broadcasts only; イベントメッセージ is excluded). They say over 95% of groups are already under the cap. — https://help.connpass.com/announcements/info/20260805 , https://x.com/connpass_jp/status/2084890063973024045 — connpass — 2026-08 [snippet] — high — pricing
- connpass scale: about 900,000 users and over 1,500 events/month (PyCon JP 2026 sponsor page). — https://2026.pycon.jp/en/sponsors/connpass — PyCon JP — 2026 [snippet] — medium — traction
- The older connpass help page says the API costs companies money (e.g. 297,000円/month) and is free on application for communities and individuals. This is inconsistent with the new table (要確認). — https://help.connpass.com/api/ — connpass — page seen 2026-11 [snippet] — medium — pricing
- Doorkeeper official pricing page: Starter 1,650円 / Pro 4,400円 / Plus 8,800円 / Business 17,600円 per month (tax incl.). Upcoming-event caps are 5 / 15 / 50 / 200. There's no free tier, but the first event is free (a paid plan is required from the second event). Ticket fees: free 0, pay-at-venue 0, prepaid 99円 + 2.5% (+ Stripe 3.6%), bank transfer 0. This settles the "1,500 vs 1,650" conflict: **1,650円 tax incl.** — https://www.doorkeeper.jp/pricing — Doorkeeper — page seen 2026-11 (no date on page) — high — pricing
- Peatix: no official fee-change notice found for 2026. The Lステップ roundup (prices as of 2026-06) still lists no base fee and 4.9% + 99円 per paid ticket. Bank-transfer payment launched in 2025-08 at the same 4.9% + 99円. Peatix Live ended early, on 2026-10-09. The terms of service were revised 2026-11-19, adding terms for a subscription service (fee impact 要確認). The official organizer pricing URL peatix.com/pricing returned 404. — https://linestep.jp/2026/07/04/qr_code_reception_system/ ; https://voix.jp/?p=74863 ; https://help-attendee.peatix.com/en/support/solutions/articles/44002812061 — Maneql / VOIX / Peatix — 2026-06 to 2026-11 — medium — pricing
- TECH PLAY check-in/receipt features: nothing found in one search (要確認; next step is TECH PLAY's help center).
- Generic options: the Google Workspace Marketplace add-on "QR Code Ticket for Attendance" generates per-attendee QR tickets from Forms/Sheets and records attendance on scan, i.e. the DIY Googleフォーム + スプレッドシート route. — https://workspace.google.com/marketplace/app/qr_code_ticket_for_attendance/9398047938?hl=ja — Google Workspace Marketplace — page seen 2026-11 [snippet] — medium — feature
- EventRegist: QR on a PDF ticket, scanned in the check-in app, with manual list check-in as a fallback (a corporate-event tool). — https://info.eventregist.com/library/checkin-basic — EventRegist — page seen 2026-11 [snippet] — low — feature

## B3. Demand / idea collection
- Blabo!: the domain blabo.jp does not resolve (DNS ENOTFOUND on 2026-11-19), and no 2026 activity turned up in search. **Likely discontinued (要確認: confirm the closure notice/date).** — https://blabo.jp/ — n/a — accessed 2026-11-19 — medium — traction
- The 困りごと投稿 / idea-matching search returned only government and regional matching (e.g. a 世田谷区 on-demand support RFP and future-city.go.jp public-private matching) and crowdsourcing listings. No consumer "post your work pain → developers build it" platform active in 2026 turned up. — https://www.biz.ne.jp/subject/toi_detail.html?tid=986527 , https://future-city.go.jp/platform/information/pdf/202308pdf/第２部.pdf — various — 2026 [snippet] — low — traction

## B4. Community tools
- LINE OpenChat rolled out a スレッド機能: any member can create a thread on a message; not on messages older than 24h, and no posting to threads older than 2 weeks. Requires LINE 14.7.0+ / desktop 9.0.0+. Publish date unconfirmed (likely 2025–2026). Shows ongoing investment in OpenChat. — via search on netshop.impress / lycbiz (exact article not opened) — LINEヤフー — 要確認 [snippet] — low — feature
- I found no OpenChat policy change, user stats, or shutdown signal for 2025–2026 (searched once).
- Commune: a no-code customer community (posts, points/badges, events, Q&A, with 運営代行). Price not public (資料請求). OSIRO: no pricing page found. Its blog covers "start small with free tools, then migrate to paid", which suggests the market path is OpenChat/Discord first and a paid platform later. — https://boxil.jp/service/5448/ , https://osiro.it/news/13685 , https://www.itreview.jp/compares/commmune_vs_questionpro — BOXIL / OSIRO / ITreview — page seen 2026-11 [snippet] — low — pricing

## Leads worth chasing
1. connpass official 「プランと料金」 page and help: does the free tier keep CSV/survey/受付票? Also the API terms for third-party tools (the 12s / 100 per day free cap matters if Kanaeru imports connpass participants).
2. Peatix terms revision dated 2026-11-19 (subscription service): is Peatix launching an organizer subscription?
3. LINE PayPay in-talk 送受信/割り勘 rollout status and whether a LINE公式アカウント or LIFF can trigger it. This could replace the PayPay/cash tally.
4. Lステップ features52 page: which plan includes 来場管理. Also check エルメ's free plan (which is generous) for event QR.
5. TECH PLAY help center (受付/チェックイン).
6. Blabo! closure date (press release or company ブラボ site).
7. OSIRO / commune official pricing (likely enterprise, 数万円〜/month, unverified).

## Looked for, not found
- Any free, LINE-native reception app aimed at small meetups that records registration source + payment method + survey. None turned up; the closest is Lステップ 来場管理 (paid, OA-centric).
- LINEミニアプリ templates for event reception (only a 2023 LINEヤフー ebook surfaced, not opened).
- Official Peatix organizer fee page (404 at peatix.com/pricing).
- TECH PLAY check-in features.
- OpenChat 2025–2026 stats or policy changes; OSIRO/commune prices.
- An active Japanese Product Hunt-like or feature-voting site for 困りごと in 2026.
