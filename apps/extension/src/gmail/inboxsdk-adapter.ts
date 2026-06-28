import * as InboxSDK from '@inboxsdk/core'
import { listTemplates, type Template } from '../api'
import { hasSeenFirstSendTour, markFirstSendTourSeen } from '../auth-store'
import { config } from '../config'
import type {
  ComposeEvent,
  GmailAdapter,
  MessageDecorate,
  ProgrammaticCompose,
  RecipientHandle,
  ReplyCandidate,
} from './adapter'
import { lookupTrackingByThreads, type TrackingSummary } from '../api'
import { presetToEpoch } from '../scheduled'

interface SdkRecipient {
  emailAddress?: string
  name?: string
}

function toHandles(raw: unknown[]): RecipientHandle[] {
  const out: RecipientHandle[] = []
  for (const r of raw) {
    const obj = r as SdkRecipient
    if (typeof obj.emailAddress !== 'string' || obj.emailAddress.length === 0) continue
    out.push({
      address: obj.emailAddress,
      ...(obj.name && obj.name.length > 0 ? { name: obj.name } : {}),
    })
  }
  return out
}

interface ComposeView {
  on: (event: string, cb: (e: unknown) => Promise<void> | void) => void
  addStatusBar?: (opts?: { height?: number; orderHint?: number }) => {
    el: HTMLElement
    destroy: () => void
  } | null
  getHTMLContent?: () => string
  setBodyHTML?: (html: string) => void
  setSubject?: (s: string) => void
  insertHTMLIntoBodyAtCursor?: (html: string) => void
  getToRecipients?: () => unknown[]
  getCcRecipients?: () => unknown[]
  getBccRecipients?: () => unknown[]
  setToRecipients?: (addrs: string[]) => void
  setCcRecipients?: (addrs: string[]) => void
  setBccRecipients?: (addrs: string[]) => void
  getSubject?: () => string
  getThreadID?: () => string | null
  getThreadIDAsync?: () => Promise<string | null>
  send?: (opts?: { sendAndArchive?: boolean }) => void
  close?: () => void
}

interface SentEventPayload {
  messageID?: string
  threadID?: string
}

function buildStatusBarHtml(): string {
  // Single button + active-state summary. The full options live in a
  // popover anchored to the button so the compose bar stays quiet.
  return `
    <div class="mf-bar" style="position:relative;display:flex;align-items:center;gap:10px;width:100%;">
      <button class="mf-options" type="button" title="MailFalcon tracking options" style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border:1px solid #c4d0e3;background:#fff;border-radius:4px;cursor:pointer;font:inherit;color:#264168;line-height:1.2;">
        <img class="mf-options-icon" alt="" width="14" height="14" style="display:block;border-radius:2px;">
        <span style="font-weight:600;">MailFalcon</span>
        <span style="opacity:0.55;font-size:10px;">▾</span>
      </button>
      <span class="mf-summary" style="font-size:11px;color:#6886b1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;"></span>

      <div class="mf-popover" style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;min-width:260px;max-width:320px;background:#fff;border:1px solid #c4d0e3;border-radius:6px;box-shadow:0 8px 24px rgba(15,26,46,0.12);padding:12px 14px;z-index:9999;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
            <input type="checkbox" class="mf-priv" style="margin:0;">
            <span><strong>Privacy mode</strong> — skip tracking</span>
          </label>

          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;" title="Sends a separate copy to each recipient with their own tracking pixel. Recipients won't see each other in the To field — but you get accurate per-recipient opens AND clicks.">
            <input type="checkbox" class="mf-merge" style="margin:0;">
            <span><strong>Mail-merge</strong> — separate copy per recipient</span>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span style="font-weight:500;">Template</span>
            <select class="mf-tpl" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:3px 6px;width:100%;">
              <option value="">— pick one —</option>
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span style="font-weight:500;">Remind me if no opens in</span>
            <select class="mf-rem" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:3px 6px;width:100%;">
              <option value="">no reminder</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span style="font-weight:500;">Send</span>
            <select class="mf-sch" style="font:inherit;color:inherit;border:1px solid #c4d0e3;background:#fff;border-radius:3px;padding:3px 6px;width:100%;">
              <option value="now">now</option>
              <option value="in-1h">in 1 hour</option>
              <option value="in-3h">in 3 hours</option>
              <option value="tomorrow-9am">tomorrow 9am</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  `
}

async function populateTemplateSelect(
  select: HTMLSelectElement,
): Promise<Template[]> {
  let list: Template[] = []
  try {
    list = await listTemplates()
  } catch {
    return []
  }
  if (list.length === 0) {
    select.innerHTML = '<option value="">no templates — make some at app.mailfalcon.app/templates</option>'
    select.disabled = true
    return []
  }
  select.innerHTML = '<option value="">— pick one —</option>'
  // Show personal templates first, then workspace-shared ones grouped
  // by workspace name. Workspace templates get a "[team]" prefix so
  // the picker makes the source obvious.
  const personal = list.filter((t) => t.scope === 'personal')
  const workspaceTpls = list.filter((t) => t.scope === 'workspace')
  for (const t of personal) {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = t.name
    select.appendChild(opt)
  }
  for (const t of workspaceTpls) {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = `[team${t.workspaceName ? ' · ' + t.workspaceName : ''}] ${t.name}`
    select.appendChild(opt)
  }
  return list
}

const reentered = new WeakSet<object>()
// Views that we opened programmatically (mail-merge dispatch + scheduled
// sends). For these we skip our presend mint pipeline entirely — the
// body either already has tracking baked in or, in the scheduled case,
// is being re-sent as a normal compose that re-runs the full flow.
const programmaticPassthrough = new WeakSet<object>()

interface MessageView {
  getMessageID?: () => string
  getMessageIDAsync?: () => Promise<string>
  getSender?: () => { emailAddress?: string; name?: string } | null
  getBodyElement?: () => HTMLElement | null
  getViewElement?: () => HTMLElement | null
  getElement?: () => HTMLElement | null
}

interface ThreadRowView {
  getThreadID?: () => string | null
  getThreadIDAsync?: () => Promise<string | null>
  addLabel?: (opts: {
    title: string
    iconUrl?: string
    foregroundColor?: string
    backgroundColor?: string
  }) => void
  on?: (event: string, cb: () => void) => void
}

interface ThreadView {
  // Both deprecated in newer InboxSDK; we use Async at call sites.
  getThreadID?: () => string | null
  getThreadIDAsync?: () => Promise<string | null>
  /** Messages currently mounted in this thread view. Does NOT include
   *  collapsed historical messages — getMessageViewsAll() for those. */
  getMessageViews?: () => MessageView[]
  getMessageViewsAll?: () => Promise<MessageView[]>
  on: (event: string, cb: (e: unknown) => void) => void
}

export class InboxSdkGmailAdapter implements GmailAdapter {
  private sdk: unknown = null
  private presendingHandlers: Array<(event: ComposeEvent) => Promise<void> | void> = []
  private incomingMessageHandlers: Array<(candidate: ReplyCandidate) => void> = []
  private messageDecorateHandlers: Array<(msg: MessageDecorate) => void> = []

  async load(): Promise<void> {
    const load = (InboxSDK as unknown as {
      load: (v: number, id: string, opts?: unknown) => Promise<unknown>
    }).load
    this.sdk = await load(2, config.inboxSdkAppId, {
      suppressAddonTitle: 'mailfalcon',
    })

    const sdk = this.sdk as {
      Compose: {
        registerComposeViewHandler: (cb: (view: unknown) => void) => void
      }
      Conversations?: {
        registerThreadViewHandler: (cb: (view: ThreadView) => void) => void
        registerMessageViewHandler?: (cb: (view: MessageView) => void) => void
      }
      Lists?: {
        registerThreadRowViewHandler?: (
          cb: (rowView: ThreadRowView) => void,
        ) => void
      }
    }

    this.attachReplyDetection(sdk.Conversations)
    this.attachSentListIndicators(sdk.Lists)

    sdk.Compose.registerComposeViewHandler((rawView) => {
      const view = rawView as ComposeView

      let privacyMode = false
      let mailMerge = false
      let remindAfterDays: number | null = null
      let scheduledAt: number | null = null
      let consumedWithoutSend = false
      let templates: Template[] = []
      // Pre-fetch the threadID once (replaces deprecated sync getThreadID).
      let cachedThreadId: string | null = null
      void (async () => {
        try {
          if (view.getThreadIDAsync) {
            cachedThreadId = await view.getThreadIDAsync()
          } else if (view.getThreadID) {
            cachedThreadId = view.getThreadID()
          }
        } catch {
          cachedThreadId = null
        }
      })()

      try {
        const bar = view.addStatusBar?.({ height: 32, orderHint: 0 })
        if (bar?.el) {
          bar.el.style.cssText =
            'background:#f5f7fa;border-top:1px solid #e3e9f2;display:flex;align-items:center;padding:0 12px;font:12px ui-sans-serif,system-ui,sans-serif;color:#264168;box-sizing:border-box;overflow:visible;'
          bar.el.innerHTML = buildStatusBarHtml()

          const optionsBtn = bar.el.querySelector('.mf-options') as HTMLButtonElement | null
          const optionsIcon = bar.el.querySelector('.mf-options-icon') as HTMLImageElement | null
          if (optionsIcon && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            optionsIcon.src = chrome.runtime.getURL('icon/32.png')
          }

          // First-send tour: spotlight the MailFalcon button once for
          // brand-new users to surface what we do without forcing them
          // through a modal.
          void (async () => {
            try {
              const seen = await hasSeenFirstSendTour()
              if (seen || !optionsBtn) return
              const tip = document.createElement('div')
              tip.style.cssText =
                'position:absolute;bottom:calc(100% + 8px);left:0;background:#0f1a2e;color:#fff;padding:8px 12px;border-radius:6px;font-size:11px;font-weight:500;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;pointer-events:auto;'
              tip.innerHTML = `<span>First time? Hit Send — we'll track opens + clicks.</span> <button type="button" style="background:none;border:none;color:#9bc6ff;cursor:pointer;font:inherit;margin-left:6px;padding:0;">Got it</button>`
              optionsBtn.style.boxShadow =
                '0 0 0 3px rgba(59,108,183,0.25)'
              const wrap = optionsBtn.parentElement
              if (wrap && getComputedStyle(wrap).position === 'static') {
                wrap.style.position = 'relative'
              }
              ;(wrap ?? optionsBtn).appendChild(tip)
              const dismiss = (): void => {
                tip.remove()
                optionsBtn.style.boxShadow = ''
                void markFirstSendTourSeen()
              }
              tip.querySelector('button')?.addEventListener('click', dismiss)
              // Also dismiss on first send.
              view.on('sent', () => dismiss())
            } catch {
              /* tour is best-effort */
            }
          })()
          const popover = bar.el.querySelector('.mf-popover') as HTMLElement | null
          const summaryEl = bar.el.querySelector('.mf-summary') as HTMLElement | null
          const privCb = bar.el.querySelector('.mf-priv') as HTMLInputElement | null
          const mergeCb = bar.el.querySelector('.mf-merge') as HTMLInputElement | null
          const tplSelect = bar.el.querySelector('.mf-tpl') as HTMLSelectElement | null
          const remSelect = bar.el.querySelector('.mf-rem') as HTMLSelectElement | null
          const schSelect = bar.el.querySelector('.mf-sch') as HTMLSelectElement | null

          // Active-state summary shown next to the button. Surfaces only
          // the non-default values, so a default compose stays quiet.
          const updateSummary = (): void => {
            if (!summaryEl) return
            const parts: string[] = []
            if (privacyMode) parts.push('Privacy on')
            if (mailMerge) parts.push('Mail-merge')
            if (remindAfterDays !== null) {
              parts.push(`Remind ${remindAfterDays}d`)
            }
            if (scheduledAt !== null) {
              const ms = scheduledAt - Date.now()
              if (ms < 86_400_000) {
                parts.push(`Send in ${Math.round(ms / 3_600_000) || 1}h`)
              } else {
                parts.push('Send tomorrow')
              }
            }
            summaryEl.textContent = parts.join(' · ')
          }

          // Popover open/close + outside-click dismiss.
          if (optionsBtn && popover) {
            const close = (): void => {
              popover.style.display = 'none'
              document.removeEventListener('mousedown', onDocClick, true)
            }
            const onDocClick = (e: MouseEvent): void => {
              if (!popover.contains(e.target as Node) && e.target !== optionsBtn) {
                close()
              }
            }
            optionsBtn.addEventListener('click', (e) => {
              e.preventDefault()
              if (popover.style.display === 'block') {
                close()
              } else {
                popover.style.display = 'block'
                // Defer registration so this click itself doesn't fire the
                // outside-click closer.
                setTimeout(() => {
                  document.addEventListener('mousedown', onDocClick, true)
                }, 0)
              }
            })
          }

          privCb?.addEventListener('change', () => {
            privacyMode = !!privCb.checked
            updateSummary()
          })

          mergeCb?.addEventListener('change', () => {
            mailMerge = !!mergeCb.checked
            updateSummary()
          })

          if (tplSelect) {
            void populateTemplateSelect(tplSelect).then((list) => {
              templates = list
            })
            tplSelect.addEventListener('change', () => {
              const t = templates.find((x) => x.id === tplSelect.value)
              if (!t) return

              // Leave {{name}} / {{first_name}} / {{company}} LITERAL
              // here — prepareTrackedBody substitutes at presend so
              // each mail-merge variant gets its own value. For
              // single-recipient sends the substitution still happens,
              // just at send time.
              if (t.subject && (!view.getSubject?.() || view.getSubject?.().length === 0)) {
                view.setSubject?.(t.subject)
              }
              const cursorInsert = view.insertHTMLIntoBodyAtCursor
              if (cursorInsert) {
                cursorInsert.call(view, t.bodyHtml)
              } else {
                const existing = view.getHTMLContent?.() ?? ''
                view.setBodyHTML?.(existing + t.bodyHtml)
              }
              tplSelect.value = ''
            })
          }

          remSelect?.addEventListener('change', () => {
            const v = Number.parseInt(remSelect.value, 10)
            remindAfterDays = Number.isFinite(v) && v > 0 ? v : null
            updateSummary()
          })

          schSelect?.addEventListener('change', () => {
            const v = schSelect.value
            if (v === 'now' || !v) {
              scheduledAt = null
            } else if (
              v === 'in-1h' ||
              v === 'in-3h' ||
              v === 'tomorrow-9am'
            ) {
              scheduledAt = presetToEpoch(v)
            }
            updateSummary()
          })
        }
      } catch (err) {
        console.warn('[mailfalcon] could not attach status bar:', err)
      }

      view.on('presending', async (rawEvent) => {
        // Programmatic mail-merge sends already have tracking baked in;
        // let Gmail send unmodified without our mint interception.
        if (programmaticPassthrough.has(view)) return

        if (reentered.has(view)) return

        const sdkEvent = rawEvent as { cancel: () => void }
        sdkEvent.cancel()

        const sentCallbacks: Array<
          (info: { messageId: string; threadId: string }) => void
        > = []

        // Register the sent listener once per compose; it fires after
        // Gmail confirms the actual send (which is after our reentered
        // dispatch).
        view.on('sent', (raw) => {
          const payload = raw as SentEventPayload
          if (!payload.messageID || !payload.threadID) return
          for (const cb of sentCallbacks) {
            try {
              cb({ messageId: payload.messageID, threadId: payload.threadID })
            } catch {
              /* ignore */
            }
          }
        })

        const wrapper: ComposeEvent = {
          getHtmlBody: () => view.getHTMLContent?.() ?? '',
          setHtmlBody: (html) => {
            view.setBodyHTML?.(html)
          },
          setSubject: (s) => {
            view.setSubject?.(s)
          },
          getRecipientCount: () => {
            const to = view.getToRecipients?.() ?? []
            const cc = view.getCcRecipients?.() ?? []
            const bcc = view.getBccRecipients?.() ?? []
            return to.length + cc.length + bcc.length
          },
          getRecipients: () => {
            const to = view.getToRecipients?.() ?? []
            const cc = view.getCcRecipients?.() ?? []
            const bcc = view.getBccRecipients?.() ?? []
            return [...toHandles(to), ...toHandles(cc), ...toHandles(bcc)]
          },
          getSubject: () => view.getSubject?.() ?? '',
          isPrivacyMode: () => privacyMode,
          // Privacy mode disables the reminder — no events = no way to
          // know whether to fire it.
          getRemindAfterDays: () => (privacyMode ? null : remindAfterDays),
          getThreadId: () => (privacyMode ? null : cachedThreadId),
          onSent: (cb) => {
            if (!privacyMode) sentCallbacks.push(cb)
          },
          getScheduledAt: () => scheduledAt,
          isMailMerge: () => mailMerge,
          close: () => {
            consumedWithoutSend = true
            view.close?.()
          },
          cancel: () => sdkEvent.cancel(),
        }

        try {
          for (const handler of this.presendingHandlers) {
            await handler(wrapper)
          }
        } catch (err) {
          console.warn('[mailfalcon] presending handler threw:', err)
        }

        reentered.add(view)
        if (consumedWithoutSend) return
        try {
          view.send?.()
        } catch (err) {
          console.error('[mailfalcon] programmatic send failed:', err)
        }
      })
    })
  }

  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void {
    this.presendingHandlers.push(handler)
  }

  onIncomingMessage(handler: (candidate: ReplyCandidate) => void): void {
    this.incomingMessageHandlers.push(handler)
  }

  onMessageDecorate(handler: (msg: MessageDecorate) => void): void {
    this.messageDecorateHandlers.push(handler)
  }

  async fireProgrammaticSend(spec: ProgrammaticCompose): Promise<void> {
    const view = await this.openProgrammaticCompose(spec)
    // Scheduled sends should run the FULL presend pipeline so they get
    // a fresh tracking row. Don't mark as passthrough.
    await new Promise((r) => setTimeout(r, 250))
    view.send?.()
  }

  async dispatchPrebakedSend(spec: ProgrammaticCompose): Promise<void> {
    const view = await this.openProgrammaticCompose(spec)
    programmaticPassthrough.add(view as object)
    await new Promise((r) => setTimeout(r, 250))
    view.send?.()
  }

  private async openProgrammaticCompose(
    spec: ProgrammaticCompose,
  ): Promise<ComposeView> {
    const sdk = this.sdk as {
      Compose?: {
        openNewComposeView?: () => Promise<ComposeView>
      }
    }
    if (!sdk.Compose?.openNewComposeView) {
      throw new Error('InboxSDK Compose.openNewComposeView unavailable')
    }
    const view = await sdk.Compose.openNewComposeView()
    if (spec.to.length > 0) view.setToRecipients?.(spec.to)
    if (spec.cc.length > 0) view.setCcRecipients?.(spec.cc)
    if (spec.bcc.length > 0) view.setBccRecipients?.(spec.bcc)
    if (spec.subject.length > 0) view.setSubject?.(spec.subject)
    view.setBodyHTML?.(spec.bodyHtml)
    return view
  }

  private attachSentListIndicators(
    lists: {
      registerThreadRowViewHandler?: (
        cb: (rowView: ThreadRowView) => void,
      ) => void
    } | undefined,
  ): void {
    if (!lists?.registerThreadRowViewHandler) return

    // Cache live for 60s so re-renders of the same row (Gmail
    // virtualizes the list while you scroll) don't re-fetch.
    type CacheEntry = { summary: TrackingSummary | null; expiresAt: number }
    const cache = new Map<string, CacheEntry>()
    const CACHE_TTL_MS = 60_000

    let pending: Map<string, ThreadRowView[]> = new Map()
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const FLUSH_DELAY_MS = 250

    const decorate = (row: ThreadRowView, summary: TrackingSummary | null): void => {
      if (!summary || !row.addLabel) return
      const opens = summary.humanOpens
      const clicks = summary.clicks
      const replies = summary.replies
      const total = opens + clicks + replies
      const parts: string[] = []
      if (opens > 0) parts.push(`${opens} open${opens === 1 ? '' : 's'}`)
      if (clicks > 0) parts.push(`${clicks} click${clicks === 1 ? '' : 's'}`)
      if (replies > 0) parts.push(`${replies} repl${replies === 1 ? 'y' : 'ies'}`)
      const title = total === 0 ? '✓ tracked' : parts.join(' · ')
      row.addLabel({
        title,
        foregroundColor: '#065f46',
        backgroundColor: '#d1fae5',
      })
    }

    const flush = (): void => {
      flushTimer = null
      const batch = pending
      pending = new Map()
      if (batch.size === 0) return

      const threadIds = [...batch.keys()].slice(0, 50)
      void lookupTrackingByThreads(threadIds)
        .then((tracking) => {
          const now = Date.now()
          for (const threadId of threadIds) {
            const summary = tracking[threadId] ?? null
            cache.set(threadId, {
              summary,
              expiresAt: now + CACHE_TTL_MS,
            })
            const rows = batch.get(threadId) ?? []
            for (const row of rows) decorate(row, summary)
          }
        })
        .catch(() => {
          // Best-effort. If the lookup fails the rows just don't get
          // decorated — Gmail still works fine.
        })
    }

    const schedule = (threadId: string, row: ThreadRowView): void => {
      const list = pending.get(threadId) ?? []
      list.push(row)
      pending.set(threadId, list)
      if (flushTimer == null) {
        flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
      }
    }

    lists.registerThreadRowViewHandler((rowView) => {
      // Only run inside the Sent folder. Heuristic via URL — InboxSDK
      // doesn't expose a clean "is sent folder" predicate.
      if (!/\/sent\b/.test(window.location.hash || window.location.pathname)) {
        return
      }

      void (async () => {
        let threadId: string | null = null
        try {
          if (rowView.getThreadIDAsync) {
            threadId = await rowView.getThreadIDAsync()
          } else {
            threadId = rowView.getThreadID?.() ?? null
          }
        } catch {
          threadId = null
        }
        if (!threadId) return

        const cached = cache.get(threadId)
        if (cached && cached.expiresAt > Date.now()) {
          decorate(rowView, cached.summary)
          return
        }
        schedule(threadId, rowView)
      })()
    })
  }

  private attachReplyDetection(
    conversations: {
      registerThreadViewHandler: (cb: (view: ThreadView) => void) => void
    } | undefined,
  ): void {
    if (!conversations?.registerThreadViewHandler) return
    // Already-seen message IDs within this tab session — InboxSDK's
    // messageAdded can re-fire when the thread view re-renders. Dedup
    // here so we don't spam /v1/replies.
    const seen = new Set<string>()

    conversations.registerThreadViewHandler((threadView) => {
      // Kick off the async fetch once per thread view. getThreadID()
      // (sync) is deprecated, getThreadIDAsync() is the supported call.
      // We hold the promise in a closure so the messageAdded handler
      // awaits it (resolving instantly after the first round-trip).
      const threadIdPromise: Promise<string | null> = (async () => {
        if (threadView.getThreadIDAsync) {
          try {
            return await threadView.getThreadIDAsync()
          } catch {
            return null
          }
        }
        return threadView.getThreadID?.() ?? null
      })()

      // Dedupe per-purpose: replies fire once per inbound message; the
      // decorator fires once per (messageId, viewElement) so re-opening
      // a thread re-decorates after Gmail tears down the DOM.
      const decorated = new WeakSet<HTMLElement>()

      const processMessage = (view: MessageView, source: string): void => {
        void (async () => {
          const threadId = await threadIdPromise
          if (!threadId) return

          const messageId = view.getMessageIDAsync
            ? await view.getMessageIDAsync().catch(() => null)
            : view.getMessageID?.()
          if (!messageId) return

          const sender = view.getSender?.() ?? null
          const senderAddress = sender?.emailAddress ?? null
          const senderName = sender?.name ?? null
          const viewElement =
            view.getElement?.() ?? view.getViewElement?.() ?? null

          // Reply-detection path (tracked-thread only, deduped by
          // messageId across the tab session). Only runs from the
          // messageAdded event — initial-render messages are NOT replies.
          if (source === 'messageAdded' && !seen.has(messageId)) {
            seen.add(messageId)
            const bodyText = (view.getBodyElement?.()?.textContent ?? '').slice(
              0,
              400,
            )
            for (const handler of this.incomingMessageHandlers) {
              try {
                handler({
                  threadId,
                  gmailMessageId: messageId,
                  senderAddress,
                  bodyPreview: bodyText,
                })
              } catch {
                /* ignore */
              }
            }
          }

          if (viewElement && !decorated.has(viewElement)) {
            decorated.add(viewElement)
            for (const handler of this.messageDecorateHandlers) {
              try {
                handler({
                  threadId,
                  messageId,
                  senderName,
                  senderAddress,
                  viewElement,
                })
              } catch {
                /* ignore */
              }
            }
          }
        })()
      }

      // Existing messages on thread open. InboxSDK fires messageAdded
      // only for NEW messages added during this thread session (e.g. a
      // reply landing while open) — initial-render messages need a
      // direct enumeration.
      let initial: MessageView[] = []
      try {
        initial = threadView.getMessageViews?.() ?? []
      } catch {
        /* unsupported on this InboxSDK build */
      }
      for (const view of initial) {
        processMessage(view, 'initial')
      }

      // Some InboxSDK versions only populate getMessageViews after a
      // small delay — getMessageViewsAll is the resolved-promise variant.
      if (initial.length === 0 && threadView.getMessageViewsAll) {
        threadView
          .getMessageViewsAll()
          .then((all) => {
            for (const view of all) processMessage(view, 'all')
          })
          .catch(() => undefined)
      }

      threadView.on('messageAdded', (raw) => {
        const view = (raw as { messageView?: MessageView }).messageView
        if (!view) return
        processMessage(view, 'messageAdded')
      })
    })
  }
}
