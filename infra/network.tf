# VPC と、Cloud SQL を内部の IP だけで置くための道（core-018。AD-8）。
# - Cloud SQL：プライベート サービス アクセス（Google の持つネットワークと、この VPC をつなぐ）で内部の IP を持ち、公開の IP を持たない
#   （止めている間の公開の IPv4 の料金〈1時間0.01ドル〉がかからず、DB がインターネットから見えない）。
# - Cloud Run：Direct VPC egress で、このサブネットから VPC に出る（サーバー代のかかるコネクタは使わない）。
# どれも料金はかからない（VPC・サブネット・ピアリングは無料。VPC の中の通信も、同じリージョンなら無料）。

resource "google_compute_network" "main" {
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

# Cloud Run の台が使う内部の IP（1台につき2つほど。/24 で足りる）
resource "google_compute_subnetwork" "run" {
  name          = "${local.name}-run"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = "10.10.0.0/24"
}

# Cloud SQL などの Google の管理する資源に渡す内部の IP の範囲
# 範囲は書いて決める（自動で選ばせると、Cloud Run のサブネット 10.10.0.0/24 とぶつかる範囲が選ばれうるため）
resource "google_compute_global_address" "private_services" {
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  address       = "10.20.0.0"
  prefix_length = 20
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
  # 消すときにピアリングを外せず止まることがあるので、消すときは外さずに残す
  deletion_policy = "ABANDON"
}
