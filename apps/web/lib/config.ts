const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

const fallback = isDev ? 'http://localhost:8787' : 'https://api.mailfalcon.app'

export const config = {
  apiHost:
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_HOST
      ? process.env.NEXT_PUBLIC_API_HOST
      : fallback,
} as const
