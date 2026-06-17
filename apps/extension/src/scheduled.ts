/**
 * Persisted queue of scheduled sends. Each record lives in
 * chrome.storage.local with a matching chrome.alarms entry that wakes
 * the SW at the scheduled time. The SW then dispatches to a Gmail tab
 * which actually fires the compose + send.
 */

export interface ScheduledSend {
  id: string
  scheduledAt: number
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
  createdAt: number
}

const STORAGE_KEY = 'mf.scheduledSends'
const ALARM_PREFIX = 'mf-send-'

type ScheduledStore = Record<string, ScheduledSend>

async function readAll(): Promise<ScheduledStore> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return {}
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const raw = stored[STORAGE_KEY] as ScheduledStore | undefined
  return raw ?? {}
}

async function writeAll(store: ScheduledStore): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  await chrome.storage.local.set({ [STORAGE_KEY]: store })
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `sch_${crypto.randomUUID()}`
  }
  return `sch_${Math.random().toString(36).slice(2)}`
}

export async function schedule(
  partial: Omit<ScheduledSend, 'id' | 'createdAt'>,
): Promise<ScheduledSend> {
  const record: ScheduledSend = {
    ...partial,
    id: newId(),
    createdAt: Date.now(),
  }
  const all = await readAll()
  all[record.id] = record
  await writeAll(all)
  await chrome.alarms.create(`${ALARM_PREFIX}${record.id}`, {
    when: record.scheduledAt,
  })
  return record
}

export async function cancel(id: string): Promise<void> {
  const all = await readAll()
  if (!all[id]) return
  delete all[id]
  await writeAll(all)
  await chrome.alarms.clear(`${ALARM_PREFIX}${id}`)
}

export async function get(id: string): Promise<ScheduledSend | null> {
  const all = await readAll()
  return all[id] ?? null
}

export async function listPending(): Promise<ScheduledSend[]> {
  const all = await readAll()
  return Object.values(all).sort((a, b) => a.scheduledAt - b.scheduledAt)
}

/**
 * Cancel every queued scheduled send. Used during sign-out cleanup so
 * sends queued under the prior account don't fire against a new
 * session. Idempotent — safe to call when nothing is queued.
 */
export async function cancelAll(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms || !chrome.storage?.local) {
    return
  }
  try {
    const alarms = await chrome.alarms.getAll()
    await Promise.all(
      alarms
        .filter((a) => a.name.startsWith(ALARM_PREFIX))
        .map((a) => chrome.alarms.clear(a.name)),
    )
  } catch {
    /* swallow — best effort */
  }
  await chrome.storage.local.remove(STORAGE_KEY).catch(() => undefined)
}

export function alarmNameToId(alarmName: string): string | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) return null
  return alarmName.slice(ALARM_PREFIX.length)
}

/** Helpers for the "In 1 hour" / "Tomorrow 9am" presets. */
export function presetToEpoch(
  preset: 'in-1h' | 'in-3h' | 'tomorrow-9am',
): number {
  const now = Date.now()
  if (preset === 'in-1h') return now + 60 * 60 * 1000
  if (preset === 'in-3h') return now + 3 * 60 * 60 * 1000
  // Tomorrow at 9am in the user's local timezone.
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}
