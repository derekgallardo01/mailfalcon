import { clickUrl, pixelUrl } from '@mailfalcon/shared'
import { hasTemplateVars, substituteVars } from './template-vars'

export interface RecipientHandle {
  address: string
  name?: string
}

export interface MintRecipientInput {
  hashedAddr: string
  displayLabel?: string
}

export interface MintRecipientPixel {
  recipientId: string
  displayLabel: string | null
  sig: string
  clickSig: string
}

export interface MintFn {
  (req: {
    recipientCount: number
    links: string[]
    subject?: string
    recipients?: MintRecipientInput[]
    remindAfterDays?: number
    threadId?: string
  }): Promise<{
    id: string
    sig: string
    recipientPixels?: MintRecipientPixel[]
    /** Pixel + click host returned by the server. Lets the worker swap
     *  to a verified custom domain at mint time without the extension
     *  needing to know about it. */
    trackerHost?: string
  }>
}

/**
 * Output shape:
 *
 * - mode: 'single' — one body to send as-is. Single-recipient sends use
 *   a per-recipient pixel + click sig so attribution works. Multi-
 *   recipient shared-body sends emit ONE shared pixel and shared click
 *   sigs (no recipientId on events — accurate counts, no per-recipient
 *   attribution).
 *
 * - mode: 'merge' — N body variants, one per recipient. The caller is
 *   responsible for dispatching N programmatic Gmail sends. Each
 *   recipient gets their own pixel + click URLs scoped to them, so
 *   per-recipient open AND click attribution works.
 */
export interface SinglePrepareResult {
  mode: 'single'
  html: string
  id: string
  linkCount: number
  originalLinks: string[]
  pixelCount: number
}

export interface MergePrepareResult {
  mode: 'merge'
  variants: Array<{
    recipient: RecipientHandle
    html: string
  }>
  id: string
  linkCount: number
  originalLinks: string[]
  pixelCount: number
}

export type PrepareResult = SinglePrepareResult | MergePrepareResult

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"',.;!?)\]'`]/g
const SKIP_PARENT_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE'])

function isInsideSkippedParent(node: Node): boolean {
  let p: Node | null = node.parentNode
  while (p && p.nodeType === Node.ELEMENT_NODE) {
    const tag = (p as Element).tagName
    if (SKIP_PARENT_TAGS.has(tag)) return true
    p = p.parentNode
  }
  return false
}

function linkifyTextNodes(root: Element): void {
  const doc = root.ownerDocument
  if (!doc) return
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const candidates: Text[] = []
  let n: Node | null = walker.nextNode()
  while (n) {
    const t = n as Text
    if (!isInsideSkippedParent(t) && URL_REGEX.test(t.data)) {
      candidates.push(t)
    }
    URL_REGEX.lastIndex = 0
    n = walker.nextNode()
  }

  for (const text of candidates) {
    const parent = text.parentNode
    if (!parent) continue
    const data = text.data
    const frag = doc.createDocumentFragment()
    let last = 0
    URL_REGEX.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = URL_REGEX.exec(data)) !== null) {
      const start = m.index
      const url = m[0]
      if (start > last) frag.appendChild(doc.createTextNode(data.slice(last, start)))
      const a = doc.createElement('a')
      a.setAttribute('href', url)
      a.textContent = url
      frag.appendChild(a)
      last = start + url.length
    }
    if (last < data.length) frag.appendChild(doc.createTextNode(data.slice(last)))
    parent.replaceChild(frag, text)
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

function makeLabel(r: RecipientHandle): string {
  if (r.name && r.name.length > 0) return r.name
  const at = r.address.indexOf('@')
  return at > 0 ? r.address.slice(0, at) : r.address
}

function makePixelImg(doc: Document, src: string): HTMLImageElement {
  const img = doc.createElement('img')
  img.setAttribute('src', src)
  img.setAttribute('width', '1')
  img.setAttribute('height', '1')
  img.setAttribute('alt', '')
  img.setAttribute('style', 'border:0;display:block;height:1px;width:1px;')
  return img
}

interface LinkRef {
  el: Element
  originalUrl: string
}

function collectLinks(body: HTMLElement): LinkRef[] {
  const linkRefs: LinkRef[] = []
  body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) return
    linkRefs.push({ el: a, originalUrl: href })
  })
  return linkRefs
}

function applyTracking(
  doc: Document,
  body: HTMLElement,
  linkRefs: LinkRef[],
  args: {
    id: string
    pixelSig: string
    clickSig: string
    recipientId?: string
    trackerHost: string
  },
): void {
  linkRefs.forEach(({ el, originalUrl }, idx) => {
    el.setAttribute(
      'href',
      clickUrl(args.id, idx, args.clickSig, args.trackerHost, args.recipientId),
    )
    el.setAttribute('data-mfk-orig', originalUrl)
  })
  body.appendChild(
    makePixelImg(
      doc,
      pixelUrl(args.id, args.pixelSig, args.trackerHost, args.recipientId),
    ),
  )
}

export async function prepareTrackedBody(args: {
  html: string
  recipientCount: number
  subject?: string
  recipients?: RecipientHandle[]
  remindAfterDays?: number
  threadId?: string
  mailMerge?: boolean
  trackerHost: string
  mint: MintFn
}): Promise<PrepareResult> {
  const {
    html,
    recipientCount,
    subject,
    recipients,
    remindAfterDays,
    threadId,
    mailMerge,
    trackerHost,
    mint,
  } = args

  // First pass: linkify + collect links on a base document so we know
  // how many links there are. We re-parse from the original HTML for
  // each merge variant so each one has its own DOM.
  const baseParser = new DOMParser()
  const baseDoc = baseParser.parseFromString(`<body>${html}</body>`, 'text/html')
  linkifyTextNodes(baseDoc.body)
  const baseLinks = collectLinks(baseDoc.body)
  const originalLinks = baseLinks.map((r) => r.originalUrl)
  // We've linkified — re-serialize so subsequent variants start from
  // the linkified HTML (otherwise we'd have to redo the walker each
  // time).
  const linkifiedHtml = baseDoc.body.innerHTML

  const recipientInputs: MintRecipientInput[] = []
  if (recipients && recipients.length > 0) {
    for (const r of recipients) {
      const hashedAddr = await sha256Hex(r.address.toLowerCase())
      recipientInputs.push({
        hashedAddr,
        displayLabel: makeLabel(r),
      })
    }
  }

  const { id, sig, recipientPixels, trackerHost: mintedTrackerHost } = await mint({
    recipientCount,
    links: originalLinks,
    subject,
    ...(recipientInputs.length > 0 ? { recipients: recipientInputs } : {}),
    ...(remindAfterDays ? { remindAfterDays } : {}),
    ...(threadId ? { threadId } : {}),
  })

  // Template variable substitution happens here at presend, not at
  // template-insertion time. Reason: mail-merge needs the raw template
  // to substitute per-recipient. We keep {{name}}/{{first_name}}/
  // {{company}} literal in the compose body, then resolve against the
  // appropriate recipient just before tracking is applied.
  const sourceHasVars = hasTemplateVars(linkifiedHtml)

  const buildVariant = (
    recipient: RecipientHandle | null,
    recipientId?: string,
    pixelSig?: string,
    clickSig?: string,
  ): string => {
    const sourceHtml =
      sourceHasVars && recipient
        ? substituteVars(linkifiedHtml, recipient)
        : linkifiedHtml
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<body>${sourceHtml}</body>`, 'text/html')
    const variantBody = doc.body
    const variantLinks = collectLinks(variantBody)
    applyTracking(doc, variantBody, variantLinks, {
      id,
      pixelSig: pixelSig ?? sig,
      clickSig: clickSig ?? sig,
      ...(recipientId ? { recipientId } : {}),
      // Prefer the host the server returned (which respects the user's
      // verified custom domain). Falls back to the caller-supplied
      // default when the server didn't include it.
      trackerHost: mintedTrackerHost ?? trackerHost,
    })
    return variantBody.innerHTML
  }

  // Mail-merge path: one body per recipient with per-recipient sigs
  // AND per-recipient template-variable substitution.
  if (mailMerge && recipients && recipients.length > 1 && recipientPixels) {
    const variants = recipients.map((recipient, idx) => {
      const rp = recipientPixels[idx]
      if (!rp) {
        return { recipient, html: buildVariant(recipient) }
      }
      return {
        recipient,
        html: buildVariant(recipient, rp.recipientId, rp.sig, rp.clickSig),
      }
    })
    return {
      mode: 'merge',
      variants,
      id,
      linkCount: baseLinks.length,
      originalLinks,
      pixelCount: variants.length,
    }
  }

  // Single-recipient: use the recipient's own sigs so opens + clicks are
  // attributed to them. Substitution runs against that one recipient.
  if (recipientPixels && recipientPixels.length === 1) {
    const rp = recipientPixels[0]!
    const recipient = recipients?.[0] ?? null
    return {
      mode: 'single',
      html: buildVariant(recipient, rp.recipientId, rp.sig, rp.clickSig),
      id,
      linkCount: baseLinks.length,
      originalLinks,
      pixelCount: 1,
    }
  }

  // Multi-recipient shared-body (no mail-merge): one shared pixel, no
  // recipientId on events. Accurate counts, no per-recipient attribution.
  // Substitute against the FIRST recipient so {{name}} still resolves
  // for the typical "Hi Alice, +cc Bob" case.
  const firstRecipient = recipients?.[0] ?? null
  return {
    mode: 'single',
    html: buildVariant(firstRecipient),
    id,
    linkCount: baseLinks.length,
    originalLinks,
    pixelCount: 1,
  }
}
