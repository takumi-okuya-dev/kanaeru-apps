# Data Model: 試合表の中身（match-002）

2026-11-22 作成。表は match-001 の [data-model.md](../001-tables/data-model.md)（この PR で DB の変更はない）。中身（`match_table.content`）の形の正本は `packages/contracts/src/match/table.ts` の `MatchTableContent`。

```text
content
├─ settings
│   ├─ format          "doubles" | "singles"
│   ├─ grouping        "four" | "three" | "two" | "none"
│   ├─ minutesPerGame  5〜90 の整数
│   ├─ startTime       "HH:MM"
│   └─ endTime         "HH:MM"（startTime より後）
├─ players[]           150人まで
│   ├─ id              英小文字と数字 1〜16文字（端末が作る。重ねない）
│   ├─ nickname        1〜20文字（呼び名）
│   ├─ level           "advanced" | "intermediate" | "beginner" | "novice" | null
│   ├─ status          "present" | "late" | "absent"
│   └─ nameCheck?      true（姓と名の間に空白がない）
└─ plan[]              組ごと（組は grouping の組だけ・重ねない）
    ├─ key             "advanced" | "intermediate" | "beginner" | "novice" | "beginner_novice" | "advanced_intermediate" | "all"
    └─ games[]         60試合まで
        ├─ players[]   ダブルスは別々の4人・シングルスは別々の2人（名簿の id）
        └─ done        終わったか
```

- どの object も strict（ほかの欄〈氏名など〉を受けない。Constitution II）。
- 組とレベル（`MATCH_GROUPS`）：four＝上級・中級・初級・入門／three＝上級・中級・初級＆入門／two＝上級＆中級・初級＆入門／none＝全員。
- `match_table.seed` はくじの種、`version` は版の番号、`editor_device_id` は担当の端末、`last_change_id` は最後に受けた変更の ID（AD-28）。
