export function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})

const ET_SHORT_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

// "Jun 14, 2026, 7:22 PM EDT"
export function formatET(ts: number): string {
  return ET_FMT.format(new Date(ts)).replace(' at ', ', ')
}

// "Jun 14, 7:22 PM"
export function formatETShort(ts: number): string {
  return ET_SHORT_FMT.format(new Date(ts)).replace(' at ', ', ')
}

const LOCAL_SHORT_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const LOCAL_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * "Jun 15, 10:23 AM" in the viewer's local timezone. Today gets a
 * shorter form — just the time — so the table doesn't repeat today's
 * date on every row.
 */
export function formatLocalShort(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return LOCAL_TIME_FMT.format(d)
  }
  return LOCAL_SHORT_FMT.format(d).replace(' at ', ', ')
}

export function formatISO(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

export function formatLocation(parts: {
  city?: string | null
  region?: string | null
  regionCode?: string | null
  country?: string | null
}): string {
  const out: string[] = []
  if (parts.city) out.push(parts.city)
  if (parts.regionCode) out.push(parts.regionCode)
  else if (parts.region) out.push(parts.region)
  if (parts.country) out.push(parts.country)
  return out.length === 0 ? '—' : out.join(', ')
}

export function formatBrowser(parts: {
  browserName?: string | null
  browserVersion?: string | null
}): string {
  if (!parts.browserName) return '—'
  const major = parts.browserVersion?.split('.')[0]
  return major ? `${parts.browserName} ${major}` : parts.browserName
}

export function formatOs(parts: {
  osName?: string | null
  osVersion?: string | null
}): string {
  if (!parts.osName) return '—'
  return parts.osVersion ? `${parts.osName} ${parts.osVersion}` : parts.osName
}

export function formatDevice(parts: {
  deviceType?: string | null
  deviceVendor?: string | null
  deviceModel?: string | null
}): string {
  if (parts.deviceVendor && parts.deviceModel) {
    return `${parts.deviceVendor} ${parts.deviceModel}`
  }
  if (parts.deviceModel) return parts.deviceModel
  if (parts.deviceType) return parts.deviceType
  return 'desktop'
}
