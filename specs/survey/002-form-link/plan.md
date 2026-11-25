# Implementation Plan: アンケートの入力の画面に Googleフォームのリンクを出す（survey-002）

**Spec**: [spec.md](./spec.md)

## 変えるもの

| 場所 | 変更 |
|---|---|
| `apps/web/src/features/survey/SurveyPage.tsx` | 入力の画面（`SurveyForm`）の `</form>` の後に、`summary.googleFormUrl` があるときだけ補助のリンクの節を足す。見た目は `buttonVariants({ variant: "text" })`・`min-h-l`・`self-start`。区切りの上の線（`border-t border-border`）と余白は既存のトークンだけ使う |
| `apps/web/src/features/survey/SurveyPage.test.tsx` | リンクの出る（href・target・rel・「送る」の下の順）・URL がなければ出ない・回答済みでも出る・お礼で消えるを確かめる |
| `e2e/tests/survey.spec.ts` | 入力の画面にリンクが出る（href・target）・お礼で消える |
| `docs/apps/survey.md` | 画面の行に、補助のリンクを書き足す（今の形） |
| `docs/decisions.md` | 決めたことを1行 |

API・DB・contracts・設定は変えない。

## 決めたこと（理由）

- **「送る」の下**：主のボタンを「送る」の1つに保ち、アプリのアンケートが先に答えられやすくする（SM-2・SM-3 を守る）。
- **節に `aria-label`**：スクリーンリーダーで、リンクの前に「交流会のアンケート」の区切りが分かる。
- **リンクの名前をお礼の画面と変える**：お礼は「続けて交流会のアンケートへ」（アプリのアンケートのあと）、入力は「交流会のアンケート（Googleフォーム）を開く」（いつでも）。テストで取り違えない。

## 確かめ

- `pnpm --filter ./apps/web exec vitest run src/features/survey/SurveyPage.test.tsx`
- `pnpm format:check`・`pnpm typecheck`・`pnpm lint`
- E2E は DB が要るので CI で流す（`e2e/tests/survey.spec.ts`）。
