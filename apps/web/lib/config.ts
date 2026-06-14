// TODO: switch to env-driven (NEXT_PUBLIC_API_HOST) when prod build lands.
export const config = {
  apiHost:
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_HOST
      ? process.env.NEXT_PUBLIC_API_HOST
      : 'http://localhost:8787',
} as const
