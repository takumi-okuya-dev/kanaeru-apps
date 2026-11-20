// アルゴリズムの分析（threads-006）の窓口の入出力の形（ふつうの zod・日本語の誤りの文）。
// めぐるの packages/shared/src/schemas.ts の「アルゴリズムの解析（specs/022）」を写した。版は戦略と同じく「まだ保存していない」を 0 にする。
import { z } from "zod";
import { OPENING_TYPES } from "./analysis-types.ts";
import { ANALYSIS_CLASSIFY_BATCH, ANALYSIS_THEMES_MAX, ANALYSIS_THEME_NAME_MAX } from "./limits.ts";
import { nameMatchKey } from "./normalize.ts";
import { countChars } from "./text.ts";

/** テーマの ID（`t`＋英数字8文字まで）。 */
export const ANALYSIS_THEME_ID_PATTERN = /^t[0-9a-z]{1,8}$/;

/** テーマの ID の形。 */
const ThemeId = z
  .string()
  .regex(ANALYSIS_THEME_ID_PATTERN, { error: "テーマの ID の形が違います。" });

/** 書き出しの型の形。 */
export const OpeningTypeSchema = z.enum(OPENING_TYPES, {
  error: "書き出しの型は、選択肢から選んでください。",
});

/** テーマ（運用アカウントごと）。 */
export const AnalysisThemeSchema = z.object({ id: ThemeId, name: z.string() });

/** 分析の範囲（all：すべて・regular：宣伝を除いたふだんの投稿）。 */
export const ANALYSIS_SCOPES = ["all", "regular"] as const;

/** 分析の範囲の型。 */
export type AnalysisScope = (typeof ANALYSIS_SCOPES)[number];

/** 分析の範囲の見える名前。 */
export const ANALYSIS_SCOPE_LABELS: Record<AnalysisScope, string> = {
  all: "すべての投稿",
  regular: "ふだんの投稿（宣伝を除く）",
};

/** GET …/analysis の問い合わせ。 */
export const AnalysisQuery = z.object({
  scope: z.enum(ANALYSIS_SCOPES, { error: "範囲は、選択肢から選んでください。" }).default("all"),
});

/** テーマの一覧の入力（10個まで。名前は前後の空白を除いて1〜20文字で、重ならない）。 */
export const AnalysisThemesInput = z
  .array(
    z.object({
      id: ThemeId.optional(),
      name: z
        .string({ error: "テーマの名前を入れてください。" })
        .trim()
        .refine((value) => countChars(value) >= 1, { error: "テーマの名前を入れてください。" })
        .refine((value) => countChars(value) <= ANALYSIS_THEME_NAME_MAX, {
          error: `テーマの名前は${ANALYSIS_THEME_NAME_MAX}文字までにしてください。`,
        }),
    }),
  )
  .max(ANALYSIS_THEMES_MAX, { error: `テーマは${ANALYSIS_THEMES_MAX}個までにしてください。` })
  .superRefine((items, ctx) => {
    const names = new Set<string>();
    const ids = new Set<string>();
    items.forEach((theme, index) => {
      // 分類の答えを読むときと同じ鍵で比べる（「AI」と「ai」、全角と半角を同じ名前とみなす）
      const key = nameMatchKey(theme.name);
      if (names.has(key))
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "同じ名前のテーマがあります。",
        });
      names.add(key);
      if (theme.id) {
        if (ids.has(theme.id))
          ctx.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "同じテーマが2つあります。",
          });
        ids.add(theme.id);
      }
    });
  });

/** 分析の設定（応答）。版 0 は「まだ保存していない」（初めの値）。 */
export const AnalysisSettings = z.object({
  /** 伸びた傾向を投稿のプロンプトに入れるか（初めは入れる） */
  trendsInPrompt: z.boolean(),
  themes: z.array(AnalysisThemeSchema),
  version: z.number().int(),
});

/** 分析の設定の型。 */
export type AnalysisSettings = z.infer<typeof AnalysisSettings>;

/** PUT …/analysis/settings の入力（読んだ版と同じときだけ保存する）。 */
export const AnalysisSettingsInput = z.object({
  trendsInPrompt: z.boolean({ error: "入れるか入れないかを選んでください。" }),
  themes: AnalysisThemesInput,
  version: z.number().int().min(0),
});

/** 分析の設定の入力の型。 */
export type AnalysisSettingsInput = z.infer<typeof AnalysisSettingsInput>;

/** 区切りの印（few：件数が少ない・untried：試していない）。 */
const BucketMarkSchema = z.enum(["few", "untried"]).nullable();

/** 区切りの集計の1行。 */
const BucketRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int(),
  views: z.number().nullable(),
  engagementRate: z.number().nullable(),
  replyRate: z.number().nullable(),
  mark: BucketMarkSchema,
});

/** 本文の特徴の片側。 */
const SideSchema = z.object({ count: z.number().int(), views: z.number().nullable() });

/** 比べの値。 */
const CompareSchema = z.object({
  count: z.number().int(),
  firstSpeed: z.number().nullable(),
  laterGrowth: z.number().nullable(),
  replyRate: z.number().nullable(),
  length: z.number().nullable(),
  questionCount: z.number().int(),
});

/** 傾向の1つ。 */
export const AnalysisTrendSchema = z.object({
  dimension: z.enum(["time", "day", "length", "feature", "opening", "theme"]),
  key: z.string(),
  text: z.string(),
  count: z.number().int(),
  views: z.number(),
  otherCount: z.number().int(),
  otherViews: z.number(),
  ratio: z.number(),
  promptable: z.boolean(),
  /** 次の投稿のプロンプトに入るか（設定・投稿のルール・NG ワードで選んだあと） */
  inPrompt: z.boolean(),
});

/** GET …/analysis の応答（読むたびに計算し、保存しない）。 */
export const AnalysisView = z.object({
  period: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
  scope: z.enum(ANALYSIS_SCOPES),
  totals: z.object({
    confirmed: z.number().int(),
    promo: z.number().int(),
    withFollowers: z.number().int(),
    classified: z.number().int(),
  }),
  needMore: z.number().int().nullable(),
  trends: z.array(AnalysisTrendSchema),
  time: z.array(BucketRowSchema),
  day: z.array(BucketRowSchema),
  length: z.array(BucketRowSchema),
  features: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      with: SideSchema,
      without: SideSchema,
      ratio: z.number().nullable(),
      mark: BucketMarkSchema,
    }),
  ),
  opening: z.array(BucketRowSchema),
  theme: z.array(BucketRowSchema),
  recommended: z.object({
    available: z.boolean(),
    posts: z.array(
      z.object({
        id: z.string(),
        head: z.string(),
        publishedAt: z.string(),
        views: z.number(),
        spread: z.number(),
        firstSpeed: z.number().nullable(),
        laterGrowth: z.number().nullable(),
        replyRate: z.number().nullable(),
      }),
    ),
    compare: z.object({ recommended: CompareSchema, others: CompareSchema }).nullable(),
  }),
  /** 今の自動投稿の時刻（「時刻の見直しの参考に」） */
  schedule: z.object({ enabled: z.boolean(), slotTimes: z.array(z.string()) }),
  settings: AnalysisSettings,
});

/** 分析の画面のデータの型。 */
export type AnalysisView = z.infer<typeof AnalysisView>;

/** 分類する投稿の一覧の選び方（unclassified：まだ・classified：分類済み）。 */
export const CLASSIFICATION_MODES = ["unclassified", "classified"] as const;

/** GET …/analysis/classifications の問い合わせ。 */
export const ClassificationsQuery = z.object({
  mode: z
    .enum(CLASSIFICATION_MODES, { error: "選び方は、選択肢から選んでください。" })
    .default("unclassified"),
});

/** 分類する投稿の1件。 */
export const ClassificationTarget = z.object({
  draftId: z.guid(),
  body: z.string(),
  publishedAt: z.string(),
  openingType: OpeningTypeSchema.nullable(),
  themeId: z.string().nullable(),
});

/** GET …/analysis/classifications の応答。 */
export const ClassificationsList = z.object({
  posts: z.array(ClassificationTarget),
  /** 一覧に入らなかった残りの数 */
  remaining: z.number().int(),
  themes: z.array(AnalysisThemeSchema),
});

/** 分類する投稿の一覧の型。 */
export type ClassificationsList = z.infer<typeof ClassificationsList>;

/** 分類の付け方（ai：外の AI の答えを貼った・manual：手で直した）。 */
export const CLASSIFICATION_SOURCES = ["ai", "manual"] as const;

/** PUT …/analysis/classifications の入力（1〜50件）。 */
export const ClassificationsInput = z.object({
  source: z.enum(CLASSIFICATION_SOURCES, { error: "付け方は、選択肢から選んでください。" }),
  items: z
    .array(
      z.object({
        draftId: z.guid({ error: "投稿の ID の形が違います。" }),
        openingType: OpeningTypeSchema,
        themeId: ThemeId.nullable(),
      }),
    )
    .min(1, { error: "分類を1件以上入れてください。" })
    .max(ANALYSIS_CLASSIFY_BATCH, {
      error: `分類は1回に${ANALYSIS_CLASSIFY_BATCH}件までにしてください。`,
    }),
});

/** 分類の保存の入力の型。 */
export type ClassificationsInput = z.infer<typeof ClassificationsInput>;

/** PUT …/analysis/classifications の応答（保存した数と、保存しなかった投稿の ID）。 */
export const ClassificationsSaveResult = z.object({
  saved: z.number().int(),
  skipped: z.array(z.string()),
});
