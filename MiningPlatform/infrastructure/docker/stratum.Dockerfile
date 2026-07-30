FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

RUN pnpm turbo build --filter=@mining/stratum-server...
EXPOSE 3333
CMD ["pnpm", "--filter", "@mining/stratum-server", "start"]
