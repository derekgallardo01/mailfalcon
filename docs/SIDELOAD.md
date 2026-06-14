# Sideloading the mailfalcon extension for local testing

Use this for end-to-end testing against the live API (api.mailfalcon.app)
before submitting to the Chrome Web Store.

## Build

From the repo root:

```
pnpm -F @mailfalcon/extension build
```

This produces `apps/extension/.output/chrome-mv3/` with everything Chrome
needs (manifest.json, background.js, content-scripts/gmail.js, popup.html,
and the icon set).

The production build uses `https://api.mailfalcon.app` and
`https://t.mailfalcon.app` via [apps/extension/src/config.ts](../apps/extension/src/config.ts).

## Load into Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. **Load unpacked** → select `apps/extension/.output/chrome-mv3`
4. You'll see "mailfalcon" appear with the falcon icon
5. Pin it to the toolbar so the popup is one click away

## Sign in (real Resend code is used in production)

1. Click the mailfalcon toolbar icon → popup opens
2. Enter your email → **Send code**
3. Check your inbox for "Your mailfalcon sign-in code" → copy the
   6-digit code
4. Paste → **Verify**
5. Popup now reads "Signed in as …"

On sign-in the extension also:
- Subscribes to Web Push (you'll see Chrome prompt for notifications
  permission the first time)
- Connects the background SW to the SSE stream so live events fire
  `chrome.notifications` toasts when Gmail tabs are open

## Test the tracking loop

1. Open https://mail.google.com in the same Chrome profile
2. Compose a message **to a different Gmail account you can also check**
   (use a second browser profile or a separate browser)
3. You'll see a status bar **above the compose area** with a
   "Privacy mode — skip tracking for this email" checkbox
   - Leave it **unchecked** to track this send
   - Check it for an untracked send (no pixel, no link rewrite)
4. Send the email
5. Open the recipient inbox — opening the email triggers the pixel,
   clicking any link triggers the redirect
6. Within ~5 seconds:
   - `chrome.notifications` toast pops up on your machine
   - https://app.mailfalcon.app/dashboard updates the table

## Common gotchas

- **Notifications denied?** `chrome://settings/content/notifications`,
  ensure mailfalcon isn't blocked.
- **No toast appearing?** Check `chrome://extensions` → mailfalcon
  → **Inspect views: service worker** for any console errors.
- **Gmail isn't picking up the extension?** The content script runs at
  document_idle on mail.google.com. Reload the Gmail tab after install.
- **InboxSDK warning in the console** is normal; we use a development
  app ID. The SDK still works for compose hooks.
- **Bot opens** (Gmail proxy, Outlook SafeLinks, link scanners) are
  filtered out of notifications. You'll see them in the dashboard
  marked as `bot` but they won't ping you.

## Bumping the version before CWS submission

`apps/extension/package.json` version field drives the manifest. CWS
expects 1.0.0+ for first submission. After every code change run
`pnpm -F @mailfalcon/extension build`, zip the `.output/chrome-mv3`
folder, and upload to the developer dashboard.

```
cd apps/extension
pnpm exec wxt zip
# produces .output/mailfalcon-<version>-chrome.zip
```
