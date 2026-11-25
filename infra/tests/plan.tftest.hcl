mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789012" }
  }
  mock_resource "google_sql_database_instance" {
    defaults = { private_ip_address = "10.20.0.3", name = "kanaeru-db", connection_name = "p:r:kanaeru-db" }
  }
  mock_resource "google_cloud_run_v2_service" {
    defaults = { uri = "https://kanaeru-123456789012.asia-northeast1.run.app" }
  }
  mock_resource "google_secret_manager_secret_version" {
    defaults = { version = "1" }
  }
}
mock_provider "random" {}

variables {
  project_id                 = "p"
  billing_account_id         = "000000-000000-000000"
  github_repository          = "o/r"
  github_repository_id       = "1"
  github_repository_owner_id = "2"
  production = {
    line_channel_ids       = "111"
    organizer_line_user_id = "U1"
    open_chat_url          = "https://line.me/x"
    threads_enabled        = true
    booking_enabled        = true
  }
  staging = {
    line_channel_ids       = "222"
    organizer_line_user_id = "U1"
    open_chat_url          = "https://line.me/x"
    app_name               = "kanaeru（ステージング）"
    threads_enabled        = true
    booking_enabled        = true
    booking_notify_mode    = "allowlist"
  }
}

run "both" {
  command = plan
  assert {
    condition     = module.production.github_environment_variables.CLOUD_RUN_SERVICE == "kanaeru"
    error_message = "prod name"
  }
  assert {
    condition     = module.staging[0].github_environment_variables.CLOUD_RUN_SERVICE == "kanaeru-stg"
    error_message = "stg name"
  }
  assert {
    condition     = module.staging[0].web_url == "https://kanaeru-stg-123456789012.asia-northeast1.run.app"
    error_message = "stg url"
  }
  assert {
    condition     = endswith(module.production.github_environment_variables.IMAGE_REPOSITORY, "/kanaeru/app") && endswith(module.staging[0].github_environment_variables.IMAGE_REPOSITORY, "/kanaeru-stg/app")
    error_message = "image repositories must be separate per environment"
  }
}

run "no_staging" {
  command = plan
  variables {
    staging = null
  }
  assert {
    condition     = length(module.staging) == 0
    error_message = "staging should be absent"
  }
}

run "staging_on_rejected" {
  command = plan
  variables {
    staging = {
      line_channel_ids       = "222"
      organizer_line_user_id = "U1"
      open_chat_url          = "https://line.me/x"
      booking_enabled        = true
      booking_notify_mode    = "on"
    }
  }
  expect_failures = [var.staging]
}
