// 人の入力の欄（人を足す・直す・会った場で続けて足す画面が同じものを使う。FR-001・FR-002・FR-007）。
// 帰り道のスマホで早く書けるよう、フルネーム・見た目の特徴・話したこと・次に話したいことを先に置く（SC-001）。
// アカウントは閉じた「アカウント（任意）」の中（入れてあるか誤りがあれば開く）。続けて足す画面（compact）では、
// よみ・LINE の名前・タグも「ほかの欄」の中に入れる。欄の上に、知られたくないことを書かない注意を出す。
import { PERSON_ACCOUNT_KINDS, PERSON_ACCOUNT_LABELS } from "@workspace/contracts/person";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import type * as React from "react";
import { SENSITIVE_HINT } from "./note-form.ts";
import type { NoteFormValues } from "./note-form.ts";

/** NoteFields が受け取るもの。 */
export type NoteFieldsProps = {
  /** 欄の値 */
  values: NoteFormValues;
  /** 欄の名前ごとの誤り */
  errors: Record<string, string>;
  /** 欄が変わったとき */
  onChange: (name: keyof NoteFormValues, value: string) => void;
  /** 続けて足す画面の短い形か（よみ・LINE の名前・タグも閉じた中に入れる） */
  compact?: boolean;
};

/** アカウントの欄の説明（アカウント名だけでよい）。 */
const ACCOUNT_DESCRIPTIONS = {
  x: "@ のあとのアカウント名",
  connpass: "アカウント名",
  github: "アカウント名",
  linkedin: "URL の /in/ のあとの名前",
  line: "相手が ID で見つけられる設定のときだけ開けます。",
  url: "http か https で始まる URL",
} as const;

/**
 * 人の入力の欄。
 * @param props 欄の値（values）・誤り（errors）・変わったとき（onChange）・短い形か（compact）
 * @returns 欄の要素
 */
export function NoteFields({ values, errors, onChange, compact = false }: NoteFieldsProps) {
  /**
   * 欄の値を変える。
   * @param name 欄の名前
   * @returns 欄に渡す値と、変わったときの受け手
   */
  const bind = (name: keyof NoteFormValues) => ({
    name,
    value: values[name],
    onChange: (change: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(name, change.target.value);
    },
  });
  const accountOpen = PERSON_ACCOUNT_KINDS.some((kind) => values[kind] !== "" || errors[kind]);
  const extraOpen = values.reading !== "" || values.lineName !== "" || values.tags !== "";
  const extraError = Boolean(errors.reading || errors.lineName || errors.tags);

  const extraFields = (
    <>
      <Field label="よみ" error={errors.reading}>
        <Input autoComplete="off" {...bind("reading")} />
      </Field>
      <Field label="LINE の名前" error={errors.lineName}>
        <Input autoComplete="off" {...bind("lineName")} />
      </Field>
      <Field
        label="タグ"
        description="「、」で区切ると、いくつでも付けられます。"
        error={errors.tags}
      >
        <Input autoComplete="off" {...bind("tags")} />
      </Field>
    </>
  );

  return (
    <div className="flex flex-col gap-s">
      <p className="text-s text-text-sub">{SENSITIVE_HINT}</p>
      <Field label="フルネーム" error={errors.fullName} required>
        <Input autoComplete="off" {...bind("fullName")} />
      </Field>
      <Field
        label="見た目の特徴"
        description="顔を思い出すための短いことば"
        error={errors.appearance}
      >
        <Input autoComplete="off" {...bind("appearance")} />
      </Field>
      <Field label="話したこと" error={errors.talk}>
        <Textarea rows={4} {...bind("talk")} />
      </Field>
      <Field label="次に話したいこと" error={errors.nextTopic}>
        <Textarea rows={2} {...bind("nextTopic")} />
      </Field>
      {compact ? (
        <Disclosure
          key={extraError ? "extra-error" : "extra"}
          summary="ほかの欄（よみ・LINE の名前・タグ）"
          variant="heading"
          defaultOpen={extraOpen || extraError}
        >
          {extraFields}
        </Disclosure>
      ) : (
        extraFields
      )}
      <Disclosure
        key={PERSON_ACCOUNT_KINDS.some((kind) => errors[kind]) ? "account-error" : "account"}
        summary="アカウント（任意）"
        variant="heading"
        defaultOpen={accountOpen}
      >
        {PERSON_ACCOUNT_KINDS.map((kind) => (
          <Field
            key={kind}
            label={PERSON_ACCOUNT_LABELS[kind]}
            description={ACCOUNT_DESCRIPTIONS[kind]}
            error={errors[kind]}
          >
            <Input
              autoComplete="off"
              spellCheck={false}
              {...(kind === "url" ? { type: "url" } : {})}
              {...bind(kind)}
            />
          </Field>
        ))}
      </Disclosure>
    </div>
  );
}
