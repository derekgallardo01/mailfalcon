# MailFalcon — Production deploy & secrets

How to deploy the worker, the web app, and what secrets each needs.

## Worker (Cloudflare Workers)

Production deploy:

```
pnpm -F @mailfalcon/worker exec wrangler deploy
```

Tail logs (one terminal, real-time):

```
pnpm -F @mailfalcon/worker exec wrangler tail
```

### Required secrets

Set each with `pnpm -F @mailfalcon/worker exec wrangler secret put <NAME>`.

| Name | Purpose | Behavior if unset |
|---|---|---|
| `HMAC_SECRET` | Signs pixel + click URLs | Worker throws on first request that needs it (any tracking event) |
| `JWT_SECRET` | Signs session tokens | Worker throws on first authed request |
| `RESEND_API_KEY` | Sign-in code email, daily digest, delete-confirm email | Sign-in/digest/delete flows degrade gracefully — code/digest is logged but never delivered |
| `VAPID_PUBLIC_KEY` | Web Push public key | Push subscriptions endpoint returns empty body; toasts won't fire |
| `VAPID_PRIVATE_KEY_JWK` | Web Push private key (JWK JSON string) | Same as above |
| `VAPID_SUBJECT` | Web Push contact, e.g. `mailto:hello@mailfalcon.app` | Same as above |

### Optional secrets

| Name | Purpose | Behavior if unset |
|---|---|---|
| `STRIPE_SECRET_KEY` | Billing checkout + portal | Both `/v1/billing/*` endpoints return 503 |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature | `/stripe/webhook` returns 503 |
| `STRIPE_PRICE_ID_PRO` | Pro tier Stripe price ID | Checkout returns 503 |
| `AXIOM_TOKEN` | Error + warn forwarder bearer | Worker logs to Cloudflare console only (still visible via `wrangler tail`) |
| `AXIOM_DATASET` | Axiom dataset name | Same as above |

### After secret changes

Wrangler picks up secret changes immediately — no redeploy needed. But to
verify the worker can read them, hit `/health` once and tail the logs.

### Cron triggers

`crons = ["0 22 * * *"]` (22:00 UTC = 6pm Eastern). Runs:
- `sendDailyDigests` — Pro users with `digestEnabled=1`
- `sendAdminDigests` — admin-tier users with platform stats

Trigger manually with `wrangler dev --test-scheduled` then hit
`http://localhost:8787/__scheduled?cron=0+22+*+*+*` in another terminal.

### Verifying secrets are loaded

```
pnpm -F @mailfalcon/worker exec wrangler secret list
```

## Web app (Cloudflare Pages)

```
cd apps/web
pnpm exec next build
pnpm exec wrangler pages deploy out --project-name mailfalcon-web \
  --branch main --commit-dirty=true
```

No secrets required — the web app only embeds `apiHost` at build time
(see `apps/web/lib/config.ts`).

## Extension

Built locally and uploaded to the Chrome Web Store dev console — see
[CWS-SUBMISSION.md](CWS-SUBMISSION.md). No deploy step from this repo.

## D1 migrations

```
pnpm -F @mailfalcon/db migrate:remote
```

Migrations live in `packages/db/migrations/`. Drizzle generates new ones
with `pnpm -F @mailfalcon/db generate`. Apply locally with
`migrate:local`.
