import type { Context } from 'hono'

/**
 * Cloudflare populates CF-Connecting-IP with the real client IP — it's
 * trusted because edge sets it (unlike X-Forwarded-For, which a caller
 * can forge). Falls back to "unknown" so rate-limit keys never look up
 * to undefined.
 */
export function getClientIp(c: Context): string {
  return c.req.header('CF-Connecting-IP') ?? 'unknown'
}
