// 戦略の入力の手助け（threads-009。めぐるの specs/014 戦略のガイド・specs/018 AI と壁打ち）。
// - 項目ごと：入力の量の印（未入力・短め・十分）・考えるヒント（閉じたトグル）・「AI と深める」（プロンプトをコピーし、答えを貼ってこの項目に入れる）
// - 全体：「全体を AI と見直す」のプロンプト・「AI と壁打ち」（選んだ区分の項目を質問してもらい、項目ごとの答えを貼って選んで入れる）
// - 活動の軸：「5問から AI と整理する」（目的の5問から案を出してもらい、決めた一言を貼り戻して入れる。threads-012）
// 貼った答えをまだ入れずに閉じるときは確かめる（threads-012）。
// 入れた内容は画面の欄に入るだけで、保存は利用者が「保存」を押す。アプリは AI を呼ばない（AD-20）。
import {
  SHORT_TIP,
  SPARRING_SECTION_IDS,
  STRATEGY_TEXT_MAX,
  STRATEGY_SECTIONS,
  buildAxisPrompt,
  buildDeepenPrompt,
  buildOverallPrompt,
  buildSparringCandidates,
  buildSparringPrompt,
  countChars,
  extractFinal,
  hasPurposeAnswer,
  hintOf,
  parseSparringAnswer,
  selectSparringTargets,
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
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { Dialog } from "@workspace/ui/components/dialog";
import { Field } from "@workspace/ui/components/field";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";
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
  if (!hint) return null;
  const item = check.items[fieldKey];
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
          <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
            {`「${label}」を AI と深める`}
          </Button>
        </div>
      ) : null}
      {open ? (
        <PasteBackDialog
          title={`「${label}」を AI と深める`}
          promptLabel="深めるプロンプト"
          prompt={buildDeepenPrompt(fieldKey, values)}
          onApply={(text) => {
            onApply(text);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** PasteBackDialog が受け取るもの。 */
type PasteBackDialogProps = {
  /** 題 */
  title: string;
  /** 手順（省略はふつうの深める手順） */
  steps?: readonly string[];
  /** プロンプトの欄の名前 */
  promptLabel: string;
  /** 外の AI に貼るプロンプト */
  prompt: string;
  /** 答えを入れる */
  onApply: (text: string) => void;
  /** 閉じる */
  onClose: () => void;
};

/** ふつうの深める手順。 */
const DEEPEN_STEPS = [
  "「プロンプトをコピー」を押す",
  "外の AI（ChatGPT や Claude）に貼って送り、AI の質問に答える",
  "AI が出した完成版を、答えごと下に貼って「この項目に入れる」",
] as const;

/**
 * プロンプトをコピーし、外の AI の答えを貼り戻して項目に入れる枠。貼った答えを入れずに閉じるときは確かめる。
 * @param props 題・手順・プロンプト・入れる・閉じる
 * @returns 枠の要素
 */
function PasteBackDialog({
  title,
  steps = DEEPEN_STEPS,
  promptLabel,
  prompt,
  onApply,
  onClose,
}: PasteBackDialogProps) {
  const [answer, setAnswer] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const extracted = answer.trim() ? extractFinal(answer) : undefined;
  const ready = extracted !== undefined && extracted.text !== "";
  const over = ready && countChars(extracted.text) > STRATEGY_TEXT_MAX;
  /** 閉じる（貼った答えがあれば先に確かめる）。 */
  const requestClose = () => {
    if (answer.trim() !== "") setConfirmClose(true);
    else onClose();
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={title}
        description="プロンプトをコピーして外の AI に貼り、やりとりのあとに出た完成版を、下に貼ります。"
        footer={
          <div className="flex flex-wrap justify-end gap-xxs">
            <Button variant="secondary" onClick={requestClose}>
              やめる
            </Button>
            <Button
              variant="primary"
              aria-disabled={!ready || undefined}
              onClick={() => {
                if (!ready) return;
                onApply(extracted.text);
              }}
            >
              この項目に入れる
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-xs">
          <ol className="list-decimal pl-s text-s">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Field label={promptLabel}>
            <Textarea readOnly rows={5} value={prompt} />
          </Field>
          <CopyButton text={prompt} label="プロンプトをコピー" />
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
          {ready ? (
            <p className="text-s text-text-sub">
              {extracted.marked
                ? "目印のあいだを入れます。"
                : "目印がないので、答えの全部を入れます。"}
            </p>
          ) : null}
          {over ? (
            <ResponseMessage tone="danger">
              {`${STRATEGY_TEXT_MAX.toLocaleString("ja-JP")}文字を超えています。入れたあとに短くしてください。`}
            </ResponseMessage>
          ) : null}
          <p className="text-s text-text-sub">
            入れても、まだ保存されません。下の「保存」で保存します。
          </p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="貼った AI の答えを捨てますか"
        confirmLabel="捨てて閉じる"
        cancelLabel="戻る"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      >
        まだ項目に入れていません。閉じると、貼った答えは消えます。
      </ConfirmDialog>
    </>
  );
}

/** AxisGuide が受け取るもの。 */
export type AxisGuideProps = {
  /** 画面の今の値 */
  values: StrategyValues;
  /** 決めた一言を活動の軸に入れる */
  onApply: (text: string) => void;
};

/** 活動の軸を AI と整理する手順（めぐるの strategy.tsx の手順）。 */
const AXIS_STEPS = [
  "「プロンプトをコピー」を押す",
  "外の AI（ChatGPT や Claude）に貼って送り、3つの案から選ぶ（直してもらってもよい）",
  "決めた一言を、答えごと下に貼って「この項目に入れる」",
] as const;

/**
 * 活動の軸の下の「5問から AI と整理する」（目的の5問のどれかに答えがあるときだけ押せる。めぐる 014 FR-036）。
 * @param props 今の値・入れる
 * @returns 要素
 */
export function AxisGuide({ values, onApply }: AxisGuideProps) {
  const [open, setOpen] = useState(false);
  const answered = hasPurposeAnswer(values);
  return (
    <div className="flex flex-col items-start gap-x3s">
      <Button
        size="small"
        variant="secondary"
        aria-disabled={!answered || undefined}
        aria-describedby={answered ? undefined : "threads-axis-note"}
        onClick={() => {
          if (answered) setOpen(true);
        }}
      >
        5問から AI と整理する
      </Button>
      {answered ? null : (
        <p id="threads-axis-note" className="text-s text-text-sub">
          先に Q1〜Q5 のどれかに答えてください。
        </p>
      )}
      {open ? (
        <PasteBackDialog
          title="活動の軸を5問から AI と整理する"
          steps={AXIS_STEPS}
          promptLabel="活動の軸を考えるプロンプト"
          prompt={buildAxisPrompt(values)}
          onApply={(text) => {
            onApply(text);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
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
  /** 壁打ちの答えを貼ったまま、まだ入れていないかを知らせる（画面を離れる前の確かめに使う） */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * 戦略の上の「AI と考える」の節（全体の見直し・壁打ち）。
 * @param props 自動チェック・今の値・入れる・まだ入れていない答えの知らせ
 * @returns 節の要素
 */
export function StrategyAiSection({
  check,
  values,
  onApply,
  onDirtyChange,
}: StrategyAiSectionProps) {
  const [sections, setSections] = useState<SparringSectionId[]>([...SPARRING_SECTION_IDS]);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [answer, setAnswer] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<SparringKey>>(new Set());
  const [result, setResult] = useState<string>();
  const [sparringOpen, setSparringOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const targets = selectSparringTargets(values, { sections, onlyIncomplete }, check);
  const parsed = answer.trim() ? parseSparringAnswer(answer) : undefined;
  const candidates = parsed ? buildSparringCandidates(parsed.items, values) : [];
  const selectable = candidates.filter((candidate) => !candidate.over && !candidate.same);
  const pickedCount = candidates.filter((candidate) => chosen.has(candidate.key)).length;
  const dirty = answer.trim() !== "";

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  /** 貼った答えを捨てて、壁打ちを閉じる。 */
  const discardAndClose = () => {
    setAnswer("");
    setChosen(new Set());
    setSparringOpen(false);
  };

  return (
    <section aria-labelledby="threads-strategy-ai" className="flex flex-col gap-xs">
      <h2 id="threads-strategy-ai" className="text-l font-bold">
        AI と考える
      </h2>
      <details>
        <summary className="cursor-pointer text-m font-bold">全体を見直す</summary>
        <div className="mt-xxs flex flex-col gap-xxs">
          <p className="text-s text-text-sub">
            項目どうしの重なり・食い違い・抜けを、質問の形で返してもらいます（答えは取りこみません）。活動の軸は、「活動の軸」の欄の「5問から
            AI と整理する」で考えられます。
          </p>
          <CopyButton
            text={buildOverallPrompt(values)}
            label="全体を見直すプロンプトをコピー"
            successMessage="コピーしました。外の AI に貼って送ると、項目どうしの重なり・食い違い・抜けを質問の形で返してくれます。"
          />
        </div>
      </details>
      <details open={sparringOpen}>
        <summary
          className="cursor-pointer text-m font-bold"
          onClick={(click) => {
            // 開け閉めは自分で持つ（貼った答えがあるまま閉じるときは確かめる）
            click.preventDefault();
            if (!sparringOpen) setSparringOpen(true);
            else if (dirty) setConfirmClose(true);
            else setSparringOpen(false);
          }}
        >
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
            <div className="flex flex-wrap items-center gap-xxs">
              <Button
                size="small"
                variant="secondary"
                onClick={() => setChosen(new Set(selectable.map((candidate) => candidate.key)))}
              >
                すべて選ぶ
              </Button>
              <Button size="small" variant="secondary" onClick={() => setChosen(new Set())}>
                すべて外す
              </Button>
              <p className="text-s text-text-sub" aria-live="polite">
                {`${candidates.length}件中${pickedCount}件を選んでいます`}
              </p>
            </div>
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
                aria-disabled={pickedCount === 0 || undefined}
                onClick={() => {
                  if (pickedCount === 0) return;
                  onApply(
                    Object.fromEntries(
                      candidates
                        .filter((candidate) => chosen.has(candidate.key))
                        .map((candidate) => [candidate.key, candidate.proposed]),
                    ),
                  );
                  setResult(
                    `${pickedCount}個の項目に入れました。確かめて「保存」を押してください。`,
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
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="貼った AI の答えを捨てますか"
        confirmLabel="捨てて閉じる"
        cancelLabel="戻る"
        onConfirm={() => {
          setConfirmClose(false);
          discardAndClose();
        }}
      >
        まだ項目に入れていません。閉じると、貼った答えは消えます。
      </ConfirmDialog>
    </section>
  );
}
