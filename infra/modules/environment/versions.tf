# 環境ごとの部品のプロバイダ（版は呼ぶ側の infra/versions.tf で決める）。
terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}
