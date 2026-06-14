import { clickUrl, pixelUrl } from '@mailfalcon/shared'

export interface InjectResult {
  html: string
  linkCount: number
  originalLinks: string[]
}

export function injectTrackingArtifacts(
  html: string,
  id: string,
  sig: string,
  host: string,
): InjectResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  const originalLinks: string[] = []
  const anchors = body.querySelectorAll('a[href]')
  anchors.forEach((a) => {
    const original = a.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(original)) return
    const idx = originalLinks.length
    originalLinks.push(original)
    a.setAttribute('href', clickUrl(id, idx, sig, host))
    a.setAttribute('data-mfk-orig', original)
  })

  const img = doc.createElement('img')
  img.setAttribute('src', pixelUrl(id, sig, host))
  img.setAttribute('width', '1')
  img.setAttribute('height', '1')
  img.setAttribute('alt', '')
  img.setAttribute('style', 'border:0;display:block;height:1px;width:1px;')
  body.appendChild(img)

  return {
    html: body.innerHTML,
    linkCount: originalLinks.length,
    originalLinks,
  }
}
