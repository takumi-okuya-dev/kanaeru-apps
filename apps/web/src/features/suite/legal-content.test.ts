// @vitest-environment node
// 利用規約とプライバシーポリシーの本文（suite-002）：正本（legal-content.ts）と、主催者が読む写し（_bmad-output/legal/*-draft.md）が
// 食い違わないこと・運営者が埋める所（〈 〉）がどれも写しの一覧にあること・節の印が重ならないこと・文の印の読み方。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, legalPlaceholders, legalTexts } from "./legal-content.ts";
import type { LegalDocumentKey } from "./legal-content.ts";
import {
  LEGAL_MARKDOWN_MARKER,
  legalToMarkdown,
  splitLegalText,
  syncLegalMarkdown,
} from "./legal-text.ts";

/** 写しの場所（文書の種類ごと）。 */
const DRAFT_FILES: Record<LegalDocumentKey, URL> = {
  terms: new URL("../../../../../_bmad-output/legal/terms-draft.md", import.meta.url),
  privacy: new URL("../../../../../_bmad-output/legal/privacy-policy-draft.md", import.meta.url),
};

const KEYS = Object.keys(LEGAL_DOCUMENTS) as LegalDocumentKey[];

describe("正本と写し", () => {
  it.each(KEYS)("%s：写しの印より下は、正本から作ったものと同じ", (key) => {
    const current = readFileSync(DRAFT_FILES[key], "utf8");
    expect(
      current,
      "正本（legal-content.ts）と写しが違います。リポジトリのルートで pnpm exec tsx apps/web/legal-md.ts を流してください",
    ).toBe(syncLegalMarkdown(current, LEGAL_DOCUMENTS[key]));
  });

  it.each(KEYS)("%s：運営者が埋める所（〈 〉）は、どれも写しの一覧（印より上）にある", (key) => {
    const current = readFileSync(DRAFT_FILES[key], "utf8");
    const header = current.slice(0, current.indexOf(LEGAL_MARKDOWN_MARKER));
    const placeholders = legalPlaceholders(LEGAL_DOCUMENTS[key]);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const placeholder of placeholders) expect(header, placeholder).toContain(placeholder);
  });

  it("写しに印の行がなければ、作り直さずに止める", () => {
    expect(() => syncLegalMarkdown("# 写し\n", LEGAL_DOCUMENTS.terms)).toThrow(/印の行/);
  });
});

describe("本文の形", () => {
  it.each(KEYS)("%s：節の印は英小文字とハイフンで、重ならない", (key) => {
    const ids = LEGAL_DOCUMENTS[key].sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
  });

  it.each(KEYS)("%s：文の中のリンクの印は、どれも読める（{{ が残らない）", (key) => {
    for (const text of legalTexts(LEGAL_DOCUMENTS[key])) {
      for (const part of splitLegalText(text)) {
        if (part.kind === "text") expect(part.text, text).not.toMatch(/\{\{|\}\}/);
      }
    }
  });

  it("写しの見出しには、前から番号を振る", () => {
    const markdown = legalToMarkdown(LEGAL_DOCUMENTS.terms);
    expect(markdown).toMatch(/^# 利用規約\n/);
    expect(markdown).toContain(`## 1. ${LEGAL_DOCUMENTS.terms.sections[0]?.heading}`);
  });
});

describe("文の読み方", () => {
  it("ふつうの文・運営者が埋める所・もう一方へのリンクに分ける", () => {
    expect(splitLegalText("〈運営者の名前〉は{{privacy}}に従います。")).toEqual([
      { kind: "placeholder", text: "〈運営者の名前〉" },
      { kind: "text", text: "は" },
      { kind: "link", to: "privacy", text: "プライバシーポリシー" },
      { kind: "text", text: "に従います。" },
    ]);
  });

  it("印のない文は、そのまま1つのかけら", () => {
    expect(splitLegalText("この規約は日本の法律に従います。")).toEqual([
      { kind: "text", text: "この規約は日本の法律に従います。" },
    ]);
  });
});
