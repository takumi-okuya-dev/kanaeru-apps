# Quickstart：アカウント・LINE ログイン（account-001）を確かめる

## 1. 手元（自動）

```bash
pnpm install
pnpm local:setup     # account・session の表ができる
pnpm check
```

## 2. 手元（手で）：試験用のログイン

`.env` に `TEST_LOGIN_ENABLED=true` を入れる（見本の `.env.example` は入）。

```bash
pnpm dev
```

- `http://localhost:5173/dev/login` で、LINE のユーザー ID（見本の値が入っている）と表示名を入れて「ログイン」。「ログインしています：{表示名}」が出る。
- 同じブラウザで `http://localhost:5173/api/v1/accounts/me` が `{ id, displayName, isOrganizer, registeredAt }` を返す。
- `.env` の `ORGANIZER_LINE_USER_ID` に同じ LINE のユーザー ID を入れて API を立て直すと、`isOrganizer: true`。
- 「ログアウト」で `me` が 401 `UNAUTHENTICATED` になる。

## 3. 本番に出したあと（手で）

- [ ] LINE の中で受付QR（パーマリンク）を開き、文字を打たずにログインが済む（`/api/v1/accounts/me` が自分。初めてならアカウントができる）
- [ ] クッキーが `__Host-kanaeru_session`・`HttpOnly`・`Secure`・`SameSite=Lax` で出る
- [ ] 同意の画面に公式LINE の友だち追加の選択肢が出る（Add friend option。構成 Open Questions 2）
- [ ] PC の外のブラウザで「LINEでログインし直す」から LINE のログインに移り、同じ道に戻る（Open Questions 3）
- [ ] 主催者の LINE で `isOrganizer: true`、ほかの人は `false`
- [ ] Cloud Logging に ID トークン・クッキーが出ていない
- [ ] `TEST_LOGIN_ENABLED=true` を本番の設定に入れると起動しない（Terraform の値に入れない）
