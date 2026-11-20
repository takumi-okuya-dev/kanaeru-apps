// 戦略の入力の手助け（threads-009。めぐるの specs/014 戦略のガイド・specs/018 AI と壁打ち）。
// - 項目ごと：入力の量の印（未入力・短め・十分）・考えるヒント（閉じたトグル）・「AI と深める」（プロンプトをコピーし、答えを貼ってこの項目に入れる）
// - 全体：「全体を AI と見直す」「活動の軸を AI と考える」のプロンプト・「AI と壁打ち」（選んだ区分の項目を質問してもらい、項目ごとの答えを貼って選んで入れる）
// 入れた内容は画面の欄に入るだけで、保存は利用者が「保存」を押す。アプリは AI を呼ばない（AD-20）。
import {
  SHORT_TIP,
  SPARRING_SECTION_IDS,
  STRATEGY_SECTIONS,
  buildAxisPrompt,
  buildDeepenPrompt,
  buildOverallPrompt,
  buildSparringCandidates,
  buildSparringPrompt,
  extractFinal,
  hintOf,
  parseSparringAnswer,
  selectSparringTargets,
  strategyFieldOf,
} from "@workspace/contracts/threads";
import type {
  CheckStatus,
  HintedKey,
  SparringKey,
  SparringSectionId,
  StrategyCheck,
  StrategyValues,
} from "@workspace/contracts/threads";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { CopyButton } from "./CopyButton.tsx";

/** 入力の量の印の名前。 */
const STATUS_LABELS: Record<CheckStatus, string> = { empty: "未入力", short: "短め", ok: "十分" };

/** FieldGuide が受け取るもの。 */
export type FieldGuideProps = {
  /** 項目のキー */
  fieldKey: HintedKey;
  /** 項目の名前 */
  label: string;
  /** 自動チェック */
  check: StrategyCheck;
  /** 画面の今の値 */
  values: StrategyValues;
  /** AI の答えをこの項目に入れる（口調の項目は呼ばない） */
  onApply: (text: string) => void;
};

/**
 * 項目の下の手助け（入力の量の印・考えるヒント・AI と深める）。
 * @param props 項目のキー・名前・自動チェック・今の値・入れる
 * @returns 要素
 */
export function FieldGuide({ fieldKey, label, check, values, onApply }: FieldGuideProps) {
  const hint = hintOf(fieldKey);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  if (!hint) return null;
  const item = check.items[fieldKey];
  const extracted = answer.trim() ? extractFinal(answer) : undefined;
  return (
    <div className="flex flex-col gap-x3s">
      <div className="flex flex-wrap items-center gap-xxs">
        <Badge variant={item.status === "ok" ? "success" : "neutral"}>
          {STATUS_LABELS[item.status]}
        </Badge>
        {hint.star ? <Badge>特に大事</Badge> : null}
        {item.status === "short" ? (
          <span className="text-s text-text-sub">{hint.shortTip ?? SHORT_TIP}</span>
        ) : null}
      </div>
      {hint.star && hint.starNote ? <p className="text-s text-text-sub">{hint.starNote}</p> : null}
      <details>
        <summary className="cursor-pointer text-s font-bold">{`「${label}」の考えるヒント`}</summary>
        <dl className="mt-xxs flex flex-col gap-x3s text-s">
          <dt className="font-bold">コツ</dt>
          <dd>{hint.tip}</dd>
          <dt className="font-bold">悪い例</dt>
          <dd>{hint.bad}</dd>
          <dt className="font-bold">良い例</dt>
          <dd>{hint.good}</dd>
          <dt className="font-bold">もっとこんな内容も</dt>
          <dd>{hint.more.join("・")}</dd>
          <dt className="font-bold">こんな場合はどうだろう？</dt>
          <dd>{hint.whatIf}</dd>
          <dt className="font-bold">もっと良くするなら</dt>
          <dd>{hint.better}</dd>
        </dl>
      </details>
      {fieldKey !== "tonePreset" ? (
        <div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              setAnswer("");
              setOpen(true);
            }}
          >
            {`「${label}」を AI と深める`}
          </Button>
        </div>
      ) : null}
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title={`「${label}」を AI と深める`}
          description="プロンプトをコピーして外の AI に貼り、やりとりのあとに出た完成版を、下に貼ります。"
          footer={
            <div className="flex flex-wrap justify-end gap-xxs">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                やめる
              </Button>
              <Button
                variant="primary"
                aria-disabled={!extracted || extracted.text === "" || undefined}
                onClick={() => {
                  if (!extracted || extracted.text === "") return;
                  onApply(extracted.text);
                  setOpen(false);
                }}
              >
                この項目に入れる
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-xs">
            <Field label="深めるプロンプト">
              <Textarea readOnly rows={5} value={buildDeepenPrompt(fieldKey, values)} />
            </Field>
            <CopyButton text={buildDeepenPrompt(fieldKey, values)} label="プロンプトをコピー" />
            <Field
              label="AI の答え"
              description="【完成版ここから】と【完成版ここまで】のあいだを読みます（目印がなければ全部）。"
            >
              <Textarea
                rows={5}
                value={answer}
                onChange={(change) => setAnswer(change.target.value)}
              />
            </Field>
            {extracted && extracted.text !== "" ? (
              <p className="text-s text-text-sub">
                {extracted.marked
                  ? "目印のあいだを入れます。"
                  : "目印がないので、答えの全部を入れます。"}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

/** StrategyAiSection が受け取るもの。 */
export type StrategyAiSectionProps = {
  /** 自動チェック */
  check: StrategyCheck;
  /** 画面の今の値 */
  values: StrategyValues;
  /** 選んだ項目の答えを入れる */
  onApply: (updates: Partial<Record<SparringKey, string>>) => void;
};

/**
 * 戦略の上の「AI と考える」の節（進み・全体の見直し・活動の軸・壁打ち）。
 * @param props 自動チェック・今の値・入れる
 * @returns 節の要素
 */
export function StrategyAiSection({ check, values, onApply }: StrategyAiSectionProps) {
  const [sections, setSections] = useState<SparringSectionId[]>([...SPARRING_SECTION_IDS]);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [answer, setAnswer] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<SparringKey>>(new Set());
  const [result, setResult] = useState<string>();
  const targets = selectSparringTargets(values, { sections, onlyIncomplete }, check);
  const parsed = answer.trim() ? parseSparringAnswer(answer) : undefined;
  const candidates = parsed ? buildSparringCandidates(parsed.items, values) : [];
  const nextLabel = check.next ? strategyFieldOf(check.next).label : null;

  return (
    <section aria-labelledby="threads-strategy-ai" className="flex flex-col gap-xs">
      <h2 id="threads-strategy-ai" className="text-l font-bold">
        AI と考える
      </h2>
      <p className="text-m">
        {`十分に書けた項目：${check.done}／16（短め ${check.review}件）。`}
        {nextLabel
          ? `次のおすすめは「${nextLabel}」です。下の印の「未入力」「短め」から埋めていきましょう。`
          : "すべての項目が十分に書けています。"}
      </p>
      <details>
        <summary className="cursor-pointer text-m font-bold">
          全体を見直す・活動の軸を考える
        </summary>
        <div className="mt-xxs flex flex-col gap-xxs">
          <p className="text-s text-text-sub">
            全体の見直しは、項目どうしの重なり・食い違い・抜けを質問してもらうものです（答えは取りこみません）。活動の軸は、目的の5つの問いから案を3つ出してもらいます。気に入った案を「活動の軸」の欄に書いてください。
          </p>
          <CopyButton text={buildOverallPrompt(values)} label="全体を見直すプロンプトをコピー" />
          <CopyButton text={buildAxisPrompt(values)} label="活動の軸を考えるプロンプトをコピー" />
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-m font-bold">
          AI と壁打ちして、まとめて埋める
        </summary>
        <div className="mt-xxs flex flex-col gap-xs">
          <fieldset className="flex flex-col gap-x3s">
            <legend className="text-s font-bold">質問してもらう区分</legend>
            {SPARRING_SECTION_IDS.map((id) => (
              <label key={id} className="flex min-h-l items-center gap-xxs text-m">
                <input
                  type="checkbox"
                  className="size-s accent-primary"
                  checked={sections.includes(id)}
                  onChange={(change) =>
                    setSections((current) =>
                      change.target.checked
                        ? SPARRING_SECTION_IDS.filter(
                            (item) => item === id || current.includes(item),
                          )
                        : current.filter((item) => item !== id),
                    )
                  }
                />
                {STRATEGY_SECTIONS.find((section) => section.id === id)?.title ?? id}
              </label>
            ))}
          </fieldset>
          <label className="flex min-h-l items-center gap-xxs text-m">
            <input
              type="checkbox"
              className="size-s accent-primary"
              checked={onlyIncomplete}
              onChange={(change) => setOnlyIncomplete(change.target.checked)}
            />
            未入力と短めの項目だけにする
          </label>
          {targets.length === 0 ? (
            <p className="text-s">質問してもらう項目がありません。区分を選び直してください。</p>
          ) : (
            <>
              <p className="text-s text-text-sub">{`質問してもらう項目：${targets.length}個`}</p>
              <CopyButton
                text={buildSparringPrompt(values, targets)}
                label="壁打ちのプロンプトをコピー"
              />
            </>
          )}
          <Field
            label="AI の壁打ちの答え"
            description="【項目：〇〇】〜【項目ここまで】の目印のある完成版を、そのまま貼ります。"
          >
            <Textarea
              rows={6}
              value={answer}
              onChange={(change) => {
                setAnswer(change.target.value);
                setResult(undefined);
                const next = change.target.value.trim()
                  ? buildSparringCandidates(parseSparringAnswer(change.target.value).items, values)
                  : [];
                setChosen(new Set(next.filter((item) => item.selected).map((item) => item.key)));
              }}
            />
          </Field>
          {parsed && !parsed.markerFound ? (
            <ResponseMessage tone="danger">
              目印（【項目：〇〇】）が見つかりません。答えの全部を貼ってください。
            </ResponseMessage>
          ) : null}
          {parsed && parsed.unknown.length > 0 ? (
            <p className="text-s text-text-sub">{`読み取れなかった項目：${parsed.unknown.join("・")}`}</p>
          ) : null}
          {candidates.length > 0 ? (
            <ul aria-label="入れる候補" className="flex flex-col gap-xxs">
              {candidates.map((candidate) => (
                <li
                  key={candidate.key}
                  className="flex flex-col gap-x3s rounded-sm border border-border bg-surface p-xxs"
                >
                  <label className="flex min-h-l items-center gap-xxs text-m font-bold">
                    <input
                      type="checkbox"
                      className="size-s accent-primary"
                      checked={chosen.has(candidate.key)}
                      disabled={candidate.over || candidate.same}
                      onChange={(change) =>
                        setChosen((current) => {
                          const next = new Set(current);
                          if (change.target.checked) next.add(candidate.key);
                          else next.delete(candidate.key);
                          return next;
                        })
                      }
                    />
                    {candidate.label}
                    {candidate.same ? "（今と同じ）" : candidate.over ? "（長すぎます）" : ""}
                  </label>
                  <p className="text-s break-words whitespace-pre-wrap">{candidate.proposed}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {candidates.length > 0 ? (
            <div className="flex flex-col items-start gap-xxs">
              <Button
                aria-disabled={chosen.size === 0 || undefined}
                onClick={() => {
                  if (chosen.size === 0) return;
                  onApply(
                    Object.fromEntries(
                      candidates
                        .filter((candidate) => chosen.has(candidate.key))
                        .map((candidate) => [candidate.key, candidate.proposed]),
                    ),
                  );
                  setResult(
                    `${chosen.size}個の項目に入れました。確かめて「保存」を押してください。`,
                  );
                  setAnswer("");
                  setChosen(new Set());
                }}
              >
                選んだ項目に入れる
              </Button>
            </div>
          ) : null}
          {result ? <ResponseMessage tone="success">{result}</ResponseMessage> : null}
        </div>
      </details>
    </section>
  );
}
