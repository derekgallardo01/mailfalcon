import { UAParser } from 'ua-parser-js'

export type UaClass = 'desktop' | 'mobile' | 'bot' | 'unknown'

const BOT_PATTERNS = [
  // Provider-side image proxies + search bots.
  'googleimageproxy',
  'googlebot',
  'yahoobot',
  'bingbot',
  'msnbot',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'applebot',
  'slurp',
  // Social-media unfurlers.
  'linkedinbot',
  'twitterbot',
  'facebookexternalhit',
  'slackbot',
  'telegrambot',
  'discordbot',
  'whatsapp',
  // Corporate SEG / email-security scanners.
  'mimecast',
  'proofpoint',
  'safelinks',
  'urldefense',
  'barracuda',
  'symantec',
  'ironport',
  'cisco-ironport',
  'trendmicro',
  'sophos',
  'forcepoint',
  'fireeye',
  'sanesecurity',
  'zscaler',
  'agari',
  'clearswift',
  'clamav',
  // Generic HTTP libraries — never a real human browser.
  'curl/',
  'wget/',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'go-http-client',
  'node-fetch',
  'axios/',
  'okhttp',
  'apache-httpclient',
  'java/',
  'libwww-perl',
  'ruby',
  // Headless / automation stacks.
  'headlesschrome',
  'phantomjs',
  'puppeteer',
  'playwright',
  'selenium',
  'chrome-lighthouse',
]

const MOBILE_PATTERNS = ['mobile', 'android', 'iphone', 'ipad', 'ipod']

export interface UaDetails {
  uaClass: UaClass
  browserName: string | null
  browserVersion: string | null
  osName: string | null
  osVersion: string | null
  deviceType: string | null
  deviceVendor: string | null
  deviceModel: string | null
}

export function parseUa(ua: string | undefined | null): UaDetails {
  if (!ua) {
    return {
      uaClass: 'unknown',
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null,
      deviceType: null,
      deviceVendor: null,
      deviceModel: null,
    }
  }
  const lower = ua.toLowerCase()
  // A real browser UA is ≥ ~60 chars ("Mozilla/5.0 (…) …/…"). Anything
  // dramatically shorter is a script/scanner even without a keyword hit.
  const suspiciouslyShort = ua.length < 20
  const noMozilla = !lower.startsWith('mozilla/')
  if (
    BOT_PATTERNS.some((p) => lower.includes(p)) ||
    (suspiciouslyShort && noMozilla)
  ) {
    return {
      uaClass: 'bot',
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null,
      deviceType: null,
      deviceVendor: null,
      deviceModel: null,
    }
  }

  const parser = new UAParser(ua)
  const browser = parser.getBrowser()
  const os = parser.getOS()
  const device = parser.getDevice()

  const isMobile =
    device.type === 'mobile' ||
    device.type === 'tablet' ||
    MOBILE_PATTERNS.some((p) => lower.includes(p))

  return {
    uaClass: isMobile ? 'mobile' : 'desktop',
    browserName: browser.name ?? null,
    browserVersion: browser.version ?? null,
    osName: os.name ?? null,
    osVersion: os.version ?? null,
    deviceType: device.type ?? (isMobile ? 'mobile' : 'desktop'),
    deviceVendor: device.vendor ?? null,
    deviceModel: device.model ?? null,
  }
}

// Backwards-compat helpers used by the auth + admin tests.
export function classifyUa(ua: string | undefined | null): UaClass {
  return parseUa(ua).uaClass
}

export function truncateIpV4(ip: string | null | undefined): string | null {
  if (!ip) return null
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  }
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

export interface CfGeo {
  country: string | null
  region: string | null
  regionCode: string | null
  city: string | null
  postalCode: string | null
  latitude: string | null
  longitude: string | null
  timezone: string | null
}

export function extractCfGeo(req: Request): CfGeo {
  const cf = (req as Request & { cf?: Record<string, unknown> }).cf ?? {}
  const get = (k: string): string | null => {
    const v = cf[k]
    return typeof v === 'string' && v.length > 0 ? v : null
  }
  return {
    country: get('country'),
    region: get('region'),
    regionCode: get('regionCode'),
    city: get('city'),
    postalCode: get('postalCode'),
    latitude: get('latitude'),
    longitude: get('longitude'),
    timezone: get('timezone'),
  }
}
