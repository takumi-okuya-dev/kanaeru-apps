# 名前などの共通の値（core-002）。資源の名前はここから作る。

locals {
  name = "kanaeru"

  # 画面の源（WEB_URL）。Cloud Run の決まった形の URL を、サービスを作る前に組み立てる
  web_url = var.web_url != "" ? var.web_url : "https://${local.name}-${data.google_project.this.number}.${var.region}.run.app"

  # コンテナのイメージの置き場所（GitHub Actions が <この値>:<コミット> を押し込む）
  image_repository = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/app"

  # 最初だけの仮のイメージ（本物は GitHub Actions が出す。Terraform はイメージの差を無視する）
  placeholder_service_image = "us-docker.pkg.dev/cloudrun/container/hello"
  placeholder_job_image     = "us-docker.pkg.dev/cloudrun/container/job"

  # 本番で動かすコンテナの中の、画面の組み立てたファイルの場所（Dockerfile と同じ）
  web_dist_dir = "/app/apps/web/dist"
}

data "google_project" "this" {
  project_id = var.project_id
}
