# 名前などの共通の値（core-002・core-018）。共通の資源の名前はここから作る（環境ごとの資源の名前は environments.tf）。

locals {
  name = "kanaeru"

  # 最初だけの仮のイメージ（本物は GitHub Actions が出す。Terraform はイメージの差を無視する）
  placeholder_service_image = "us-docker.pkg.dev/cloudrun/container/hello"
  placeholder_job_image     = "us-docker.pkg.dev/cloudrun/container/job"

  # 本番で動かすコンテナの中の、画面の組み立てたファイルの場所（Dockerfile と同じ）
  web_dist_dir = "/app/apps/web/dist"
}

data "google_project" "this" {
  project_id = var.project_id
}
