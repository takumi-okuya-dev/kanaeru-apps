# 外から渡す値（core-002）。値は terraform.tfvars（コミットしない。見本は terraform.tfvars.example）で渡す。
# 秘密の値はここに置かない（DB のパスワードは Terraform の中で作り、state に残さない。secrets.tf）。

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
  description = "デプロイを許す GitHub のリポジトリ（owner/repo の形）。このリポジトリの main のブランチだけが入れる"

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

variable "app_name" {
  type        = string
  description = "画面に出すアプリの名前（設定 APP_NAME。コンテナの組み立ての APP_NAME と同じにする）"
  default     = "kanaeru"
}

variable "web_url" {
  type        = string
  description = "画面の源（設定 WEB_URL）。空なら Cloud Run の決まった形の URL（https://<サービス>-<プロジェクト番号>.<リージョン>.run.app）にする"
  default     = ""
}

variable "line_channel_ids" {
  type        = string
  description = "IDトークンを確かめるときの LINE のチャネルID（カンマで並べる。秘密ではない。AD-4）"
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
  default     = 1
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

variable "threads_enabled" {
  type        = bool
  description = "Threads の運用アプリの秘密と定期の仕事を作るか。true にする前に、鍵の束の秘密に版を足す（README の 9）"
  default     = false
}

variable "threads_token_key_version" {
  type        = number
  description = "Threads のトークンを包む今の鍵の版（TOKEN_ENCRYPTION_KEY_VERSION。鍵の束の JSON にある版）"
  default     = 1
}
