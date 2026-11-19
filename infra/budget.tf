# 請求の予算（core-002。AD-9：月2,000円、50%・100% でメールで知らせる）。
# 知らせは、請求先アカウントの管理者と利用者にメールで届く（既定の宛先）。予算はお金を止めない。
# クレジット（新規の300ドルなど）を引く前の額で数える：クレジットで0円に見えている間も、本当の費用で知らせる。

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "${local.name}-monthly"

  budget_filter {
    projects               = ["projects/${data.google_project.this.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "EXCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [google_project_service.apis]
}
