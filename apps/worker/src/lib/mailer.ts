import {
  escapeHtml,
  renderAlertBox,
  renderButton,
  renderCodeBox,
  renderEmailShell,
} from './email-theme'

interface SendCodeArgs {
  email: string
  code: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string; PUBLIC_WEB_URL?: string }
}

function renderHtml(code: string, webUrl?: string): string {
  return renderEmailShell({
    webUrl,
    preheader: `Your verification code is ${code}. Valid for 15 minutes.`,
    badge: {
      text: 'Verification',
      bg: '#e0f2fe',
      fg: '#0369a1',
    },
    title: 'Your sign-in code',
    subtitle: 'Enter the 6-digit code below to sign in to your Mail Falcon account.',
    bodyHtml: `
      ${renderCodeBox(code, { label: 'Single-use sign-in code', expiryMinutes: 15 })}
      <p style="margin: 20px 0 0; font-size: 13px; color: #64748b; line-height: 1.6;">
        This code expires in 15 minutes. If you didn't request this code, you can safely ignore this email &mdash; your account remains secure.
      </p>
    `,
    footerNote: 'Need help? Reply directly to this email or visit our help center.',
  })
}

export async function sendCode({ email, code, env }: SendCodeArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: code for ${email} = ${code}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to: email,
      subject: 'Your Mail Falcon sign-in code',
      text: `Your sign-in code is ${code}.\n\nThis code expires in 15 minutes. If you didn't request it, you can safely ignore this email.\n\nMail Falcon`,
      html: renderHtml(code, env.PUBLIC_WEB_URL),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`)
  }
}

function renderDeleteHtml(code: string, webUrl?: string): string {
  return renderEmailShell({
    webUrl,
    preheader: `Account deletion confirmation code: ${code}.`,
    badge: {
      text: 'Security Alert',
      bg: '#fee2e2',
      fg: '#b91c1c',
    },
    title: 'Confirm account deletion',
    subtitle: 'You requested to permanently delete your Mail Falcon account.',
    bodyHtml: `
      ${renderAlertBox(
        '<strong>Warning:</strong> This action is permanent. Confirming deletion will immediately erase all your tracked emails, analytics history, templates, and account records.',
        'danger',
      )}
      ${renderCodeBox(code, {
        label: 'Deletion Confirmation Code',
        expiryMinutes: 15,
        isDanger: true,
      })}
      <p style="margin: 16px 0 0; font-size: 13px; color: #64748b; line-height: 1.6;">
        Paste this code in Settings to confirm. If you did not request this, ignore this email and nothing will happen.
      </p>
    `,
  })
}

export async function sendDeleteCode({ email, code, env }: SendCodeArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: delete code for ${email} = ${code}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to: email,
      subject: 'Confirm account deletion — Mail Falcon',
      text: `Your account-deletion confirmation code is ${code}.\n\nPaste it in the Settings page to confirm. This permanently deletes every tracked email, event, push subscription, and your user record. The code expires in 15 minutes.\n\nIf you didn't request this, ignore this email.\n\nMail Falcon`,
      html: renderDeleteHtml(code, env.PUBLIC_WEB_URL),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend delete-code send failed: ${res.status} ${await res.text()}`)
  }
}

export interface SendFollowupArgs {
  to: string
  subject: string | null
  emailId: string
  sentAt: number
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderFollowupHtml(args: {
  subject: string
  webUrl: string
  emailId: string
  sentAt: number
}): string {
  const detailUrl = `${args.webUrl}/dashboard/email/?id=${encodeURIComponent(args.emailId)}`
  const sentDate = new Date(args.sentAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return renderEmailShell({
    webUrl: args.webUrl,
    preheader: `No opens recorded yet for "${args.subject}". Sent ${sentDate}.`,
    badge: {
      text: 'Follow-up Reminder',
      bg: '#e0e7ff',
      fg: '#4338ca',
    },
    title: 'No opens yet on your email',
    subtitle: 'You set a reminder for a tracked message that has not been opened yet.',
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #060a14; border: 1px solid #1e293b; border-radius: 12px; margin: 16px 0 20px;">
        <tr>
          <td style="padding: 16px 20px;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">Subject</div>
            <div style="font-size: 15px; font-weight: 600; color: #ffffff; line-height: 1.4;">${escapeHtml(args.subject)}</div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">Sent on ${sentDate}</div>
          </td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 16px;">
        Most recipient replies happen within 48 hours. If this email is time-sensitive, consider sending a gentle bump.
      </p>
      ${renderButton('View email details in dashboard', detailUrl)}
    `,
  })
}

export async function sendFollowupReminder({
  to,
  subject,
  emailId,
  sentAt,
  webUrl,
  env,
}: SendFollowupArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: followup reminder for ${to} ${emailId}`)
    return
  }

  const safeSubject = subject ?? '(no subject)'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to,
      subject: `No opens yet: "${safeSubject}"`,
      text: `Your tracked email "${safeSubject}" hasn't been opened.\n\nView details: ${webUrl}/dashboard/email/?id=${encodeURIComponent(emailId)}\n\nMail Falcon`,
      html: renderFollowupHtml({
        subject: safeSubject,
        webUrl,
        emailId,
        sentAt,
      }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend followup send failed: ${res.status} ${await res.text()}`)
  }
}

export interface SendWorkspaceInviteArgs {
  to: string
  workspaceName: string
  inviterEmail: string
  acceptUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string; PUBLIC_WEB_URL?: string }
}

function renderInviteHtml({
  workspaceName,
  inviterEmail,
  acceptUrl,
  webUrl,
}: {
  workspaceName: string
  inviterEmail: string
  acceptUrl: string
  webUrl?: string
}): string {
  const safeName = workspaceName.replace(/[<>&"]/g, '')
  const safeInviter = inviterEmail.replace(/[<>&"]/g, '')

  return renderEmailShell({
    webUrl,
    preheader: `${safeInviter} invited you to join the "${safeName}" workspace on Mail Falcon.`,
    badge: {
      text: 'Workspace Invite',
      bg: '#052e16',
      fg: '#4ade80',
    },
    title: `Join ${safeName}`,
    subtitle: `<strong style="color: #ffffff;">${safeInviter}</strong> has invited you to collaborate in their Mail Falcon workspace.`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #060a14; border: 1px solid #1e293b; border-radius: 12px; margin: 16px 0 20px;">
        <tr>
          <td style="padding: 18px 20px;">
            <p style="margin: 0 0 10px; font-size: 13px; font-weight: 600; color: #ffffff;">What workspace membership includes:</p>
            <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #94a3b8; line-height: 1.7;">
              <li>Shared high-converting templates and variable snippets</li>
              <li>Consolidated tracking analytics for team outreach</li>
              <li>Your personal tracked sends remain completely private</li>
            </ul>
          </td>
        </tr>
      </table>
      ${renderButton('Accept Invitation', acceptUrl)}
      <p style="font-size: 12px; color: #64748b; margin: 16px 0 0; line-height: 1.5;">
        This invitation link expires in 7 days. If you don't have an account yet, accepting will guide you through quick sign-in.
      </p>
    `,
  })
}

export async function sendWorkspaceInvite({
  to,
  workspaceName,
  inviterEmail,
  acceptUrl,
  env,
}: SendWorkspaceInviteArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(
      `[mailfalcon] dev mailer: invite to ${to} for "${workspaceName}" via ${acceptUrl}`,
    )
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to,
      subject: `${inviterEmail} invited you to "${workspaceName}" on Mail Falcon`,
      text: `${inviterEmail} invited you to join the "${workspaceName}" workspace on Mail Falcon.\n\nAccept here: ${acceptUrl}\n\nThis invite expires in 7 days.`,
      html: renderInviteHtml({
        workspaceName,
        inviterEmail,
        acceptUrl,
        webUrl: env.PUBLIC_WEB_URL,
      }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend invite send failed: ${res.status} ${await res.text()}`)
  }
}

export interface SendWelcomeArgs {
  to: string
  trialDaysRemaining: number
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderWelcomeHtml(args: { trialDaysRemaining: number; webUrl: string }): string {
  return renderEmailShell({
    webUrl: args.webUrl,
    preheader: `You're all set! Your ${args.trialDaysRemaining}-day Pro trial is active.`,
    badge: {
      text: 'Pro Trial Active',
      bg: '#052e16',
      fg: '#34d399',
    },
    title: "You're all set 🎉",
    subtitle: `The Mail Falcon extension is installed and ready. Your free <strong style="color: #ffffff;">${args.trialDaysRemaining}-day Pro trial</strong> is now active.`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 20px 0;">
        <tr>
          <td style="padding: 14px 18px; background: #060a14; border-radius: 10px; border-left: 3px solid #0284c7; margin-bottom: 8px;">
            <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px;">1. Compose in Gmail</div>
            <div style="font-size: 13px; color: #94a3b8;">Open Gmail and click Compose. You'll see the Mail Falcon tracker bar right above the send button.</div>
          </td>
        </tr>
        <tr><td style="height: 10px;"></td></tr>
        <tr>
          <td style="padding: 14px 18px; background: #060a14; border-radius: 10px; border-left: 3px solid #00d4ff;">
            <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px;">2. Hit Send</div>
            <div style="font-size: 13px; color: #94a3b8;">Send normally. We automatically attach zero-latency open &amp; click tracking.</div>
          </td>
        </tr>
        <tr><td style="height: 10px;"></td></tr>
        <tr>
          <td style="padding: 14px 18px; background: #060a14; border-radius: 10px; border-left: 3px solid #10b981;">
            <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px;">3. Instant Intel</div>
            <div style="font-size: 13px; color: #94a3b8;">Receive real-time desktop notifications and double blue checkmarks (&#10003;&#10003;) in your Sent folder.</div>
          </td>
        </tr>
      </table>
      ${renderButton('Open Dashboard', `${args.webUrl}/dashboard`)}
    `,
  })
}

export async function sendWelcomeEmail({
  to,
  trialDaysRemaining,
  webUrl,
  env,
}: SendWelcomeArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: welcome to ${to}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to,
      subject: `Welcome to Mail Falcon — ${trialDaysRemaining}-day Pro trial active`,
      text: `Your Mail Falcon extension is installed and ready.\n\nCompose a new email in Gmail, hit Send, and we'll start tracking opens, clicks, and replies.\n\nYour ${trialDaysRemaining}-day Pro trial is active — no card required.\n\nDashboard: ${webUrl}/dashboard`,
      html: renderWelcomeHtml({ trialDaysRemaining, webUrl }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend welcome send failed: ${res.status} ${await res.text()}`)
  }
}

export interface SendActivationArgs {
  to: string
  trialDaysRemaining: number
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderActivationHtml(args: { trialDaysRemaining: number; webUrl: string }): string {
  return renderEmailShell({
    webUrl: args.webUrl,
    preheader: `Send your first tracked email · ${args.trialDaysRemaining} days left on your Pro trial.`,
    badge: {
      text: 'Quick Start',
      bg: '#451a03',
      fg: '#fde68a',
    },
    title: 'Send your first tracked email',
    subtitle: `Mail Falcon is active, but you haven't sent a tracked message yet. You have <strong style="color: #ffffff;">${args.trialDaysRemaining} days remaining</strong> on your Pro trial.`,
    bodyHtml: `
      <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 16px;">
        It takes one click: compose an email in Gmail, verify the Mail Falcon bar is active, and click Send. Your dashboard will immediately light up with live open and click analytics.
      </p>
      ${renderButton('Open Gmail Compose', 'https://mail.google.com/mail/u/0/?compose=1')}
      <p style="margin: 20px 0 0; font-size: 12px; color: #64748b;">
        Need to adjust notifications? <a href="${args.webUrl}/settings" style="color: #94a3b8; text-decoration: underline;">Manage settings</a> anytime.
      </p>
    `,
  })
}

export async function sendActivationReminder({
  to,
  trialDaysRemaining,
  webUrl,
  env,
}: SendActivationArgs): Promise<void> {
  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: activation reminder to ${to}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to,
      subject: 'Quick nudge — send your first tracked email',
      text: `Mail Falcon's installed but you haven't sent a tracked email yet. Compose in Gmail, hit Send, and the dashboard starts filling.\n\nGmail compose: https://mail.google.com/mail/u/0/?compose=1\n\n${trialDaysRemaining} days left on your Pro trial.`,
      html: renderActivationHtml({ trialDaysRemaining, webUrl }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend activation send failed: ${res.status} ${await res.text()}`)
  }
}

export type EventNotificationKind = 'open' | 'click' | 'reply' | 'hot-lead'

export interface SendEventNotificationArgs {
  to: string
  kind: EventNotificationKind
  subject: string | null
  recipientLabel?: string
  location?: string
  device?: string
  emailId?: string
  ip?: string
  isp?: string
  openedAfter?: string
  isFirstOpen?: boolean
  timezone?: string
  postalCode?: string
  latitude?: string
  longitude?: string
  isVpnLikely?: boolean
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function buildEventSubject(kind: EventNotificationKind, who: string, subject: string): string {
  switch (kind) {
    case 'open':
      return `📬 ${who} opened: ${subject}`
    case 'click':
      return `🖱 ${who} clicked: ${subject}`
    case 'reply':
      return `↩️ ${who} replied: ${subject}`
    case 'hot-lead':
      return `🔥 Hot lead: ${who}`
  }
}

function eventVerb(kind: EventNotificationKind): string {
  switch (kind) {
    case 'open':
      return 'opened your email'
    case 'click':
      return 'clicked a link in your email'
    case 'reply':
      return 'replied to your email'
    case 'hot-lead':
      return 'is now a hot lead'
  }
}

function eventBadge(kind: EventNotificationKind): { text: string; bg: string; fg: string } {
  switch (kind) {
    case 'open':
      return { text: 'Email Opened', bg: '#082f49', fg: '#38bdf8' }
    case 'click':
      return { text: 'Link Clicked', bg: '#3b0764', fg: '#c084fc' }
    case 'reply':
      return { text: 'Reply Received', bg: '#052e16', fg: '#4ade80' }
    case 'hot-lead':
      return { text: 'Hot Lead Alert', bg: '#450a0a', fg: '#f87171' }
  }
}

function renderEventNotificationHtml(args: {
  kind: EventNotificationKind
  subject: string
  recipientLabel: string
  location?: string
  device?: string
  emailId?: string
  ip?: string
  isp?: string
  openedAfter?: string
  isFirstOpen?: boolean
  timezone?: string
  postalCode?: string
  latitude?: string
  longitude?: string
  isVpnLikely?: boolean
  webUrl: string
}): string {
  const detailUrl = args.emailId
    ? `${args.webUrl}/dashboard/email/?id=${encodeURIComponent(args.emailId)}`
    : `${args.webUrl}/dashboard`
  const safeSubject = escapeHtml(args.subject)
  const safeWho = escapeHtml(args.recipientLabel)
  const badge = eventBadge(args.kind)
  const verb = eventVerb(args.kind)

  const chips: string[] = []
  if (args.isFirstOpen) {
    chips.push(
      `<span style="display:inline-block;background:#052e16;color:#4ade80;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 8px;border-radius:12px;margin-right:6px;border:1px solid #166534;">First Open</span>`,
    )
  }
  if (args.isVpnLikely) {
    chips.push(
      `<span style="display:inline-block;background:#451a03;color:#fde68a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 8px;border-radius:12px;margin-right:6px;border:1px solid #78350f;">VPN / Proxy</span>`,
    )
  }

  const metaRows: string[] = []
  if (args.openedAfter) {
    metaRows.push(`
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; width: 70px;">When</td>
        <td style="padding: 6px 0; font-size: 13px; color: #ffffff;">${escapeHtml(args.openedAfter)}</td>
      </tr>
    `)
  }
  if (args.device) {
    metaRows.push(`
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Device</td>
        <td style="padding: 6px 0; font-size: 13px; color: #ffffff;">${escapeHtml(args.device)}</td>
      </tr>
    `)
  }
  if (args.location) {
    const locBits = [args.location]
    if (args.postalCode) locBits.push(args.postalCode)
    if (args.timezone) locBits.push(`(${args.timezone})`)
    metaRows.push(`
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Location</td>
        <td style="padding: 6px 0; font-size: 13px; color: #ffffff;">${escapeHtml(locBits.join(' · '))}</td>
      </tr>
    `)
  }
  if (args.ip) {
    const ipLine = args.isp
      ? `${escapeHtml(args.ip)} <span style="color:#64748b;">&middot; ${escapeHtml(args.isp)}</span>`
      : escapeHtml(args.ip)
    metaRows.push(`
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">IP / ISP</td>
        <td style="padding: 6px 0; font-size: 13px; color: #ffffff;">${ipLine}</td>
      </tr>
    `)
  }
  if (args.latitude && args.longitude) {
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(args.latitude)},${encodeURIComponent(args.longitude)}`
    metaRows.push(`
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Map</td>
        <td style="padding: 6px 0; font-size: 13px;"><a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="color: #00d4ff; text-decoration: underline;">View location on Google Maps</a></td>
      </tr>
    `)
  }

  const metaTable = metaRows.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top: 16px; border-top: 1px solid #1e293b; padding-top: 10px;">
        <tbody>${metaRows.join('')}</tbody>
      </table>`
    : ''

  return renderEmailShell({
    webUrl: args.webUrl,
    preheader: `${safeWho} ${verb}: "${safeSubject}"`,
    badge,
    title: `${safeWho} ${verb}`,
    bodyHtml: `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #060a14; border: 1px solid #1e293b; border-radius: 12px; margin: 16px 0;">
        <tr>
          <td style="padding: 16px 20px;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">Subject</div>
            <div style="font-size: 15px; font-weight: 600; color: #ffffff; line-height: 1.4;">${safeSubject}</div>
            ${chips.length ? `<div style="margin-top: 8px;">${chips.join('')}</div>` : ''}
            ${metaTable}
          </td>
        </tr>
      </table>
      ${renderButton('Open in Dashboard', detailUrl)}
    `,
    footerNote: `Manage notification preferences anytime in <a href="${args.webUrl}/settings" style="color: #94a3b8; text-decoration: underline;">Settings</a>.`,
  })
}

export async function sendEventNotification(
  args: SendEventNotificationArgs,
): Promise<void> {
  const {
    to,
    kind,
    subject,
    recipientLabel,
    location,
    device,
    emailId,
    ip,
    isp,
    openedAfter,
    isFirstOpen,
    timezone,
    postalCode,
    latitude,
    longitude,
    isVpnLikely,
    webUrl,
    env,
  } = args
  const safeSubject = subject ?? '(no subject)'
  const who = recipientLabel ?? 'A recipient'
  const mailSubject = buildEventSubject(kind, who, safeSubject)

  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: event-notify ${kind} → ${to}: ${mailSubject}`)
    return
  }

  const detailUrl = emailId
    ? `${webUrl}/dashboard/email/?id=${encodeURIComponent(emailId)}`
    : `${webUrl}/dashboard`

  const textLines: string[] = []
  textLines.push(`${who} ${eventVerb(kind)}.`)
  textLines.push('')
  textLines.push(`"${safeSubject}"`)
  const chipLines: string[] = []
  if (isFirstOpen) chipLines.push('[FIRST OPEN]')
  if (isVpnLikely) chipLines.push('[VPN/PROXY]')
  if (chipLines.length) textLines.push(chipLines.join(' '))
  textLines.push('')
  if (openedAfter) textLines.push(`When: ${openedAfter}`)
  if (device) textLines.push(`Device: ${device}`)
  if (location) {
    const locBits = [location]
    if (postalCode) locBits.push(postalCode)
    if (timezone) locBits.push(`(${timezone})`)
    textLines.push(`Location: ${locBits.join(' · ')}`)
  }
  if (ip) textLines.push(`IP: ${ip}${isp ? ` · ${isp}` : ''}`)
  if (latitude && longitude) {
    textLines.push(`Map: https://www.google.com/maps?q=${latitude},${longitude}`)
  }
  textLines.push('')
  textLines.push(`Open in dashboard: ${detailUrl}`)
  textLines.push('')
  textLines.push(`Manage these alerts: ${webUrl}/settings`)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mail Falcon <hello@mailfalcon.app>',
      to,
      subject: mailSubject,
      text: textLines.join('\n'),
      html: renderEventNotificationHtml({
        kind,
        subject: safeSubject,
        recipientLabel: who,
        location,
        device,
        emailId,
        ip,
        isp,
        openedAfter,
        isFirstOpen,
        timezone,
        postalCode,
        latitude,
        longitude,
        isVpnLikely,
        webUrl,
      }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend event-notify send failed: ${res.status} ${await res.text()}`)
  }
}

export async function sendOutreachEmail({
  to,
  subject,
  html,
  text,
  env,
}: {
  to: string
  subject: string
  html: string
  text: string
  env: { ENVIRONMENT?: string; RESEND_API_KEY?: string }
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'No RESEND_API_KEY set' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Derek @ Mail Falcon <hello@mailfalcon.app>',
      reply_to: 'hello@mailfalcon.app',
      to,
      subject,
      text,
      html,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { ok: false, error: `${res.status}: ${errText}` }
  }

  const data = (await res.json()) as { id: string }
  return { ok: true, id: data.id }
}

