import { config } from './config'

export interface StreamEvent {
  id: number
  emailId: string
  type: 'open' | 'click' | 'reply'
  linkId: string | null
  ts: number
  uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
  country: string | null
  isFirstOpen: boolean
  // Enriched fields for richer notifications; old workers omit these.
  subject?: string | null
  recipientLabel?: string | null
  city?: string | null
  regionCode?: string | null
  deviceType?: string | null
}

export type EventHandler = (e: StreamEvent) => void

export class StreamClient {
  private abort: AbortController | null = null
  private lastSeenTs: number = Date.now()
  private stopped = false

  constructor(
    private readonly token: string,
    private readonly onEvent: EventHandler,
  ) {}

  start(): void {
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    this.abort?.abort()
    this.abort = null
  }

  private async connect(): Promise<void> {
    if (this.stopped) return

    const url = new URL(`${config.apiHost}/stream`)
    url.searchParams.set('token', this.token)
    url.searchParams.set('since', String(this.lastSeenTs))

    const ctrl = new AbortController()
    this.abort = ctrl

    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok || !res.body) {
        console.warn('[mailfalcon] stream connect failed', res.status)
        return this.scheduleReconnect(10_000)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!this.stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const ev = parseSseBlock(block)
          if (ev?.name === 'event' && ev.data) {
            try {
              this.onEvent(JSON.parse(ev.data) as StreamEvent)
            } catch (err) {
              console.warn('[mailfalcon] parse event failed', err)
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.warn('[mailfalcon] stream error', err)
    } finally {
      this.abort = null
    }

    return this.scheduleReconnect(1_000)
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.stopped) return
    setTimeout(() => {
      void this.connect()
    }, delayMs)
  }

  noteEventTs(ts: number): void {
    this.lastSeenTs = Math.max(this.lastSeenTs, ts)
  }
}

function parseSseBlock(block: string): { name: string; data: string } | null {
  const lines = block.split('\n')
  let name = 'message'
  let data = ''
  for (const line of lines) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return null
  return { name, data }
}
