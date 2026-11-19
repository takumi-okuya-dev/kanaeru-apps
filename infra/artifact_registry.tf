# コンテナのイメージの置き場所（core-002。東京）。
# 古いイメージを自動で消す。消すのは「新しい10個に入らず、かつ30日より古い」ものだけ（残す決まりが消す決まりより強い）。
# 動いている版のイメージを消さないため（research.md R-8）：最小0台なので、台が0から立ち上がるたびにイメージを読む。
# 消されていると立ち上がれないことがある。デプロイが db:migrate や確かめで何度か落ちても（押し込んだイメージは数に入る）、
# 動いている版のイメージが消えるのは、そのあと10回押し込み、かつ30日たったときだけ。1つ前の版へ戻す余地も残る。
# そのぶん無料の枠（0.5 GB）は超えうるが、超えた分は 1 GB あたり月 0.1 ドルほど（予算の中で小さい）。

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
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "2592000s" # 30日
    }
  }

  depends_on = [google_project_service.apis]
}
