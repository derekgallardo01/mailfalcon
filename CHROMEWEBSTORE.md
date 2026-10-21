# Chrome Web Store Listing — Mail Falcon

> Last Updated: 2026-08-19

## Store Listing

**Extension Name** [REQUIRED]
Mail Falcon

**Short Description** [REQUIRED]
Real-time open + click tracking for Gmail. Desktop notifications, full device intel, privacy mode per email. Free tier included.

**Detailed Description** [REQUIRED]
Know the moment your email is read.

Mail Falcon adds real-time open and click tracking directly into Gmail. Send messages normally and receive instant notifications the moment a recipient opens your email or clicks a link, complete with device and location insights.

Key Features:
- Real-Time Open Tracking: Get instant desktop notifications when recipients open your tracked emails.
- Click Tracking: Outbound links in tracked emails are routed through signed redirects so you know exactly which links were clicked.
- Device & Location Intelligence: View recipient browser, operating system, device category, coarse geographic location (city/region/country), and timezone.
- Privacy Mode Per Email: Easily toggle tracking off for any individual message directly from the Gmail compose window.
- Anti-Spoofing & Sender Verification: Inspect SPF, DKIM, and DMARC authentication verdicts on incoming messages to verify sender identity.
- Bot & Prefetch Filtering: Distinguishes automated security scanners and Apple Mail Privacy Protection (MPP) prefetch requests from genuine human opens.
- Scheduled Sends: Queue emails to be sent at optimal times directly from Gmail.

How to Use:
1. Install the extension and sign in with your email address.
2. Open Gmail and click Compose. The Mail Falcon status bar will appear above the compose area.
3. Keep tracking enabled or check "Privacy mode" to skip tracking for that email.
4. Send your email. View real-time activity and analytics at mailfalcon.app/dashboard.

Privacy and Security:
Tracking pixels and link rewriting run client-side. Full email bodies are never stored on Mail Falcon servers. Mail Falcon complies with Google API Services User Data Policy including Limited Use requirements.

Support:
Email: hello@mailfalcon.app
Website: https://mailfalcon.app

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Add open and click tracking to outgoing Gmail messages and surface event notifications and deliverability analytics on the user dashboard.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|------------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `apps/extension/public/icon/128.png` |
| Small Icon | 16×16 PNG | ✅ Ready | `apps/extension/public/icon/16.png` |
| Medium Icon | 32×32 PNG | ✅ Ready | `apps/extension/public/icon/32.png` |
| Large Icon | 48×48 PNG | ✅ Ready | `apps/extension/public/icon/48.png` |
| Screenshot 1 [REQUIRED] | 1280×800 PNG | ✅ Ready | `apps/extension/store-assets/screenshot-1-opens-1280x800.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 PNG | ✅ Ready | `apps/extension/store-assets/screenshot-2-detail-1280x800.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 PNG | ✅ Ready | `apps/extension/store-assets/screenshot-3-privacy-1280x800.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ✅ Ready | `apps/extension/store-assets/small-promo-440x280.png` |
| Marquee Promo Tile | 1400×560 PNG | ✅ Ready | `apps/extension/store-assets/marquee-promo-1400x560.png` |
| Promo Video | 1920×1080 MP4 | ✅ Ready | `apps/extension/store-assets/mailfalcon-promo.mp4` |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores the user's authenticated session token (JWT), notification preferences, Web Push subscription state, and local cache so the user stays signed in across browser sessions. |
| `notifications` | permissions | Displays desktop notifications when an email recipient opens a tracked email or clicks a tracked link. |
| `alarms` | permissions | Periodically wakes the extension service worker to refresh authentication tokens and manage scheduled send timeouts. |
| `scripting` | permissions | Injects the Mail Falcon compose UI components and status bar into Gmail compose windows. |
| `identity` | permissions | Launches Google OAuth flow via `chrome.identity.launchWebAuthFlow` for optional sender-verification features against the Gmail API. |
| `https://mail.google.com/*` | host_permissions | Required to detect compose windows, attach the Mail Falcon tracking toggle toolbar, and inject tracking pixels / signed links upon sending. |
| `https://*.mailfalcon.app/*` | host_permissions | Required to communicate with Mail Falcon's backend API (`api.mailfalcon.app`) for authentication, tracking event streams, and dashboard data synchronization. |
| `https://gmail.googleapis.com/*` | host_permissions | Used to fetch message metadata headers (`Authentication-Results`, `From`, `Reply-To`) to evaluate SPF/DKIM/DMARC verdicts for sender spoof protection. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|------------|-------------------------|---------|----------------------------|
| Personally identifiable info | Yes (User email) | Yes (to `api.mailfalcon.app`) | Account authentication & notifications | No |
| Authentication info | Yes (Session JWT / OAuth tokens) | Yes (token exchange) | Maintaining signed-in session | No |
| Personal communications | No (Full bodies never stored) | No | Only subject lines & link URLs for tracking | Conditionally (Resend/Slack/Discord if user enables webhooks) |
| Location | Coarse geo of open events (derived on server) | Yes | Displaying open analytics to sender | No |
| User activity | Email open/click events | Yes | Tracking analytics | No |
| Website content | Email metadata / headers only | No (headers processed on-device) | Anti-spoofing verification | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL**: `https://mailfalcon.app/privacy`

---

## Distribution

- **Visibility**: Public
- **Regions**: All regions
- **Pricing**: Free

---

## Developer Info

- **Publisher Name**: Mail Falcon / Kinetic Helix
- **Contact Email**: hello@mailfalcon.app
- **Support URL / Email**: hello@mailfalcon.app
- **Homepage URL**: `https://mailfalcon.app`

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.19.3 | 2026-10-11 | Real-time reply tracking with Google Cloud Pub/Sub webhook, interactive self-send onboarding celebration, fixed CWS manifest packaging (omitted key). | Ready for Upload / Submission |
| 1.19.2 | 2026-10-06 | Add post-install welcome onboarding trigger tab and pulsing animated first-send tour tooltip in Gmail compose window. | Published / Superseded |
| 1.19.1 | 2026-08-19 | Fix API host resolution in CWS mode (`--mode cws`) to target production `api.mailfalcon.app` instead of `localhost`. Added config regression tests. | Published |
| 1.19.0 | 2026-08-19 | Added speed-winged brand refresh, MPP detection, sequence support, and deliverability suite. | Rejected (Red Potassium) |

---

## Review Notes

### Rejection History

| Date | Reason / ID | Root Cause | Fix Applied | Resubmitted |
|------|-------------|------------|-------------|-------------|
| 2026-08-19 | Red Potassium (Inaccurate Description - Non functional / connecting to localhost) | WXT build command `wxt zip --mode cws` set Vite mode to `'cws'`. In Vite, `import.meta.env.DEV` is `true` whenever `mode !== 'production'`. `config.ts` relied on `isDev = env.DEV ?? false`, causing `apiHost` to compile as `http://localhost:8787` in CWS release packages. | Updated `config.ts` to check `env.MODE === 'development'` (and respect explicit env overrides). Bundled release package verified to connect strictly to `https://api.mailfalcon.app`. Bumped extension version to `1.19.1`. Added vitest regression tests. | Yes (1.19.1) |
