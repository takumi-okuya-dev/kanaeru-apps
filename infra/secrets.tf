# 秘密の値（core-002。AD-9）。DB の接続先（パスワードを含む DATABASE_URL）を Secret Manager に置く。
# パスワードは Terraform の中で作る「その場だけの値」（ephemeral）で、state にも plan のファイルにも残らない。
# DB の利用者（cloud_sql.tf）と Secret Manager の版の両方に、書くだけの欄（*_wo）で同じ apply のうちに書く。
# 2つの *_wo_version は同じ var.db_password_version を使う（片方だけ上がって食い違うことがない）。
# ephemeral の値は plan・apply のたびに作り直されるが、*_wo_version が変わらない限り、どこにも書かれない。

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
resource "google_secret_manager_secret_version" "database_url" {
  secret                 = google_secret_manager_secret.database_url.id
  secret_data_wo         = "postgresql://${google_sql_user.app.name}:${ephemeral.random_password.db.result}@localhost/${google_sql_database.app.name}?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  secret_data_wo_version = var.db_password_version
}
