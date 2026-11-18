# Feature Specification: 共通の土台（core-001）

**Feature Branch**: `feature/core-001-foundation`

**Created**: 2026-11-19

**Status**: Draft

**Input**: 構成の決めごと（`_bmad-output/architecture-kanaeru/architecture-kanaeru.md`）の「最初に入れる共通の PR」3つ（設定と `DB_UNAVAILABLE`／画面のファイルを返すことと画面の CSP／`lib/liff.ts` と `contracts/src/core` の道・日本時間の関数）と、見本の領域 `notes` の削除、プロダクトの見た目の値（墨）。

## Clarifications

### Session 2026-11-19

開発者が不在のため、AI が仮に決めた（【仮決め】。理由は [research.md](./research.md)）。

- Q: `DB_UNAVAILABLE` と、いまの `UNAVAILABLE`（503）は並べるか → A: `UNAVAILABLE` を `DB_UNAVAILABLE` に置きかえる（503 を返す理由は DB だけ。1つの状態の番号に2つの code を持たない）【仮決め R3】
- Q: 画面のファイルを返すかどうかは何で決めるか → A: 設定 `WEB_DIST_DIR`（組み立てた画面の場所）。あれば返す。staging・production では必須【仮決め R6】
- Q: `note` の表は2回に分けて消すか → A: 1回で消す。本番にまだ何も出ていない（前の版のアプリがない）ため【仮決め R1】
- Q: LIFF ID がないとき（手元・テスト）、画面はどう動くか → A: LINE につながない仮の形で動く。ログインしていない・IDトークンがない、として振る舞う【仮決め R8】
- Q: 「その日の終わり」は含むか含まないか → A: 翌日の日本時間 0時の時刻を返し、「その時刻より前なら、その日のうち」とする【仮決め R10】
- Q: 外のブラウザで LIFF の小さな窓（`subWindow`）が要る `'unsafe-eval'` を画面の CSP に入れるか → A: 入れない。友だち追加は LINE の中で出すため、守りを優先する【仮決め R7】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 1つの置き場所で、画面と API が同じ源で動く (Priority: P1)

主催者・受付係・参加者が、1つの URL（本番の置き場所）を開くと、画面が出て、その画面から同じ源の API を使える。LINE の中で開いても、LINE のログインの仕組みが守りの見出し（CSP）に止められない。

**Why this priority**: 置き場所が1つ（AD-8）でないと、クッキーのセッション（account）も LINE ログインも動かず、どの領域も始められない。

**Independent Test**: 組み立てた画面を API に渡して起動し、`/`・`/e/{id}/checkin` のような画面の道で画面が出ること、`/api` の道は API の答えと API の守りの見出しが返ることを確かめる。

**Acceptance Scenarios**:

1. **Given** 組み立てた画面の場所が設定にある, **When** `/api` 以外の道（ファイルがない道を含む）を開く, **Then** 画面（`index.html`）と画面の CSP が返る
2. **Given** 同じ設定, **When** `/api/v1/...` を開く, **Then** API の答えと API の CSP（すべてを止める形）が返り、ない道は API のエラーの形の 404
3. **Given** 画面の CSP, **When** LINE の SDK が必要な源に通信する, **Then** 止められない（それ以外の外の源は止める）
4. **Given** staging・production, **When** 画面の場所が設定にない、または `index.html` がない, **Then** 起動しない

---

### User Story 2 - DB が止まっていても、分かる形で断る (Priority: P1)

夜間（0時〜8時）に DB が止まっているとき、どの窓口も待ち続けずに 503 と決まった code（`DB_UNAVAILABLE`）と日本語の文を返し、画面がそのまま「夜間（0時〜8時）は止まっています」と出せる。

**Why this priority**: 夜間停止（AD-10）は毎日起きる。分かりにくいエラーで落ちると、交流会の主催者が困る。

**Independent Test**: 答えない DB・つながらない DB を指して窓口を呼び、時間の上限のうちに 503・`DB_UNAVAILABLE` が返ることを確かめる。

**Acceptance Scenarios**:

1. **Given** DB につながらない（拒否・時間切れ・止まっている）, **When** どの窓口が DB を読んでも, **Then** 503・`DB_UNAVAILABLE`・決まった文が返る
2. **Given** DB が答えない, **When** 動いているかの窓口を呼ぶ, **Then** 時間の上限のうちに 503・`DB_UNAVAILABLE`
3. **Given** DB の別のエラー（制約の違反など）, **When** 起きる, **Then** `DB_UNAVAILABLE` にはならない

---

### User Story 3 - 領域が使う共通の部品がそろっている (Priority: P2)

account・event・reception・survey の領域のセッションが、設定（LINE のチャネル・主催者・オープンチャット）・LINE の始め方・参加者が開く道とミニアプリの URL・日本時間の日付を、自分で作らずに1か所から使える。

**Why this priority**: 領域ごとに作ると食い違う（AD-4・AD-14・Consistency Conventions）。並行して始める前にそろえる。

**Independent Test**: 各部品の単体のテスト（設定の確かめ・仮の LIFF・道とパーマリンク・日本時間）で確かめる。

**Acceptance Scenarios**:

1. **Given** staging・production, **When** `LINE_CHANNEL_IDS`・`ORGANIZER_LINE_USER_ID` がない・形が違う、または `OPEN_CHAT_URL` が https でない, **Then** 起動しない。local・test ではなくてもよい
2. **Given** LIFF ID がない（手元・テスト）, **When** 画面を開く, **Then** LINE なしで画面が動き、未ログイン・IDトークンなしとして振る舞う
3. **Given** 交流会の ID, **When** 受付の道とミニアプリの URL を作る, **Then** `https://miniapp.line.me/{LIFF ID}/e/{eventId}/checkin`
4. **Given** どの時刻帯のサーバーでも, **When** 2026-11-25T15:30Z の日本時間の日付とその日の終わりを求める, **Then** `2026-11-26` と `2026-11-26T15:00Z`

---

### User Story 4 - 見本の領域がなく、見た目がプロダクトの色 (Priority: P3)

テンプレートの見本の領域（メモ）がコード・DB・文書から消え、画面の色がプロダクトの墨（DESIGN.md）になる。

**Why this priority**: 見本が残ると、ほかのセッションが見本を真似たり、ぶつかったりする。色は画面を作る前にそろえる。

**Independent Test**: `notes` の道・表・画面がないこと、見た目の値のテストがプロダクトの DESIGN.md と一致することを確かめる。

**Acceptance Scenarios**:

1. **Given** DB の変更を当てた DB, **When** 表を見る, **Then** `note` の表がない（既存の DB の変更のファイルは書き換えない）
2. **Given** `tokens.css`, **When** 値のテストを流す, **Then** プロダクトの DESIGN.md（土台を引き継いだもの）と一致する

### Edge Cases

- 画面の道に見えるが拡張子のある道（`/assets/ない.js`）は、`index.html` を返さず 404（壊れた JS を HTML で返さない）。
- `..` や `%2e%2e` を使った道で、組み立てた画面の外のファイルを読ませない。
- `/api` と `/apifoo` を取り違えない（`/api` そのものと `/api/` の下だけが API）。
- LINE の SDK が読みこめない・始められないとき、画面は分かる文を出す（EXPERIENCE の「読みこめない」）。
- LIFF の古い版（2.31.0 以下）を入れない。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 見本の領域 `notes` の API・画面・約束・見本のデータ・テスト・文書を消し、`note` の表を消す DB の変更を新しく足す。
- **FR-002**: 設定に `LINE_CHANNEL_IDS`（数字のチャネル ID をカンマで並べる）・`ORGANIZER_LINE_USER_ID`（LINE のユーザー ID の形）・`OPEN_CHAT_URL`（任意・https）を足す。staging・production では、前の2つがなければ起動しない。どの環境でも形が違えば起動しない。
- **FR-003**: DB に届かないこと（拒否・時間切れ・止まっている）を、土台のエラーの処理の1か所で 503・`DB_UNAVAILABLE` に読みかえる。動いているかの窓口も同じ code を返す。
- **FR-004**: 動いているかの窓口は DB に触るので、置き場所の起動の確かめ（probe）には使わない（既定の TCP の確かめのまま）。
- **FR-005**: 設定で組み立てた画面の場所があれば、API が画面のファイルを返し、`/api` 以外のファイルのない道は `index.html` を返す。`/api` は API の CSP、ほかは画面の CSP。
- **FR-006**: 画面の CSP は、自分の源と、LINE の SDK（`@line/liff` 2.32）が要る源だけを許す。
- **FR-007**: LINE の始め方（init・ログインしているか・ログイン・IDトークン・LINE の中か・友だち追加を勧める〈使えるときだけ〉）を画面の共通の1か所に置き、組み立てがルーターより先に呼ぶ。LIFF ID は組み立てのときに埋め、ないときは LINE なしの仮の形で動く。
- **FR-008**: 参加者が開く道（`/e/{eventId}/checkin`・`/e/{eventId}/survey`・`/invite/{inviteToken}`）と、道からミニアプリの URL（パーマリンク）を作る関数を1つ、約束の土台に置く。
- **FR-009**: 「日本時間の日付」と「その日の終わり」を出す関数を約束の土台に置き、サーバーの時刻帯に頼らない。
- **FR-010**: 見た目の値の primary の組を墨（`#3B3833`・`#34312D`・`#FFFFFF`）にし、`primary-subtle`（`#EFEFEF`）を足す。値のテストはプロダクトの DESIGN.md（土台を引き継ぐ形）を読む。
- **FR-011**: 今の形の文書（全体の形・文書の一覧・決まりの中の見本の参照）を、変えたことに合わせる。

### Key Entities

- **設定**：LINE のチャネル ID の並び・主催者の LINE のユーザー ID・オープンチャットの URL・組み立てた画面の場所。
- **参加者が開く道**：受付・アンケート・招待の3つ。ミニアプリの URL はこの道から作る。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 全部の確かめ（`pnpm check`：秘密の値・依存・整形・型・lint・単体と結合・E2E）が通る。
- **SC-002**: DB が答えないとき、窓口は3秒以内に 503・`DB_UNAVAILABLE` を返す（時間の上限を短くしたテストで）。
- **SC-003**: 組み立てた画面を API から返し、CSP を効かせたまま画面を開いて違反が0件（E2E）。
- **SC-004**: コード・設定・今の形の文書に、見本の領域 `notes` の参照が残らない（仕様・構想・過去の DB の変更を除く）。

## Assumptions

- 本番の置き場所（Terraform・Dockerfile・デプロイの流れ）は別のセッションが作る。この仕様は、コンテナの中で `WEB_DIST_DIR` を設定すれば動く形まで。
- 試験用のログインの窓口と `POST /api/v1/auth/line` は account-001 が作る（AD-12）。
- 本物の LINE ログインは、置き場所に出してから確かめる（手元の http では動かない）。
- DB に届かないときの画面の出し方（見出しとして出すなど）は、各領域の画面で作る。この仕様は、文をそのまま出せる形の code と文言まで。
