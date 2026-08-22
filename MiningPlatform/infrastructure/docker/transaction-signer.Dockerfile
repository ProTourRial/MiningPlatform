# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile --strict-peer-dependencies=false
RUN pnpm --filter @mining/transaction-signer... build \
  && pnpm --filter @mining/transaction-signer --prod deploy /prod/transaction-signer

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S mining && adduser -S mining -G mining
COPY --from=builder --chown=mining:mining /prod/transaction-signer ./
USER mining
EXPOSE 4100
CMD ["node", "dist/main.js"]
