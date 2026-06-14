export type UaClass = 'desktop' | 'mobile' | 'bot' | 'unknown'

const BOT_PATTERNS = [
  'googleimageproxy',
  'googlebot',
  'mimecast',
  'proofpoint',
  'safelinks',
  'urldefense',
  'barracuda',
  'bingbot',
  'yahoobot',
  'curl/',
  'wget/',
  'python-requests',
]

const MOBILE_PATTERNS = ['mobile', 'android', 'iphone', 'ipad', 'ipod']

export function classifyUa(ua: string | undefined | null): UaClass {
  if (!ua) return 'unknown'
  const lower = ua.toLowerCase()
  if (BOT_PATTERNS.some((p) => lower.includes(p))) return 'bot'
  if (MOBILE_PATTERNS.some((p) => lower.includes(p))) return 'mobile'
  return 'desktop'
}

export function truncateIpV4(ip: string | null | undefined): string | null {
  if (!ip) return null
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  }
  // IPv6: truncate to first 4 groups
  const v6 = ip.split(':')
  if (v6.length >= 4) {
    return `${v6.slice(0, 4).join(':')}::`
  }
  return null
}

export async function hashUa(ua: string): Promise<string> {
  const data = new TextEncoder().encode(ua)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
