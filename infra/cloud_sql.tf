# Cloud SQL for PostgreSQL のサーバーを1つ（core-002・core-018。AD-8・AD-9・AD-10）。本番とステージングが、この中の別の DB を使う
# （DB と DB の利用者は環境ごとの部品 modules/environment が作る）。
# - 型：ENTERPRISE・db-f1-micro（共有コア。SLA の対象外）・POSTGRES_18（uuidv7() を使う）。
#   edition を書かないと PostgreSQL 16 以上は Enterprise Plus になり、db-f1-micro が選べず apply が落ちる。
# - つなぎ方：内部の IP だけ（公開の IP を持たない。network.tf）。Cloud Run は Direct VPC egress で VPC に出て、TCP でつなぐ。
#   手元から本番の DB を見るときは、一時的に ipv4_enabled を true にして apply し、Cloud SQL Auth Proxy でつなぐ（README の 6）。
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
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      # 暗号のない直のつなぎを断る（アプリは sslmode=no-verify で暗号をかけてつなぐ。modules/environment/secrets.tf）
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

  depends_on = [google_project_service.apis, google_service_networking_connection.private_services]
}
