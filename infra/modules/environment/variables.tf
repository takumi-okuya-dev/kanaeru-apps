# 環境ごとの部品に渡す値（core-018）。プロジェクトに1つのもの（ネットワーク・Cloud SQL のサーバー・イメージの置き場・WIF）は
# 呼ぶ側（infra/）が作って渡す。別のプロジェクトに環境を移すとき（構成 C）は、移した先で同じ値を作って、この部品を呼ぶ。

# ---- 環境の名前と大きさ
variable "name" {
  type        = string
  description = "資源の名前の頭（本番は kanaeru・ステージングは kanaeru-stg）。Cloud Run のサービス・秘密・身分の名前になる"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,14}$", var.name))
    error_message = "name は英小文字で始まる、英小文字・数字・- の15文字までにしてください（身分の ID の上限に収めるため）。"
  }
}

variable "app_env" {
  type        = string
  description = "API の設定 APP_ENV（production・staging）"

  validation {
    condition     = contains(["production", "staging"], var.app_env)
    error_message = "app_env は production・staging のどちらかにしてください。"
  }
}

variable "github_ref" {
  type        = string
  description = "この環境へデプロイしてよい GitHub のブランチ（本番は refs/heads/main・ステージングは refs/heads/develop）"
}

variable "max_instances" {
  type        = number
  description = "Cloud Run の台数の上限。DB の接続は「台数 × db_pool_max」まで増えるので、ほかの環境と合わせて Cloud SQL の上限（db-f1-micro は25）に収める"
}

variable "db_pool_max" {
  type        = number
  description = "1台の DB の接続の上限（設定 DATABASE_POOL_MAX）"
}

# ---- プロジェクトに1つのもの（呼ぶ側が渡す）
variable "project_id" {
  type        = string
  description = "GCP のプロジェクトID"
}

variable "project_number" {
  type        = string
  description = "GCP のプロジェクトの番号（Cloud Run の決まった形の URL に使う）"
}

variable "region" {
  type        = string
  description = "置き場所のリージョン"
}

variable "sql_instance_name" {
  type        = string
  description = "Cloud SQL のサーバーの名前（DB と利用者をこの中に作る）"
}

variable "sql_private_ip" {
  type        = string
  description = "Cloud SQL のサーバーの内部の IP（Cloud Run は Direct VPC egress で、この IP に TCP でつなぐ）"
}

variable "vpc_network_id" {
  type        = string
  description = "Cloud Run が出ていく VPC のネットワーク"
}

variable "vpc_subnetwork_id" {
  type        = string
  description = "Cloud Run が出ていく VPC のサブネット（Direct VPC egress）"
}

variable "artifact_repository_location" {
  type        = string
  description = "コンテナのイメージの置き場所のリージョン"
}

variable "artifact_repository_name" {
  type        = string
  description = "コンテナのイメージの置き場所の名前（デプロイの身分に押し込む権限を付ける）"
}

variable "workload_identity_pool_name" {
  type        = string
  description = "GitHub Actions から入る WIF のプールの名前（projects/<番号>/locations/global/workloadIdentityPools/<ID>）"
}

variable "web_dist_dir" {
  type        = string
  description = "コンテナの中の、画面の組み立てたファイルの場所（Dockerfile と同じ）"
}

variable "placeholder_service_image" {
  type        = string
  description = "最初だけの仮のイメージ（サービス）"
}

variable "placeholder_job_image" {
  type        = string
  description = "最初だけの仮のイメージ（job）"
}

# ---- 環境ごとの値（infra/terraform.tfvars の production・staging）
variable "web_url" {
  type        = string
  description = "画面の源（設定 WEB_URL）。空なら Cloud Run の決まった形の URL（https://<name>-<プロジェクト番号>.<リージョン>.run.app）。独自ドメインにするときはその URL"
  default     = ""
}

variable "app_name" {
  type        = string
  description = "画面に出すアプリの名前（設定 APP_NAME。コンテナの組み立ての APP_NAME と同じにする）"
}

variable "line_channel_ids" {
  type        = string
  description = "IDトークンを確かめるときの LINE のチャネルID（カンマで並べる。秘密ではない。AD-4）。環境ごとの LINE ミニアプリのチャネル"
}

variable "organizer_line_user_id" {
  type        = string
  description = "主催者の LINE のユーザーID（秘密ではない。AD-5）"
}

variable "open_chat_url" {
  type        = string
  description = "コミュニティのオープンチャットの URL（秘密ではない）"
}

variable "db_password_version" {
  type        = number
  description = "DB のパスワードの版。上げて apply すると、新しいパスワードを作って DB と Secret Manager の両方に書く（README の 6）"
}

variable "threads_enabled" {
  type        = bool
  description = "Threads の運用アプリの秘密を作るか（定期の仕事は共通の kanaeru-jobs-tick が動かす）"
}

variable "threads_token_key_version" {
  type        = number
  description = "トークンを包む今の鍵の版（TOKEN_ENCRYPTION_KEY_VERSION。鍵の束の JSON にある版）"
}

variable "threads_oauth_enabled" {
  type        = bool
  description = "Threads の OAuth の接続と Meta の Webhook（threads-010。機能の印 threads.oauth）を入にするか"

  validation {
    condition     = !var.threads_oauth_enabled || var.threads_app_id != ""
    error_message = "threads_oauth_enabled を true にするときは、threads_app_id（Meta のアプリの ID）も入れてください。"
  }
}

variable "threads_app_id" {
  type        = string
  description = "Meta のアプリの ID（数字。公開してよい値）。threads_oauth_enabled のときだけ使う"

  validation {
    condition     = var.threads_app_id == "" || can(regex("^[0-9]+$", var.threads_app_id))
    error_message = "threads_app_id は数字だけにしてください（Meta の開発者の画面のアプリ ID）。"
  }
}

variable "booking_enabled" {
  type        = bool
  description = "予約（AD-24）の秘密を作るか（定期の仕事は共通の kanaeru-jobs-tick が動かす）"
}

variable "booking_notify_mode" {
  type        = string
  description = "予約の知らせの送り方（NOTIFY_MODE。AD-24）。off・allowlist・on。ステージングは off か allowlist にする"

  validation {
    condition     = contains(["off", "allowlist", "on"], var.booking_notify_mode)
    error_message = "booking_notify_mode は off・allowlist・on のどれかにしてください。"
  }

  validation {
    condition     = var.booking_notify_mode == "off" || var.booking_enabled
    error_message = "booking_notify_mode を off 以外にするときは、booking_enabled も true にしてください。"
  }
}
