# 名前などの共通の値（core-002・core-018）。共通の資源の名前はここから作る（環境ごとの資源の名前は environments.tf）。
# 資源の名前は「スイート（suite）」と役割だけにし、サービス名（PaletKit など）を入れない（作ったあとに変えられないため。
# docs/rules/coding.md 2章）。サービス名は provider の default_labels（versions.tf）のラベルに持たせる（ラベルはあとから変えられる）。

locals {
  name = "suite"

  # 最初だけの仮のイメージ（本物は GitHub Actions が出す。Terraform はイメージの差を無視する）
  placeholder_service_image = "us-docker.pkg.dev/cloudrun/container/hello"
  placeholder_job_image     = "us-docker.pkg.dev/cloudrun/container/job"

  # 本番で動かすコンテナの中の、画面の組み立てたファイルの場所（Dockerfile と同じ）
  web_dist_dir = "/app/apps/web/dist"
}

data "google_project" "this" {
  project_id = var.project_id
}
