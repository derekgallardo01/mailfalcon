import { clickUrl, pixelUrl } from '@mailfalcon/shared'

export interface PrepareResult {
  html: string
  id: string
  sig: string
  linkCount: number
}

export interface MintFn {
  (req: { recipientCount: number; links: string[] }): Promise<{
    id: string
    sig: string
  }>
}

export async function prepareTrackedBody(args: {
  html: string
  recipientCount: number
  trackerHost: string
  mint: MintFn
}): Promise<PrepareResult> {
  const { html, recipientCount, trackerHost, mint } = args

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  const linkRefs: Array<{ el: Element; originalUrl: string }> = []
  body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) return
    linkRefs.push({ el: a, originalUrl: href })
  })

  const { id, sig } = await mint({
    recipientCount,
    links: linkRefs.map((r) => r.originalUrl),
  })

  linkRefs.forEach(({ el, originalUrl }, idx) => {
    el.setAttribute('href', clickUrl(id, idx, sig, trackerHost))
    el.setAttribute('data-mfk-orig', originalUrl)
  })

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
  }
}
