# syntax=docker/dockerfile:1
# 本番のコンテナ（core-002。構成の決めごと AD-8・AD-11）。
# 1つのコンテナが、画面の組み立てたファイル（apps/web/dist）と /api を同じ源で返す。
# 同じコンテナを Cloud Run jobs で db:migrate としても動かす（infra/cloud_run.tf の job が args を
# ["scripts/migrate.ts"] に差しかえる。中身は apps/api/scripts/migrate.ts）。
#
#   docker build --build-arg VITE_LIFF_ID=<LIFF ID> -t kanaeru .
#
# - VITE_LIFF_ID：LIFF ID（公開してよい値。AD-4）。画面の組み立てのときに埋める。
# - APP_NAME：画面の題に埋める名前（Cloud Run の環境の値 APP_NAME と同じにする）。
# 動かすときの設定は環境の値で渡す（値の意味は apps/api/src/kernel/config.ts。本番の値は infra/cloud_run.tf）。
# TypeScript は組み立てずに、Node.js の型を取り除く仕組みでそのまま動かす（erasableSyntaxOnly の書き方だけを使うため）。

# Node.js の版は package.json の devEngines・.node-version と同じ。指紋（digest）で固定する（Dependabot が新しくする）。
# 2つの FROM（base・runtime）は同じ値にする（Dependabot は ARG を読まないので、FROM に直に書く）。

# ---- 共通：pnpm を入れる（package.json の packageManager と同じ版。Node.js 26 には corepack がない）
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS base
RUN npm install --global pnpm@12.21.0 && npm cache clean --force
# CI=true：pnpm を問いかけなしで動かし、prepare（git の設定）を飛ばす
ENV CI=true
WORKDIR /app

# ---- 画面を組み立てる（apps/web/dist）
FROM base AS web
ARG VITE_LIFF_ID=""
ARG APP_NAME=kanaeru
COPY . .
RUN pnpm install --frozen-lockfile --filter "web..."
RUN VITE_LIFF_ID="${VITE_LIFF_ID}" APP_NAME="${APP_NAME}" pnpm --filter web build

# ---- API の本番の依存だけを入れる（開発の道具〈drizzle-kit・tsx・lint・テスト〉は入れない）
FROM base AS api
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "api..." \
  && rm -rf apps/api/test \
  && find apps/api/src packages/contracts/src packages/csv/src packages/secret-box/src -name "*.test.ts" -delete

# ---- 動かすコンテナ（pnpm を持たない。ファイルは root の持ち物で、動かす人〈node〉は書き換えられない）
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime
ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=8080 \
  WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=api /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/packages/contracts ./packages/contracts
COPY --from=api /app/packages/csv ./packages/csv
COPY --from=api /app/packages/secret-box ./packages/secret-box
COPY --from=api /app/apps/api ./apps/api
COPY --from=web /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/api
USER node
EXPOSE 8080
# API（画面のファイルも返す）。db:migrate は job で `node scripts/migrate.ts` にする
ENTRYPOINT ["node"]
CMD ["src/index.ts"]
