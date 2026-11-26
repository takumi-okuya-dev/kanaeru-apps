# Data Model: 試合表の中身の設定とミニゲーム（match-009）

2026-11-26 作成。表は変えない（match-001 の [data-model.md](../001-tables/data-model.md)）。中身の形の正本は `packages/contracts/src/match/table.ts` の `MatchTableContent`。match-003 の [data-model.md](../003-day-of/data-model.md) からの差：

```text
content
├─ settings
│   ├─ format          "doubles" | "singles"（今のまま）
│   ├─ gameCount       1〜60 の整数（足した。1つの組の試合の数）
│   ├─ levels          "four" | "three" | "two" | null（足した。レベル別の分け方。null はレベル別をしない）
│   ├─ ungrouped       真偽（足した。分けない〈全員で1つ〉もする）
│   └─ courts          1〜20 の整数 | null（足した。ミニゲームのコート数。null はミニゲームをしない）
│   （minutesPerGame・startTime・endTime・grouping は外した。読むときに直す）
├─ plan[]              組の key は「levels の組 +（ungrouped なら）all」のどれか。重ならない（今のまま）
├─ archive?[]          今のまま
└─ mini?               ミニゲームのチーム分け（足した。組んでいなければ持たない）
    └─ teams[][]       チームごとの名簿の人の ID（チームの数 = courts × 2。どの人も1つのチームまで・名簿にいる人。空のチームはない）
```

確かめ（`superRefine`）：

- `levels`・`ungrouped`・`courts` のどれか1つは要る（「分け方を1つ以上選んでください」）
- `plan` の組の key は今の組の並びにあるものだけ・重ならない（今の確かめを組の並びに広げる）
- `mini` は `courts` があるときだけ。チームの数は `courts × 2`、同じ人は2つのチームに入らない、名簿にいる人だけ

前の形を直す（preprocess）：`settings` に `grouping` があれば、`gameCount = clamp(floor((終わり − 始まり) ÷ 1試合の長さ), 1, 60)`・`levels = grouping === "none" ? null : grouping`・`ungrouped = grouping === "none"`・`courts = null` にし、前の4つの欄を外す。
