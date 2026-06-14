// WXT/Vite injects import.meta.env.DEV during `wxt dev` and false at
// build time. Prod build (`wxt build`) ships the live URLs.
const isDev = (import.meta.env as { DEV?: boolean }).DEV ?? false

export const config = {
  apiHost: isDev ? 'http://localhost:8787' : 'https://api.mailfalcon.app',
  trackerHost: isDev ? 'http://localhost:8787' : 'https://t.mailfalcon.app',
} as const
