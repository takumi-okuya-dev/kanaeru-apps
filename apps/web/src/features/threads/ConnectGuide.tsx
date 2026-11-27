// Threads で許可するときのアカウントの取り違えを減らす案内（threads-012。めぐるの specs/025 の ThreadsAccountGuide・AccountSwitchSteps を写した）。
// - 押す前：「threads.com でログインしているアカウントで許可されます」と、閉じた「違うアカウントが出たときは」の手順
// - 違うアカウントで戻ったとき：エラーの文に続けて、切り替えの手順と threads.com を開くリンク（その画面で次にすることなので閉じない）
import { buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { THREADS_WEB_URL, accountGuideParts, accountSwitchSteps } from "./connect-guide.ts";

/**
 * threads.com を新しいタブで開くリンク。
 * @param props ボタンの形にするか（button）
 * @param props.button ボタンの形にするなら true
 * @returns リンク
 */
export function ThreadsWebLink({ button = false }: { button?: boolean }) {
  return (
    <a
      className={button ? buttonVariants({ variant: "secondary" }) : "text-text-link underline"}
      href={THREADS_WEB_URL}
      target="_blank"
      rel="noreferrer"
    >
      threads.com を開く（新しいタブ）
    </a>
  );
}

/** 押す前の案内が受け取るもの。 */
export type ThreadsAccountGuideProps = {
  /** 使うべきアカウントのユーザー名（@ なし。決まっていなければ null） */
  expected: string | null;
  /** 戻ってきたときに、もう一度押すボタンの名前 */
  again: string;
};

/**
 * 「Meta のアプリでつなぐ」を押す前の案内。使うべきアカウントが決まっていれば @名前を太く出す。
 * @param props 使うべきアカウント（expected）・もう一度押すボタンの名前（again）
 * @returns 案内
 */
export function ThreadsAccountGuide({ expected, again }: ThreadsAccountGuideProps) {
  const { lead, check } = accountGuideParts(expected);
  return (
    <div role="note" className="flex flex-col gap-xxs rounded-sm border border-border p-xs text-s">
      <p>
        {lead}
        {check ? (
          <>
            <strong className="font-bold">{check.name}</strong>
            {check.rest}
          </>
        ) : null}
      </p>
      <Disclosure summary="違うアカウントが出たときは">
        <ul className="flex flex-col gap-x3s">
          {accountSwitchSteps(expected, again).map((step) => (
            <li key={step}>・{step}</li>
          ))}
        </ul>
        <p>
          <ThreadsWebLink />
        </p>
      </Disclosure>
    </div>
  );
}

/**
 * 違うアカウントで許可して戻ったときの、切り替えの手順と「threads.com を開く」。
 * @param props 使うべきアカウント（expected）・もう一度押すボタンの名前（again）
 * @returns 手順
 */
export function AccountSwitchSteps({ expected, again }: ThreadsAccountGuideProps) {
  return (
    <div className="flex flex-col items-start gap-xxs text-s">
      <ol className="list-decimal pl-m">
        {accountSwitchSteps(expected, again).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <ButtonRow>
        <ThreadsWebLink button />
      </ButtonRow>
    </div>
  );
}
