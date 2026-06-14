// WXT/Vite injects import.meta.env.DEV during `wxt dev` and false at
// build time. Prod build (`wxt build`) ships the live URLs.
const env = import.meta.env as {
  DEV?: boolean
  WXT_INBOXSDK_APP_ID?: string
}

const isDev = env.DEV ?? false

export const config = {
  apiHost: isDev ? 'http://localhost:8787' : 'https://api.mailfalcon.app',
  trackerHost: isDev ? 'http://localhost:8787' : 'https://t.mailfalcon.app',
  // Register a real APP_ID at https://www.inboxsdk.com/register before
  // CWS submission and set WXT_INBOXSDK_APP_ID in apps/extension/.env.
  inboxSdkAppId: env.WXT_INBOXSDK_APP_ID ?? 'sdk_mailfalcon_dev_local',
} as const
