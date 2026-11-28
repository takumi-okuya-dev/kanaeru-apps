# Quickstart：PaletKit の交流会を会った場に選ぶ（person-002）

## 前提

- 共通の PR（`feat/core-person-event-sources`：受付の `listCheckedInEventIds`・交流会の `listAccountEventSummaries`・lint の許す一覧）と、person-001 が `develop` に入っている。
- 手元：`pnpm local:setup` のあと `pnpm dev`。ログインは見本の LINE ログイン（`docs/rules/coding.md` 6章）。

## 確かめ

1. **候補に出る会**：
   - 手順：主催者 A で交流会を3つ作る（会1・会2・会3）。別の人 B を会2の受付係にし、会3に B でチェックインする。B の `/person/meetings` を開く。
   - 結果：会2と会3が出て、会1は出ない。会3を A の組織に入れて B を部員にしても、出るものは変わらない。
2. **作って続けて足す**：
   - 手順：B で会3の「開く」を押す。
   - 結果：会3の名前と日付の会った場が開く。続けて2人を足すと、会った場の画面に2人が並ぶ。`/person/meetings` に戻ると、会3に「作った」の札が付いている。
3. **二度作らない**：
   - 手順：会3の「開く」をもう一度押す。
   - 結果：同じ会った場が開く。
4. **残り方**：
   - 手順：A で会3の名前を直す。そのあと会3を消す（消せる交流会のとき）。
   - 結果：B の会った場は、作ったときの名前と日付のまま、人も付いたまま残る。候補からは会3が消える。
5. **受付アプリが見えない**：
   - 手順：受付アプリを止めた（台帳で見えない）状態で `/person/meetings` を開く。
   - 結果：「PaletKit の交流会」の欄が出ない。`POST /api/v1/person/meetings/from-event` は 404。
6. **名簿が出ない**：
   - 手順：会3にほかの人 C を「決まった言葉」の名前でチェックインさせる。
   - 結果：B の候補の欄・会った場の画面・API の答えに、その言葉が出ない。

## 自動のテスト

- `pnpm check`（単体・結合・E2E・lint・型）。
- 結合：`apps/api/src/modules/person/event-meetings.test.ts`（候補の条件・作る・二度作らない・確かめ直し・残り方・名簿が出ない）。
- 画面：`apps/web/src/features/person/MeetingsPage.test.tsx`。
- E2E：`e2e/tests/person.spec.ts` に交流会から作る流れを足す。
