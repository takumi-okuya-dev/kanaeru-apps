# Cloud SQL for PostgreSQL を1つ（core-002。AD-8・AD-9・AD-10）。
# - 型：ENTERPRISE・db-f1-micro（共有コア。SLA の対象外）・POSTGRES_18（uuidv7() を使う）。
#   edition を書かないと PostgreSQL 16 以上は Enterprise Plus になり、db-f1-micro が選べず apply が落ちる。
# - つなぎ方：公開IPはあるが承認済みネットワークは空。つなぐのは Cloud Run に備わっている接続（Unix ソケット）だけ。
# - 夜間の停止（0時〜8時）は Cloud Scheduler が activation_policy を変える（scheduler.tf）。Terraform はその差を無視する。
# - 消さない：prevent_destroy（plan で止める）・deletion_protection（プロバイダで止める）・deletion_protection_enabled（GCP で止める）。

resource "google_sql_database_instance" "main" {
  name             = "${local.name}-db"
  region           = var.region
  database_version = "POSTGRES_18"

  deletion_protection = true

  settings {
    edition           = "ENTERPRISE"
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    # 作るときは動かしておく。あとの変更（夜間の停止）は lifecycle で無視する
    activation_policy = "ALWAYS"

    deletion_protection_enabled = true

    disk_type             = "PD_SSD"
    disk_size             = 10
    disk_autoresize       = true
    disk_autoresize_limit = 20

    ip_configuration {
      ipv4_enabled = true
      # 暗号のない直のつなぎを断る（Cloud Run の組み込みの接続はいつも暗号つき）
      ssl_mode = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled = true
      # UTC で書く。日本時間の12時（DB が動いている昼。AD-9）
      start_time = "03:00"
      # WAL を残すと保存の量の料金が増えるので、時点を選んだ戻しはしない（毎日のバックアップだけ）
      point_in_time_recovery_enabled = false
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    # 保守で再起動する時間帯：月曜 04:00 UTC（日本時間の月曜13時。DB が動いていて、交流会のない時間）
    maintenance_window {
      day          = 1
      hour         = 4
      update_track = "stable"
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [settings[0].activation_policy]
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = local.name
  instance = google_sql_database_instance.main.name
}

# アプリの DB の利用者。パスワードは secrets.tf の ephemeral の値を、書くだけの欄で渡す（state に残らない）
resource "google_sql_user" "app" {
  name                = local.name
  instance            = google_sql_database_instance.main.name
  password_wo         = ephemeral.random_password.db.result
  password_wo_version = var.db_password_version
}
