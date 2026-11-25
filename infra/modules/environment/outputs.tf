# 環境ごとの部品が返す値（どれも秘密ではないが、プロジェクトの番号などを含むので文書には写さない）。

output "web_url" {
  description = "画面の源（設定 WEB_URL）。LINE のミニアプリのエンドポイント URL にもこれを使う"
  value       = local.web_url
}

output "service_urls" {
  description = "Cloud Run のサービスの URL"
  value       = google_cloud_run_v2_service.app.urls
}

output "migrate_job_name" {
  description = "DB の変更を当てる Cloud Run の job"
  value       = google_cloud_run_v2_job.migrate.name
}

output "deployer_email" {
  description = "この環境のデプロイの身分"
  value       = google_service_account.deployer.email
}

output "github_environment_variables" {
  description = "GitHub の環境（Settings → Environments → この環境 → Environment variables）に入れる値。LIFF_ID は LINE の側の値を入れる"
  value = {
    GCP_DEPLOYER_SA   = google_service_account.deployer.email
    CLOUD_RUN_SERVICE = google_cloud_run_v2_service.app.name
    MIGRATE_JOB       = google_cloud_run_v2_job.migrate.name
    IMAGE_REPOSITORY  = local.image_repository
    APP_NAME          = var.app_name
  }
}
