# GitHub Actions から鍵なしで入る仕組み（Workload Identity Federation。core-002・core-018。AD-9・AD-11）。
# 入れるのは var.github_repository の main（本番）と develop（ステージング）のブランチの GitHub Actions だけ（プロバイダの条件で止める）。
# どの身分になりすませるかは、ブランチで分ける（本番のデプロイの身分は main だけ・ステージングのデプロイの身分は develop と main〈本番の前に同じ中身を出すため〉。
# modules/environment/iam.tf。夜の緊急デプロイで DB を起こす kanaeru-db-waker は main だけ。service_accounts.tf）。
# リポジトリの名前（owner/repo）は付け直せ、消したあとに別の人が同じ名前を取れるので、
# 変わらない数字の ID（リポジトリと持ち主）でも絞り、なりすましの権限もリポジトリの ID に付ける。
# Cloud Run は WIF の直の権限に対応していないため、入ったあとは環境ごとのデプロイの身分（<name>-deployer）になりすまして動く
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
  display_name                       = "GitHub（main と develop）"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  # このリポジトリ（名前と、変わらない数字の ID の両方）の main と develop のブランチ（push と、そのブランチから手で流したとき）だけを受け入れる
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repository}\"",
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.repository_owner_id == \"${var.github_repository_owner_id}\"",
    "(assertion.ref == \"refs/heads/main\" || assertion.ref == \"refs/heads/develop\")",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
