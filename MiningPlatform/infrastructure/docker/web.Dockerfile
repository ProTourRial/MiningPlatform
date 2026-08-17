# MiningPlatform
# Author: Abia Nugrahanto
# Copyright (c) 2026 Abia Nugrahanto. All rights reserved.

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD=false
ARG NEXT_PUBLIC_DEVELOPMENT_DASHBOARD_TOKEN=local-development-dashboard
ARG NEXT_PUBLIC_DEVELOPMENT_WORKER_ID=dev-7d9a4df2e77952c0657de069
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD=$NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD
ENV NEXT_PUBLIC_DEVELOPMENT_DASHBOARD_TOKEN=$NEXT_PUBLIC_DEVELOPMENT_DASHBOARD_TOKEN
ENV NEXT_PUBLIC_DEVELOPMENT_WORKER_ID=$NEXT_PUBLIC_DEVELOPMENT_WORKER_ID
ENV NEXT_OUTPUT_MODE=standalone
RUN pnpm --filter @mining/shared build && pnpm --filter @mining/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup -S mining && adduser -S mining -G mining
COPY --from=builder --chown=mining:mining /app/apps/web/.next/standalone ./
COPY --from=builder --chown=mining:mining /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=mining:mining /app/apps/web/public ./apps/web/public
USER mining
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
