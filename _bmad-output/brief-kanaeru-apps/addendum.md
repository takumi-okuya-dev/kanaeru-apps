# 補足：プロダクトブリーフ kanaeru-apps

作成：2026-11-19（[ブリーフ](./brief-kanaeru-apps.md)に入りきらない、PRD・構成づくりで使う材料）

## 1. 調べもの

2026-11-19 時点。出典つき。「要確認」は、出典が古い・食い違う・はっきりしないもの。

### 1-1. 受付・名札・マッチングの似たサービス

| サービス | 主催者に役立つ点 | 料金 |
|---|---|---|
| connpass | 参加者一覧をCSVで出せる（アンケート回答も）。受付番号つきの受付票・出席チェックがCSVに反映される（[ヘルプ](https://help.connpass.com/organizers/event-admin)・[受付票](https://help.connpass.com/organizers/event-ticket)） | 無料で使える |
| Peatix | 公式アプリでQRチェックイン（[資料](https://documents.peatix.com/howtousepeatixforo_checkin.pdf)）。CSVには販売ID・氏名・チケット・状態（Checked in）・フォーム回答・User ID が入る。キャンセル済みは含まれず、フォームの回答はイベント終了の30日後に消える（[ヘルプ](https://help-organizer.peatix.com/en/support/solutions/articles/44001821754)） | 無料イベントは0円。有料チケットは4.9%＋99円/枚（[第三者の比較](https://www.itreview.jp/products/peatix/price)。要確認） |
| Doorkeeper | 2016年に有料化（[告知](https://www.doorkeeper.jp/news/2016/8/22/from-free-to-paid-status-update)） | 月1,500円〜1,650円（出典で食い違う。要確認） |
| TECH PLAY | 掲載は無料。主催者がAPIトークンで申し込み状況を取れる。チェックインの機能は要確認 | 無料 |
| Eight（Sansan） | QRで名刺交換。2025年10月に EXPOLINE と連携（[記事](https://dxmagazine.jp/news/ytoda2638-47/)） | — |
| EventHub | 大規模イベント向けの商談・マッチング | 要問合せ |

- 小さな勉強会・交流会向けの、自己紹介カード・名札の Web アプリで目立つものは見つからなかった。
- 既存のツールにない点（推論）：connpass・Peatix・直接の申し込みをまたいだ受付の一元化／当日の支払い方法（PayPay・現金）ごとの集計／知ったきっかけの記録。（名札に「いま困っていること」を載せる案は3章のとおりやめた）

### 1-2. 需要・不満を集めるサービス

| サービス | 状況と仕組み |
|---|---|
| 不満買取センター（株式会社インサイトテック） | 2025年も稼働。不満を投稿すると1〜10ポイントがもらえ、ギフト券などに換えられる。集めたデータを分析SaaS（不満ファインダー・IDEAI）として企業に売る。累計の件数は記事で食い違う（[記事1](https://webtan.impress.co.jp/r/prtimes/items/000000189.000083450)・[記事2](https://www.excite.co.jp/news/article/Prtimes_2025-12-29-173649-1/)） |
| Blabo! | 企業・行政のお題に生活者がアイデアを出す共創型。CCCグループ入り。確かめられた最新の記事は2023年ごろ（[記事](https://webtan.impress.co.jp/e/2023/08/23/45391)）。2026年に運営しているかは要確認 |
| ideee | 見つからなかった（要確認） |
| ツクロー | アプリのアイデア投稿と開発者をつなぐ（[App Store](https://apps.apple.com/jp/app/id6740224152)） |

### 1-3. LINE

- 公式アカウントの料金（税別、[公式](https://www.lycbiz.com/jp/service/line-official-account/plan/)）：コミュニケーションプラン：月0円・200通・追加不可／ライトプラン：月5,000円・5,000通／スタンダードプラン：月15,000円・30,000通・追加は約3円/通〜（2026年10月1日に単価を改定）。
- **数えない通数**：1対1のチャット・応答メッセージ・あいさつメッセージ・Reply API。**数える通数**：Push・Multicast・Broadcast・Narrowcast。→「手を挙げた人に1対1で送る」形なら、無料プランのままで回せる可能性が高い。
- LINEログインは無料で、個人でもプロバイダーを作れる。新しいチャネルは「開発中」で始まり、誰でも使えるようにするには、状態を公開に切り替える（[公式](https://developers.line.biz/ja/docs/line-login/getting-started/)）。
- LIFF は、新しく作るなら「LINEミニアプリとして作る」ことが勧められている。LIFF と LINEミニアプリの統合は2025年2月に告知されたが、時期は未定（[公式](https://developers.line.biz/ja/docs/liff/getting-started/)。要確認）。
- LINE Pay の国内サービスは2025年4月30日に終了（[記事](https://www.itmedia.co.jp/mobile/spv/2406/13/news158.html)）。

### 1-4. 名簿の取り込み

- connpass API は2025年4月に v2（APIキー方式）に変わった。フリープラン（無料）は申請・審査制で、業務目的では使えない。2026年11月4日から、フリープランの呼び出し上限は「12秒に1回・1日100回」（[ヘルプ](https://help.connpass.com/api/)）。特定のイベントの参加者一覧を API で取れるかは要確認（可能性は低い）。
- 現実的な取り込みは **CSV**（connpass・Peatix とも出せる）。

### 1-5. GCP・PostgreSQL の費用

- Cloud Run の無料枠（リクエスト課金）：月180,000 vCPU秒・360,000 GiB秒・200万リクエスト（[公式](https://cloud.google.com/run/pricing)）。東京リージョンが無料枠の対象のTierかは要確認。
- Cloud SQL には常設の無料枠がない。最小の db-f1-micro で月$8〜10ほど（ストレージ代は別）。AlloyDB は30日の試用だけ。
- Neon の無料プラン：プロジェクトごとに月100 CU時間・1GB、超えても課金されない（[公式](https://neon.com/faqs/free-plan-limits-and-quotas)）。Supabase の無料プラン：500MB・2プロジェクト、1週間使わないと一時停止（[公式](https://supabase.com/docs/guides/platform/free-project-pausing)）。Supabase は、交流会が月1回だと止まりやすい。
- 目安：Cloud Run（無料枠内）＋ Neon の無料プランでほぼ月0円。GCP の中だけで完結させる（Cloud SQL を使う）と月$8〜12ほど（要確認）。

## 2. 技術の制約（構成づくり・PRDで使う）

- 言語は TypeScript（product-template の typescript ブランチの骨組み）。
- 置き場所は GCP、インフラは Terraform。主催者が勉強したい技術でもある。
- 運用費（プロダクトを動かす費用）はクラウドサービスの無料枠でゼロに近づける。開発を自律的に進めるためのAIの利用料は、別枠で考える。
- DB：骨組みは PostgreSQL。Cloud SQL には無料枠がないので、Neon などの無料プランと比べて決める（1-5）。
- LINE：LINEログイン・LIFF（LINEミニアプリ）・公式LINE を使う。料金と数える通数は1-3。
- 決済の連携は持たない（支払い方法を記録するだけ）。

## 3. ブレインストーミングから変えたこと（経緯）

- 名札（自己紹介カード）に「いま困っていること」欄を載せる案をやめた。入口で考える負荷が高いため。困りごとは交流会のあとのアンケートで聞く。
- デジタルの名札そのものを最初の版から外した。紙の名札で十分で、登録は受付のチェックインで起きるため。
- 進行の台本・タイムテーブル・話したいことのメモは、アプリの機能にせず、次の交流会の準備として別に固める（アプリで見る機能は、ブリーフの「余裕があれば」）。台本の型は、主催者向けスイートの候補として残す。
