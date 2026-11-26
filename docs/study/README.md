# 学びの文書（study）

- 作成日：2026-11-19
- 直した日：2026-11-22（Service Worker と property-based テストの学びを足した。match-005）
- 直した日：2026-11-23（MCP の学びを足した。core-021）

## 1. この文書の置き場所は何のためか

kanaeru で**初めて使う技術**を、**このプロジェクトでの使い方に絞って**説明する文書を置く。途中から入った人（新しいセッション・人）や、その技術が初めての人が、毎回同じことを調べ直さずに済むようにするため（[文書の決まり](../rules/documents.md)の「開発を速くする」）。

- ここは**考え方の説明**の場所。次の正本ではない。
  - 守る原則・技術の制約 → [Constitution](../../.specify/memory/constitution.md)
  - 作業の決まり → [CLAUDE.md](../../CLAUDE.md)・`docs/rules/`
  - 構成の決めごと → [構成の決めごと](../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md)
  - 今のシステムの形 → [docs/README.md](../README.md) 2章の文書
- ここに書いたことと上の文書が食い違ったら、上の文書が正。気づいたら、ここを直す。
- 使い方が変わったとき・間違いに気づいたときに直す。

## 2. 一覧

| 文書 | 何が書いてあるか |
|---|---|
| [GCPの学び](./gcp.md) | kanaeru が使う GCP のサービス（Cloud Run・Cloud SQL・Cloud Scheduler・Secret Manager・Artifact Registry）、夜間の DB の停止、GitHub Actions から鍵なしでデプロイする仕組み、費用と予算の知らせ |
| [Terraformの学び](./terraform.md) | インフラをコードで持つ考え方、状態（state）と GCS、plan・apply の流れ、`lifecycle`、秘密の値の扱い、kanaeru の `infra/` の形と主な資源の例 |
| [LINEの学び](./line.md) | LINEミニアプリ（未認証）と LIFF、LINE ログインと IDトークンの確かめ、自前のセッション、友だち追加、QR に入れる URL、公式LINE のプランと数える通数 |
| [Service Worker の学び](./service-worker.md) | 範囲（scope）と置いたフォルダ・一生（install・waiting・activate）・何を持ち何を持たないか・止め方（機能の印と自分を外す Service Worker）・試し方（試合表のネットなし。AD-27） |
| [property-based テストの学び](./property-based-testing.md) | fast-check の書き方・どんな性質を書くか（往復・範囲・決まり）・失敗したときの読み方（試合表の組み方と QR の中身） |
| [MCP の学び](./mcp.md) | MCP の登場人物と通信（JSON-RPC・Streamable HTTP）、OAuth 2.1 の認可の流れ（PKCE・resource・iss・CIMD・DCR）、kanaeru の守りと実装の場所（core-021）|
