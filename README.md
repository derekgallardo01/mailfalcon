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
# In separate terminals:
pnpm -F @mailfalcon/worker dev    # wrangler dev --local on :8787
pnpm -F @mailfalcon/web dev       # next dev on :3000
pnpm -F @mailfalcon/extension dev # WXT dev build with HMR
```

## Sideloading the extension against production

See [docs/SIDELOAD.md](docs/SIDELOAD.md).

## Setup / ops

See [docs/SETUP.md](docs/SETUP.md) for what's wired in Cloudflare,
Resend, Stripe, and InboxSDK.

## Live

- API: https://api.mailfalcon.app
- Tracker: https://t.mailfalcon.app
- Dashboard: https://app.mailfalcon.app
- Privacy policy: https://app.mailfalcon.app/privacy/
