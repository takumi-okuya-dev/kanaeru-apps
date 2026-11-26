# Terraform とプロバイダの版・state の置き場所・provider の設定（core-002。AD-9）。
# state は手で作った GCS のバケットに置く。バケットの名前は書かず、init のときに渡す（README の 3）。
# このプロジェクトの資源（共通の資源と、本番・ステージングの環境）を1つの state に持つ（別のプロジェクトに環境を移すときは、
# その環境を別の state にする。core-018）：
#   terraform init -backend-config="bucket=<state のバケット>"
terraform {
  # 1.11 以上：書くだけの欄（password_wo・secret_data_wo）と、その場だけの値（ephemeral）を使うため
  required_version = ">= 1.11"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  backend "gcs" {
    prefix = "suite/project"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # 請求の予算（google_billing_budget）を手元の資格（ADC）で作るときに要る
  user_project_override = true
  billing_project       = var.project_id

  # サービス名はラベルに持たせる（名前と違い、あとから変えられる。docs/rules/coding.md 2章）。環境は名前の -stg とラベル env
  default_labels = {
    product = "paletkit"
  }
}
