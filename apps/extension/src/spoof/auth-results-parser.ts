export type AuthVerdict =
  | 'pass'
  | 'fail'
  | 'softfail'
  | 'neutral'
  | 'none'
  | 'temperror'
  | 'permerror'

export interface AuthResults {
  authority: string
  spf: AuthVerdict | null
  dkim: AuthVerdict | null
  dmarc: AuthVerdict | null
  /** The `header.from=` value if present — the domain the user sees in
   *  their inbox. */
  headerFrom: string | null
  /** The `header.i=` or `header.d=` from the DKIM signature — the
   *  domain that signed the message. */
  dkimDomain: string | null
}

const VERDICT_VALUES: ReadonlySet<AuthVerdict> = new Set<AuthVerdict>([
  'pass',
  'fail',
  'softfail',
  'neutral',
  'none',
  'temperror',
  'permerror',
])

/**
 * Parse an RFC 8601 Authentication-Results header. Returns null if the
 * authority is not `mx.google.com` (Gmail's MX) — we only trust the
 * verdict when Gmail itself stamped it.
 *
 * Example input (whitespace folded):
 *   mx.google.com;
 *     dkim=pass header.i=@stripe.com header.s=google header.b=abc;
 *     spf=pass (google.com: domain of foo@stripe.com ...) smtp.mailfrom=foo@stripe.com;
 *     dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=stripe.com
 */
export function parseAuthResults(raw: string): AuthResults | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length === 0) return null

  // Authority is everything up to the first semicolon (or first
  // whitespace if no semicolon). Strip a trailing version number like
  // ";i=1" Gmail sometimes inserts.
  const semi = collapsed.indexOf(';')
  if (semi < 0) return null
  const authority = collapsed.slice(0, semi).trim().split(/\s+/)[0]!.toLowerCase()
  if (authority !== 'mx.google.com') return null

  const body = collapsed.slice(semi + 1)
  // Split on ';' to get individual method results.
  const methods = body.split(';').map((s) => s.trim()).filter((s) => s.length > 0)

  let spf: AuthVerdict | null = null
  let dkim: AuthVerdict | null = null
  let dmarc: AuthVerdict | null = null
  let headerFrom: string | null = null
  let dkimDomain: string | null = null

  for (const method of methods) {
    // Each method is `name=verdict ...key=val...`. Pull the leading
    // token (with possible "/version" like `dkim/1`).
    const m = /^([a-z][a-z0-9-]*)(?:\/\d+)?\s*=\s*([a-z]+)\b/i.exec(method)
    if (!m) continue
    const name = m[1]!.toLowerCase()
    const verdict = m[2]!.toLowerCase() as AuthVerdict
    if (!VERDICT_VALUES.has(verdict)) continue

    if (name === 'spf') spf = verdict
    else if (name === 'dkim') {
      dkim = verdict
      const d = /header\.i=@?([^\s;]+)/i.exec(method) ?? /header\.d=([^\s;]+)/i.exec(method)
      if (d) dkimDomain = d[1]!.toLowerCase()
    } else if (name === 'dmarc') {
      dmarc = verdict
      const hf = /header\.from=([^\s;]+)/i.exec(method)
      if (hf) headerFrom = hf[1]!.toLowerCase()
    }
  }

  return { authority, spf, dkim, dmarc, headerFrom, dkimDomain }
}
