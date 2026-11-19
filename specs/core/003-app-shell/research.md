# Research: 外枠のナビ（core-003）

【仮決め】は、開発者の指示（spec.md の Clarifications 1〜4）にない所を、AI が決めたもの。

## R1. 外枠の形は、道の静かな値（staticData）で持ち主の領域が書く【仮決め】

- **決めたこと**：`lib/router.ts` で TanStack Router の `StaticDataRouteOption` に `layout?: "admin" | "bare"` を足す。参加者の道と手元のログインは、持ち主の領域が `createRoute({ …, staticData: { layout: "bare" } })` と書く。書かない道は `"admin"`。外枠は、今の道の一番深い当たり（`matches` の最後）の値を読む。
- **理由**：道と一緒に宣言でき、型で確かめられる。外枠は領域を読まずに済む（境界の決まり：shell → lib だけ）。管理の道（8つ）より参加者の道（4つ）が少なく、領域の直しが少ない。
- **書き忘れの守り**：`router.test.tsx` で、`PARTICIPANT_ROUTE_PATTERNS` のどの道も `"bare"`、`ADMIN_ROUTE_PATTERNS` のどの道も `"bare"` でないことを、登録された道から確かめる（領域の数は書かない）。
- **退けた案**：道の頭（`/admin`）で外枠が決める（暗黙の約束になる。`/dev/login` などを外枠が知る要がある）。既定をナビなしにする（領域の直しが多い）。

## R2. 交流会の中の項目は、領域が出すフックで決める【仮決め】

- **決めたこと**：`WebFeature` に任意の `useNavItems?: () => readonly NavItem[]`（今の道に合わせた項目を返す React のフック）を足す。組み立て（`router.tsx`）が、`useNavItems` か静かな `nav` を領域の順に並べた1つのフックにして外枠に渡す（並びと数は起動のときに決まるので、フックの呼ぶ順は変わらない）。
- event は、今の道が `/admin/events/$eventId…` のとき、画面が読みこんだ交流会（`EVENT_QUERY_KEYS.detail`）の役目から、`availableAdminTabs` の項目を足す。ナビのための問い合わせはしない（`enabled: false` で、画面の読みこみを待つだけ）。読みこむまで・失敗したときは「交流会の一覧」だけ。
- **理由**：役目を知っているのは event だけ。外枠は領域を読めない。新しい問い合わせを足さないので、ログインの前に 401 を出さない。
- `EventAdminNav` は消す（使う所がなくなる）。

## R3. 今の項目【仮決め】

- 行き先と同じ道は `aria-current="page"`。行き先の下の道（`/` で区切った頭が同じ）では、一番長く当たる項目に `aria-current="true"`。項目は任意の `also`（ほかに含める道の頭）を持てる。event は「準備」に「交流会を直す」（`/admin/events/$eventId/edit`）を含める（準備の画面の「交流会を直す」から開くため）。
- 見た目は、どちらも墨の印（サイドバーは左、タブバーは上の 2px の線）と太字。墨と本文の色は 1.36:1 なので、色だけにしない（DESIGN.md の Colors）。

## R4. タブバーの固定とアイコン【仮決め】

- 751px 以下の管理の形は、外枠を画面の高さ（`h-dvh`）にし、帯と本文を1つのスクロールの枠（`overflow-y-auto`）に入れ、タブバーをその下の段に置く。本文がタブバーの下に潜らないので、押せる所がタブバーに隠れない（最初は `sticky bottom-0` で作ったが、タブバーの下に来た押せる所が axe の target-size〈WCAG 2.5.8〉で落ち、キーボードのフォーカスも隠れうる〈2.4.11〉ため、こちらにした）。道が変わったら枠を上に戻す（窓のスクロールは道の道具が戻すが、枠は戻さないため）。752px 以上と参加者の画面は、今のとおり窓がスクロールする。重なりの順の値は付けない（あとから body に足す重ねる枠〈ダイアログ〉が上に来る）。
- 端末の下の安全な余白は `env(safe-area-inset-bottom)`。効かせるため、`index.html` の viewport に `viewport-fit=cover` を足し、外枠の左右にも安全な余白を空ける。CSS の値の名前は `apps/web/src/styles.css` の `@utility`（`pb-safe`・`px-safe`）に置く（Tailwind の任意の値を書かない）。
- アイコンは線で描いた SVG（`status-icon.tsx` と同じ作り）。種類は `list`・`people`・`concerns`・`setup` の4つで、`lib/feature.ts` の `NavIcon` に置く。
- 「メニュー」ボタンは 48px（`size-xl`）の四角、三本線のアイコンと読み上げの名前「メニュー」。

## R5. サイドバーの開閉の覚え方

- `localStorage` の鍵 `app-shell.sidebar-open`（`"0"`／`"1"`）。読み書きはどれも try/catch で包み、使えなければ出した状態（書けなければ、その画面の間だけ効く）。
- 隠すと、サイドバーを描かずに本文を広げる。752px 未満ではボタンを出さない（タブバーは開閉しない）。

## R6. A3 の名前の列

- 名前のセルを折り返さない（`whitespace-nowrap`）。表は auto の並べ方なので、名前の列は名前の長さまで広がり、印の列が残りを使う。長い名前でも、表を囲む枠の中で横に送る（今の Table のとおり）。
