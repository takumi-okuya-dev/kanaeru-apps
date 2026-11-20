// 利用規約とプライバシーポリシーのページ（suite-002）：本文の題と節・下書きの帯・運営者が埋める所の印・表の出し方・ほかのページへのリンク。
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../lib/testing.tsx";
import { LegalLink } from "./LegalLink.tsx";
import { PrivacyPage, TermsPage } from "./LegalPage.tsx";
import { LEGAL_TEXT_IS_DRAFT, PRIVACY, TERMS } from "./legal-content.ts";

describe("利用規約のページ", () => {
  it("題・節の見出し（番号つき）・最後の行を、本文のとおりに出す", async () => {
    renderWithRouter(<TermsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: TERMS.title })).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(TERMS.sections.length);
    expect(headings[0]).toHaveTextContent(`1. ${TERMS.sections[0]?.heading}`);
    expect(screen.getByText(/施行日：/)).toBeInTheDocument();
  });

  it("下書きの間は「下書き（公開前）」の帯を出す", async () => {
    renderWithRouter(<TermsPage />);
    await screen.findByRole("heading", { level: 1, name: TERMS.title });
    const banner = screen.queryByRole("note", { name: "下書き（公開前）" });
    if (LEGAL_TEXT_IS_DRAFT) expect(banner).toBeInTheDocument();
    else expect(banner).not.toBeInTheDocument();
  });

  it("運営者が埋める所に印を付け、文の中のリンクとほかのページへのリンクを出す", async () => {
    const { container } = renderWithRouter(<TermsPage />);
    await screen.findByRole("heading", { level: 1, name: TERMS.title });
    const marks = [...container.querySelectorAll("mark[data-placeholder]")].map(
      (mark) => mark.textContent,
    );
    expect(marks).toContain("〈運営者の名前〉");
    expect(marks).toContain("〈施行日〉");
    for (const link of screen.getAllByRole("link", { name: "プライバシーポリシー" })) {
      expect(link).toHaveAttribute("href", "/privacy");
    }
    const others = screen.getByRole("navigation", { name: "ほかのページ" });
    expect(within(others).getByRole("link", { name: "すべてのアプリ" })).toHaveAttribute(
      "href",
      "/apps",
    );
  });
});

describe("プライバシーポリシーのページ", () => {
  it("2つの列の表を、見出しと中身の並びで出し、利用規約へのリンクを出す", async () => {
    renderWithRouter(<PrivacyPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: PRIVACY.title }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("LINE のユーザーID・表示名").tagName).toBe("SPAN");
    expect(screen.getByText("LINE のユーザーID・表示名").closest("dt")).not.toBeNull();
    expect(screen.getByText(/AES-256-GCM/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "利用規約" })[0]).toHaveAttribute("href", "/terms");
  });
});

describe("LegalLink", () => {
  it("新しいタブで開くときは target と rel を付ける", async () => {
    renderWithRouter(
      <p>
        <LegalLink to="terms" newTab />
        <LegalLink to="privacy" />
      </p>,
    );
    const terms = await screen.findByRole("link", { name: "利用規約" });
    expect(terms).toHaveAttribute("target", "_blank");
    expect(terms).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("link", { name: "プライバシーポリシー" })).not.toHaveAttribute(
      "target",
    );
  });
});
