/**
 * Premium email template system for Mail Falcon.
 * Designed for flawless rendering across Gmail (Web, iOS, Android), Apple Mail,
 * Outlook, and dark/light modes.
 */

export interface EmailShellOptions {
  preheader?: string
  badge?: {
    text: string
    bg?: string
    fg?: string
  }
  title?: string
  subtitle?: string
  bodyHtml: string
  footerNote?: string
  webUrl?: string
}

export function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '&') return '&amp;'
    if (c === '"') return '&quot;'
    if (c === "'") return '&#39;'
    return c
  })
}

export function renderButton(
  text: string,
  url: string,
  style: 'primary' | 'secondary' | 'danger' = 'primary',
): string {
  const bg =
    style === 'danger'
      ? '#ef4444'
      : style === 'secondary'
        ? '#1e293b'
        : '#00d4ff'
  const fg =
    style === 'primary' ? '#070c18' : '#ffffff'
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0 12px;">
      <tr>
        <td align="left" style="border-radius: 8px; background: ${bg};">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 26px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: ${fg}; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em; line-height: 1.2;">
            ${escapeHtml(text)} &rarr;
          </a>
        </td>
      </tr>
    </table>
  `
}

export function renderCodeBox(
  code: string,
  options: {
    label?: string
    expiryMinutes?: number
    isDanger?: boolean
  } = {},
): string {
  const label = options.label ?? 'SINGLE-USE VERIFICATION CODE'
  const expiry = options.expiryMinutes ?? 15
  const accentColor = options.isDanger ? '#f87171' : '#00d4ff'
  const glowBorder = options.isDanger ? '#7f1d1d' : '#0369a1'
  const bg = '#060a14'

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0; background: ${bg}; border: 1px solid ${glowBorder}; border-radius: 14px; overflow: hidden;">
      <tr>
        <td style="padding: 24px 20px; text-align: center;">
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 12px;">
            ${escapeHtml(label)}
          </div>
          <div style="font-family: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace; font-size: 38px; font-weight: 800; color: ${accentColor}; letter-spacing: 0.26em; padding-left: 0.26em; line-height: 1.1; margin: 4px 0 12px;">
            ${escapeHtml(code)}
          </div>
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #94a3b8;">
            &#9201; Expires in ${expiry} minutes &middot; Do not share this code
          </div>
        </td>
      </tr>
    </table>
  `
}

export function renderAlertBox(
  contentHtml: string,
  type: 'info' | 'warning' | 'danger' = 'info',
): string {
  const bg =
    type === 'danger'
      ? '#450a0a'
      : type === 'warning'
        ? '#451a03'
        : '#082f49'
  const border =
    type === 'danger'
      ? '#7f1d1d'
      : type === 'warning'
        ? '#78350f'
        : '#0369a1'
  const color =
    type === 'danger'
      ? '#fca5a5'
      : type === 'warning'
        ? '#fde68a'
        : '#7dd3fc'

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0; background: ${bg}; border: 1px solid ${border}; border-radius: 10px;">
      <tr>
        <td style="padding: 14px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; color: ${color};">
          ${contentHtml}
        </td>
      </tr>
    </table>
  `
}

export function renderEmailShell(opts: EmailShellOptions): string {
  const webUrl = opts.webUrl ?? 'https://mailfalcon.app'
  const badgeHtml = opts.badge
    ? `<span style="display: inline-block; background: ${opts.badge.bg ?? '#0f2744'}; color: ${opts.badge.fg ?? '#38bdf8'}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 10px; border-radius: 20px; vertical-align: middle; border: 1px solid rgba(56, 189, 248, 0.2);">${escapeHtml(opts.badge.text)}</span>`
    : ''

  const preheaderHtml = opts.preheader
    ? `<div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #070c18; opacity: 0;">
        ${escapeHtml(opts.preheader)}
        &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
      </div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(opts.title ?? 'Mail Falcon')}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #070c18 !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .email-card { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .email-content { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070c18; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #e2e8f0;">
  ${preheaderHtml}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #070c18; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table class="email-card" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 540px; background-color: #0d172e; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 32px 20px; border-bottom: 1px solid #1e293b; background-color: #0d172e;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <a href="${webUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
                      <img src="${webUrl}/falcon.png" alt="Mail Falcon" width="34" height="34" style="width: 34px; height: 34px; border-radius: 8px; display: inline-block; vertical-align: middle;" />
                      <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; vertical-align: middle; margin-left: 8px;">Mail Falcon</span>
                    </a>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    ${badgeHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td class="email-content" style="padding: 32px 32px 28px; background-color: #0d172e;">
              ${
                opts.title
                  ? `<h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; line-height: 1.25;">${escapeHtml(opts.title)}</h1>`
                  : ''
              }
              ${
                opts.subtitle
                  ? `<p style="margin: 0 0 20px; font-size: 14px; color: #94a3b8; line-height: 1.6;">${opts.subtitle}</p>`
                  : ''
              }
              ${opts.bodyHtml}
            </td>
          </tr>

          <!-- Footer Note Area (optional) -->
          ${
            opts.footerNote
              ? `<tr>
                  <td style="padding: 0 32px 24px; background-color: #0d172e;">
                    <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6;">${opts.footerNote}</p>
                  </td>
                </tr>`
              : ''
          }

        </table>

        <!-- External Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 540px; margin-top: 20px; text-align: center;">
          <tr>
            <td style="padding: 0 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #64748b; line-height: 1.6;">
              <p style="margin: 0 0 6px; font-weight: 500; color: #94a3b8;">
                Mail Falcon &middot; Real-time email tracking for Gmail
              </p>
              <p style="margin: 0;">
                <a href="${webUrl}/dashboard" style="color: #64748b; text-decoration: underline; margin: 0 4px;">Dashboard</a> &middot;
                <a href="${webUrl}/settings" style="color: #64748b; text-decoration: underline; margin: 0 4px;">Settings</a> &middot;
                <a href="${webUrl}/privacy" style="color: #64748b; text-decoration: underline; margin: 0 4px;">Privacy</a> &middot;
                <a href="mailto:hello@mailfalcon.app" style="color: #64748b; text-decoration: underline; margin: 0 4px;">Help</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
