// 利用規約とプライバシーポリシーの文の読み方（suite-002）。React を読まない（写しを作る手順〈apps/web/legal-md.ts〉も使う）。
// - splitLegalText：文を、ふつうの文・運営者が埋める所（〈 〉）・もう一方へのリンク（{{terms}}・{{privacy}}）に分ける
// - legalToMarkdown・syncLegalMarkdown：主催者が読む写し（_bmad-output/legal/*-draft.md）の、印より下を作る
import { LEGAL_DOCUMENTS, PLACEHOLDER_PATTERN } from "./legal-content.ts";
import type { LegalBlock, LegalDocument, LegalDocumentKey } from "./legal-content.ts";

/** 文のかけら。 */
export type LegalTextPart =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; text: string }
  | { kind: "link"; to: LegalDocumentKey; text: string };

/** もう一方へのリンクの印の形。 */
const LINK_PATTERN = /\{\{(terms|privacy)\}\}/g;

/**
 * 文を、ふつうの文・運営者が埋める所・もう一方へのリンクに分ける。
 * @param text 文
 * @returns かけらの並び（空のかけらは入れない）
 */
export function splitLegalText(text: string): LegalTextPart[] {
  const parts: LegalTextPart[] = [];
  const pattern = new RegExp(`${PLACEHOLDER_PATTERN.source}|${LINK_PATTERN.source}`, "g");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: "text", text: text.slice(last, match.index) });
    const key = match[1] as LegalDocumentKey | undefined;
    if (key) parts.push({ kind: "link", to: key, text: LEGAL_DOCUMENTS[key].title });
    else parts.push({ kind: "placeholder", text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/**
 * 写しの文（リンクは「題」にする）。
 * @param text 文
 * @returns Markdown の文
 */
function markdownText(text: string): string {
  return splitLegalText(text)
    .map((part) => (part.kind === "link" ? `「${part.text}」` : part.text))
    .join("");
}

/**
 * まとまりを Markdown にする。
 * @param block まとまり
 * @returns Markdown の行
 */
function markdownBlock(block: LegalBlock): string {
  switch (block.kind) {
    case "paragraph":
      return markdownText(block.text);
    case "list":
      return block.items
        .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${markdownText(item)}`)
        .join("\n");
    case "table":
      return [
        `| ${block.columns.map(markdownText).join(" | ")} |`,
        `|${block.columns.map(() => "---").join("|")}|`,
        ...block.rows.map((row) => `| ${row.map(markdownText).join(" | ")} |`),
      ].join("\n");
  }
}

/**
 * 文書を Markdown にする（写しの印より下）。
 * @param doc 文書
 * @returns Markdown
 */
export function legalToMarkdown(doc: LegalDocument): string {
  const chunks = [`# ${doc.title}`, ...doc.intro.map(markdownText)];
  doc.sections.forEach((section, index) => {
    chunks.push(`## ${index + 1}. ${section.heading}`);
    for (const block of section.blocks) chunks.push(markdownBlock(block));
  });
  chunks.push(markdownText(doc.closing));
  return `${chunks.join("\n\n")}\n`;
}

/** 写しの、ここから下を作る印の行。 */
export const LEGAL_MARKDOWN_MARKER =
  "<!-- ここから下は apps/web/src/features/suite/legal-content.ts から作る。手で直さない（直したら pnpm exec tsx apps/web/legal-md.ts） -->";

/**
 * 写しの印より下を、今の本文で置きかえる（印より上の、主催者に向けた書きこみは残す）。
 * @param fileText 今の写しの中身
 * @param doc 文書
 * @returns 置きかえた中身
 * @throws {Error} 写しに印の行がないとき
 */
export function syncLegalMarkdown(fileText: string, doc: LegalDocument): string {
  const at = fileText.indexOf(LEGAL_MARKDOWN_MARKER);
  if (at < 0) throw new Error(`写しに印の行がありません：${LEGAL_MARKDOWN_MARKER}`);
  return `${fileText.slice(0, at + LEGAL_MARKDOWN_MARKER.length)}\n\n${legalToMarkdown(doc)}`;
}
