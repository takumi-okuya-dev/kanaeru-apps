// 利用規約（/terms）とプライバシーポリシー（/privacy）のページ（suite-002）。ログインなしで開け、外枠のナビを出さない（layout: bare）。
// - 本文は legal-content.ts の1か所から描く（主催者が読む写しの md も同じ所から作る）
// - 下書きの間（LEGAL_TEXT_IS_DRAFT）は、題の下に「下書き（公開前）」の帯を出す
// - 運営者が埋める所（〈 〉）は黄色の印で見せる（埋め忘れが見て分かる）
// - 2つの列の表は、狭い画面でも横に動かないよう、見出しと中身の並び（dl）で出す
// - 最後に、もう一方のページと「すべてのアプリ」へのリンクを置く（ナビのない外枠で、ほかへ移れるように）
import { Link } from "@tanstack/react-router";
import { Page } from "../../lib/page.tsx";
import { LegalLink } from "./LegalLink.tsx";
import { LEGAL_TEXT_IS_DRAFT, PRIVACY, TERMS } from "./legal-content.ts";
import type { LegalBlock, LegalDocument, LegalDocumentKey } from "./legal-content.ts";
import { splitLegalText } from "./legal-text.ts";

/**
 * 文を描く（運営者が埋める所に印、もう一方へのリンク）。
 * @param props 文（text）
 * @param props.text 文
 * @returns 要素
 */
function LegalText({ text }: { text: string }) {
  return (
    <>
      {splitLegalText(text).map((part, index) => {
        const key = `${index}:${part.text}`;
        if (part.kind === "placeholder") {
          return (
            <mark
              key={key}
              data-placeholder=""
              className="rounded-sm bg-warning px-x3s font-bold text-text"
            >
              {part.text}
            </mark>
          );
        }
        if (part.kind === "link") return <LegalLink key={key} to={part.to} />;
        return <span key={key}>{part.text}</span>;
      })}
    </>
  );
}

/**
 * まとまりを描く。
 * @param props まとまり（block）
 * @param props.block まとまり
 * @returns 要素
 */
function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.kind === "paragraph") {
    return (
      <p>
        <LegalText text={block.text} />
      </p>
    );
  }
  if (block.kind === "list") {
    const items = block.items.map((item) => (
      <li key={item}>
        <LegalText text={item} />
      </li>
    ));
    return block.ordered ? (
      <ol className="flex list-decimal flex-col gap-x3s pl-s">{items}</ol>
    ) : (
      <ul className="flex list-disc flex-col gap-x3s pl-s">{items}</ul>
    );
  }
  const [, valueLabel] = block.columns;
  return (
    <dl className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
      {block.rows.map(([name, value]) => (
        <div key={name} className="flex flex-col gap-x3s px-xs py-xxs">
          <dt className="font-bold">
            <LegalText text={name} />
          </dt>
          <dd>
            <span className="text-s text-text-sub">{valueLabel}：</span>
            <LegalText text={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 下書きの帯（LEGAL_TEXT_IS_DRAFT の間だけ出す）。
 * @returns 要素
 */
function DraftBanner() {
  return (
    <div
      role="note"
      aria-labelledby="legal-draft-heading"
      className="flex flex-col gap-x3s rounded-md border border-l-4 border-border border-l-warning bg-surface px-xs py-xxs"
    >
      <p id="legal-draft-heading" className="font-bold">
        下書き（公開前）
      </p>
      <p>
        この文は、運営者が確かめる前の下書きです。黄色の印の〈
        〉の所は、まだ決まっていません。決まるまで、内容が変わることがあります。
      </p>
    </div>
  );
}

/**
 * 文書のページ。
 * @param props 文書（doc）
 * @param props.doc 文書
 * @returns 画面の要素
 */
export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  const other: LegalDocumentKey = doc.key === "terms" ? "privacy" : "terms";
  return (
    <Page title={doc.title} lead={doc.lead}>
      {LEGAL_TEXT_IS_DRAFT ? <DraftBanner /> : null}
      <div className="flex max-w-content flex-col gap-s text-m break-words">
        {doc.intro.map((text) => (
          <p key={text}>
            <LegalText text={text} />
          </p>
        ))}
        {doc.sections.map((section, index) => {
          const headingId = `${doc.key}-${section.id}`;
          return (
            <section key={section.id} aria-labelledby={headingId} className="flex flex-col gap-xxs">
              <h2 id={headingId} className="text-l leading-tight font-bold">
                {index + 1}. {section.heading}
              </h2>
              {section.blocks.map((block, blockIndex) => (
                <LegalBlockView key={`${section.id}-${blockIndex}`} block={block} />
              ))}
            </section>
          );
        })}
        <p>
          <LegalText text={doc.closing} />
        </p>
      </div>
      <nav aria-label="ほかのページ" className="border-t border-border pt-xs">
        <ul className="flex flex-wrap gap-x-s gap-y-xxs text-m">
          <li>
            <LegalLink to={other} />
          </li>
          <li>
            <Link to="/apps" className="text-text-link underline">
              すべてのアプリ
            </Link>
          </li>
        </ul>
      </nav>
    </Page>
  );
}

/**
 * 利用規約のページ。
 * @returns 画面の要素
 */
export function TermsPage() {
  return <LegalDocumentPage doc={TERMS} />;
}

/**
 * プライバシーポリシーのページ。
 * @returns 画面の要素
 */
export function PrivacyPage() {
  return <LegalDocumentPage doc={PRIVACY} />;
}
