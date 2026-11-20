// 宣伝とリサーチの画面の「伸びる投稿を見つけるリサーチ」の読み物（threads-012。めぐるの components/guides/ResearchGuide.tsx の文を写した）。
// 初めは閉じている。成果（フォロワー・問い合わせが増えること）を約束する言い方をしない。
import { Button } from "@workspace/ui/components/button";
import { useId, useState } from "react";
import type * as React from "react";

/** Part が受け取るもの。 */
type PartProps = {
  /** 小見出し */
  title: string;
  /** 中身 */
  children: React.ReactNode;
};

/**
 * 読み物の1つの段。
 * @param props 小見出し（title）・中身（children）
 * @returns 段の要素
 */
function Part({ title, children }: PartProps) {
  return (
    <div className="flex flex-col gap-x3s">
      <h3 className="text-m font-bold">{title}</h3>
      {children}
    </div>
  );
}

/**
 * 点の並び。
 * @param props 項目（items）
 * @param props.items 項目
 * @returns 並びの要素
 */
function Items({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-x3s pl-s">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * 伸びる投稿を見つけるリサーチのやり方（開閉できる）。
 * @returns 読み物の要素
 */
export function ResearchGuide() {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="flex flex-col gap-xs rounded-md border border-border p-xs">
      <div>
        <Button
          variant="text"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          {open ? "伸びる投稿を見つけるリサーチ（閉じる）" : "伸びる投稿を見つけるリサーチ（読む）"}
        </Button>
      </div>
      {open ? (
        <section
          id={bodyId}
          aria-label="伸びる投稿を見つけるリサーチ"
          className="flex flex-col gap-xs text-s"
        >
          <p className="text-text-sub">
            ほかのアカウントで反応が良かった投稿から、自分のアカウントでも使える「型」を見つけるためのやり方です。
          </p>
          <Part title="① 良い参考アカウントを見極める3つの目安">
            <Items
              items={[
                "フォロワー数：Threads で1,000人以上が目安です。Instagram のフォロワー数とかけ離れていないかも見ます（Instagram だけ大きいアカウントは、Threads の投稿の力とは限りません）。",
                "投稿の閲覧数：閲覧が2,000回以上の投稿が、いくつもあるか。1つだけ大きいものは、たまたまの場合があります。",
                "投稿の頻度：最近まで続けて投稿しているか。昔だけ伸びていたアカウントは、今の参考になりにくいです。",
              ]}
            />
          </Part>
          <Part title="② 真似してよい投稿">
            <p>話の中身ではなく、組み立て方（型）を借ります。たとえば次のような型です。</p>
            <Items
              items={[
                "あるある共感型：「〇〇な人あるある」のように、読んだ人が「わかる」と思う場面を並べる",
                "気づき型：「〇年続けてわかったこと」のように、経験から得た一言を伝える",
                "ビフォーアフター型：「前は〇〇だったけど、今は〇〇」のように、変化を見せる",
                "まとめ型：「〇〇するときの3つのコツ」のように、短く整理して保存したくなる形にする",
                "問いかけ型：最後を「みんなはどうしてる？」のように、気軽に答えられる質問で終える",
              ]}
            />
          </Part>
          <Part title="③ 真似しない方がよい投稿">
            <Items
              items={[
                "愚痴・批判・炎上・あおりなど、ネガティブな気持ちだけで伸びた投稿",
                "有名人の知名度や、その人の実績・肩書きがあるから伸びた投稿",
                "その日の話題（時事ネタ）だけで伸びた投稿",
              ]}
            />
            <p>
              例外：始めはネガティブでも、最後に前向きな気づきに変わる投稿は、参考にしてかまいません。
            </p>
          </Part>
          <Part title="④ リサーチの5つの手順">
            <ol className="flex list-decimal flex-col gap-x3s pl-s">
              <li>届けたい人が検索しそうなキーワードで、Threads を検索する</li>
              <li>閲覧やいいねが多い、伸びている投稿を見つける</li>
              <li>投稿したアカウントを、①の3つの目安で確かめる</li>
              <li>参考にしたい投稿を、この画面の「参考の投稿を足す」で残す</li>
              <li>投稿の中の特徴的な言葉で、もう一度検索して広げる</li>
            </ol>
          </Part>
          <Part title="⑤ 足す前の5つの確かめ">
            <Items
              items={[
                "集めたい人（届けたい人）に届く投稿か",
                "自分のアカウントでも、くり返し使える型か",
                "コメントなど、反応の中身が良いか",
                "ネガティブな気持ちだけで伸びていないか",
                "投稿者の知名度や実績だけで伸びていないか",
              ]}
            />
            <p className="rounded-md bg-surface-sunken p-xxs">
              いちばん大事な考え方：一番バズった投稿を探すのではなく、集めたい人に届き、くり返し使える型を見つけることです。
            </p>
          </Part>
        </section>
      ) : null}
    </div>
  );
}
