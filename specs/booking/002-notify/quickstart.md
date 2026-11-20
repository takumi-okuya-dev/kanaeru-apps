# Quickstart: 予約の知らせの仕組み（booking-002）

2026-11-20 作成。名前・アドレスはどれも架空のもの。

## 1. 手元で確かめる（本物の LINE には送らない）

手元（`APP_ENV=local`）では、どの設定でも偽の送り手を使う。`.env` に次を入れる（値の作り方は `.env.example`）。

```text
TOKEN_ENCRYPTION_KEYS={"1":"<32バイトの base64>"}
TOKEN_ENCRYPTION_KEY_VERSION=1
NOTIFY_MODE=on
```

1. `pnpm dev`。手元のログイン（`/dev/login`）で A としてログインし、設定 › 組織で組織を作る（A が管理者）。
2. 設定 › 予約の知らせ で、組織の「設定を開く」。チャネル ID `1234567890`・シークレット（16進の32文字。例 `0123456789abcdef0123456789abcdef`）・アクセストークン（20文字以上の英数字）を入れて保存する。末尾4文字・Webhook の URL・紐づいた人数 0・今月送った数 0・あいさつの見本が出る。
3. 友だち追加の知らせを、署名を付けて送る（シークレットは 2 の値）。

   ```bash
   BODY='{"destination":"Uffffffffffffffffffffffffffffffff","events":[{"type":"follow","replyToken":"r1","source":{"type":"user","userId":"U0123456789abcdef0123456789abcdef"},"timestamp":0,"mode":"active","webhookEventId":"e1","deliveryContext":{"isRedelivery":false}}]}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac '<シークレット>' -binary | base64)
   curl -i -X POST "<Webhook の URL>" -H 'content-type: application/json' -H "x-line-signature: $SIG" -d "$BODY"
   ```

4. ログインしたまま `GET /api/v1/booking/dev/notify-outbox` を開くと、あいさつ（`/line-link/…` のリンク）が見える。そのリンクを開き「紐づける」を押す。設定の画面の紐づいた人数が 1 になる。
5. 「自分に確かめのメッセージを送る」で「送りました」と出て、今月送った数が 1 になる。`NOTIFY_MODE=allowlist` にして立ち上げ直すと「許可リストにないため送りませんでした」と、自分の ID が出る。
6. 3 の `follow` を `unfollow`（`replyToken` なし）にして送ると、紐づいた人数が 0 に戻る。

## 2. 本番で出すときに要るインフラの変更（この仕様では `infra/` を直さない）

| 何 | 名前 | 値・既定 | 置き場所 |
|---|---|---|---|
| 送り方 | `NOTIFY_MODE` | `off`（既定。出したあとも `off` のまま）→ 確かめの間は `allowlist` → 問題がなければ `on` | Cloud Run の環境の変数（秘密でない） |
| 送ってよい宛先 | `NOTIFY_ALLOWLIST` | 空（既定）。確かめる人の「公式アカウントから見える LINE のユーザー ID」とメールアドレスをカンマで並べる | Secret Manager（新しい秘密 `notify-allowlist`）→ Cloud Run の環境の変数 |
| 鍵の束 | `TOKEN_ENCRYPTION_KEYS`・`TOKEN_ENCRYPTION_KEY_VERSION` | Threads ですでに使っているもの（なければ公式アカウントの設定は 503） | Secret Manager（今のまま） |

- `APP_ENV` が `production` のとき本物の LINE を呼ぶ。`NOTIFY_MODE` が `off` の間は、ボット情報の読み取り（設定の保存のとき）のほかは呼ばない。
- メールの送信のサービスとドメインは決まっていない（Open Questions 8）。決まったら、送り手（`EmailSender`）を `platform/notify` に足し、送り主のアドレスとサービスの鍵の設定を足す。それまで本番のメールは「メールの準備がない」と記録する。
- 組織には、LINE の画面で次をしてもらう（設定の画面に書いた）：Webhook の URL を貼る・「Webhook の利用」を入にする・「検証」で成功を確かめる・「Webhook の再送」を入にする（夜間に DB が止まっている間の知らせを、LINE が送り直す）・LINE Official Account Manager のあいさつメッセージと応答メッセージを切にする（あいさつが2つ届かないように）。
- 回数の制限：Webhook も `/api/v1` の書く道の IP ごとの制限（既定 60秒に100回）に入る。LINE のサーバーからの Webhook が多い組織が出たら、`RATE_LIMIT_MAX` を見直すか、Webhook の道だけ制限を分ける（共通の変更）。

## 3. 確かめのテスト

```bash
pnpm check                                  # 全部（型・lint・単体と結合・E2E）
pnpm --filter api exec vitest run src/platform/notify src/modules/booking
pnpm --filter web build && pnpm --filter e2e exec playwright test tests/booking-notify.spec.ts  # 設定の画面と紐づけ（偽の Webhook）
```
