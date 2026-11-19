# GitHub Actions から鍵なしで入る仕組み（Workload Identity Federation。core-002。AD-9・AD-11）。
# 入れるのは var.github_repository の main のブランチの GitHub Actions だけ（プロバイダの条件で止める）。
# リポジトリの名前（owner/repo）は付け直せ、消したあとに別の人が同じ名前を取れるので、
# 変わらない数字の ID（リポジトリと持ち主）でも絞り、なりすましの権限もリポジトリの ID に付ける。
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
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  # このリポジトリ（名前と、変わらない数字の ID の両方）の main のブランチ（push と、main から手で流したとき）だけを受け入れる
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_repository_owner_id}\"",
    "assertion.ref == \"refs/heads/main\"",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# このリポジトリから入った GitHub Actions だけが kanaeru-deployer になりすませる（名前ではなく、変わらないリポジトリの ID で指す）
resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
