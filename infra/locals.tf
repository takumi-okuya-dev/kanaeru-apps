# 名前などの共通の値（core-002・core-018）。共通の資源の名前はここから作る（環境ごとの資源の名前は environments.tf）。

locals {
  name = "kanaeru"

  # コンテナのイメージの置き場所（GitHub Actions が <この値>/app-<環境>:<コミット> を押し込む。環境ごとにイメージの名前を分け、
  # 古いイメージの掃除が環境ごとに新しい10個を残すようにする。artifact_registry.tf）
  image_repository = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"

  # 最初だけの仮のイメージ（本物は GitHub Actions が出す。Terraform はイメージの差を無視する）
  placeholder_service_image = "us-docker.pkg.dev/cloudrun/container/hello"
  placeholder_job_image     = "us-docker.pkg.dev/cloudrun/container/job"

  # 本番で動かすコンテナの中の、画面の組み立てたファイルの場所（Dockerfile と同じ）
  web_dist_dir = "/app/apps/web/dist"
}

data "google_project" "this" {
  project_id = var.project_id
}
