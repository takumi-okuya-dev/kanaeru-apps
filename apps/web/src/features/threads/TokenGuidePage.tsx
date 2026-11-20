// トークンの作り方の詳しい手順（threads-012。めぐるの pages/guide-threads-token.tsx を写した）。
// 設定の「Threads への接続」の「詳しい手順を見る」から新しいタブで開く。Meta の画面の名前は変わることがあるので、
// 手順ごとに目的を書き、画面の写真は使わない。
import type * as React from "react";
import { SessionGate } from "../account/index.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";

/** Step が受け取るもの。 */
type StepProps = {
  /** 見出し */
  title: string;
  /** この手順の目的（手順のときだけ） */
  purpose?: string;
  /** 本文 */
  children: React.ReactNode;
};

/**
 * 手順の節。
 * @param props 見出し（title）・目的（purpose）・本文（children）
 * @returns 節
 */
function Step({ title, purpose, children }: StepProps) {
  return (
    <section className="flex flex-col gap-xxs">
      <h2 className="text-l font-bold">{title}</h2>
      {purpose ? <p className="text-m font-bold text-text-sub">この手順の目的：{purpose}</p> : null}
      <div className="flex flex-col gap-xxs text-m">{children}</div>
    </section>
  );
}

/**
 * トークンの作り方のページ（ログインが要る）。
 * @returns ページ
 */
export function TokenGuidePage() {
  return (
    <ThreadsPage
      title="自分の Meta のアプリで、Threads のトークンを作る"
      lead="自分で作った Meta のアプリのアクセストークンを貼って、Threads のアカウントをつなぐ手順です。かかる時間の目安は30分です。"
    >
      <div className="flex flex-col gap-l">
        <Step title="はじめに">
          <p>
            Meta のアプリを持っていなくても、この手順のとおりに進めれば作れます。もう Meta
            のアプリとトークンを持っているなら、「5. 長期のトークンを作る」から読んでください。
          </p>
        </Step>

        <Step
          title="1. Meta の開発者のアカウントを用意する"
          purpose="Meta のアプリを作れるようにします。"
        >
          <p>
            Meta の開発者のサイト（developers.facebook.com）を開き、Facebook
            のアカウントでログインして、開発者として登録します。電話番号やメールアドレスの確かめを求められたら、画面の案内に従います。
          </p>
        </Step>

        <Step title="2. アプリを作る" purpose="トークンを出す、自分だけのアプリを作ります。">
          <p>
            開発者のサイトの「マイアプリ」から「アプリを作成」を選びます。使い方（ユースケース）を選ぶ画面では、Threads
            API へのアクセスを選びます。アプリの名前は自由です（例：自分の名前＋Threads）。
          </p>
          <p>
            作ったアプリは「開発モード」のままでかまいません。自分のアカウントで使うだけなら、Meta
            の審査（App Review）は要りません。
          </p>
        </Step>

        <Step
          title="3. 権限を足す"
          purpose="このアプリが使う4つの権限を、トークンに入れられるようにします。"
        >
          <ul className="list-disc pl-s">
            <li>threads_basic：プロフィール（ユーザー名・表示名・画像）を読む。必ず要ります</li>
            <li>threads_content_publish：承認した投稿を自動で投稿する</li>
            <li>threads_manage_insights：投稿の反応の数とフォロワーの数を読み、反応を出す</li>
            <li>threads_manage_replies：時間差のメンションの返信を出す</li>
          </ul>
          <p>
            アプリの Threads
            の使い方の設定で、この4つを足します。あとの3つがないと、自動投稿・反応・時間差のメンションが使えません。
          </p>
        </Step>

        <Step
          title="4. 自分をテスターに足す"
          purpose="開発モードのアプリで、自分の Threads のアカウントのトークンを作れるようにします。"
        >
          <p>
            アプリの「役割」（または Threads の使い方の設定）で、自分の Threads
            のアカウントをテスターに足します。そのあと、Threads
            のアプリの「設定」→「アカウント」→「ウェブサイトのアクセス許可」（またはそれに近い項目）で、届いた招待を受けます。
          </p>
        </Step>

        <Step
          title="5. 長期のトークンを作る"
          purpose="60日使えるトークンを作ります（期限の前に、このアプリが自動で延ばします）。"
        >
          <p>
            アプリの Threads の使い方の設定にある「ユーザートークン生成ツール」で、自分の Threads
            のアカウントの「アクセストークンを生成」を押し、出たトークンをコピーします。このツールで作るトークンは長期のトークンです。
          </p>
          <p>
            トークンはパスワードと同じように扱い、ほかの人に見せたり、チャットに貼ったりしないでください。
          </p>
        </Step>

        <Step title="6. 貼る" purpose="運用アカウントを Threads につなぎます。">
          <p>
            つなぎたい運用アカウントの「設定」を開き、「Threads
            への接続」の欄にコピーしたトークンを貼って「つなぐ」を押します。「つなぎました」と出れば終わりです。運用アカウントがまだなければ、先にアカウントの一覧で名前だけを入れて作ります。
          </p>
          <p>トークンは暗号にして持ち、画面には二度と出しません。</p>
        </Step>

        <Step title="トークンを取り消すには">
          <p>
            Meta の開発者のサイトでアプリを消すか、Threads
            のアプリの「ウェブサイトのアクセス許可」で、そのアプリを消します。取り消すと、運用アカウントは「接続し直しが要る」になり、自動投稿が止まります。このアプリからも消したいときは、運用アカウントの設定で接続を切るか、アカウントを消してください。
          </p>
        </Step>

        <Step title="うまくいかないとき">
          <ul className="list-disc pl-s">
            <li>
              「期限の短いトークン」と出たとき：ユーザートークン生成ツールで作ったトークンを貼ってください。ほかの方法で作ったトークンは1時間で切れることがあります。
            </li>
            <li>
              「あなたの別の運用アカウントでつながっています」と出たとき：その運用アカウントの設定で、新しいトークンを貼ってつなぎ直してください。
            </li>
            <li>
              「前につないでいた Threads
              のアカウントと違います」と出たとき：つなぎ直す運用アカウントと同じ Threads
              のアカウントで、トークンを作り直してください。
            </li>
            <li>
              「少し止めています」と出たとき：確かめに続けて失敗したため、10分ほど待ってから貼り直してください。
            </li>
            <li>
              投稿の権限・反応の権限がないと出たとき：「3.
              権限を足す」を見直し、トークンを作り直してつなぎ直してください。
            </li>
          </ul>
        </Step>

        <p className="text-s text-text-sub">
          この手順は2026年11月20日のときの内容です。Meta の画面の名前は変わることがあります。
        </p>
      </div>
    </ThreadsPage>
  );
}

/**
 * トークンの作り方の道の画面（ログインを確かめる）。
 * @returns 画面の要素
 */
export function TokenGuideRoute() {
  return (
    <SessionGate>
      <TokenGuidePage />
    </SessionGate>
  );
}
