import { clickUrl, pixelUrl } from '@mailfalcon/shared'

export interface PrepareResult {
  html: string
  id: string
  sig: string
  linkCount: number
  originalLinks: string[]
}

export interface MintFn {
  (req: {
    recipientCount: number
    links: string[]
    subject?: string
  }): Promise<{
    id: string
    sig: string
  }>
}

// http(s) URL pattern. Stops at whitespace and at trailing punctuation
// that's almost never part of a URL (sentence-ending . , ; ! ? ) ' " etc.).
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

// Walk text nodes and linkify any bare http(s) URLs we find. Gmail
// usually auto-links URLs on space/newline, but not always — and a user
// can paste a URL and hit Send before the linkify pass runs. Without
// this step those URLs go out unrewritten.
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

export async function prepareTrackedBody(args: {
  html: string
  recipientCount: number
  subject?: string
  trackerHost: string
  mint: MintFn
}): Promise<PrepareResult> {
  const { html, recipientCount, subject, trackerHost, mint } = args

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  // 1. Linkify bare http(s) URLs in text nodes so they end up in the
  //    rewrite pass below. Skips anchors/code blocks.
  linkifyTextNodes(body)

  // 2. Collect every <a href="http(s)://…"> in document order.
  const linkRefs: Array<{ el: Element; originalUrl: string }> = []
  body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) return
    linkRefs.push({ el: a, originalUrl: href })
  })

  const originalLinks = linkRefs.map((r) => r.originalUrl)

  const { id, sig } = await mint({
    recipientCount,
    links: originalLinks,
    subject,
  })

  // 3. Replace each href with our /c/:id/:idx redirect; remember the
  //    original on a data-* attr for debug.
  linkRefs.forEach(({ el, originalUrl }, idx) => {
    el.setAttribute('href', clickUrl(id, idx, sig, trackerHost))
    el.setAttribute('data-mfk-orig', originalUrl)
  })

  // 4. Drop the 1×1 pixel at the end of body.
  const img = doc.createElement('img')
  img.setAttribute('src', pixelUrl(id, sig, trackerHost))
  img.setAttribute('width', '1')
  img.setAttribute('height', '1')
  img.setAttribute('alt', '')
  img.setAttribute(
    'style',
    'border:0;display:block;height:1px;width:1px;',
  )
  body.appendChild(img)

  return {
    html: body.innerHTML,
    id,
    sig,
    linkCount: linkRefs.length,
    originalLinks,
  }
}
