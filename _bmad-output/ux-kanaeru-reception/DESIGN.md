---
title: "DESIGN：kanaeru 受付アプリ（最初の版）"
status: final
created: 2026-11-19
updated: 2026-11-19
sources:
  - ../../docs/design/DESIGN.md
  - ../../docs/design/README.md
  - ../prd-kanaeru-reception/prd-kanaeru-reception.md
  - ../architecture-kanaeru/architecture-kanaeru.md
  - ./.memlog.md
name: kanaeru 受付アプリ
description: 交流会の受付とアンケートを、LINEの中で静かにきちんと済ませる見た目。土台の docs/design/DESIGN.md を引き継ぎ、プロダクトの色（墨）と、この版の部品だけを足す。
inherits: ../../docs/design/DESIGN.md
colors:
  # ここに書いた4つ以外の値（text・text-sub・text-link・background・surface・border・border-input・
  # danger・danger-text・warning・success・success-text・overlay・scrim など）は、
  # すべて土台の docs/design/DESIGN.md の値のまま。typography・spacing・radius・shadow・zIndex・
  # breakpoints・motion も土台のまま（値の道も土台の形：{typography.size.m}・{spacing.xs}・{radius.s}）。
  primary: '#3B3833'          # 墨。主のボタン1つ・選んだ状態・フォーカスの輪だけ。白の上 11.67:1・地（#F8F7F6）の上 10.91:1
  primary-hover: '#34312D'    # primary を押す・指したとき。on-primary との差 12.94:1
  on-primary: '#FFFFFF'       # primary の上の文字
  primary-subtle: '#EFEFEF'   # 新しい値。primary を 8% 白に混ぜた色。選んだ状態のチップの地だけ。text の文字 13.85:1
components:
  button-primary:
    background: '{colors.primary}'
    background-hover: '{colors.primary-hover}'
    foreground: '{colors.on-primary}'
    radius: '{radius.s}'
    min-height: '44px'          # 土台の 40px から上げる（押せる所は高さ44px以上）
    width-mobile: '100%'        # 【仮決め】狭い画面では横いっぱい
  choice-chip:
    background: '{colors.surface}'
    foreground: '{colors.text}'
    border: '1px solid {colors.border-input}'
    radius: '{radius.s}'
    min-height: '44px'
    padding-x: '{spacing.xs}'
    gap: '{spacing.xxs}'
    font-size: '{typography.size.m}'
  choice-chip-selected:
    background: '{colors.primary-subtle}'
    foreground: '{colors.text}'
    border: '2px solid {colors.primary}'   # 【仮決め】ふちを太くし、地の違い（1.15:1）だけに頼らない
    icon: 'check・{colors.primary}'        # 【仮決め】先頭にチェックの印
    font-weight: '{typography.weight.bold}'
  checkin-card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{radius.m}'
    padding: '{spacing.s}'
    icon: 'check-circle・{colors.success}'
    title-size: '{typography.size.xl}'
    title-weight: '{typography.weight.bold}'
  totals-card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{radius.m}'
    padding: '{spacing.xs}'
    row-divider: '{colors.border}'
    numbers: 'tabular-nums・右寄せ'
    total-size: '{typography.size.xl}'
    total-weight: '{typography.weight.bold}'
  qr-display:
    module: '{colors.text}'
    background: '{colors.surface}'
    quiet-zone: '4モジュール分'
    min-size-screen: '240px'    # 【仮決め】画面に出すときの最小の一辺
    label-size: '{typography.size.l}'
  flag-same-name:
    background: '{colors.warning}'
    foreground: '{colors.text}'
    radius: '{radius.s}'
    icon: 'alert'
  flag-manual:
    background: '{colors.surface-sunken}'
    foreground: '{colors.text-sub}'
    border: '1px solid {colors.border}'
    radius: '{radius.s}'
---

# kanaeru 受付アプリの見た目

作成：2026-11-19（決めた経緯は [.memlog.md](./.memlog.md)。振る舞いは [EXPERIENCE.md](./EXPERIENCE.md)）

土台は [docs/design/DESIGN.md](../../docs/design/DESIGN.md)（SmartHR Design System を土台にした既定）。ここには、土台と違うところと、この版で大事なところだけを書く。書いていないことは土台のとおり。土台の出典とライセンス（smarthr-ui・MIT）は [docs/design/README.md](../../docs/design/README.md) 3 にある。

## Brand & Style

- **信頼感・きちんと／落ち着いた・シンプル**。参加者が初めて会う「受付の人」の代わりになる画面なので、派手さより、迷わず・きちんとしている印象を先にする。
- 参加者の画面は **LINEの中（ミニアプリ）** で開く。上にはLINEの見出しの帯があり、まわりにはLINEの緑がある。プロダクトの色を墨にしたのは、LINEの緑と張り合わず、LINEの中で落ち着いて見えるため。緑の系統の色はプロダクトの色に使わない。
- 個性は色の数ではなく、ことば（[EXPERIENCE.md](./EXPERIENCE.md) の Voice and Tone）と、余白の静かさで出す。部品の形は土台から変えすぎない。

## Colors

土台からの違いは、`primary` の組（墨）と、新しい値 `primary-subtle` の4つだけ。

| 値 | 使う所 | 使わない所 |
|---|---|---|
| `{colors.primary}` 墨 `#3B3833` | 1つの画面の**主のボタン1つ**・**選んだ状態**（チップのふちと印）・**フォーカスの輪**（土台の `shadow.focus`） | 広い面の塗り・見出し・文字の強調・リンクの色 |
| `{colors.primary-hover}` `#34312D` | 主のボタンを押す・指したとき | ほかのすべて |
| `{colors.on-primary}` `#FFFFFF` | 墨の上の文字 | — |
| `{colors.primary-subtle}` `#EFEFEF` | **選んだ状態のチップの地**だけ | 面・カード・表の行の地、選んだ状態以外の印 |

**コントラストの注意**

- 墨は白の上 11.67:1・地の上 10.91:1 で、文字にも十分。ただし**本文の文字色 `{colors.text}`（`#23221E`）との差は 1.36:1** しかない。墨の文字は本文と見分けられないので、**色で「押せる」「選んだ」を伝えない**。
- **リンクは必ず下線つき**（色は土台の `{colors.text-link}`）。文字だけのボタンも下線をつける。墨をリンクの色に使わない。
- `primary-subtle` と白の差は 1.15:1 で、地の色だけでは選んだかが分からない。選んだチップは、**太いふち（墨）とチェックの印**を必ず一緒に使う。
- `primary-subtle` の上に `{colors.text-sub}` を置かない（4.49:1 で 4.5:1 に届かない）。選んだチップの中の文字は `{colors.text}` だけ。
- 状態の色（`danger`・`success`・`warning`）は土台のとおり、いつもことばかアイコンと一緒に使う。

## Components

土台の部品（shadcn/ui の Base UI の形を、`packages/ui` の値で上書きしたもの）はそのまま使う。ここでは、この版で足す部品と、土台から変える所だけを書く。振る舞い（選び方・押したあと）は [EXPERIENCE.md](./EXPERIENCE.md) の Component Patterns。

### 主のボタン

- 土台の主のボタンに、`{components.button-primary}` を当てる。高さは **44px 以上**（土台の 40px から上げる）。
- 狭い画面では横いっぱい【仮決め】。1つの画面に1つだけ（チェックインの画面なら「チェックインする」、済んだあとは「アンケートに答える」）。

### 選択肢のチップ

申し込みの媒体・知ったきっかけ・支払い方法・アンケートの選択肢に使う、文字を打たずに選ぶための部品。

- **ふだん**：`{colors.surface}` の地・`{colors.border-input}` の 1px のふち（白の上 3.62:1）・`{colors.text}` の文字・角 `{radius.s}`・高さ 44px 以上・文字 `{typography.size.m}`（16px）。
- **選んだ**：`{colors.primary-subtle}` の地・`{colors.primary}` の 2px のふち・先頭にチェックの印（墨）・文字は太字【仮決め：ふちの太さ・印・太字】。
- **フォーカス**：土台の `shadow.focus`（白の縁と墨の輪）。
- **並べ方**：折り返して並べ、間は `{spacing.xxs}`（8px）。1つの設問のチップは、見出し（設問の名前）の下にまとめる。チップの中の文字は1行に収まる短さにする（「無料（招待など）」がいちばん長い）。
- 角は `{radius.s}`。丸い札（`full`）にしない（土台の Shapes のとおり）。

### チェックインのカード

チェックインの画面で、チェックインが済んだとき（と「チェックイン済み」のとき）に出す、画面のいちばん上のカード。`{components.checkin-card}`。

- 中身の順：できたの印（`{colors.success}` のアイコン）→「チェックインしました」（`{typography.size.xl}`・太字）→ 交流会の名前 → 紙の名札の案内。
- カードの地は `{colors.surface}`。墨や緑で塗らない（できたは、アイコンとことばで伝える）。
- 下に続く「アンケートに答える」（開いているときだけ）が、この画面の主のボタン。オープンチャットの案内（Should）は文字のリンク（下線つき）。

### 合計のカード

一覧画面の合計のタブで、支払い方法ごとの人数と合計金額を出すカード。`{components.totals-card}`。

- 行：PayPay・現金・無料（招待など）の順に、「人数」と「金額」。数字は桁がそろう数字（`tabular-nums`）で右寄せ。金額は「円」をつけ、3桁ごとに区切る。
- いちばん下に全体の合計の行。上に `{colors.border}` の線を引き、`{typography.size.xl}`・太字にする。手元の現金と見比べる数字なので、現金の行も読み間違えない大きさ（`{typography.size.l}` 以上）にする【仮決め】。
- 色で金額の多い少ないを表さない。墨も使わない。

### 参加者の行

一覧画面の参加者のタブの行（PCでは表の行、狭い画面ではカードの形。土台の Responsive のとおり）。

- **同じ名前の印**：`{components.flag-same-name}`。注意の黄色の地に、注意のアイコンと「同じ名前があります」。色だけにしない。
- **手でのチェックインの印**：`{components.flag-manual}`。くぼみの地に、手で入れたことと入れた人の名前。

### QRの表示

準備の画面で、受付QRとアンケートQRを出し、印刷する部品。`{components.qr-display}`。

- QRの点は `{colors.text}`、地は `{colors.surface}`。墨や色つきのQRにしない（読み取りを確かにするため）。まわりに 4モジュール分の余白を必ず空ける。
- QRの上に、どちらのQRかを大きく書く（「受付QR」「アンケートQR」・`{typography.size.l}`・太字）と、交流会の名前。2つを取り違えないよう、ことばで区別する（色で区別しない）。
- 画面での最小の一辺は 240px【仮決め】。印刷では、1枚に1つのQRを大きく載せる【仮決め】。

## Do's and Don'ts

| する | しない |
|---|---|
| 墨は、主のボタン1つ・選んだ状態・フォーカスの輪だけに使う | 墨で見出し・面・文字を塗って「きちんと感」を出す |
| リンクと文字だけのボタンに、必ず下線をつける | 色だけでリンクを見分けさせる（墨と本文は 1.36:1） |
| 選んだチップは、薄い地＋太い墨のふち＋チェックの印で示す | `primary-subtle` の地だけで選んだことを示す |
| 押せる所は高さ 44px 以上、スマホの本文は 16px 以上 | 土台の小さいボタン（32px）を参加者の画面に使う |
| LINEの緑の隣で静かに見える色だけを使う | 緑の系統をプロダクトの色やできたの印以外の飾りに使う |
| 合計と金額は、桁がそろう数字で右寄せ | 金額を色で塗り分ける |
| QRは濃い点と白い地、ことばで種類を書く | 色つき・ロゴ入りのQR、色だけで受付QRとアンケートQRを分ける |
| 値は先頭の表と土台の表から読む | 色の値を画面のコードに直接書く |
