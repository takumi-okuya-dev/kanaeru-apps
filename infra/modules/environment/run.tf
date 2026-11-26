# Cloud Run のサービス（画面と /api を同じ源で返す）と、DB の変更を当てる job（core-002・core-018。AD-8・AD-11）。
# Terraform が持つのは「どう動かすか」（台数・環境の値・秘密の参照・身分・VPC への出口）。
# 「どのイメージを動かすか」は GitHub Actions（.github/workflows/deploy.yml）が持つので、イメージの差は無視する。
# 環境の値を変えるのは Terraform だけにする（デプロイで --set-env-vars などを使うと、次の plan で取り合いになる）。
# DB へは Direct VPC egress で VPC に出て、Cloud SQL の内部の IP に TCP でつなぐ。VPC に出すのは内部の宛先だけ
# （PRIVATE_RANGES_ONLY。LINE・Threads などの外の API へは、今までどおり直に出る）。

locals {
  # API の設定（値の意味は apps/api/src/kernel/config.ts）。秘密ではない値だけ。秘密は Secret Manager から渡す
  service_env = {
    APP_ENV                = var.app_env
    APP_NAME               = var.app_name
    WEB_URL                = local.web_url
    API_HOST               = "0.0.0.0"
    API_PORT               = "8080"
    WEB_DIST_DIR           = var.web_dist_dir
    LOG_LEVEL              = "info"
    TRUSTED_PROXY_HOPS     = "1"
    RATE_LIMIT_MAX         = "600"
    DATABASE_POOL_MAX      = tostring(var.db_pool_max)
    LINE_CHANNEL_IDS       = var.line_channel_ids
    ORGANIZER_LINE_USER_ID = var.organizer_line_user_id
    OPEN_CHAT_URL          = var.open_chat_url
  }

  # Threads・予約を入にしたときだけ足す設定（アプリを見せるかは、アプリの台帳〈設定 → アプリの台帳〉で決める。AD-16）
  feature_env = merge(
    local.shared_secrets_enabled ? { TOKEN_ENCRYPTION_KEY_VERSION = tostring(var.threads_token_key_version) } : {},
    local.threads_oauth ? { THREADS_APP_ID = var.threads_app_id, DOMAIN_FEATURES = "threads.oauth" } : {},
    var.booking_enabled ? { NOTIFY_MODE = var.booking_notify_mode } : {},
  )

  # 秘密の参照（環境の値の名前 → Secret Manager の秘密の名前）。許可リストは送り方が allowlist のときだけ読む
  secret_env = merge(
    { DATABASE_URL = google_secret_manager_secret.database_url.secret_id },
    local.shared_secrets_enabled ? {
      TOKEN_ENCRYPTION_KEYS = google_secret_manager_secret.token_keys[0].secret_id
      JOB_TRIGGER_SECRET    = google_secret_manager_secret.job_trigger[0].secret_id
    } : {},
    local.threads_oauth ? { THREADS_APP_SECRET = google_secret_manager_secret.threads_app_secret[0].secret_id } : {},
    var.booking_notify_mode == "allowlist" ? { NOTIFY_ALLOWLIST = google_secret_manager_secret.notify_allowlist[0].secret_id } : {},
  )
}

resource "google_cloud_run_v2_service" "app" {
  name                = var.name
  location            = var.region
  deletion_protection = var.deletion_protection
  labels              = local.labels

  # 参加者のスマホから届く。誰でも開ける（ログインはアプリの中で確かめる）
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true

  # 台数の上限はサービスの単位で置く（流れを受けるすべての版の合計）。版の単位だけだと、デプロイで古い版と
  # 新しい版が重なる間に、版ごとに上限まで立ち上がり、DB の接続の数が見込みを超えうる
  scaling {
    min_instance_count = 0
    max_instance_count = var.max_instances
  }

  template {
    service_account = google_service_account.runtime.email
    timeout         = "60s"

    # 版の単位も同じ値にそろえる（両方あると小さいほうが効く。サービスの単位の上限と食い違わないように）
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    # DB の内部の IP へ出る道（Direct VPC egress。サーバー代はかからない）。台が立ち上がるとき、つながるまで時間がかかることが
    # ある（Google の文書）。DB につながらない間は 503（DB_UNAVAILABLE）で答え、次の要求でつなぎ直す
    vpc_access {
      network_interfaces {
        network    = var.vpc_network_id
        subnetwork = var.vpc_subnetwork_id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.placeholder_service_image

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
        for_each = merge(local.service_env, local.feature_env)
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
      # 起動の確かめ（probe）は既定（TCP）のまま。DB に触る窓口を指さない（夜間は DB が止まるため。AD-10）
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  # 秘密を読む権限と版・DB ができてから、新しい版を立ち上げる（消すときは、サービスを DB より先に消す）
  depends_on = [
    google_sql_database.app,
    google_secret_manager_secret_iam_member.runtime_database_url,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_iam_member.runtime_token_keys,
    google_secret_manager_secret_iam_member.runtime_job_trigger,
    google_secret_manager_secret_version.job_trigger,
    google_secret_manager_secret_iam_member.runtime_threads_app_secret,
    google_secret_manager_secret_iam_member.runtime_notify_allowlist,
  ]
}

# DB の変更を当てる job（同じイメージで node scripts/migrate.ts を動かす。AD-11）。
# GitHub Actions が、イメージを更新してから動かして待ち、成功したときだけサービスを出す。
resource "google_cloud_run_v2_job" "migrate" {
  name                = "${var.name}-migrate"
  location            = var.region
  deletion_protection = false
  labels              = local.labels

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.runtime.email
      timeout         = "600s"
      # DB の変更を何度も当て直さない（失敗したらデプロイを止めて、人が見る）
      max_retries = 0

      vpc_access {
        network_interfaces {
          network    = var.vpc_network_id
          subnetwork = var.vpc_subnetwork_id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        image = var.placeholder_job_image
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
    google_sql_database.app,
    google_secret_manager_secret_iam_member.runtime_database_url,
    google_secret_manager_secret_version.database_url,
  ]
}

# 共通の定期の仕事（core-017）。5分ごと（8時〜23時台）に POST /api/v1/jobs/tick を呼び、組み立てがその回に当たる領域の
# 定期の仕事（Threads・booking などの scheduledJob）を動かす。合言葉があるとき（Threads か予約が入）だけ作る。
# 呼ぶ先は Cloud Run の決まった形の URL（独自ドメインの前の中継〈Cloudflare など〉を通さない）。
# Cloud Scheduler の無料の枠は請求先アカウントごとに3つ。DB の停止・起動と、環境ごとに1つずつで、ステージングを入れると4つ（月0.10ドル）。
resource "google_cloud_scheduler_job" "jobs_tick" {
  count       = local.shared_secrets_enabled ? 1 : 0
  name        = "${var.name}-jobs-tick"
  description = "5分ごと（8時〜23時台）に ${var.name} の共通の定期の仕事を呼ぶ（その回に当たる領域の仕事を動かす）"
  region      = var.region
  schedule    = "*/5 8-23 * * *"
  time_zone   = "Asia/Tokyo"

  # 1回の失敗は次の回が拾う（領域の仕事は何度呼んでも二重にならない作り）ので、やり直さない
  retry_config {
    retry_count = 0
  }

  attempt_deadline = "120s"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.app.uri}/api/v1/jobs/tick"
    headers = {
      "Content-Type"  = "application/json"
      "Authorization" = "Bearer ${random_password.job_trigger[0].result}"
    }
    body = base64encode("{}")
  }

  lifecycle {
    ignore_changes = [paused]
  }
}
