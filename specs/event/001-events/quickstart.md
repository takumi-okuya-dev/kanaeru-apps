# Quickstart：交流会（event-001）を確かめる

## 1. 手元（自動）

```bash
pnpm install
pnpm local:setup     # event・event_staff・staff_invite の表ができる
pnpm check
```

## 2. 手元（手で）

`.env` の `ORGANIZER_LINE_USER_ID` に、手元のログインで使う LINE のユーザー ID（例：`U` と `f` の32文字）を入れて `pnpm dev`。

1. `http://localhost:5173/dev/login?redirect=/admin/events` で、その ID でログインする。
2. 「交流会を追加」で、名前・日付・時刻・会場・参加費を入れて「作る」。一覧に出る。
3. 「準備」で、受付QRとアンケートQRが並ぶ。「印刷の画面」→「印刷する」で、1枚に1つの QR が出る。
4. 「アンケートを開く」→「アンケートは開いています」。
5. 「招待のリンクを作る」→ リンクを写し、別のブラウザ（別の LINE のユーザー ID でログイン）で開いて「受ける」。一覧にその交流会だけが出る。準備の画面は開けない。
6. 主催者の準備の画面で、その受付係を「外す」。

## 3. 本番に出したあと（手で）

- [ ] 受付QR・アンケートQRを LINE のカメラで読むと、ミニアプリでその交流会の画面が開く（構成 Open Questions 1）
- [ ] 招待のリンクを LINE で開くと、P3 が開き、受けると受付係になる
- [ ] PC のブラウザで QR の印刷の画面を印刷すると、1枚に1つの QR だけが載る
- [ ] Cloud Logging に招待の印が出ていない
