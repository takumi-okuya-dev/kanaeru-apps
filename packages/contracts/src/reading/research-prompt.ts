// 「あとで調べる」の調べる文と、調べる先の URL（specs/reading/002-kindle-search/research.md R6・PRD FR-R20・AD-20）。zod を読まない。
// 調べる文は、利用者のブラウザが開く URL に入るだけで、PaletKit から外の AI には何も送らない（貼る形と同じ扱い）。
// 調べる先の URL の頭は、ここに決め打ちにする（利用者が書きかえられない）。

/** 調べる先。 */
export const RESEARCH_TARGETS = {
  chatgpt: { label: "ChatGPT", base: "https://chatgpt.com/?q=" },
  claude: { label: "Claude", base: "https://claude.ai/new?q=" },
  google: { label: "Google", base: "https://www.google.com/search?q=" },
} as const;

/** 調べる先の名前。 */
export type ResearchTarget = keyof typeof RESEARCH_TARGETS;

/** 調べる先の名前の並び（画面の順）。 */
export const RESEARCH_TARGET_KEYS = Object.keys(RESEARCH_TARGETS) as ResearchTarget[];

/** URL の長さの上限（こえたら、開かずにコピーに切りかえる）。 */
export const RESEARCH_URL_MAX = 2_000;

/** 調べる文の材料。 */
export type ResearchInput = {
  /** 書名 */
  title: string;
  /** 章 */
  chapter: string | null;
  /** マーカーの文 */
  text: string;
  /** コメント */
  comment: string | null;
  /** 分かりたいこと */
  want: string | null;
};

/**
 * 調べる文を組み立てる。
 * @param input 材料
 * @returns 調べる文
 */
export function buildResearchPrompt(input: ResearchInput): string {
  const lines = [
    `技術書『${input.title}』を読んでいて、分からない所があります。分かりやすく説明してください。`,
    ...(input.want ? [`この本で分かりたいこと：${input.want}`] : []),
    ...(input.chapter ? [`章：${input.chapter}`] : []),
    ...(input.text ? [`本の文：「${input.text}」`] : []),
    ...(input.comment ? [`私のメモ：${input.comment.replace(/^[?？]\s*/u, "")}`] : []),
  ];
  return lines.join("\n");
}

/**
 * 調べる先の URL（長すぎるときは null＝コピーに切りかえる）。
 * @param target 調べる先
 * @param prompt 調べる文
 * @returns URL か null
 */
export function researchUrl(target: ResearchTarget, prompt: string): string | null {
  const url = `${RESEARCH_TARGETS[target].base}${encodeURIComponent(prompt)}`;
  return url.length > RESEARCH_URL_MAX ? null : url;
}
