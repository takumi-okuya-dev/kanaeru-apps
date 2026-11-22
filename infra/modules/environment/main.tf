# 環境ごとの部品（core-018）：DB と DB の利用者・秘密の値・身分と権限・Cloud Run のサービスと DB の変更を当てる job・共通の定期の仕事。
# 本番（kanaeru）とステージング（kanaeru-stg）が、同じ Cloud SQL のサーバーの中の別の DB を使う（構成 B）。
# 別のプロジェクトに環境を移すとき（構成 C）は、移した先で Cloud SQL・ネットワーク・イメージの置き場・WIF を作り、この部品を呼ぶ。

locals {
  # 画面の源（WEB_URL）。Cloud Run の決まった形の URL を、サービスを作る前に組み立てる
  web_url = var.web_url != "" ? var.web_url : "https://${var.name}-${var.project_number}.${var.region}.run.app"

  # DB と DB の利用者の名前（- を使わない）
  db_name = replace(var.name, "-", "_")

  # Threads と予約が共に使う秘密（鍵の束・合言葉）を作るか
  shared_secrets_enabled = var.threads_enabled || var.booking_enabled

  # Meta のアプリの秘密の値の入れ物は、Threads を入にしていて Meta のアプリの ID を入れたら作り、OAuth の入・切とは別に残す
  # （一時的に切っても、手で入れた秘密の値を消さない。入・切で変わるのは Cloud Run の設定だけ）
  threads_app_provisioned = var.threads_enabled && var.threads_app_id != ""
  threads_oauth           = local.threads_app_provisioned && var.threads_oauth_enabled
}

# ---- DB と DB の利用者（同じ Cloud SQL のサーバーの中に、環境ごとに1つずつ）
resource "google_sql_database" "app" {
  name     = local.db_name
  instance = var.sql_instance_name

  # 作るときは利用者のあと、消すときは利用者より先（DB を消したあとなら、利用者は表を持たないので消せる）
  depends_on = [google_sql_user.app]
}

# アプリの DB の利用者。パスワードは、Secret Manager に書いた版を読み直した値を、書くだけの欄で渡す（state に残らない）。
# 書く順番と、途中で落ちたときに食い違わない理由は secrets.tf の頭
resource "google_sql_user" "app" {
  name                = local.db_name
  instance            = var.sql_instance_name
  password_wo         = local.db_password
  password_wo_version = var.db_password_version
}
