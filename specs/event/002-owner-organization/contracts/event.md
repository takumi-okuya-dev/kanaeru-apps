# Contracts: 交流会の持ち主と組織（event-002）

2026-11-20 作成。窓口はどれもログイン必須（account の `requireSession`）。形は `packages/contracts/src/event/`。

## 変える窓口

| 動き | 道 | だれ | 変わること |
|---|---|---|---|
| GET | `/api/v1/events` | ログインした人 | 自分が主催者の交流会（持ち主・入れた組織の管理者と編集者）と受付係の交流会。運営者もすべては見ない。運営者が開くと、持ち主のない交流会を運営者のものにする |
| POST | `/api/v1/events` | ログインした人（前は運営者だけ） | 作った人が持ち主 |
| すべての交流会ごとの窓口（event・reception・survey） | `/api/v1/events/{eventId}/…` | 主催者・受付係（窓口ごとに前と同じ） | 主催者の決め方が「持ち主か、入れた組織の管理者・編集者」に替わる。部員は 403 |
| GET・POST | `/api/v1/staff-invites/{inviteToken}`・`…/accept` | ログインした人 | 「すでに主催者」は、その交流会の主催者か（前は運営者か） |

## 足す窓口

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/api/v1/events/{eventId}/organization` | 主催者 | `EventOrganizationState`：持ち主・今の組織・自分が持ち主か・選べる組織（持ち主だけ。持ち主が入っている組織を入った順） |
| PUT | `/api/v1/events/{eventId}/organization` | 持ち主 | `{ organizationId: uuid \| null }`。入れる・入れ替える・外す。答えは `EventOrganizationState`。主催者でなければ 403 `FORBIDDEN`、持ち主でなければ 403 `EVENT_OWNER_ONLY`、入っていない組織は 404 `EVENT_ORGANIZATION_NOT_FOUND` |

## 形

```ts
// EventView に足す欄
owner: { accountId: string; displayName: string } | null; // 持ち主のない今の交流会は null
organization: { id: string; name: string } | null;        // 入れた組織
isOwner: boolean;                                          // 今の利用者が持ち主か

// EventOrganizationState
{
  owner: { accountId: string; displayName: string } | null;
  organization: { id: string; name: string } | null;
  isOwner: boolean;
  options: { id: string; name: string }[]; // 持ち主のときだけ。ほかは空
}

// EventOrganizationInput
{ organizationId: string | null }
```

エラー（`EVENT_ERRORS` に足す）：

| code | 状態 | 文言 |
|---|---|---|
| `EVENT_OWNER_ONLY` | 403 | 交流会を組織に入れる・外すのは、持ち主だけです。持ち主に頼んでください。 |
| `EVENT_ORGANIZATION_NOT_FOUND` | 404 | 選んだ組織が見つかりません。入っている組織だけ選べます。画面を読み直してから、もう一度選んでください。 |

役目（`roles.ts`）：`EVENT_ACCESS_ROLES = ["organizer", "staff", "member"]`・`EventAccessRole`・ラベル「部員」。`EventRole`（`organizer`・`staff`）は答えの `myRole` のまま。

## ほかの領域が使うもの（`apps/api/src/modules/event/index.ts`）

| 名前 | 変わること |
|---|---|
| `requireEventRole(deps, roles)` | `roles` は `EventAccessRole` から選ぶ（部員も選べる）。判定は `resolveEventAccess` |
| `currentEventRole(c)` | `EventAccessRole` を返す |
| `getEventRole(db, config, eventId, account)` | `"organizer"`・`"staff"`・`"member"`・`null` |
| `withdrawal` | 足す。退会の段（組み立てが suite のあと・アプリの一覧の順に流す） |

## 退会の確かめの中身（`withdrawal.preview`）

- 引き継ぐ：「交流会「{名前}」は、{新しい持ち主}さん（組織「{組織}」の管理者）に引き継がれます。」（`kind: "handover"`）
- 消す：「組織に入れていない交流会{n}件（「…」・「…」）と、その受付係・招待のリンク・割引を消します。チェックインのある交流会があると退会できません（先に組織に入れてください）。」（`kind: "delete"`）
