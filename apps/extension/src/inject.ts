import { clickUrl, pixelUrl } from '@mailfalcon/shared'

export interface RecipientHandle {
  address: string
  name?: string
}

export interface PrepareResult {
  html: string
  id: string
  sig: string
  linkCount: number
  originalLinks: string[]
  pixelCount: number
}

export interface MintRecipientInput {
  hashedAddr: string
  displayLabel?: string
}

export interface MintRecipientPixel {
  recipientId: string
  displayLabel: string | null
  sig: string
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
  }>
}

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
  // Local-part is short and matches what Gmail itself shows.
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

export async function prepareTrackedBody(args: {
  html: string
  recipientCount: number
  subject?: string
  recipients?: RecipientHandle[]
  remindAfterDays?: number
  threadId?: string
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
    trackerHost,
    mint,
  } = args

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  linkifyTextNodes(body)

  const linkRefs: Array<{ el: Element; originalUrl: string }> = []
  body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) return
    linkRefs.push({ el: a, originalUrl: href })
  })

  const originalLinks = linkRefs.map((r) => r.originalUrl)

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

  const { id, sig, recipientPixels } = await mint({
    recipientCount,
    links: originalLinks,
    subject,
    ...(recipientInputs.length > 0 ? { recipients: recipientInputs } : {}),
    ...(remindAfterDays ? { remindAfterDays } : {}),
    ...(threadId ? { threadId } : {}),
  })

  linkRefs.forEach(({ el, originalUrl }, idx) => {
    el.setAttribute('href', clickUrl(id, idx, sig, trackerHost))
    el.setAttribute('data-mfk-orig', originalUrl)
  })

  // Pixel placement: emit one per recipient if the server returned
  // per-recipient sigs, else fall back to one shared pixel (legacy
  // behavior so a partial rollout still works).
  let pixelCount = 0
  if (recipientPixels && recipientPixels.length > 0) {
    for (const rp of recipientPixels) {
      body.appendChild(
        makePixelImg(doc, pixelUrl(id, rp.sig, trackerHost, rp.recipientId)),
      )
      pixelCount++
    }
  } else {
    body.appendChild(makePixelImg(doc, pixelUrl(id, sig, trackerHost)))
    pixelCount = 1
  }

  return {
    html: body.innerHTML,
    id,
    sig,
    linkCount: linkRefs.length,
    originalLinks,
    pixelCount,
  }
}
