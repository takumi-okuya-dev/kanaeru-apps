# 使う API の有効化（core-002）。serviceusage・cloudresourcemanager は最初の apply の前に手で有効にする（README の 2）。
# disable_on_destroy は既定（false）のまま：資源を消しても API は有効のまま残す。

resource "google_project_service" "apis" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
  service = each.value
}
