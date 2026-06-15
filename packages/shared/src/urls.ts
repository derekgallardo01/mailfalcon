export const DEFAULT_TRACKER_HOST = 'https://t.mailfalcon.app'
export const DEFAULT_API_HOST = 'https://api.mailfalcon.app'

/**
 * Pixel URL. If `recipientId` is provided, the sig must be over
 * `${id}:${recipientId}`. The server reads `?r=` and verifies the
 * recipient-bound sig, then records the open against that recipient.
 * Without `recipientId`, the sig is over `${id}` and the open is
 * recorded with `recipientId=null` (backwards compatible).
 */
export function pixelUrl(
  id: string,
  sig: string,
  host = DEFAULT_TRACKER_HOST,
  recipientId?: string,
): string {
  const r = recipientId ? `&r=${encodeURIComponent(recipientId)}` : ''
  return `${host}/p/${id}.gif?s=${sig}${r}`
}

/**
 * Click URL. When `recipientId` is provided, the sig must be over
 * `${id}:${recipientId}:c` and the server records the click against that
 * recipient. Without `recipientId`, the sig is over `${id}` and the
 * click is recorded with `recipientId=null` (backwards compatible).
 */
export function clickUrl(
  id: string,
  linkIdx: number,
  sig: string,
  host = DEFAULT_TRACKER_HOST,
  recipientId?: string,
): string {
  const r = recipientId ? `&r=${encodeURIComponent(recipientId)}` : ''
  return `${host}/c/${id}/${linkIdx}?s=${sig}${r}`
}
