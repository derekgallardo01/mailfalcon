/**
 * Minimal RFC 5322 message builder for the Gmail API's users.messages.send
 * endpoint. Gmail wants the raw message base64url-encoded.
 *
 * Supports:
 *   - plain text + HTML alternative bodies (multipart/alternative)
 *   - To / Cc / Bcc address lists with display-name quoting
 *   - Subject / Reply-To / In-Reply-To / References for threading
 *
 * Attachments (multipart/mixed with base64 parts) are handled by a
 * later phase; this file stays focused on the common send case.
 */

export interface Rfc5322Message {
  fromAddress: string
  fromName?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  textBody?: string
  htmlBody: string
  /** Original Gmail message-id (RFC 5322 <...@mail.gmail.com>) being
   *  replied to. Sets In-Reply-To + is prepended to References. */
  inReplyTo?: string
  /** Prior References header from the source message, if any. */
  references?: string
  /** Optional attachments. Each part is base64-encoded standard (not
   *  base64url) with 76-char line wrapping per RFC 2045. */
  attachments?: Attachment[]
}

export interface Attachment {
  filename: string
  mimeType: string
  /** File contents as standard base64 (no URL-safe substitutions).
   *  Line-wrapping is applied at build time. */
  dataBase64: string
}

/**
 * Build an RFC 5322 message string, then base64url-encode it for the
 * Gmail API. The `raw` field returned goes verbatim into
 * gmail.users.messages.send{ raw }.
 */
export function buildRfc5322(msg: Rfc5322Message): string {
  const hasAttachments = msg.attachments && msg.attachments.length > 0
  const altBoundary = 'mfalt_' + Math.random().toString(36).slice(2)
  const mixedBoundary = hasAttachments
    ? 'mfmix_' + Math.random().toString(36).slice(2)
    : null

  const headers: string[] = []
  headers.push(`From: ${formatAddress(msg.fromAddress, msg.fromName)}`)
  headers.push(`To: ${msg.to.map((a) => formatAddress(a)).join(', ')}`)
  if (msg.cc && msg.cc.length > 0) {
    headers.push(`Cc: ${msg.cc.map((a) => formatAddress(a)).join(', ')}`)
  }
  if (msg.bcc && msg.bcc.length > 0) {
    headers.push(`Bcc: ${msg.bcc.map((a) => formatAddress(a)).join(', ')}`)
  }
  headers.push(`Subject: ${encodeHeaderValue(msg.subject)}`)
  headers.push('MIME-Version: 1.0')
  if (msg.inReplyTo) {
    headers.push(`In-Reply-To: ${msg.inReplyTo}`)
    const refs = msg.references
      ? `${msg.references} ${msg.inReplyTo}`
      : msg.inReplyTo
    headers.push(`References: ${refs}`)
  }

  const text = msg.textBody ?? htmlToText(msg.htmlBody)
  const altPart = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    msg.htmlBody,
    `--${altBoundary}--`,
  ].join('\r\n')

  if (!hasAttachments || !mixedBoundary) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
    return headers.join('\r\n') + '\r\n\r\n' + altPart + '\r\n'
  }

  // Attachments: wrap the multipart/alternative in a multipart/mixed
  // container. Standard MIME shape most mail clients render correctly.
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
  const mixedParts: string[] = []
  mixedParts.push(`--${mixedBoundary}`)
  mixedParts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
  mixedParts.push('')
  mixedParts.push(altPart)
  for (const att of msg.attachments!) {
    mixedParts.push(`--${mixedBoundary}`)
    mixedParts.push(`Content-Type: ${att.mimeType}; name="${encodeFilename(att.filename)}"`)
    mixedParts.push('Content-Transfer-Encoding: base64')
    mixedParts.push(
      `Content-Disposition: attachment; filename="${encodeFilename(att.filename)}"`,
    )
    mixedParts.push('')
    mixedParts.push(wrap76(att.dataBase64))
  }
  mixedParts.push(`--${mixedBoundary}--`)
  mixedParts.push('')

  return headers.join('\r\n') + '\r\n\r\n' + mixedParts.join('\r\n')
}

/** Wrap standard base64 at 76 chars per RFC 2045. */
function wrap76(b64: string): string {
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += 76) chunks.push(b64.slice(i, i + 76))
  return chunks.join('\r\n')
}

/** Escape quote chars in a filename so the Content-Disposition header
 *  stays parseable. Non-ASCII filenames get RFC 2047-encoded. */
function encodeFilename(name: string): string {
  const safe = name.replace(/["\\]/g, '_')
  if (/^[\x20-\x7e]*$/.test(safe)) return safe
  const b64 = btoa(unescape(encodeURIComponent(safe)))
  return `=?UTF-8?B?${b64}?=`
}

/**
 * Encode the RFC 5322 message as base64url per Gmail API spec. Standard
 * base64 with `+` → `-`, `/` → `_`, no padding.
 */
export function base64UrlEncodeRfc5322(msg: string): string {
  // UTF-8 → bytes → base64 (standard) → base64url tweaks.
  const utf8 = new TextEncoder().encode(msg)
  let binary = ''
  for (let i = 0; i < utf8.length; i++) binary += String.fromCharCode(utf8[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Quote a display name if it contains characters that would otherwise
 *  break RFC 5322 parsing. `From: "Alice \"Bob\" Cool" <a@x.com>`. */
function formatAddress(address: string, name?: string): string {
  if (!name) return address
  const safeName = name.includes(',') || name.includes('"') || name.includes('<')
    ? `"${name.replace(/"/g, '\\"')}"`
    : name
  return `${safeName} <${address}>`
}

/** Encode header values that contain non-ASCII per RFC 2047 (Q-encoding
 *  in UTF-8). Subject lines with emoji or accents need this or Gmail
 *  displays garbage. */
function encodeHeaderValue(value: string): string {
  // Fast path: pure ASCII.
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value
  const b64 = btoa(unescape(encodeURIComponent(value)))
  return `=?UTF-8?B?${b64}?=`
}

/** Very rough HTML → text fallback for the text/plain alternative part.
 *  Real HTML→text conversion is hard and we don't need perfection —
 *  most modern mail clients render the HTML part; the text part is
 *  fallback for terminal clients / accessibility. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
