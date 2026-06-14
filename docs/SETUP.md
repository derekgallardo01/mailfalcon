# mailfalcon — production setup

What's already wired (no action needed):
- Cloudflare Worker at `api.mailfalcon.app` and `t.mailfalcon.app`
- D1 + KV + R2 created and bound
- HMAC_SECRET + JWT_SECRET uploaded as Worker secrets
- Cloudflare Pages site at `app.mailfalcon.app` (static export of `apps/web`)
- DNS managed by Cloudflare Registrar (mailfalcon.app)
- Derek's account promoted to `tier=admin` in prod D1

## What still needs your action

### 1. Resend (for real magic-code emails)

Currently the worker logs the 6-digit code to `wrangler tail` instead of
sending email — that works for testing but won't work for real users.

1. Sign up at https://resend.com
2. **Domains → Add Domain → enter `mailfalcon.app`**
3. Resend shows DNS records to add (one TXT for SPF, one TXT for DKIM,
   sometimes an MX). Because the zone is on Cloudflare, you can add them
   in the Cloudflare dashboard → DNS → Records → Add record. Set Proxy
   status to **DNS only** (grey cloud) for these records.
4. Back in Resend, click **Verify** — usually takes <2 minutes.
5. **API Keys → Create API Key**, scope = Sending, copy the `re_...` value.
6. Upload to the worker:

   ```
   cd apps/worker
   pnpm exec wrangler secret put RESEND_API_KEY
   # paste the key when prompted
   ```

Done. `apps/worker/src/lib/mailer.ts` already detects `RESEND_API_KEY`
and switches from `console.log` to a real Resend send.

You may want to update the sender address in `mailer.ts` — currently
`mailfalcon <hello@mailfalcon.app>`. Pick something at `mailfalcon.app`.

### 2. InboxSDK APP_ID (for Chrome Web Store submission)

Local dev works with the placeholder `sdk_mailfalcon_dev_local`. For
prod / CWS, get a real ID.

1. Sign up at https://www.inboxsdk.com/register
2. Register the extension. They give you an APP_ID like `sdk_xxx_yyy`.
3. Copy `apps/extension/.env.example` to `apps/extension/.env` and
   paste the APP_ID.
4. Rebuild: `pnpm -F @mailfalcon/extension build`.

`.env` is gitignored, but the value is inlined into the extension bundle
at build time via `import.meta.env.WXT_INBOXSDK_APP_ID`.

### 3. Stripe (for paid tier)

Already scaffolded — endpoints `/v1/billing/checkout` and
`/v1/billing/portal` return 503 until configured.

1. Sign up at https://stripe.com (you may already have an account)
2. Create a product "mailfalcon Pro" with a recurring price (e.g.
   $7/month). Copy the `price_...` ID.
3. Upload secrets + var:

   ```
   cd apps/worker
   pnpm exec wrangler secret put STRIPE_SECRET_KEY     # sk_live_... or sk_test_...
   pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET # set after step 4
   # Add as plain var in wrangler.toml [vars]:
   #   STRIPE_PRICE_ID_PRO = "price_..."
   ```
4. Stripe Dashboard → Webhooks → Add endpoint:
   - URL: `https://api.mailfalcon.app/stripe/webhook`
   - Events: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
5. Copy the webhook signing secret (`whsec_...`) and put it in
   `STRIPE_WEBHOOK_SECRET`.

After deploying with the secrets set, free users see an Upgrade button
on the dashboard.

### 4. Chrome Web Store submission

Need before submission:
- Privacy policy URL (host it on the landing page or a static `/privacy`)
- Demo video (Loom, 60s, show install → sign-in → send → notification)
- Screenshots (1280×800)
- Detailed permission justifications (mail.google.com, storage,
  notifications, alarms)
- Limited Use disclosure for Gmail data — the extension reads compose
  body to inject the pixel + rewrite links, which counts as Google user
  data under their policy. Be explicit.

Submit at https://chrome.google.com/webstore/devconsole. $5 one-time
developer fee, ~2 week review for extensions that touch Gmail.

## How to verify everything is live

```
curl https://api.mailfalcon.app/health
# → {"ok":true,"env":"production",...}

curl https://app.mailfalcon.app/
# → returns HTML with "mailfalcon" landing page

# In a browser:
# 1. https://app.mailfalcon.app/sign-in → enter your email
# 2. wrangler tail in another shell, copy the 6-digit code
#    (or check Resend Logs once that's wired)
# 3. Verify code → /dashboard renders
# 4. /admin (you should see it because you're tier=admin)
```

## Re-deploying after code changes

```
# Worker
cd apps/worker
pnpm exec wrangler deploy

# Web dashboard
cd apps/web
pnpm build
cd ../worker
pnpm exec wrangler pages deploy ../../apps/web/out --project-name mailfalcon-web --branch main --commit-dirty=true

# Database migrations
cd apps/worker
pnpm exec wrangler d1 migrations apply mailfalcon --remote
```

## Operational tips

- `wrangler tail` streams live worker logs — handy for the dev mailer
  output and for debugging webhook signature failures.
- `wrangler d1 execute mailfalcon --remote --command "..."` runs ad-hoc
  SQL against the prod D1. Useful for promoting users to admin:
  `UPDATE users SET tier='admin' WHERE email='you@x.com'`.
- The Pages deploy step doesn't have a `wrangler pages domain` command
  in v3; custom domains are added via the dashboard or the REST API.
  See the `wrangler pages domain` shim done at setup time for the
  reference call.
