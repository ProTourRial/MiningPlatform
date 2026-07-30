# Local Development

```bash
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Stratum skeleton tersedia pada port 3333. Skeleton sengaja menolak autentikasi dan share sampai upstream relay serta validator selesai.
