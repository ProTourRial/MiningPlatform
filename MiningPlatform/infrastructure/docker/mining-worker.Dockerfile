FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN pnpm db:generate \
  && pnpm --filter @mining/mining-worker... build \
  && pnpm --filter @mining/mining-worker --prod deploy /prod/mining-worker

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S mining && adduser -S mining -G mining
COPY --from=builder --chown=mining:mining /prod/mining-worker ./
USER mining
CMD ["node", "dist/main.js"]
