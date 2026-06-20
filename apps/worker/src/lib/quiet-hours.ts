/**
 * Per-user quiet-hours check. Skips push notifications when the
 * current local time (in the user's chosen IANA timezone) falls
 * inside the [start, end) window. Identical start + end means
 * disabled. Windows that cross midnight (e.g. 22:00–08:00) are
 * detected by start > end and OR'd instead of AND'd.
 */

export interface QuietHoursConfig {
  quietStartMinute: number | null
  quietEndMinute: number | null
  quietTimezone: string | null
}

function minuteIndexInTz(now: Date, tz: string): number {
  // Intl.DateTimeFormat with a numeric hour/minute renders the wall-
  // clock time in the requested timezone; parse and convert.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  let hour = 0
  let minute = 0
  for (const p of parts) {
    if (p.type === 'hour') hour = Number.parseInt(p.value, 10)
    else if (p.type === 'minute') minute = Number.parseInt(p.value, 10)
  }
  // 24-hour formatter sometimes emits "24" for midnight depending on
  // locale; clamp to 0.
  if (hour === 24) hour = 0
  return hour * 60 + minute
}

export function isInQuietHours(cfg: QuietHoursConfig, now = new Date()): boolean {
  const start = cfg.quietStartMinute
  const end = cfg.quietEndMinute
  if (start == null || end == null) return false
  if (start === end) return false

  let mins: number
  try {
    mins = minuteIndexInTz(now, cfg.quietTimezone ?? 'UTC')
  } catch {
    // Invalid timezone string — fall back to UTC.
    mins = minuteIndexInTz(now, 'UTC')
  }

  // Non-crossing: 09:00–17:00 → in if 9 <= mins < 17.
  if (start < end) return mins >= start && mins < end
  // Crossing midnight: 22:00–08:00 → in if mins >= 22 OR mins < 8.
  return mins >= start || mins < end
}
