// TODO: switch to WXT env-driven config (import.meta.env.WXT_API_HOST) when prod build lands.
export const config = {
  apiHost: 'http://localhost:8787',
  trackerHost: 'http://localhost:8787',
} as const
