# Cloud Run のサービス（画面と /api を同じ源で返す）と、DB の変更を当てる job（core-002。AD-8・AD-11）。
# Terraform が持つのは「どう動かすか」（台数・環境の値・秘密の参照・身分・Cloud SQL の接続）。
# 「どのイメージを動かすか」は GitHub Actions（.github/workflows/deploy.yml）が持つので、イメージの差は無視する。
# 環境の値を変えるのは Terraform だけにする（デプロイで --set-env-vars などを使うと、次の plan で取り合いになる）。

locals {
  # 台数の上限（AD-8）。DB の接続は「台数 × 1台のプールの上限（DATABASE_POOL_MAX）」まで増えるので、
  # Cloud SQL（db-f1-micro）の接続の上限を超えないよう、2つを並べて決める
  max_instances = 2

  # API の設定（値の意味は apps/api/src/kernel/config.ts）。秘密ではない値だけ。秘密は下の DATABASE_URL のように Secret Manager から渡す
  service_env = {
    APP_ENV                = "production"
    APP_NAME               = var.app_name
    WEB_URL                = local.web_url
    API_HOST               = "0.0.0.0"
    API_PORT               = "8080"
    WEB_DIST_DIR           = local.web_dist_dir
    LOG_LEVEL              = "info"
    TRUSTED_PROXY_HOPS     = "1"
    RATE_LIMIT_MAX         = "600"
    LINE_CHANNEL_IDS       = var.line_channel_ids
    ORGANIZER_LINE_USER_ID = var.organizer_line_user_id
    OPEN_CHAT_URL          = var.open_chat_url
  }
}

resource "google_cloud_run_v2_service" "app" {
  name                = local.name
  location            = var.region
  deletion_protection = true

  # 参加者のスマホから届く。誰でも開ける（ログインはアプリの中で確かめる）
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true

  # 台数の上限はサービスの単位で置く（流れを受けるすべての版の合計）。版の単位だけだと、デプロイで古い版と
  # 新しい版が重なる間に、版ごとに上限まで立ち上がり、DB の接続の数が見込みを超えうる
  scaling {
    min_instance_count = 0
    max_instance_count = local.max_instances
  }

  template {
    service_account = google_service_account.runtime.email
    timeout         = "60s"

    # 版の単位も同じ値にそろえる（両方あると小さいほうが効く。サービスの単位の上限と食い違わないように）
    scaling {
      min_instance_count = 0
      max_instance_count = local.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = local.placeholder_service_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # 要求のあるときだけ CPU を使う（料金を要求の間だけにする）。起動のときだけ CPU を増やす
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.service_env
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      # 起動の確かめ（probe）は既定（TCP）のまま。DB に触る窓口を指さない（AD-10）
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_iam_member.runtime_sql_client,
    google_secret_manager_secret_iam_member.runtime_database_url,
    google_secret_manager_secret_version.database_url,
  ]
}

# DB の変更を当てる job（同じイメージで node scripts/migrate.ts を動かす。AD-11）。
# GitHub Actions が、イメージを更新してから動かして待ち、成功したときだけサービスを出す。
resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.runtime.email
      timeout         = "600s"
      # DB の変更を何度も当て直さない（失敗したらデプロイを止めて、人が見る）
      max_retries = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image = local.placeholder_job_image
        # コンテナの ENTRYPOINT は node。作業の場所は apps/api（Dockerfile）
        args = ["scripts/migrate.ts"]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_iam_member.runtime_sql_client,
    google_secret_manager_secret_iam_member.runtime_database_url,
    google_secret_manager_secret_version.database_url,
  ]
}
