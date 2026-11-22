# Data Model: 試合表の中身に足すもの（match-003）

2026-11-22 作成。表は match-001 の [data-model.md](../001-tables/data-model.md)（DB の変更はない）。中身の形は match-002 の [data-model.md](../002-roster/data-model.md) に、次を足す。形の正本は `packages/contracts/src/match/table.ts` の `MatchTableContent`。

```text
content
├─ players[]
│   └─ status          "present" | "late" | "absent" | "left"（left＝帰った。足した）
├─ plan[]
│   ├─ games[]         240行まで（組を一緒にすると、ほかの組の終わった試合が移ってくるため。前は60）
│   └─ offset?         -240〜240 の整数（足した。行の数 = 設定から決まる試合の数 + offset）
└─ archive?[]          前の分け方・試合の形で終わった試合（足した。key は組ごとに1つ・7つまで）
    ├─ key             終わったときの組の key
    └─ games[]         240まで。終わった試合だけ（done: true）・別々の2人か4人（混ざってよい）・名簿にいる人
```

- どの object も strict のまま（氏名などほかの欄を受けない）。
- `archive` の試合に入った人は、名簿から消さない（消すと「来ない」にする。`roster-edit.ts` の `removePlayer`）。
