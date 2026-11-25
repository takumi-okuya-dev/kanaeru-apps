# Feature Specification: アカウント・LINE ログイン・今の利用者（account-001）

**Feature Branch**: `feature/account-001-line-login`（`feature/core-001-foundation` の上に積む）

**Created**: 2026-11-19

**Status**: Draft

**Input**: 構成の決めごと AD-2・AD-3・AD-4・AD-5・AD-7・AD-12 の account の持ち分。LINE の ID トークンを API が確かめて自前のセッションを出すこと、今の利用者を受け取る1つの仕組み（API の `requireSession`・`currentAccount(c)`、画面の `useSession()`）、主催者か（`isOrganizer`）、アカウントを消す関数と主催者だけの窓口、手元とテストの試験用のログイン。PRD の FR-3（主催者の見分けの土台）・FR-4（名前の初期値になる表示名）・FR-6（友だち追加はチャネルの設定）・FR-16（消す関数）。

## Clarifications

### Session 2026-11-19

開発者が不在のため、AI が仮に決めた（【仮決め】。理由は [research.md](./research.md)）。

- Q: 試験用のログインを使えるかは何で決めるか → A: 設定 `TEST_LOGIN_ENABLED`（既定は切）。staging・production で入なら起動しない（見本のデータの設定と同じ形）。手元の見本の `.env` とテスト・E2E は入【仮決め R3】
- Q: セッションのクッキーに何を入れ、DB に何を持つか → A: クッキーには乱数の通し札（32バイト）を入れ、DB には札の SHA-256 だけを持つ【仮決め R4】
- Q: セッションの30日は、使うたびに延ばすか → A: 延ばさない（作ってから30日で切れる）。切れたら、LINE の中では自動でログインし直す【仮決め R5】
- Q: LINE の表示名が変わったら、account の表示名も変えるか → A: LINE でログインするたびに、確かめた ID トークンの `name` で上書きする（`name` がなければ変えない）【仮決め R6】
- Q: 自動でログインし直してもうまくいかないとき、画面はどうするか → A: 自動で試すのは、ページを開いてから（または前に成功してから）1度だけ。だめなら「LINEでログインし直す」のボタン（LINE の中は開き直し、外のブラウザは LINE のログインへ）【仮決め R9】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - LINE の中で開くだけでログインが済む (Priority: P1)

参加者が受付QR から LINE の中でミニアプリを開くと、文字を打たずにログインが済み、初めてならアカウントができる（登録）。画面から送られた名前や ID は信じず、LINE が確かめた ID トークンだけで本人を決める。

**Why this priority**: チェックイン（FR-4）・受付係・主催者の画面のすべてが、ログインと今の利用者を前提にする（AD-12）。

**Independent Test**: LINE の確かめを仮のものに差しかえ、`POST /api/v1/auth/line` に ID トークンを送ると、アカウントが作られ（2回目は同じアカウント）、セッションのクッキーが出て、`GET /api/v1/accounts/me` が自分を返すことを確かめる。

**Acceptance Scenarios**:

1. **Given** 初めての LINE の利用者, **When** 正しい ID トークンを送る, **Then** アカウントができ、表示名は LINE の名前、登録日はその時刻、`HttpOnly; SameSite=Lax; Path=/`（https では `Secure`）のクッキーが出る
2. **Given** すでにアカウントがある利用者, **When** もう一度ログインする, **Then** 同じアカウントのまま、新しいセッションが出る（表示名は新しい名前に変わる）
3. **Given** 期限切れ・別のチャネル・形の違う ID トークン, **When** 送る, **Then** 401 `LINE_LOGIN_FAILED` で、アカウントもセッションもできない
4. **Given** LINE に届かない（時間切れ・LINE の障害）, **When** 送る, **Then** 待ち続けず 502 `LINE_UNREACHABLE`
5. **Given** 画面が名前やユーザー ID を本文に足して送る, **When** ログインする, **Then** 受け取らない（400）。本人は ID トークンだけで決まる

---

### User Story 2 - ほかの領域が今の利用者を1つの仕組みで受け取る (Priority: P1)

event・reception・survey のセッションが、クッキーやセッションの表を自分で読まずに、道の前に `requireSession` を付けて `currentAccount(c)` を読むだけで、今の利用者（account の id と LINE のユーザー ID）が分かる。未ログインは、どの領域でも同じ 401 `UNAUTHENTICATED`。

**Why this priority**: 並行して作るほかの領域が、すぐに使う（AD-12）。

**Independent Test**: テストの中で `requireSession` を付けた道を足し、クッキーなし・期限切れ・消したアカウントで 401、ログインしたクッキーで `currentAccount` が返ることを確かめる。

**Acceptance Scenarios**:

1. **Given** クッキーがない・知らない札・期限の切れたセッション, **When** `requireSession` の付いた道を呼ぶ, **Then** 401 `UNAUTHENTICATED`（決まった日本語の文）
2. **Given** ログインしたクッキー, **When** 呼ぶ, **Then** `currentAccount(c)` が account の id と LINE のユーザー ID を返す
3. **Given** ログアウトした・アカウントを消した, **When** 同じクッキーで呼ぶ, **Then** 401

---

### User Story 3 - 主催者だけが使える操作を見分け、頼まれたらアカウントを消せる (Priority: P2)

主催者は設定の LINE のユーザー ID と同じ人で、表に印を持たない。主催者は、参加者に頼まれたら、その人のアカウントを消せる（セッションも消える。チェックイン・回答はその表を作る領域が CASCADE で消す）。

**Why this priority**: 管理の画面の権限（FR-3）とデータの削除（FR-16）の土台。画面と流れは event・reception の仕様で作る。

**Independent Test**: 主催者のクッキーで `DELETE /api/v1/accounts/{accountId}` が 204 になり、相手のセッションが使えなくなること、主催者でなければ 403 であることを確かめる。

**Acceptance Scenarios**:

1. **Given** 設定の主催者と同じ LINE のユーザー ID, **When** `GET /api/v1/accounts/me`, **Then** `isOrganizer: true`。ほかの人は `false`。設定に主催者がなければ誰も主催者でない
2. **Given** 主催者, **When** 参加者のアカウントを消す, **Then** 204。そのアカウントのセッションも消え、もう一度消すと 404
3. **Given** 主催者でない, **When** 消そうとする, **Then** 403 `FORBIDDEN`

---

### User Story 4 - 手元とテストでは LINE なしでログインできる (Priority: P2)

開発者と E2E は、LINE（https のエンドポイント）なしに、試験用のログイン（LINE のユーザー ID と表示名を渡す）でセッションを作れる。本番では、この窓口を入にしたままでは起動しない。

**Why this priority**: 手元の http では本物の LINE ログインが動かない（docs/study/line.md 5）。ほかの領域の E2E も使う。

**Independent Test**: 試験用のログインを入にした API で、LINE のユーザー ID と表示名を送るとセッションが出ること、切のときは 404 であること、staging・production で入にすると設定の確かめで止まることを確かめる。E2E で、画面の手元のログインから入り、`/api/v1/accounts/me` が自分を返すことを確かめる。

**Acceptance Scenarios**:

1. **Given** `TEST_LOGIN_ENABLED=true`（local・test）, **When** `POST /api/v1/auth/test-login`, **Then** アカウントを作るか探し、セッションのクッキーが出る
2. **Given** `TEST_LOGIN_ENABLED` が切, **When** 呼ぶ, **Then** 404
3. **Given** `APP_ENV` が staging・production, **When** `TEST_LOGIN_ENABLED=true` で起動する, **Then** 起動しない
4. **Given** LIFF ID のない画面（手元・E2E）, **When** 手元のログインの画面で名前を入れて送る, **Then** ログインでき、今の利用者の名前が出る

---

### User Story 5 - 画面がセッションの切れ目で迷わない (Priority: P2)

画面のどこかの API が 401 を返したら、LINE の中なら自動でログインし直して同じ画面のまま続ける。うまくいかなければ「LINEでログインし直す」のボタンを出す（EXPERIENCE.md の未ログインの状態）。

**Why this priority**: セッションは30日で切れる。受付の行列で止まらないように。

**Independent Test**: 画面の単体のテストで、仮の LIFF（ログイン済み・ID トークンあり）のとき、`/accounts/me` が 401 なら `/auth/line` に ID トークンを1度だけ送り、今の利用者を出すこと、失敗したらボタンを出すことを確かめる。

**Acceptance Scenarios**:

1. **Given** LINE の中でログイン済み・セッションなし, **When** 画面を開く, **Then** ID トークンを1度だけ送り、ログインした状態になる
2. **Given** ログインし直しが失敗した, **When** 画面を見る, **Then** 「LINEでログインし直す」のボタンが見出しつきで出て、ログインを何度もくり返さない
3. **Given** LIFF ID のない画面, **When** 未ログイン, **Then** 手元のログインの画面への案内を出す

### Edge Cases

- ID トークンの `aud` が `LINE_CHANNEL_IDS` にない・`LINE_CHANNEL_IDS` が空：LINE に問い合わせずに 401 `LINE_LOGIN_FAILED`（設定が空の手元では本物のログインは使えない）。
- 同じ利用者が同時に2回ログインしても、アカウントは1つ（LINE のユーザー ID の一意の制約と upsert）。
- `name` のない ID トークン（`profile` のスコープなし）：初めてなら表示名は空の文字。
- DB の夜間停止中のログイン・`/accounts/me`：土台の 503 `DB_UNAVAILABLE`（account は読みかえない）。
- ID トークン・クッキー・札をログに出さない（ログの1行は道の形と状態だけ）。
- 期限の切れたセッションの行は、その人が次にログインしたときに消す。
- 主催者が自分のアカウントを消すこともできる（止めない）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: account の領域が `account`（id・LINE のユーザー ID〈一意〉・表示名・登録日〈作った時刻〉・直した時刻）と `session`（id・札の SHA-256〈一意〉・`account_id`〈`ON DELETE CASCADE`〉・期限・作った時刻）の表を持つ（AD-2・AD-3・AD-7）。
- **FR-002**: `POST /api/v1/auth/line` は ID トークンだけを受け取り、`aud` が設定の `LINE_CHANNEL_IDS` にあるときだけ、そのチャネル ID を `client_id` にして LINE の verify で確かめる。返った `sub` を LINE のユーザー ID、`name` を表示名にしてアカウントを作るか探し、30日のセッションとクッキーを出す。LINE への問い合わせには時間の上限を置く。
- **FR-003**: `POST /api/v1/auth/logout` は今のセッションの行を消し、クッキーを消す（セッションがなくても 204）。
- **FR-004**: `GET /api/v1/accounts/me` は今の利用者の id・表示名・主催者か・登録日を返す。未ログインは 401 `UNAUTHENTICATED`。
- **FR-005**: `DELETE /api/v1/accounts/{accountId}` は主催者だけが使え、アカウントを消す（204・ない ID は 404・主催者でなければ 403）。
- **FR-006**: `POST /api/v1/auth/test-login` は設定 `TEST_LOGIN_ENABLED` が入のときだけ使え（切なら 404）、LINE のユーザー ID と表示名でアカウントを作るか探してセッションを出す。staging・production で入なら起動しない。
- **FR-007**: account の入口（`index.ts`）が、ほかの領域に `requireSession`・`currentAccount(c)`・`isOrganizer`・`requireOrganizer`・`findAccountById(db, id)`・`deleteAccount(db, id)`・`accountTable`（外部キーのためだけ）を出す。
- **FR-008**: 画面の account の入口が `useSession()`（読みこみ中・ログイン済みと今の利用者・未ログイン）と、ログイン済みのときだけ中身を出す `SessionGate` を出す。LINE の中でログイン済みなら、セッションがないときに ID トークンを1度だけ送る。どの API の 401 でも、セッションを読み直してログインし直す。
- **FR-009**: LIFF ID のない画面では、手元のログインの画面（`/dev/login`）から試験用のログインを使える。
- **FR-010**: 友だち追加（FR-6）はミニアプリのチャネルの設定（Add friend option）で勧め、コードでは案内を出さない。あとで要るときのため、画面の account の入口から `requestFriendship()` を出す。
- **FR-011**: エラーの code と日本語の文言は、約束の account のフォルダに置く（`UNAUTHENTICATED` 401・`LINE_LOGIN_FAILED` 401・`LINE_UNREACHABLE` 502）。
- **FR-012**: ID トークン・クッキー・札・表示名をログに書かない。

### Key Entities

- **アカウント**：LINE の利用者1人。LINE のユーザー ID・表示名・登録日。ほかの領域は id を外部キーで参照するだけ。
- **セッション**：アカウントのログインの1回。札の SHA-256・期限（30日）。札そのものはクッキーにだけある。
- **今の利用者**：要求ごとに、セッションから引いた account の id と LINE のユーザー ID。
- **主催者**：設定 `ORGANIZER_LINE_USER_ID` と LINE のユーザー ID が同じ利用者（表に印を持たない）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 全部の確かめ（`pnpm check`）が通る。テストはネットワークに出ない（LINE の確かめは仮のものに差しかえる）。
- **SC-002**: LINE が答えないとき、ログインの窓口は5秒＋α以内に 502 で返る（時間の上限を短くしたテストで確かめる）。
- **SC-003**: DB に札そのものが残らない（テストでセッションの表を読み、札と同じ値がないことを確かめる）。
- **SC-004**: E2E で、手元のログイン → 今の利用者の表示までが、両方の幅でアクセシビリティの違反0件で通る。

## Assumptions

- 本物の LINE ログイン（ミニアプリ・同意の画面・友だち追加の選択肢）は、置き場所に出してから確かめる（構成の Open Questions 2・3）。
- 受付係の権限（交流会ごと）と、主催者がアカウントを消す画面・流れ（FR-16）は event・reception の仕様で作る。account は関数と窓口だけ。
- チェックイン・回答・受付係の表の `account_id` の CASCADE は、その表を作る領域が付ける（AD-7）。
- LINE のトークン（アクセストークン・ID トークン）は保存しない。
