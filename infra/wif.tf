# GitHub Actions から鍵なしで入る仕組み（Workload Identity Federation。core-002。AD-9・AD-11）。
# 入れるのは var.github_repository の main のブランチの GitHub Actions だけ（プロバイダの条件で止める）。
# Cloud Run は WIF の直の権限に対応していないため、入ったあとは kanaeru-deployer になりすまして動く
# （サービスアカウントの鍵は作らない。research.md R-2）。
# プールは消しても30日は同じIDで作り直せないので、IDを変えない。

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "kanaeru のデプロイ（GitHub Actions）"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub（main だけ）"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # このリポジトリの main のブランチ（push と、main から手で流したとき）だけを受け入れる
  attribute_condition = "assertion.repository == \"${var.github_repository}\" && assertion.ref == \"refs/heads/main\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# このリポジトリから入った GitHub Actions だけが kanaeru-deployer になりすませる
resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
