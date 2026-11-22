# 外から渡す値（core-002）。値は terraform.tfvars（コミットしない。見本は terraform.tfvars.example）で渡す。
# 秘密の値はここに置かない（DB のパスワードは Terraform の中で作り、state に残さない。modules/environment/secrets.tf）。

variable "project_id" {
  type        = string
  description = "GCP のプロジェクトID（手で作ったもの）"
}

variable "region" {
  type        = string
  description = "置き場所のリージョン（AD-8：東京）"
  default     = "asia-northeast1"
}

variable "billing_account_id" {
  type        = string
  description = "請求先アカウントのID（XXXXXX-XXXXXX-XXXXXX の形。予算の知らせに使う）"
}

variable "github_repository" {
  type        = string
  description = "デプロイを許す GitHub のリポジトリ（owner/repo の形）。このリポジトリの main（本番）と develop（ステージング）のブランチだけが入れる"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "owner/repo の形にしてください。"
  }
}

# 名前（owner/repo）は付け直せ、消したあとに別の人が同じ名前を取れる。数字の ID は変わらないので、両方で絞る（wif.tf）
variable "github_repository_id" {
  type        = string
  description = "github_repository の数字の ID（変わらない値）。`gh api repos/<owner>/<repo> --jq .id` で見る（README の 4）"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "数字だけにしてください。"
  }
}

variable "github_repository_owner_id" {
  type        = string
  description = "github_repository の持ち主（人か組織）の数字の ID（変わらない値）。`gh api repos/<owner>/<repo> --jq .owner.id` で見る（README の 4）"

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_owner_id))
    error_message = "数字だけにしてください。"
  }
}

variable "budget_amount" {
  type        = number
  description = "請求の予算（月。AD-9：2,000円）"
  default     = 2000
}

variable "budget_currency" {
  type        = string
  description = "予算の通貨（請求先アカウントの通貨と同じにする）"
  default     = "JPY"
}

# ---- 環境ごとの値（core-018）。資源の名前・台数・DB の接続の数は environments.tf で決める
variable "production" {
  description = "本番（kanaeru。main のマージで出る）の値"
  type = object({
    # 画面の源（設定 WEB_URL）。空なら Cloud Run の決まった形の URL（https://<サービス>-<プロジェクト番号>.<リージョン>.run.app）。
    # 独自ドメインにするときはその URL（LINE のミニアプリ・OAuth の戻り先に登録する前に決める）
    web_url = optional(string, "")
    # 画面に出すアプリの名前（設定 APP_NAME。GitHub の環境の変数 APP_NAME と同じにする）
    app_name = optional(string, "kanaeru")
    # IDトークンを確かめるときの LINE のチャネルID（カンマで並べる。秘密ではない。AD-4）。環境ごとの LINE ミニアプリのチャネル
    line_channel_ids = string
    # 主催者の LINE のユーザーID（秘密ではない。AD-5。同じプロバイダーなら環境で同じ値）
    organizer_line_user_id = string
    # コミュニティのオープンチャットの URL（秘密ではない）
    open_chat_url = string
    # DB のパスワードの版。上げて apply すると、新しいパスワードを作って DB と Secret Manager の両方に書く（README の 6）
    db_password_version = optional(number, 1)
    # Threads の運用アプリの秘密を作るか。true にする前に、鍵の束の秘密に版を足す（README の 9）
    threads_enabled = optional(bool, false)
    # トークンを包む今の鍵の版（TOKEN_ENCRYPTION_KEY_VERSION）
    threads_token_key_version = optional(number, 1)
    # Threads の OAuth の接続と Meta の Webhook（threads-010）を入にするか。threads_enabled と threads_app_id が要る
    threads_oauth_enabled = optional(bool, false)
    # Meta のアプリの ID（数字。公開してよい値）
    threads_app_id = optional(string, "")
    # 予約（AD-24）の秘密を作るか。true にする前に、鍵の束の秘密に版を足す（README の 10）
    booking_enabled = optional(bool, false)
    # 予約の知らせの送り方（NOTIFY_MODE）。off・allowlist・on。ステージングは off か allowlist にする
    booking_notify_mode = optional(string, "off")
  })
}

variable "staging" {
  description = "ステージング（kanaeru-stg。develop のマージで出る。本番と同じ Cloud SQL のサーバーの中の別の DB を使う）の値。null なら作らない"
  type = object({
    # 画面の源（設定 WEB_URL）。空なら Cloud Run の決まった形の URL（https://<サービス>-<プロジェクト番号>.<リージョン>.run.app）。
    # 独自ドメインにするときはその URL（LINE のミニアプリ・OAuth の戻り先に登録する前に決める）
    web_url = optional(string, "")
    # 画面に出すアプリの名前（設定 APP_NAME。GitHub の環境の変数 APP_NAME と同じにする）
    app_name = optional(string, "kanaeru")
    # IDトークンを確かめるときの LINE のチャネルID（カンマで並べる。秘密ではない。AD-4）。環境ごとの LINE ミニアプリのチャネル
    line_channel_ids = string
    # 主催者の LINE のユーザーID（秘密ではない。AD-5。同じプロバイダーなら環境で同じ値）
    organizer_line_user_id = string
    # コミュニティのオープンチャットの URL（秘密ではない）
    open_chat_url = string
    # DB のパスワードの版。上げて apply すると、新しいパスワードを作って DB と Secret Manager の両方に書く（README の 6）
    db_password_version = optional(number, 1)
    # Threads の運用アプリの秘密を作るか。true にする前に、鍵の束の秘密に版を足す（README の 9）
    threads_enabled = optional(bool, false)
    # トークンを包む今の鍵の版（TOKEN_ENCRYPTION_KEY_VERSION）
    threads_token_key_version = optional(number, 1)
    # Threads の OAuth の接続と Meta の Webhook（threads-010）を入にするか。threads_enabled と threads_app_id が要る
    threads_oauth_enabled = optional(bool, false)
    # Meta のアプリの ID（数字。公開してよい値）
    threads_app_id = optional(string, "")
    # 予約（AD-24）の秘密を作るか。true にする前に、鍵の束の秘密に版を足す（README の 10）
    booking_enabled = optional(bool, false)
    # 予約の知らせの送り方（NOTIFY_MODE）。off・allowlist・on。ステージングは off か allowlist にする
    booking_notify_mode = optional(string, "off")
  })
  default = null

  validation {
    condition     = var.staging == null || var.staging.booking_notify_mode != "on"
    error_message = "ステージングの booking_notify_mode は off か allowlist にしてください（本物の参加者に知らせを送らないため）。"
  }
}
