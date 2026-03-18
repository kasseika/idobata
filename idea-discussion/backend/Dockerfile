# idea-discussion/backend/Dockerfile
# バックエンド（Express + TypeScript）の Docker イメージ
# マルチステージビルド:
#   backend-builder: 依存関係インストール + TypeScript コンパイル
#   production:      コンパイル済み JS のみを含む軽量本番イメージ
#   development:     ホットリロード対応の開発イメージ（ソースはボリュームマウント）

# Stage 1: 依存関係インストール + TypeScript ビルド
FROM node:20-alpine AS backend-builder
WORKDIR /app

# ルートの package.json とワークスペースの package.json をコピー
COPY package.json package-lock.json ./
COPY ./idea-discussion/backend/package.json ./idea-discussion/backend/

# ビルドに必要な全依存関係をインストール
RUN npm install --workspace=idobata-idea-discussion-backend

WORKDIR /app/idea-discussion/backend
# バックエンドのソースコードをコピー
COPY ./idea-discussion/backend ./
# TypeScript を JavaScript にコンパイル（出力先: ./build/）
RUN npm run build

# Stage 2: 本番イメージ（コンパイル済み JS のみを含む）
FROM node:20-alpine AS production
WORKDIR /app

# node_modules をビルダーステージからコピー
COPY --from=backend-builder /app/node_modules ./node_modules

# コンパイル済み JavaScript をコピー（TypeScript ソースは含まない）
COPY --from=backend-builder /app/idea-discussion/backend/build ./idea-discussion/backend/build
# モジュール解決に必要な package.json をコピー
COPY --from=backend-builder /app/idea-discussion/backend/package.json ./idea-discussion/backend/package.json

ENV NODE_ENV=production

WORKDIR /app/idea-discussion/backend
EXPOSE 3100
CMD ["node", "build/server.js"]

# Stage 3: 開発イメージ（ホットリロード対応）
# ソースコードはdocker-compose.yml のボリュームマウントで提供される
FROM node:20-alpine AS development
WORKDIR /app

# node_modules をビルダーステージからコピー
COPY --from=backend-builder /app/node_modules ./node_modules

ENV NODE_ENV=development
ENV PATH /app/node_modules/.bin:$PATH

WORKDIR /app/idea-discussion/backend
EXPOSE 3100
CMD ["npm", "run", "dev"]
