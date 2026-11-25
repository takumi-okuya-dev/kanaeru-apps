# 秘密の値（core-002・core-018。AD-9）。
#
# DB の接続先（パスワードを含む DATABASE_URL）：パスワードは Terraform の中で作る「その場だけの値」（ephemeral）で、
# state にも plan のファイルにも残らない。書く順番（specs/core/002-infra/research.md R-3）：
#   1. 作ったパスワードを、Secret Manager の版に書く（書くだけの欄 secret_data_wo）。
#   2. 書いた版を ephemeral で読み直し、そのパスワードを DB の利用者に書く（main.tf の password_wo）。
# Secret Manager の版を正本にして DB の利用者はそこから読むので、apply が途中で落ちても、次の apply で同じ値がそろう。
# 食い違ったとき（手で直した・わけが分からない）は、db_password_version を1つ上げて apply する（README の 6）。
#
# Threads と予約の秘密：
#   - TOKEN_ENCRYPTION_KEYS：外のサービスのトークンを包む鍵の束（{"1":"<32バイトの base64>"}）。Terraform は入れ物だけを作り、
#     値は手で版を足す（README の 9。state に残さないため）。環境ごとに別の鍵にする
#   - JOB_TRIGGER_SECRET：定期の仕事の合言葉。Cloud Scheduler の見出しに入れるので Terraform が作り、state に残る
#     （state のバケットは非公開。Cloud Scheduler の見出しは秘密の参照を使えないため）
#   - THREADS_APP_SECRET：Meta のアプリの秘密の値（threads-010）。入れ物だけを作り、値は手で版を足す
#   - NOTIFY_ALLOWLIST：予約の知らせの許可リスト（AD-24）。入れ物だけを作り、値は手で版を足す（README の 10）

ephemeral "random_password" "db" {
  length = 32
  # 接続の URL にそのまま入れても壊れないよう、記号を使わない（英大小・数字の32文字）
  special = false
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.name}-database-url"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

# DB の接続先。Cloud Run は Direct VPC egress で、Cloud SQL の内部の IP に TCP でつなぐ（Cloud SQL Auth Proxy を通さない。AD-8）。
# Cloud SQL は暗号のない接続を断る（ENCRYPTED_ONLY）。sslmode=no-verify：暗号はかけるが、サーバーの証明書は確かめない
# （pg の require は verify-full と同じに扱われ、内部の IP では証明書の名前が合わないため。通るのは VPC の中だけ。research R3）。
# 利用者の名前は google_sql_user を読まずに local.db_name で書く（DB の利用者がこの版を読むので、読み合いにしない）。
resource "google_secret_manager_secret_version" "database_url" {
  secret                 = google_secret_manager_secret.database_url.id
  secret_data_wo         = "postgresql://${local.db_name}:${ephemeral.random_password.db.result}@${var.sql_private_ip}:5432/${local.db_name}?sslmode=no-verify"
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

resource "google_secret_manager_secret" "token_keys" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = "${var.name}-token-encryption-keys"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "random_password" "job_trigger" {
  count   = local.shared_secrets_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "job_trigger" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = "${var.name}-job-trigger-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "job_trigger" {
  count       = local.shared_secrets_enabled ? 1 : 0
  secret      = google_secret_manager_secret.job_trigger[0].id
  secret_data = random_password.job_trigger[0].result
}

resource "google_secret_manager_secret" "threads_app_secret" {
  count     = local.threads_app_provisioned ? 1 : 0
  secret_id = "${var.name}-threads-app-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret" "notify_allowlist" {
  count     = var.booking_enabled ? 1 : 0
  secret_id = "${var.name}-notify-allowlist"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}
