# Chrome Web Store submission — MailFalcon 1.0.0

Everything needed to publish the extension at
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).

## Build the upload zip

```
pnpm -F @mailfalcon/extension build
pnpm -F @mailfalcon/extension exec wxt zip
# produces .output/mailfalcon-1.0.0-chrome.zip
```

Upload that zip on the dev console "Package" step.

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
> MailFalcon runs end-to-end on Cloudflare. Tracking IDs are signed and
> scoped per email. Compose content is read at send time only — modified
> to insert the pixel and rewritten links — then handed back to Gmail.
> It is never transmitted to MailFalcon servers or shared with third
> parties.
>
> Export all your data as JSON or delete your account self-serve in
> Settings. Full policy:
> [app.mailfalcon.app/privacy](https://app.mailfalcon.app/privacy).
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
> resulting events on the user's MailFalcon dashboard.

## Permission justifications

Paste each into the matching dev-console field.

### `storage`

> Stores the user's authenticated session token (JWT), Web Push
> subscription metadata and a "seen onboarding" flag in
> `chrome.storage.local`. Required so the user does not have to sign in
> on every popup open.

### `notifications`

> Used to show a Chrome notification when a recipient opens or clicks a
> tracked email. The notification is fired from the extension service
> worker after a server-sent event from api.mailfalcon.app.

### `alarms`

> Used by the service worker to wake periodically and reconnect to the
> server-sent events stream that delivers open/click notifications.
> Without `alarms` the SW would be torn down by Chrome and live
> notifications would stop.

### `scripting`

> Used by InboxSDK's compose hooks to attach the MailFalcon status bar
> above the Gmail compose area. This is how the user sees and toggles
> the per-email "Privacy mode" checkbox.

### Host permission: `https://mail.google.com/*`

> The content script must run on Gmail to detect new compose windows,
> attach the Privacy mode toggle, read the message body at send time,
> and rewrite links + insert the tracking pixel before the message is
> sent. This is the core feature of the extension.

### Host permission: `https://*.mailfalcon.app/*`

> The extension talks to MailFalcon's own API at api.mailfalcon.app
> (email sign-in, minting tracking IDs, fetching dashboard data) and
> uses t.mailfalcon.app for click redirects. Host permission is needed
> for these CORS-restricted fetches from the popup, service worker, and
> content script.

## Limited Use disclosure (Google user data)

This is the most important section for Gmail extensions.

> MailFalcon's use of information received from Google APIs adheres to
> the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/user_data),
> including the Limited Use requirements.
>
> Specifically:
>
> - **Read.** MailFalcon reads the body of an outgoing Gmail compose
>   message at the moment the user clicks Send, solely to insert a 1px
>   tracking pixel and to rewrite outbound links through a signed
>   redirect. The modified body is handed back to Gmail to send. The
>   compose body is **never transmitted to MailFalcon servers** and is
>   **never shared with any third party**.
> - **Modify.** Same as above — modification is limited to inserting the
>   tracking pixel image tag and replacing outbound link `href` values
>   with signed `t.mailfalcon.app` redirects scoped to that single
>   message.
> - **Store.** No Gmail content is stored. The server stores only:
>   the tracking ID (random 16 bytes), an opaque salt, the user-supplied
>   subject (when explicitly granted), the recipient count (integer),
>   and the resulting open/click events.
> - **Transfer.** No Gmail content is transferred to any third party.
> - **Human read.** No MailFalcon employee, contractor or AI/ML model
>   reads Gmail content. No human-review pipeline exists.
> - **Advertising.** No data of any kind is used for advertising.

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
5. Admin events tab (only if showing the team-tier upsell — optional).

## Promo tile (optional but boosts placement)

- Small promo tile: 440×280
- Marquee: 1400×560

## Privacy policy URL

`https://app.mailfalcon.app/privacy`

(Already live.)

## Submission checklist

- [ ] Bumped extension to `1.0.0` (done in `apps/extension/package.json`)
- [ ] `homepage_url` set to `https://app.mailfalcon.app`
   (done in `apps/extension/wxt.config.ts`)
- [ ] Built zip with `pnpm exec wxt zip` → uploaded
- [ ] Pasted short + long description above
- [ ] Pasted permission justifications above
- [ ] Pasted Limited Use disclosure above
- [ ] Uploaded ≥1 screenshot (1280×800 PNG)
- [ ] Privacy policy URL set to `https://app.mailfalcon.app/privacy`
- [ ] Single purpose set
- [ ] Category set to Productivity
- [ ] Pay one-time $5 developer fee (first-time submitters only)
- [ ] Submit for review

Review typically takes 1–7 days for new extensions, longer if Gmail
content is touched (this one does). Plan accordingly.

## After submission

- Status will move from `In review` → `Published` or `Rejected with
  reason`.
- If rejected, fix the cited issue, bump to `1.0.1`, rebuild zip,
  resubmit.
- Update [docs/SIDELOAD.md](SIDELOAD.md) to point at the CWS install URL
  instead of unpacked-load once published.
- Update the landing page hero CTA from "Sign in to MailFalcon" to
  "Add MailFalcon to Chrome" with the CWS link.
