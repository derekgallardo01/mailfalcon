# Chrome Web Store submission — MailFalcon 1.18.1

Everything needed to publish the extension at
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
and to pass Google OAuth **restricted-scope** verification.

> **IMPORTANT — restricted scopes.** MailFalcon uses two restricted Gmail
> scopes (`gmail.compose`, `gmail.readonly`). This triggers full Google OAuth
> verification **plus a CASA Tier 2 security assessment**. The Limited Use
> disclosure below and the Chrome "Data safety" form must be **accurate** —
> the previous version of this doc understated Gmail API usage and must never
> be resubmitted. See "Pre-verification remediation" before submitting.

## Build the upload zip

```
pnpm -F @mailfalcon/extension zip:cws
# produces apps/extension/.output/mailfalconextension-1.18.1-chrome.zip
```

Use **`zip:cws`** (`wxt zip --mode cws`), NOT plain `wxt zip`. The Chrome
Web Store rejects a manifest `key` field ("key field is not allowed in
manifest"); `--mode cws` strips the pinned sideload key so the upload
succeeds. Plain `wxt zip` keeps the key (for stable sideload IDs) and will
be rejected by the store.

The manifest version is **1.18.1** (not 1.0.0). Each new upload must have a
strictly higher version than the last; you cannot go back down.

Upload that zip on the dev console "Package" step.

> **Published extension ID differs from the sideload ID.** The store
> assigns its own key/ID on publish, so the production ID will NOT be
> `flimjkffmcjdmbppckejndmihbnflldm`. After creating the item, copy the
> production extension ID from the dashboard and add
> `https://<prod-id>.chromiumapp.org/` to the Google OAuth client's
> authorized redirect URIs — otherwise the extension's anti-spoof Google
> connect (`launchWebAuthFlow`) will fail in the published build.

## Store listing copy

### Title

`MailFalcon — Email tracking for Gmail`

### Short description (≤ 132 chars)

`Real-time open + click tracking for Gmail. Desktop notifications, full
device intel, privacy mode per email. Free tier included.`

(127 characters)

### Detailed description

> **Know the moment your email is read.**
>
> MailFalcon adds open and link tracking to Gmail. Send like normal — get
> a notification the instant a recipient opens, with full browser, device
> and location detail.
>
> ## What it does
>
> - **Real-time open tracking.** Every open fires a Web Push notification
>   on your desktop within seconds of being read.
> - **Click tracking.** Every link in your tracked email is rewritten
>   through a signed redirect so you know who clicked which link.
> - **Full device intelligence.** Each event records browser, OS, device
>   type, IP /24 prefix, city, region, postal code and timezone.
> - **Privacy mode per email.** A checkbox in the Gmail compose area lets
>   you skip tracking on any individual message — no pixel, no link
>   rewrite, nothing sent to MailFalcon.
> - **Optional Gmail connection.** Connect your Google account to send
>   tracked mail server-side (with reply context) and to verify sender
>   authentication (SPF/DKIM/DMARC) on incoming mail. This is optional and
>   uses restricted Gmail scopes — see Privacy below.
> - **Bot filtering.** Gmail's image proxy and known link scanners are
>   flagged separately so the human-open count stays trustworthy.
> - **Daily digest (Pro).** Optional morning email with a recap of the
>   prior day's opens and clicks.
>
> ## How it works
>
> 1. Install the extension and sign in (email-link sign-in, no password).
> 2. Open Gmail and compose a message. A status bar appears above the
>    compose body with a "Privacy mode" checkbox — leave it unchecked to
>    track this send.
> 3. Send. Open and click events stream to
>    [app.mailfalcon.app/dashboard](https://app.mailfalcon.app/dashboard).
>
> ## Pricing
>
> - **Free.** 10 tracked emails per day. No watermark.
> - **Pro — $7/month.** Unlimited tracked emails + daily digest email.
>
> ## Privacy and data
>
> Core tracking (pixel + link rewrite) runs entirely in your browser and
> does **not** use the Gmail API — the composed body is never sent to
> MailFalcon servers on that path.
>
> If you connect your Google account (optional), MailFalcon uses the
> `gmail.compose` and `gmail.readonly` scopes to send tracked mail on your
> behalf and to read message headers/threads for reply context and sender
> verification. Full details in the Limited Use disclosure below and at
> [app.mailfalcon.app/privacy](https://app.mailfalcon.app/privacy).
>
> Export all your data as JSON or delete your account self-serve in
> Settings.
>
> ## Support
>
> hello@mailfalcon.app

### Category

Productivity

### Language

English

### Single purpose

> Add open and click tracking to outgoing Gmail messages and surface the
> resulting open/click events on the user's MailFalcon dashboard. The
> optional Google-account connection supports this purpose by sending
> tracked messages and by verifying sender authentication and providing
> reply context for the same mail.

## Permission justifications

Paste each into the matching dev-console field. Keep these consistent with
the manifest (`apps/extension/wxt.config.ts`) — all of the following are
actually declared.

### `storage`

> Stores the user's authenticated session token (JWT), Web Push
> subscription metadata, a "seen onboarding" flag, and — when the user
> connects their Google account — Google OAuth tokens, all in
> `chrome.storage.local`. Required so the user does not have to sign in on
> every popup open.

### `notifications`

> Used to show a Chrome notification when a recipient opens or clicks a
> tracked email. Fired from the extension service worker after a
> server-sent event from api.mailfalcon.app.

### `alarms`

> Used by the service worker to wake periodically and reconnect to the
> server-sent events stream that delivers open/click notifications.
> Without `alarms` the SW would be torn down by Chrome and live
> notifications would stop.

### `scripting`

> Used by InboxSDK's compose hooks to attach the MailFalcon status bar
> above the Gmail compose area — how the user sees and toggles the
> per-email "Privacy mode" checkbox.

### `identity`

> Used to run the Google OAuth sign-in flow for the optional Gmail
> connection via `chrome.identity.launchWebAuthFlow`
> (redirect URI `https://<extension-id>.chromiumapp.org/`). This is how the
> user grants MailFalcon access to verify sender authentication on incoming
> mail. The authorization code is exchanged for tokens **server-side**; the
> client secret never ships in the extension.

### Host permission: `https://mail.google.com/*`

> The content script must run on Gmail to detect new compose windows,
> attach the Privacy mode toggle, read the message body at send time, and
> rewrite links + insert the tracking pixel before the message is sent.
> This is the core feature of the extension.

### Host permission: `https://gmail.googleapis.com/*`

> The extension calls the Gmail REST API (`users.messages.get`,
> `format=metadata`) with the user's `gmail.readonly` token to read the
> `Authentication-Results`, `From`, and `Reply-To` headers of a message and
> compute a sender-authentication (SPF/DKIM/DMARC) verdict for the
> anti-spoofing feature. Only message **metadata headers** are requested —
> never message bodies — and the result is processed on-device.

### Host permission: `https://*.mailfalcon.app/*`

> The extension talks to MailFalcon's own API at api.mailfalcon.app
> (email sign-in, minting tracking IDs, server-side OAuth token exchange,
> fetching dashboard data) and uses t.mailfalcon.app for click redirects.
> Host permission is needed for these CORS-restricted fetches from the
> popup, service worker, and content script.

## OAuth verification — restricted scope justifications

Paste into the OAuth consent screen "scope justification" fields. Google
requires you explain **why each scope is necessary** and **why a narrower
scope will not work**.

### `https://www.googleapis.com/auth/gmail.compose` (restricted)

> Required to send tracked email on the user's behalf. After the user
> composes a message in MailFalcon's compose flow, the server inserts a 1px
> open-tracking pixel and rewrites outbound links through signed redirects,
> assembles the RFC 5322 message, and calls `users.messages.send`. A
> narrower scope is insufficient: `gmail.send` cannot create/read the draft
> or thread context the compose flow relies on, and `gmail.insert`/label
> scopes do not send. We do not use `gmail.modify` or full-mailbox
> (`https://mail.google.com/`) scopes.

### `https://www.googleapis.com/auth/gmail.readonly` (restricted)

> Used for two features: (1) **Sender verification** — reading the
> `Authentication-Results`/`From`/`Reply-To` **headers** (metadata only) of
> a message to compute an SPF/DKIM/DMARC verdict shown in Gmail; and
> (2) **Reply context** — fetching the source thread when the user replies,
> so quoted context is available in the compose flow. There is no narrower
> read scope: Gmail offers no "headers-only" or "single-thread" OAuth
> scope, so `gmail.readonly` is the minimum that permits `messages.get`.
> For feature (1) we constrain the API request to `format=metadata` with an
> explicit `metadataHeaders` allow-list so no bodies are retrieved.

> **Consider before submitting:** if reply-context is not essential for
> launch, dropping the **server-side** `gmail.readonly` (keeping it only in
> the extension for header reads) narrows the *server's* restricted-scope
> footprint and can simplify the CASA assessment. Decide and update
> `apps/worker/src/lib/google-tokens.ts` accordingly.

## Limited Use disclosure (Google user data)

The single most important section. This must match the code exactly.

> MailFalcon's use of and transfer of information received from Google APIs
> adheres to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> and the
> [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/user_data),
> including the **Limited Use** requirements.
>
> **Scopes used (only after the user connects their Google account):**
> `gmail.compose` and `gmail.readonly`, plus `openid`/`email`/`profile` to
> identify the connected Gmail address. Core open/click tracking does not
> use any Gmail API scope.
>
> - **Read.** With `gmail.readonly` MailFalcon (a) reads message
>   **metadata headers only** (`Authentication-Results`, `From`,
>   `Reply-To`; `format=metadata`) on-device in the extension to compute a
>   sender-authentication verdict — this header data is cached only in the
>   browser (`chrome.storage.session`) and is **never transmitted to
>   MailFalcon servers**; and (b) on the server, fetches a source thread to
>   build reply context. Reply-context content is returned to the user's
>   own client transiently and is **not stored**.
> - **Send/Modify.** With `gmail.compose` MailFalcon sends messages the
>   user composes, after inserting an open-tracking pixel and rewriting
>   outbound links through signed redirects scoped to that message. It does
>   not otherwise modify the user's mailbox.
> - **Store.** MailFalcon stores: the connected Gmail address; OAuth access
>   and refresh tokens; and, for tracking, the message **subject line**,
>   the Gmail **thread/message IDs**, and outbound **link URLs**. Recipient
>   addresses are SHA-256 hashed in the tracking path. Scheduled sends
>   temporarily store recipient addresses and a short body preview until
>   the scheduled send executes, then follow normal retention. **Full
>   message bodies are never stored.**
> - **Transfer.** MailFalcon does not sell Google user data and does not
>   use it for advertising. Subject lines are transmitted to third-party
>   notification providers (Resend for email-to-self digests; Slack/Discord
>   webhooks) **only when the user explicitly enables** those channels.
>   Operational error logs (Axiom) may include a Gmail `threadId` and
>   truncated Google API error text, but never subjects or message bodies.
> - **Human/AI access.** No MailFalcon employee, contractor, or AI/ML model
>   reads Gmail message bodies, and no human-review pipeline exists. The
>   operator admin console does not display Gmail-derived message content
>   (subject lines were removed and are not searchable).
> - **Deletion.** Users can disconnect Gmail and delete their account
>   self-serve in Settings. Both paths revoke the grant at Google
>   (`oauth2.googleapis.com/revoke`) and delete the stored tokens; account
>   deletion additionally removes all tracked-email data.

## Chrome "Data safety" form — what to declare

- **Data collected/used:** email subjects, message IDs/thread IDs, outbound
  URLs, connected Google email address, OAuth tokens, recipient identifiers
  (hashed), open/click event metadata (IP, coarse geo, device).
- **Purpose:** app functionality (tracking, sending, verification).
- **Shared with third parties:** yes, conditionally — subjects to
  Resend/Slack/Discord when the user enables those notification channels.
- **Encrypted in transit:** yes. **Encrypted at rest:** only if remediation
  item 1 is completed — otherwise do not claim it.
- **Deletion mechanism:** yes, self-serve in Settings.

## Pre-verification remediation (do before CASA / final submit)

CASA Tier 2 assessors and Google's reviewer will check these. Tracking:

- [x] **1. Encrypt OAuth refresh/access tokens at rest** — AES-256-GCM in
  `apps/worker/src/lib/crypto-tokens.ts`, wired into
  `apps/worker/src/lib/google-tokens.ts`. Lazy, zero-downtime migration.
  **Action required:** set the `TOKEN_ENC_KEY` Workers secret in production
  (see `docs/DEPLOY.md`) — without it, encryption is a no-op.
- [x] **2. Minimize `scheduled_sends`** — `bodyPreview` is no longer written
  (worker `scheduled.ts`, extension `scheduled.ts`/`api.ts`); existing rows
  purged by migration `0018_clear_scheduled_body_preview.sql`. Recipient
  addresses retained (needed for the user's own scheduled-queue view).
- [x] **3. Revoke at Google on disconnect + delete** — `revokeGoogleGrant`
  called in `DELETE /v1/compose/oauth` (`compose.ts`) and account deletion
  (`me.ts`).
- [x] **4. Restrict admin access to Gmail-derived content** — subject lines
  removed from all admin API responses + search and from the admin web UI
  (`apps/worker/src/routes/admin.ts`, `apps/web/app/admin/*`).
- [x] **5. Scrub Axiom identifiers** — `threadId` removed from the
  `gmail_thread_fetch_failed` warn log (`compose.ts`).
- [x] **6. Explicit `google_tokens` deletion** — added to the account
  deletion batch (`me.ts`), not just FK cascade.
- [ ] **7. Privacy policy** — ensure app.mailfalcon.app/privacy states the
  Gmail scopes, server-side token storage, third-party subject sharing, and
  the deletion path, and includes the Limited Use statement. *(Still to
  verify on the live page.)*
- [ ] **8. Decide `gmail.readonly` server-side** — keep or drop reply
  context (see scope justification note) to size the CASA footprint.
  *(Product decision — currently kept.)*

> **Deploy note:** apply the DB migration (`pnpm -F @mailfalcon/db
> migrate:remote`) and set `TOKEN_ENC_KEY` before/with the worker deploy so
> encryption engages and the body-preview purge runs.

## Demo video (required for OAuth verification)

Unlisted YouTube video. Must show, on screen:

1. The OAuth consent screen with the verified app name **MailFalcon** and
   the exact Gmail permissions being requested.
2. The in-app "Connect Google account" action that triggers that consent.
3. Each restricted scope actually being used:
   - `gmail.compose`: composing in MailFalcon and sending; show the sent
     message in Gmail.
   - `gmail.readonly`: the sender-verification badge on a message, and (if
     kept) reply context populating.
4. The **disconnect / delete** path in Settings that removes access.

## Screenshots required (1280×800 PNG, ≥1)

Capture five if possible:

1. Gmail compose window with the MailFalcon "Privacy mode" status bar
   pinned above the body.
2. Chrome notification toast firing the moment a recipient opens
   ("Opened by — desktop · Safari · United States").
3. Dashboard list view at app.mailfalcon.app/dashboard with several
   tracked emails, opens and clicks visible.
4. Per-email detail page showing the event timeline with
   browser/OS/location for each open.
5. Sender-verification badge (anti-spoof) on an inbox message.

## Promo tile (optional but boosts placement)

- Small promo tile: 440×280
- Marquee: 1400×560

## Privacy policy URL

`https://app.mailfalcon.app/privacy`

(Already live — confirm it covers the Gmail scopes per remediation item 7.)

## Submission checklist

- [ ] Pre-verification remediation items above addressed (or consciously
  deferred with disclosures updated to match)
- [ ] `homepage_url` set to `https://app.mailfalcon.app`
  (done in `apps/extension/wxt.config.ts`)
- [ ] Built zip with `pnpm exec wxt zip` (v1.18.1) → uploaded
- [ ] Pasted short + long description above
- [ ] Pasted permission justifications above (incl. `identity`,
  `gmail.googleapis.com`)
- [ ] Pasted **accurate** Limited Use disclosure above
- [ ] Chrome Data safety form matches the disclosure
- [ ] OAuth consent screen scope justifications pasted
- [ ] Demo video recorded + linked
- [ ] Uploaded ≥1 screenshot (1280×800 PNG)
- [ ] Privacy policy URL set + updated for Gmail scopes
- [ ] Single purpose set
- [ ] Category set to Productivity
- [ ] Pay one-time $5 developer fee (first-time submitters only)
- [ ] CASA Tier 2 assessment scheduled (long lead time — start early)
- [ ] Submit for review

Review typically takes 1–7 days for a new extension; **restricted-scope
OAuth verification + CASA takes considerably longer (weeks)**. Plan
accordingly.

## After submission

- Status will move from `In review` → `Published` or `Rejected with
  reason`.
- If rejected, fix the cited issue, bump the version, rebuild zip,
  resubmit.
- Update [docs/SIDELOAD.md](SIDELOAD.md) to point at the CWS install URL
  instead of unpacked-load once published.
- Update the landing page hero CTA from "Sign in to MailFalcon" to
  "Add MailFalcon to Chrome" with the CWS link.
</content>
