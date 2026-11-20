// 参考の投稿の欄（threads-012。めぐるの components/research/ReferencePostFields.tsx の振る舞いを写した）：
// 本文・媒体・元の投稿の投稿日（と今の鮮度）・投稿の URL・検索したキーワード・投稿の数字と投稿者とメモ（開閉）・なぜ良いか。
// 足す枠と直す枠の両方で使う。誤りは欄のそば（EXPERIENCE.md）。
import {
  FRESHNESS_LEVELS,
  POSTED_DATE_MODES,
  REFERENCE_AUTHOR_MAX,
  REFERENCE_BODY_MAX,
  REFERENCE_MEMO_MAX,
  REFERENCE_PLATFORMS,
  REFERENCE_WHY_GOOD_MAX,
  SHORT_TEXT_MAX,
  URL_MAX,
  countChars,
  jstToday,
} from "@workspace/contracts/threads";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useId, useState } from "react";
import type * as React from "react";
import type { FieldErrors } from "../../lib/form.ts";
import { REFERENCE_METRIC_LABELS, freshnessOfForm } from "./reference-post-form.ts";
import type { ReferenceForm } from "./reference-post-form.ts";

/** ReferencePostFields が受け取るもの。 */
export type ReferencePostFieldsProps = {
  /** 欄の値 */
  form: ReferenceForm;
  /** 1つの欄を変える */
  setField: <K extends keyof ReferenceForm>(key: K, value: ReferenceForm[K]) => void;
  /** 欄ごとの誤り */
  errors: FieldErrors;
  /** 送っている間など、変えられないとき */
  disabled?: boolean;
  /** なぜ良いかの説明（任意） */
  whyGoodNote?: string;
  /** なぜ良いかの下に足すもの（1件の解説など） */
  whyGoodExtra?: React.ReactNode;
};

/**
 * 文字数の説明（今の数／上限）。
 * @param value 値
 * @param max 上限
 * @returns 説明の文
 */
function counter(value: string, max: number): string {
  return `${countChars(value).toLocaleString("ja-JP")}／${max.toLocaleString("ja-JP")}文字`;
}

/**
 * 参考の投稿の欄。
 * @param props 欄の値（form）・変える（setField）・誤り（errors）・変えられない（disabled）・なぜ良いかの説明と足すもの
 * @returns 欄の要素
 */
export function ReferencePostFields({
  form,
  setField,
  errors,
  disabled = false,
  whyGoodNote,
  whyGoodExtra,
}: ReferencePostFieldsProps) {
  const hasDetails =
    REFERENCE_METRIC_LABELS.some(([key]) => form[key] !== "") ||
    form.author !== "" ||
    form.memo !== "";
  const detailsHaveError =
    REFERENCE_METRIC_LABELS.some(([key]) => errors[key]) || !!errors.author || !!errors.memo;
  const [detailsOpen, setDetailsOpen] = useState(hasDetails);
  const open = detailsOpen || detailsHaveError;
  const detailsId = useId();
  const freshness = FRESHNESS_LEVELS.find((level) => level.value === freshnessOfForm(form))?.label;

  return (
    <div className="flex flex-col gap-xs">
      <Field
        label="本文"
        description={`伸びていた投稿の本文を、そのまま貼ります（${counter(form.body, REFERENCE_BODY_MAX)}）`}
        error={errors.body}
        required
      >
        <Textarea
          rows={5}
          disabled={disabled}
          value={form.body}
          onChange={(change) => setField("body", change.target.value)}
        />
      </Field>
      <ChoiceChips
        label="媒体"
        options={REFERENCE_PLATFORMS.map((item) => ({ value: item.value, label: item.label }))}
        value={form.platform}
        onValueChange={(value) => {
          if (!disabled) setField("platform", value);
        }}
      />
      <ChoiceChips
        label="元の投稿の投稿日"
        description={`投稿日から鮮度（30日まで：最新、90日まで：現役、それより前：アーカイブ）を決め、新しい参考の投稿ほどプロンプトで先に使います。今の入力：${freshness ?? ""}`}
        options={POSTED_DATE_MODES.map((item) => ({ value: item.value, label: item.label }))}
        value={form.postedDateMode}
        onValueChange={(value) => {
          if (!disabled) setField("postedDateMode", value);
        }}
      />
      {form.postedDateMode === "exact" ? (
        <Field label="投稿日" error={errors.postedDate} required>
          <Input
            type="date"
            disabled={disabled}
            max={jstToday(new Date())}
            value={form.postedDate}
            onChange={(change) => setField("postedDate", change.target.value)}
          />
        </Field>
      ) : null}
      <Field
        label="投稿の URL"
        description={`https:// で始まる URL（${counter(form.postUrl, URL_MAX)}）`}
        error={errors.postUrl}
      >
        <Input
          type="url"
          inputMode="url"
          disabled={disabled}
          placeholder="https://www.threads.com/…"
          value={form.postUrl}
          onChange={(change) => setField("postUrl", change.target.value)}
        />
      </Field>
      <Field
        label="検索したキーワード"
        description={counter(form.keyword, SHORT_TEXT_MAX)}
        error={errors.keyword}
      >
        <Input
          disabled={disabled}
          value={form.keyword}
          onChange={(change) => setField("keyword", change.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
        <div>
          <Button
            variant="text"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen(!open)}
          >
            {open ? "投稿の数字・投稿者を閉じる" : "投稿の数字・投稿者を入れる（分かる場合だけ）"}
          </Button>
        </div>
        {open ? (
          <div id={detailsId} className="flex flex-col gap-xs">
            <p className="text-s text-text-sub">
              入れた数は、「なぜ良いか」を AI に頼むプロンプトに入ります（入れなければ「不明」）。
            </p>
            <div className="grid grid-cols-2 gap-xs wide:grid-cols-3">
              {REFERENCE_METRIC_LABELS.map(([key, label]) => (
                <Field key={key} label={label} error={errors[key]}>
                  <Input
                    inputMode="numeric"
                    disabled={disabled}
                    value={form[key]}
                    onChange={(change) => setField(key, change.target.value)}
                  />
                </Field>
              ))}
            </div>
            <Field
              label="投稿者（アカウント名）"
              description={counter(form.author, REFERENCE_AUTHOR_MAX)}
              error={errors.author}
            >
              <Input
                disabled={disabled}
                value={form.author}
                onChange={(change) => setField("author", change.target.value)}
              />
            </Field>
            <Field
              label="メモ（なぜ気になったか、など）"
              description={counter(form.memo, REFERENCE_MEMO_MAX)}
              error={errors.memo}
            >
              <Textarea
                rows={2}
                disabled={disabled}
                value={form.memo}
                onChange={(change) => setField("memo", change.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>
      <Field
        label="なぜ良いか"
        description={[whyGoodNote, counter(form.whyGood, REFERENCE_WHY_GOOD_MAX)]
          .filter(Boolean)
          .join(" ")}
        error={errors.whyGood}
      >
        <Textarea
          rows={4}
          disabled={disabled}
          placeholder="例：冒頭の1文で共感を取り、最後に問いかけでコメントを促している"
          value={form.whyGood}
          onChange={(change) => setField("whyGood", change.target.value)}
        />
      </Field>
      {whyGoodExtra}
    </div>
  );
}
