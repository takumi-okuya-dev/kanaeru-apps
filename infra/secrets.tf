# 秘密の値（core-002。AD-9）。DB の接続先（パスワードを含む DATABASE_URL）を Secret Manager に置く。
# パスワードは Terraform の中で作る「その場だけの値」（ephemeral）で、state にも plan のファイルにも残らない。
#
# 書く順番（research.md R-3）：
#   1. 作ったパスワードを、Secret Manager の版に書く（書くだけの欄 secret_data_wo）。
#   2. 書いた版を ephemeral で読み直し、そのパスワードを DB の利用者に書く（cloud_sql.tf の password_wo）。
# ephemeral の値は plan・apply のたびに作り直されるので、2か所に同じ ephemeral を直に書くと、
# apply が途中で落ちたとき（片方だけ書けた）に、次の apply でもう片方だけ別の値が書かれて食い違う。
# Secret Manager の版を正本にして DB の利用者はそこから読むので、途中で落ちても、次の apply で同じ値がそろう。
# 2つの *_wo_version は同じ var.db_password_version を使う。値を書くのは、その版が変わったときと作るときだけ。
# 食い違ったとき（手で直した・わけが分からない）は、db_password_version を1つ上げて apply する（README の 6）。

ephemeral "random_password" "db" {
  length = 32
  # 接続の URL にそのまま入れても壊れないよう、記号を使わない（英大小・数字の32文字）
  special = false
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name}-database-url"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# 本番の DB の接続先（Cloud Run に備わっている Cloud SQL の接続の Unix ソケット。AD-8）。
# 宛先を localhost と書き、問い合わせの host でソケットを指す。pg は host の問い合わせを宛先より先に使う。
# 宛先が空の URL（postgresql://u:p@/db?host=...）は、API の設定の確かめ（WHATWG の URL）で読めないので使わない。
# 利用者の名前は google_sql_user を読まずに local.name で書く（DB の利用者がこの版を読むので、読み合いにしない）。
resource "google_secret_manager_secret_version" "database_url" {
  secret                 = google_secret_manager_secret.database_url.id
  secret_data_wo         = "postgresql://${local.name}:${ephemeral.random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  secret_data_wo_version = var.db_password_version
}

# 上で書いた版を読み直す（その場だけ。state に残らない）。版が新しく作られる apply では、作ったあとに読む
ephemeral "google_secret_manager_secret_version" "database_url" {
  secret  = google_secret_manager_secret_version.database_url.secret
  version = google_secret_manager_secret_version.database_url.version
}

locals {
  # DB の利用者に書くパスワード（読み直した DATABASE_URL の「利用者:パスワード@」から取り出す。英大小・数字だけ）
  db_password = regex("^postgresql://[^:]+:([A-Za-z0-9]+)@", ephemeral.google_secret_manager_secret_version.database_url.secret_data)[0]
}
