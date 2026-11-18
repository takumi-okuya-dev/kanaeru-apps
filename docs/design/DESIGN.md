---
title: "DESIGN: テンプレートの既定"
status: template
created: 2026-11-18
updated: 2026-11-18
sources:
  - https://github.com/kufu/smarthr-ui (packages/smarthr-ui/src/themes/ ・ v103.1.1・MIT)
  - https://smarthr.design/
name: テンプレートの既定（SmartHR Design System を土台にしたもの）
description: 業務の道具として、静かで読みやすく、迷わない見た目。値は smarthr-ui の値を土台にし、プロダクトの色だけを置きかえる。
colors:
  # 出典と、足した値は README.md 3。コントラストは白（#ffffff）と地（#f8f7f6）の上で計った。
  primary: '#2F5BB7'          # プロダクトの色（仮。置きかえる）。主のボタン・選んだ状態・フォーカスの輪。白の上 6.36:1
  primary-hover: '#2A52A6'    # primary を押す・指したとき（5% 暗く）
  on-primary: '#FFFFFF'       # primary の上の文字
  text: '#23221E'             # 文字（GREY_100）。白の上 15.9:1
  text-sub: '#706D65'         # 補足の文字（GREY_65）。白の上 5.17:1・地の上 4.83:1
  text-disabled: '#C1BDB7'    # 使えない文字（GREY_30）。コントラストの例外（使えないものに限る）
  text-link: '#0071C1'        # リンクの文字。白の上 5.08:1
  background: '#F8F7F6'       # 画面の地（GREY_5）
  surface: '#FFFFFF'          # 面（カード・表・入力欄・ダイアログ）
  surface-sunken: '#F5F4F3'   # くぼみ（BASE_GREY。まとまりの地）
  surface-over: '#F2F1F0'     # 地の上の地（OVER_BACKGROUND）
  head: '#EDEBE8'             # 表の見出しの地（HEAD）
  border: '#D6D3D0'           # 区切りの線（GREY_20）。飾りの線だけに使う
  border-input: '#8A867F'     # 入力欄・チェックの箱のふち（足した値）。白の上 3.62:1・地の上 3.39:1
  danger: '#E01E5A'           # 危ないこと・エラー（アイコン・塗り・白の上の文字）。白の上 4.66:1
  danger-text: '#C8174D'      # 灰色の地の上のエラーの文字（足した値）。地の上 5.33:1
  warning: '#FFCC17'          # 注意の印の塗り（WARNING_YELLOW）。上に文字を載せるときは text を使う
  success: '#0F7F85'          # できた・正しい（アイコン・塗り）。白の上 4.78:1
  success-text: '#0B6F74'     # 灰色の地の上のできたの文字（足した値）。地の上 5.54:1
  overlay: 'rgba(3,3,2,0.15)' # 重なりの薄い幕（OVERLAY）
  scrim: 'rgba(3,3,2,0.5)'    # ダイアログのうしろの幕（SCRIM）
typography:
  fontFamily: 'system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif'  # 端末の書体
  # 16px を基準に、段の比で決めた大きさ（smarthr-ui の font size）
  size:
    xxs: '10.67px'   # 補助の補助（使いすぎない）
    xs: '12px'       # 補助・注記
    s: '13.71px'     # 表の中・説明
    m: '16px'        # 本文（標準）
    l: '19.2px'      # 小見出し
    xl: '24px'       # 見出し
    xxl: '32px'      # ページの題（狭い画面では 28.8px）
  lineHeight:
    none: 1
    tight: 1.25      # 見出し
    normal: 1.5      # 本文（標準）
    relaxed: 1.75    # 長い説明
  weight:
    normal: 400
    bold: 700        # 太さはこの2つだけ
spacing:
  # 1文字（16px）を単位にした段（smarthr-ui の spacing）
  x3s: '4px'
  xxs: '8px'
  xs: '16px'
  s: '24px'
  m: '32px'
  l: '40px'
  xl: '48px'
  xxl: '56px'
  x3l: '64px'
radius:
  s: '4px'     # 入力欄・ボタン・札
  m: '6px'     # カード
  l: '8px'     # ダイアログ
  full: '9999px'
shadow:
  # 色はどれも rgba(3,3,2,0.3)
  layer1: '0 1px 2px 0'      # 少し浮いた面（押せるカード）
  layer2: '0 2px 4px 1px'    # 浮いた面（ドロップダウン）
  layer3: '0 4px 8px 2px'    # 重なる面（ダイアログ）
  layer4: '0 8px 16px 4px'   # いちばん上（知らせ）
  focus: '0 0 0 2px #FFFFFF, 0 0 0 4px primary'  # フォーカスの輪（白の縁と primary の輪）
zIndex:
  default: 0
  fixedMenu: 100
  overlapBase: 10000
  overlap: 10500
breakpoints:
  small: '751px'   # これ以下を狭い画面とみる（パソコンを基準に、狭い画面に合わせる）
motion:
  hover: '0.3s ease-out'
  reduced: 'prefers-reduced-motion のときは動かさない'
---

# テンプレートの既定の見た目

## Brand & Style

- **業務の道具として静かに**。飾りより、読みやすさと迷わなさを先にする。色は、意味（主の操作・危ない・できた・注意）と、プロダクトの色1つに絞る。
- 灰色は、わずかに温かみのある段（smarthr-ui の灰色）を使う。真っ黒・真っ白の画面の地は使わない（地は `background`、面は `surface`）。
- プロダクトの個性は、`primary` とことば（EXPERIENCE.md 2）で出す。部品の形は変えすぎない。

## Colors

- **使う値は先頭の表だけ**。画面のコードに色の値を直接書かない。
- `primary` は、1つの画面で主の操作（主のボタン1つ）と、選んだ状態・フォーカスの輪に使う。広い面の塗りに使わない。
- 文字は `text`・`text-sub`・`text-link` だけ。灰色の地（`background`・`surface-sunken`）の上のエラーとできたの文字は、`danger-text`・`success-text` を使う。
- 状態の色（`danger`・`success`・`warning`）は、**いつもことばかアイコンと一緒に**使う（色だけで伝えない）。
- 区切りの線は `border`、入力欄など押したり入れたりできるもののふちは `border-input`（3:1 以上）。
- ダークモードは既定にない。作るなら、プロダクトの DESIGN.md で値の組を足す。

## Typography

- 書体は端末の書体（`system-ui`）。本文は `m`（16px）・行の高さ `normal`（1.5）を標準にする。
- 大きさは段（`xxs`〜`xxl`）からだけ選ぶ。1つの画面で使う段は3〜4つまで。
- 太さは 400 と 700 だけ。強調に色や大きさを重ねすぎない。
- 数字が並ぶ所（表・金額・日時）は、桁がそろう数字（`tabular-nums`）にする。

## Layout & Spacing

- 余白は1文字（16px）を単位にした段（`x3s` 4px 〜 `x3l` 64px）からだけ選ぶ。まとまりの中は狭く、まとまりの間は広く。
- パソコンを基準に作り、`small`（751px 以下）で1列にする。狭い画面でも横のスクロールを出さない（表は表の中だけで横に送る）。
- ページは、題 → リード文 → まとまり（見出しつき）の順。1つのページの主の操作は、題の近くか、まとまりの終わりに置く。

## Elevation & Depth

- 影は4段（`layer1`〜`layer4`）。押せる・重なる・知らせる、の順に深くする。ふつうの面は影なしで、`border` か地の違いで分ける。
- 重なりの順は `zIndex` の段だけを使う。

## Shapes

- 角は `s`（4px。入力欄・ボタン・札）・`m`（6px。カード）・`l`（8px。ダイアログ）。丸い札や人の画像だけ `full`。

## Components

部品は、使う道具（TypeScript なら shadcn/ui）を、ここの値で上書きして使う。道具の最初の見た目のまま出さない。

| 部品 | 見た目の決まり |
|---|---|
| ボタン | 主（`primary` の塗り・`on-primary` の文字）・二番（`surface` の地・`border-input` のふち・`text` の文字）・危ない（`danger` の塗り）・文字だけ（`text-link`）。高さは 40px（小さいもの 32px）。1つのまとまりに主は1つ |
| 入力欄 | `surface` の地・`border-input` のふち・角 `s`。誤りは `danger` のふちと、欄の下の文（`danger-text`） |
| 表 | 見出しの行は `head` の地。行の間は `border`。値がないときは空欄（EXPERIENCE.md 4） |
| ダイアログ | `surface`・角 `l`・影 `layer3`・うしろは `scrim` |
| 知らせの帯 | 上か、操作の近くに出す。状態の色のアイコンとことば |
| 札（状態） | 角 `s`、状態の色のふちか薄い塗りと、ことば |
| フォーカス | どの押せる物にも `shadow.focus` の輪（四辺とも見える） |

## Do's and Don'ts

| する | しない |
|---|---|
| 値は先頭の表から読む | 色・余白・大きさの値を直接書く（例：Tailwind の `bg-[#…]`・`p-[13px]`） |
| 状態はことばとアイコンと色で伝える | 色だけで伝える |
| 主のボタンは1つのまとまりに1つ | 主のボタンを並べる |
| フォーカスの輪を見せる | `outline: none` で消す |
| SmartHR の考え方を参考にする | SmartHR のブランドの色・ロゴ・イラストを使う、SmartHR と見間違える見た目にする |
