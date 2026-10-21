// WXT/Vite sets import.meta.env.MODE = 'development' during `wxt dev`.
// For all builds (`wxt build`, `wxt zip`, `wxt zip --mode cws`), MODE is not
// 'development' and live production endpoints are used. Note that Vite's `DEV`
// boolean is true for any custom mode (like `--mode cws`), so we check MODE
// explicitly to avoid bundling localhost in CWS release builds.
const env = import.meta.env as {
  MODE?: string
  DEV?: boolean
  WXT_API_HOST?: string
  WXT_TRACKER_HOST?: string
  WXT_INBOXSDK_APP_ID?: string
}

const isDev = env.MODE === 'development'

export const config = {
  apiHost:
    env.WXT_API_HOST ?? (isDev ? 'http://localhost:8787' : 'https://api.mailfalcon.app'),
  trackerHost:
    env.WXT_TRACKER_HOST ?? (isDev ? 'http://localhost:8787' : 'https://t.mailfalcon.app'),
  inboxSdkAppId: env.WXT_INBOXSDK_APP_ID ?? 'sdk_mailfalcon_dev_local',
  publicWebUrl:
    env.MODE === 'development' ? 'http://localhost:3000' : 'https://mailfalcon.app',
} as const
