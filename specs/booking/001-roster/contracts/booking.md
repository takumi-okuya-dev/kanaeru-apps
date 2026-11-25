# Contracts: 予約の名簿（booking-001）

2026-11-20 作成。窓口はどれもログイン必須（account の `requireSession`）と、event の `requireEventRole`。道の頭は `/api/v1/booking/events/{eventId}`。形は `packages/contracts/src/booking/`。受付アプリ（suite の `requireApp`）の道として組み立てが付ける。

## 窓口

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `…/setting` | 主催者・受付係 | `BookingSetting`：`{ mode, entryCount }`（行がなければ `reception`・0） |
| PUT | `…/setting` | 主催者 | `{ mode: "reception" \| "roster" }`。答えは `BookingSetting` |
| GET | `…/entries` | 主催者・受付係 | `Roster`：行・人数・交流会の日が終わったか |
| POST | `…/entries` | 主催者・受付係 | `{ name, applicationSource, memo? }` → 201 `RosterEntry`（入口「手で足す」） |
| PUT | `…/entries/{entryId}/status` | 主催者 | `{ status: "confirmed" \| "cancelled" }` → `RosterEntry` |
| POST | `…/entries/merge` | 主催者 | `{ keepEntryId, removeEntryId }` → `RosterEntry`（残した行） |
| POST | `…/entries/import/preview` | 主催者 | `RosterImportInput` → `RosterImportPreview`（書かない） |
| POST | `…/entries/import` | 主催者 | `RosterImportInput` → `RosterImportResult`（入った・すでにある・名前が空の数）。`mapping` があれば持ち主の列の対応を覚える（画面は、列が50を超える・見出しが100文字を超える CSV では `mapping` を送らず名前だけで取り込む） |
| GET | `…/import-mappings` | 主催者 | `{ mappings: { headers, nameColumn, applicationSource }[] }`（交流会の持ち主のもの） |
| GET | `…/entries/export` | 主催者 | 名簿の CSV |
| GET | `…/matches` | 主催者・受付係 | `MatchBoard`：チェックインごとの当ての状態（新しい順）・名簿から選べる行・人数 |
| POST | `…/checkins/{checkinId}/match` | 主催者・受付係 | `{ entryId }`：当てる・名簿から選ぶ → `MatchBoard` |
| POST | `…/checkins/{checkinId}/dismiss` | 主催者・受付係 | `{ entryId }`：ちがう人 → `MatchBoard` |
| POST | `…/checkins/{checkinId}/walk-in` | 主催者・受付係 | 当たらないチェックインを飛び入りの行にして当てる → 201 `MatchBoard` |
| DELETE | `…/entries/{entryId}/match` | 主催者・受付係 | 手で当てたものを外す → `MatchBoard` |
| POST | `…/entries/{entryId}/checkin` | 主催者・受付係 | 受付の `CheckinInput`：名簿から選んで手でチェックインし、当てる → 201 `MatchBoard` |
| POST | `…/walk-ins` | 主催者・受付係 | 受付の `CheckinInput`：名簿にいない人を手でチェックインし、飛び入りの行を足す → 201 `MatchBoard` |

ない交流会は 404（event の `NOT_FOUND`）、役目が違えば 403（event の `FORBIDDEN`）。使い方が「受付だけ」なら、`…/setting` のほかは 409 `BOOKING_ROSTER_OFF`。

## 形

```ts
type BookingMode = "reception" | "roster";
type EntryKind = "manual" | "import" | "walk_in";
type EntryStatus = "confirmed" | "cancelled";
type Attendance = "came" | "no_show" | "pending"; // 来た・来なかった・まだ

// BookingSetting
{ mode: BookingMode; entryCount: number }

// RosterEntry
{
  id: string;
  name: string;
  applicationSource: ApplicationSource; // 受付の申し込みの媒体
  entryKind: EntryKind;
  status: EntryStatus;
  appliedAt: string;
  enteredByName: string | null; // 手で足した・飛び入りの入れた人
  memo: string | null;
  sameName: boolean;
  attendance: Attendance;
  match: "manual" | "auto" | null; // どう当たったか
}

// Roster
{
  entries: RosterEntry[]; // 申し込んだ日時の古い順
  counts: { confirmed; cancelled; came; noShow; walkIn; bySource: { applicationSource; count }[] }; // bySource は確定の行
  eventEnded: boolean;
}

// RosterImportInput（ファイルは送らない。research R5）
{
  applicationSource: ApplicationSource;
  rows: { line: number; name: string }[]; // 1〜500行。name は空でもよい（「名前が空」になる）・50文字まで
  mapping?: { headers: string[]; nameColumn: string }; // CSV のときだけ。見出しは50列・100文字まで
}

// RosterImportPreview
{
  rows: { line: number; name: string; outcome: "insert" | "existing" | "empty"; sameName: boolean }[];
  counts: { insert: number; existing: number; empty: number };
}

// RosterImportResult
{ counts: { insert: number; existing: number; empty: number } }

// MatchBoard（受付係の画面 S1）
{
  checkins: {
    checkinId: string;
    name: string;           // チェックインの名前（写し）
    method: "line" | "manual";
    checkedInAt: string;
    state: "candidate" | "unmatched" | "matched_auto" | "matched_manual" | "walk_in";
    entry: { id: string; name: string; applicationSource: ApplicationSource } | null; // 当たった行か候補
  }[];
  choices: { id: string; name: string; applicationSource: ApplicationSource }[]; // 名簿から選べる行（確定・当たっていない）
  counts: { came: number; confirmed: number; walkIn: number; pending: number }; // pending＝候補と名簿にいないの数
}
```

エラー（`BOOKING_ERRORS`）：

| code | 状態 | 文言 |
|---|---|---|
| `BOOKING_ROSTER_OFF` | 409 | この交流会は名簿を使っていません。準備の画面の「使い方」で「名簿を使う」を選んでから、もう一度開いてください。 |
| `BOOKING_ENTRY_NOT_FOUND` | 404 | 名簿の行が見つかりません。ほかの端末で消された・まとめられたかもしれません。画面を読み直してください。 |
| `BOOKING_CHECKIN_NOT_FOUND` | 404 | チェックインが見つかりません。取り消されたかもしれません。画面を読み直してください。 |
| `BOOKING_ENTRY_NOT_MATCHABLE` | 409 | この行には当てられません。取り消しの行か、もうほかのチェックインに当たっています。画面を読み直してください。 |
| `BOOKING_CHECKIN_ALREADY_MATCHED` | 409 | このチェックインは、もう名簿に当たっています。画面を読み直してください。 |
| `BOOKING_MATCH_NOT_MANUAL` | 409 | この当ては、同じ LINE のアカウントで自動で当たったものなので外せません。違うときは、チェックインを取り消してください。 |
| `BOOKING_MERGE_NAME_MISMATCH` | 400 | まとめられるのは、同じ名前の行どうしだけです。 |
| `BOOKING_MERGE_BOTH_MATCHED` | 409 | 2人とも来ています。別の人ではありませんか。同じ人なら、先に片方の当てを外してからまとめてください。 |

## ほかの領域が使うもの

### reception が足す（`apps/api/src/modules/reception/index.ts`）

| 名前 | 何か |
|---|---|
| `listEventAttendees(db, eventId)` | `{ checkinId, name, accountId, method, checkedInAt }[]`（古い順）。ほかのアプリ（試合表など）も使う（FR-B103） |
| `hasCheckedIn(db, eventId, accountId)` | `boolean` |
| `createManualCheckin(db, config, { eventId, enteredBy, input })` | 手でのチェックインを作る（参加費・割引・金額は手でのチェックインの窓口と同じ）。`CheckinRecord` を返す。選べない割引は 400 `DISCOUNT_UNAVAILABLE` |

### booking が出す（`apps/api/src/modules/booking/index.ts`）

`routes`・`withdrawal`（確かめの中身だけ）。ほかの領域に出す関数はない（AD-23：ほかのアプリには reception がチェックインを出す）。

### 画面の差しこみの場所（この仕様で足す）

- event：`registerSetupSection({ id, Component: ({ event }) => … })`（準備の画面の「持ち主と組織」のあと）
- reception：`registerReceptionSection({ id, Component: ({ event }) => … })`（一覧画面の上）。あわせて `CheckinFields`・`EMPTY_CHECKIN_FORM`・`validateCheckinForm`・`focusFirstCheckinError`・`isNightStop`・`receptionPollInterval` を出す
