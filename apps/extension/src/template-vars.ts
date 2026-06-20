/**
 * Pure substitution logic for template variables: {{name}},
 * {{first_name}}, {{company}}. No DOM dependency — runs equally
 * happily in the content script and the mail-merge variant generator.
 *
 * Design choices:
 * - Unknown {{tokens}} are LEFT ALONE so users notice mistypes
 *   (e.g. {{nmae}}) instead of getting a silently-empty string.
 * - HTML-escape every substituted value so a recipient name like
 *   `<script>alert(1)</script>` (stored DB-side by some other path)
 *   doesn't injection-attack into the compose body.
 * - {{first_name}} prefers the first whitespace-separated token of
 *   the display name; falls back to splitting the address local-part
 *   on `.` and title-casing the first token.
 * - {{company}} is derived from the email domain: strip a trailing
 *   public-suffix-ish chunk and title-case what remains.
 */

export interface RecipientCtx {
  name?: string
  address: string
}

const KNOWN_TOKENS = new Set([
  'name',
  'first_name',
  'firstname',
  'company',
])

const SUFFIX_CHUNKS = new Set([
  'com',
  'co',
  'io',
  'net',
  'org',
  'edu',
  'gov',
  'app',
  'dev',
  'ai',
  'so',
  'us',
  'me',
  'inc',
  'biz',
  'tech',
  'cloud',
])

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function titleCase(s: string): string {
  if (s.length === 0) return s
  return s[0]!.toUpperCase() + s.slice(1).toLowerCase()
}

function localPartName(address: string): string {
  const at = address.indexOf('@')
  const local = at > 0 ? address.slice(0, at) : address
  // "john.doe" → "John"; "alice_smith" → "Alice"; bare "bob" → "Bob"
  const first = local.split(/[._\-+]/)[0]!
  return titleCase(first)
}

function resolveName(ctx: RecipientCtx): string {
  if (ctx.name && ctx.name.trim().length > 0) return ctx.name.trim()
  return localPartName(ctx.address)
}

function resolveFirstName(ctx: RecipientCtx): string {
  if (ctx.name && ctx.name.trim().length > 0) {
    const first = ctx.name.trim().split(/\s+/)[0]!
    return first
  }
  return localPartName(ctx.address)
}

function resolveCompany(ctx: RecipientCtx): string {
  const at = ctx.address.indexOf('@')
  if (at < 0) return ''
  const domain = ctx.address.slice(at + 1).toLowerCase()
  const parts = domain.split('.').filter(Boolean)
  if (parts.length === 0) return ''
  // Strip public-suffix-ish trailing chunks until we hit something
  // that looks like a real org name. "hooli.research.org" → "hooli".
  // "stripe.com" → "stripe". "mail.google.com" → "google".
  while (parts.length > 1 && SUFFIX_CHUNKS.has(parts[parts.length - 1]!)) {
    parts.pop()
  }
  // For multi-segment like "research.hooli" after stripping, prefer
  // the second-to-last token (typical org-name position).
  const orgToken =
    parts.length >= 2 ? parts[parts.length - 1]! : parts[0]!
  return titleCase(orgToken)
}

/**
 * Substitute {{name}}, {{first_name}}, {{company}} in `text` using
 * `ctx`. Returns the text with each known token replaced by the
 * resolved + HTML-escaped value. Unknown tokens (e.g. {{nope}}) are
 * passed through untouched.
 *
 * Token matching is case-insensitive; `{{Name}}` and `{{NAME}}` both
 * resolve as `{{name}}`. Whitespace inside the braces is also tolerated
 * (`{{ name }}`) so users can type either form.
 */
export function substituteVars(text: string, ctx: RecipientCtx): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (whole, raw: string) => {
    const token = raw.toLowerCase()
    if (!KNOWN_TOKENS.has(token)) return whole

    let value = ''
    switch (token) {
      case 'name':
        value = resolveName(ctx)
        break
      case 'first_name':
      case 'firstname':
        value = resolveFirstName(ctx)
        break
      case 'company':
        value = resolveCompany(ctx)
        break
    }
    return escapeHtml(value)
  })
}

/** True iff `text` contains at least one recognized variable. Used by
 *  the compose path to skip substitution work when there's nothing
 *  to substitute. */
export function hasTemplateVars(text: string): boolean {
  const match = text.match(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)
  if (!match) return false
  return match.some((m) => {
    const inner = m.replace(/[{}\s]/g, '').toLowerCase()
    return KNOWN_TOKENS.has(inner)
  })
}
