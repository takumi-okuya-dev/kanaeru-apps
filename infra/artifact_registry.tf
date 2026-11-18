# コンテナのイメージの置き場所（core-002。東京）。
# 無料の枠（0.5 GB）に近づけるため、新しい5つを残し、7日より古いものを消す（残す決まりが消す決まりより強い）。

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = local.name
  description   = "kanaeru のコンテナ（GitHub Actions が押し込む）"
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s"
    }
  }

  depends_on = [google_project_service.apis]
}
