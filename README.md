# mailfalcon

Freemium Gmail email tracker — opens, clicks, real-time browser notifications.

Chrome / Chromium extension (Manifest V3) + Cloudflare Workers backend + Next.js dashboard.

## Status

Pre-alpha. v1 targeting Gmail-only.

## Repo layout

- `apps/extension` — WXT MV3 extension (Preact + Tailwind, InboxSDK for Gmail hooks)
- `apps/web` — Next.js 15 dashboard on Cloudflare Pages (Edge runtime, App Router)
- `apps/worker` — Hono on Cloudflare Workers (tracking pixel + click + API + auth + Stripe webhooks)
- `packages/shared` — zod schemas, HMAC helpers, event types, URL builders
- `packages/db` — Drizzle schema + D1 migrations
- `packages/ui` — shared Tailwind preset + components
- `infra` — wrangler config, deployment scripts

## Toolchain

- Node 22+
- pnpm 9+
- wrangler (Cloudflare CLI, installed per-app via `pnpm add -D wrangler`)

## Local dev

```bash
pnpm install
pnpm dev
```

(More to come once apps are scaffolded.)
