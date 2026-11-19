# Digest suite-r1-1: Pricing benchmarks, bundling, who pays, risks (Japan)

Accessed: 2026-11-19 for every source. Prices are excl. tax unless noted. The pages were read through a fetch-and-summarize tool, so check exact figures on the live pages before quoting them in a decision document.
Notation: [C] = confidence, [K] = class.

## C1. Japan pricing (suites, SMB and individual)

- **Google Workspace (JP official page):** Business Starter ¥800, Standard ¥1,600, Plus ¥2,500 per user per month. The page shows a 50% promotion for 2026-12-02 to 2027-03-02 and regular prices from 2027-03-02. Starter has only limited Gemini (Gmail assistant plus the Gemini app; not Docs, Sheets or Meet). Standard and Plus include Gemini across apps and NotebookLM. The page also mentions an annual plan "about 16% cheaper" without listing it separately, and a footnote's promo terms (first 20 users for 12 months) contradict the 3-month promo. 要確認: whether ¥800 is the annual or the flexible price, and the promo terms.
  - https://workspace.google.com/intl/ja/pricing.html | Google | page seen 2026-11 | [C] medium (prices high; billing terms unclear) | [K] pricing
- **Microsoft 365 Business Basic (JP, via reseller notice):** list price rises from 2026-07-01. Annual commitment with monthly billing goes from ¥944 to ¥1,101; monthly commitment goes from ¥1,079 to ¥1,259 (tax-inclusive notation). The bundle "Business Basic + Microsoft 365 Copilot Business" is about ¥4,407 per user per month (annual, monthly billing, excl. tax, after revision). NTT Docomo Business lists ¥4,847 for the same bundle, so the figures need reconciling. US Basic goes from $6 to $7. Direction: up, with the official reason being "new features" (AI).
  - https://www.softbank.jp/business/service/cloud/microsoft-365/pdf/cidna-m365-20260701correctprice-notice.pdf | SoftBank (reseller) | 2026-06/07 | [C] medium | [K] pricing
  - https://atmarkit.itmedia.co.jp/ait/spv/2512/24/news064.html | @IT | 2025-12 | [C] medium (headline only) | [K] pricing
  - Not retrieved: the official Microsoft JP comparison page (fetch timed out) and Standard/Premium JP prices (要確認).
- **kintone (official):** ライト ¥1,000, スタンダード ¥1,800, ワイド ¥3,000 per user per month. Minimum 10 users for Lite and Standard, 1,000 for Wide. Annual plans cost 12x the monthly price, so there is no discount. The page shows no revision note. Comparison with earlier prices: I believe Lite was ¥780 and Standard ¥1,500 before the 2024 revision, with the minimum at 5 users, but that comes from training data and was not verified this run. If true, the direction is up and the minimum seat count doubled.
  - https://kintone.cybozu.co.jp/price/ | Cybozu | page seen 2026-11 | [C] high (current) / low (history) | [K] pricing
- **Money Forward Cloud, sole proprietors (official):**
  - パーソナルミニ: ¥900/month on annual billing, ¥1,280 on monthly billing.
  - パーソナル: ¥1,280 annual, ¥1,680 monthly.
  - パーソナルプラス: ¥2,980, annual only.
  - About 12 services are included in the base fee (tax return, invoicing and others), so it is a suite-in-one-fee model.
  - The page announces "a partial pricing revision in 2026-12."
  - https://biz.moneyforward.com/price/individual/ | Money Forward | page seen 2026-11 | [C] high | [K] pricing
- **Money Forward Cloud, small companies (official):**
  - ひとり法人: ¥2,480 annual / ¥3,980 monthly, 1 user, max 500 journal entries.
  - スモールビジネス: ¥4,480 / ¥5,980, 3 users.
  - ビジネス: ¥6,480 / ¥7,980, unlimited users at +¥300 per user from the 4th.
  - The base fee includes 12 services (accounting, invoicing, expenses, payroll, attendance, HR, e-contract and others).
  - The page announces a pricing revision for 2027-06.
  - Pattern: a flat company fee plus a small per-seat add-on, not pure per-seat pricing.
  - https://biz.moneyforward.com/accounting/smb/price/ | Money Forward | page seen 2026-11 | [C] high | [K] pricing
- **freee (search excerpts from freee pages; the pricing page itself was not fetched):**
  - Corporate accounting: スターター ¥5,480/month on annual billing (¥7,280 monthly), スタンダード from ¥8,980/month annual.
  - One-person companies: ミニマム ¥2,980 annual / ¥3,980 monthly.
  - freee HR: ミニマム ¥2,000/month annual (up to 5 employees), スターター ¥3,000.
  - Sole-proprietor prices were not captured (要確認).
  - https://www.freee.co.jp/accounting/small-medium/pricing/ , https://www.freee.co.jp/accounting/new-corporation/pricing/ | freee | page seen 2026-11 | [C] medium | [K] pricing
- **Notion (JP official):** Plus ¥1,650, Business ¥3,150 per member per month; the toggle says annual billing saves up to 20%. Full Notion AI (Agent, AI Meeting Notes, Enterprise Search) is in Business only. Free and Plus get just an AI trial. Custom agents cost US$10 per 1,000 credits per month. This fits AI being bundled into the higher tier, which pushes buyers up-tier. The page shows no AI add-on, consistent with the add-on having been removed.
  - https://www.notion.com/ja/pricing | Notion | page seen 2026-11 | [C] medium-high | [K] pricing
- **Zoho One (aggregator sites; the official JP page returned 404):** all-employee pricing is about ¥4,440–5,240 per employee per month. Per-user pricing is about ¥10,800–12,740. The all-employee plan requires a license for every employee. 要確認 on the official page.
  - https://www.itreview.jp/products/zoho-one/price | ITreview | page seen 2026-11 | [C] low | [K] pricing
- **Pattern across C1:** every major suite raised prices in 2025–2026 and justified it with AI (Microsoft from 2026-07, Google bundling Gemini, Notion moving AI to Business, Money Forward revisions in 2026-12 and 2027-06). Typical "tool" seats cost ¥800–1,800 per user per month. Accounting suites for one person or one company cost ¥900–3,000 per month, with about 12 apps bundled under one fee. [C] medium | [K] pricing

## C2. Bundling evidence

- **Setapp:** Mac $14.99/month, Mac+iOS $18.99, Power User $22.99 (4 Macs and 4 iOS devices), each with 1,000–2,000 AI credits. Annual billing saves "up to 40%." The catalog is "hundreds of apps." There is also a Marketplace for buying single apps, so it is a hybrid of bundle and à la carte.
  - https://setapp.com/pricing | MacPaw | page seen 2026-11 | [C] high | [K] pricing
- **Setapp developer economics:** 70% of each subscriber's fee goes to a developer pool, split by each app's share of that user's usage. A developer whose app brought the user in earns a 20% partner fee on that user, for up to 90%. Setapp keeps 10%. Marketplace direct sales pay 85% for subscriptions and 75% for one-time purchases. The docs' example: a developer with a small usage share gets about $2.24 of a $9.99 fee. For an indie developer this means bundle revenue per user is diluted unless the developer owns the acquisition.
  - https://docs.setapp.com/docs/distributing-revenue | MacPaw | page seen 2026-11 | [C] high | [K] benchmark
- **Money Forward and freee** bundle about 12 back-office apps under one plan fee (see C1). This is the strongest Japanese evidence that SMBs accept "one fee, many small apps" when the apps share data (accounting, payroll, HR). [C] medium (inference from packaging, not from conversion data) | [K] pricing
- No data found on bundle vs single-app conversion or churn (see "Looked for, not found").

## C3. Who pays: individuals vs organizations

- **MIC 情報通信白書 (令和8年 / 2026):** 86.4% of Japanese companies use generative AI in some business process, counting only respondents who did not answer "don't know." Use rose sharply from the 2024 survey. Use for white-collar document work is about 70%. Japan's "don't know" share is higher than in the US or China.
  - https://www.soumu.go.jp/johotsusintokei/whitepaper/ja/r08/text/nd121130.txt | 総務省 | 2026 | [C] medium (excerpt only) | [K] behavior
- **Individual business use of generative AI:** a survey of 9,244 business people found 29.3% use generative AI at work and 59.1% do not. The publisher is a vendor (Arsaga Partners). GMO Research & AI's fixed-point survey (2025-09) found 28.4% using it continuously at work. Read together with the MIC figure: companies say "yes," but fewer than a third of individual workers use it.
  - https://www.commercepick.com/archives/70553 | アルサーガパートナーズ via CommercePick (vendor survey) | 2025 (要確認) | [C] medium | [K] behavior
  - https://atmarkit.itmedia.co.jp/ait/articles/2509/26/news042.html | @IT / GMOリサーチ&AI | 2025-09 | [C] medium | [K] behavior
- **Shadow AI (individuals using AI tools their company has not approved):**
  - LRM (vendor survey, n=1,080): shadow AI use is 54.0% in organizations with no AI policy, 17.5% where a policy exists, and 12.0% where usage is visible to the company.
  - BOXIL (SaaS review and comparison site): 14.4% say "the company hasn't adopted AI but I use it personally."
  - AI白書2026 (Kadokawa ASCII Research, n=310): managers (46.5%) use shadow AI more than staff (38.1%).
  - Caveat: none of these says who pays for paid plans.
  - https://boxil.jp/mag/a10546/ | BOXIL | 2026 (要確認) | [C] low-medium | [K] behavior
  - https://atmarkit.itmedia.co.jp/ait/articles/2609/10/news027.html | @IT / AI白書2026 | 2026-09 | [C] medium | [K] behavior
- **Freemium and trial benchmarks (ChartMogul SaaS Conversion Report, 2026-02, n=200, conversion within 6 months; vendor-run survey):**
  - All products: median 8%.
  - Freemium: 3–5% good, 8–12% great.
  - Free trial without card: 4–6% good, 10–15% great.
  - Free trial with card required: 25–35% good, 50–60% great.
  - B2B: 6–10% good. B2C or hybrid: 5–7% good.
  - AI products: 6–8% good, 15–20% great.
  - Per 1,000 site visitors, a card-required trial yields about 10.5 payers vs about 5 for freemium.
  - https://chartmogul.com/reports/saas-conversion-report/ | ChartMogul (with Kyle Poyar) | 2026-02 | [C] medium-high | [K] benchmark
- **First Page Sage (86 SaaS companies, 2022–2025):** freemium about 2.6–3.7% vs opt-in free trial 18.2%. Seen only in summaries, not the primary page.
  - [C] low | [K] benchmark

## C4. Risks

- **LINE platform:**
  - In-app purchase for digital content in LINE mini apps opened 2026-04, for **verified** mini apps in Japan only. Fees apply from the 2026-07 billing period.
  - LIFF browser header and action-button behavior changed in LINE 26.7.0 (2026-05). LIFF v2.29.1 shipped 2026-06-29.
  - Verified mini app channels were linked to Business Manager organizations (2026-06).
  - Implication: monetization features are gated by verification review, and the UI can change without notice.
  - https://developers.line.biz/ja/news/tags/line-mini-app/1/ | LY Corp LINE Developers | 2026 | [C] medium (seen through search summary) | [K] risk
  - https://www.lycbiz.com/jp/column/line-mini-app/service-information/mini_matome_202607/ | LY Corp | 2026-07 | [C] medium | [K] risk
- **Indie revenue distribution:** RevenueCat's State of Subscription Apps 2025 (more than 75k apps, reported by TechRepublic) says most apps do not reach US$1,000 MRR within 2 years, and AI apps outperform legacy categories. These are mobile subscription apps, not B2B SaaS. RevenueCat is a vendor, and this was seen only through press coverage.
  - https://www.techrepublic.com/article/news-apps-revenue-developers/ | TechRepublic | 2025-03 | [C] medium | [K] risk

## Leads worth chasing
- The official Microsoft JP business comparison page (it timed out), plus Microsoft 365 Personal/Family JP prices after Copilot bundling.
- The Google Workspace footnote conflict (3-month promo vs "first 20 users for 12 months"), and whether ¥800 is the annual or the flexible price.
- What Money Forward's 2026-12 (sole proprietor) and 2027-06 (SMB) revisions actually change; the details are on the support site.
- kintone's 2024 revision notice, to confirm the old prices and old minimum seat count.
- The BOXIL and LRM shadow-AI primary releases; check whether they ask about paying for AI personally.
- The primary RevenueCat State of Subscription Apps report (revenue percentiles, AI app conversion).
- The LINE mini app verified-review requirements page (needed to use in-app purchase).
- Japanese SMB "all-in-one" suites (e.g. ジョブカン, the Bizer / 1つの管理画面 type of suite), which were not searched for lack of budget.

## Looked for, not found
- Any primary survey on Japanese workers **paying personally** (自腹) for business or AI tools, and on the split between company-paid and self-paid AI subscriptions.
- Data on bundle vs single-app conversion or churn (Setapp publishes none; no indie case study found).
- Japanese 個人開発 SaaS bundle examples, and Japanese indie developer revenue surveys.
- SMB IT budget per employee in Japan, and quantified friction from 稟議 (internal purchase approval) for small SaaS.
- Examples of LINE official accounts being banned, or unverified mini apps being shut down.
- The official Zoho One JP pricing page (it returned 404).
