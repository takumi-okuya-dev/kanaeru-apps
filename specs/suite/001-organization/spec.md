# Feature Specification: スイートの組織（人と役割・招待・抜ける・引き継ぐ・消す）と、退会の手順の組み立て（suite-001）

**Feature Branch**: `feature/threads-011-meguru-parity`（threads-011・012 と同じ作業の場所。PR は分けて出す）

**Created**: 2026-11-20

**Status**: Draft（手元で実装と確かめまで済み。コミット・PR はまだ。【仮決め】は主催者の確かめを待つ）

**Input**: 主催者の指示（2026-11-20）「スイートの組織と、その上の Threads のチーム運用を作る」。範囲は [PRD 組織と Threads のチーム運用](../../../_bmad-output/prd-kanaeru-org/prd-kanaeru-org.md) の 4章（FR-O1〜FR-O55）・6章・8章、作りは[構成の決めごと](../../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) AD-22・AD-19・AD-16・AD-15。主催者が決めたこと：組織は suite の共通の領域が持つ・契約の持ち主はアカウントか組織（表の形と判定の形だけ。払うしくみは作らず、どの機能も契約で止めない）・持ち主の退会では組織に入れた記録を組織の管理者に引き継ぐ・退会の手順は組み立てが各領域の `index.ts` から集め、共通 → アプリの一覧の順 → account で流す（suite はほかの領域を呼ばない・各段はやり直せる）。

Threads の側（組織に入れる・担当・承認を任せる・運用状況・退会の引き継ぎ）は [threads-013](../../threads/013-team-operation/spec.md)。

## Clarifications

### Session 2026-11-20

主催者が決めたもの（上の Input）と、AI が決めたもの（【仮決め】）。PRD の【仮決め】（O1〜O20）はそのまま使った。

- Q: 招待の札の持ち方 → A: 照らし合わせは SHA-256 だけ（PRD FR-O21）。PRD の「管理者はいつでも出してコピーできる」と両立させるため、出し直すための写しを秘密の箱（`@workspace/secret-box`）で包んで持つ（めぐるの invite-service と同じ形）。秘密の箱の設定がない環境では写しを持たず、「作り直す」を押したときだけ出す【仮決め】
- Q: 札の形 → A: 32バイトの乱数の base64url（43文字）。形が違う札は DB を読まずに「使えないリンク」（404 `ORGANIZATION_INVITE_INVALID`）【仮決め】
- Q: 「1人が作れる組織は20」の数え方 → A: 作った人の記録を持たないので、管理者として持っている組織の数で数える（引き継いで管理者になった組織も数える）【仮決め】
- Q: 新しい人の知らせ（FR-O55）→ A: 組織に `admin_seen_at` を持ち、管理者が組織の画面を開いたときより後に入った人に「新しい人」の印を1回だけ出す（開いたら今にする）【仮決め】
- Q: 管理者が自分の役割を変える・自分を外す → A: 409 `ORGANIZATION_SELF_NOT_ALLOWED`（引き継ぎを使う）【仮決め】
- Q: 管理者が抜ける窓口 → A: `POST …/leave` に `successorAccountId` を付ける（なければ 409 `ORGANIZATION_SUCCESSOR_REQUIRED`）。引き継ぎと抜けるを1つのトランザクションで行う【仮決め】
- Q: 退会での管理者の引き継ぎ先（FR-O34）→ A: いちばん長くいる人（入った日時 → account の ID の順）。前の管理者は編集者になり、そのあと account を消すときに組織の人の行ごと消える【仮決め】
- Q: 退会の手順の形 → A: 各領域の `index.ts` が `withdrawal`（`prepare(db, accountId)` と `preview(db, accountId)`。型は `kernel/withdrawal.ts`）を出す。組み立て（`app.ts` の `orderWithdrawalSteps`）が、共通の領域を `COMMON_DOMAINS` の順、次にアプリを一覧の順（アプリの中は `domains` の順）に並べ、`DomainRouteDeps.withdrawalSteps` で渡す。account の退会と、主催者がアカウントを消す窓口が順に流してから消す。確かめの中身は `GET /api/v1/accounts/me/withdrawal`【仮決め】
- Q: 退会の確かめの中身の形 → A: `{ items: [{ kind: "organization" | "handover" | "delete", source, text }] }`。文は各領域が日本語で作る。画面は種類ごとに「組織」「引き継がれる記録」「消える記録」に分けて出す【仮決め】
- Q: 契約の表（PRD 8章は「まだ作らない」）→ A: 主催者の指示で、持ち主の形だけ先に作った：`entitlement`（`app_key`・`holder_account_id`・`holder_organization_id`。どちらか1つだけの CHECK・どちらも CASCADE）。`hasEntitlement(db, { ownerAccountId, organizationId }, appKey)` は `ENTITLEMENTS_ENFORCED = false` の間いつも true（判定の問い合わせは書いてあり、テストで確かめる）。どの窓口も呼ばない【仮決め】
- Q: 組織の画面の入口（FR-O53）と招待の説明（FR-O22）をアプリが足す仕組み → A: 画面の領域の `feature.organization`（`links(organizationId)`・`joinNotes`）。組み立て（`router.tsx`）が属するアプリを付けて `lib/organization.ts` に渡し、suite の画面は見えるアプリの分だけ出す（O9）
- Q: 招待の道の置き場所 → A: `packages/contracts/src/core/participant-paths.ts` の `PARTICIPANT_ROUTE_PATTERNS.join`（`/join/$joinToken`）と `participantPaths.join`。画面は外枠のナビを出さない（`layout: "bare"`）。予約語に `join` を足した（O3）
- Q: QR の部品 → A: suite は event の画面を読めないので、event の `QrCode` を suite の中に写した（AD-18「形が固まったら共通に移す」。2つ目の領域が使ったので、`lib` に移す小さな共通の PR の候補）【仮決め】
- Q: 組織の操作の記録 → A: 持たない（O14）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 組織を作って招く (Priority: P1)

設定 › 組織で組織を作り、招待のリンク（と QR）を出してほかの人に送る。開いた人は組織の名前・管理者・人数と、何が誰に見えるか（アプリの説明を含む）を確かめて、メンバーとして入る。

**Acceptance Scenarios**:

1. **Given** ログインした人, **When** 名前を入れて作る, **Then** 管理者として組織の画面が開く
2. **Given** 招待のリンク, **When** 別の人が開いて「入る」を押す, **Then** メンバーとして入り、管理者の画面に「新しい人」が1回だけ出る
3. **Given** 作り直したリンク, **When** 前のリンクを開く, **Then** 「使えないリンク」と「管理者に新しいリンクを頼んでください」

### User Story 2 - 役割を切り替え、外し、引き継ぐ (Priority: P1)

管理者がメンバー⇔編集者を切り替え、人を外し、管理者を引き継ぐ。管理者が抜けるときは、先に引き継ぐ人を選ぶ。

### User Story 3 - 退会で、組織と記録の行き先を確かめる (Priority: P1)

退会の確かめの枠に、組織（引き継ぐ・消える）・引き継がれる記録・消える記録が分けて出る。退会すると、その順に片付く。

## Requirements *(mandatory)*

- **FR-1**: 組織の操作の判定は suite の1か所（`requireOrganizationRole`）。組織の人でなければ 404、管理者だけの操作で管理者でなければ 403。役割は要求のたびに引く。
- **FR-2**: 人数・編集者の数・管理者が1人は、組織の行の鍵のあとに数え、DB の部分の一意の制約でも守る。
- **FR-3**: suite はほかの領域の表に書かない。人が抜ける・組織が消えるときのアプリの片付けは、アプリの表の複合の外部キー（`organization_member(organization_id, account_id)` を CASCADE）で起きる。
- **FR-4**: 退会の手順は、どの段も2回流して同じ結果になる。管理者のいない組織を残さない。
- **FR-5**: ログに招待の札・表示名を出さない。

## 範囲の外（PRD 9.2 のまま）

払うしくみ・組織が記録の持ち主になる形・受付係の見直し・複数の管理者・通知の一覧・組織の操作の記録。

## 残り

- コミットと PR は主催者に頼まれてから。DB の変更（`0012_suite_organization.sql`）は threads の `0013` より先に入れる。
- 構成の決めごと（Constitution の AD の範囲の書きぶり）と `docs/rules/specs.md` の suite の行に「組織」を足すのは、主催者の確かめのあとに。
