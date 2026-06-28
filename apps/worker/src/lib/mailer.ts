interface SendCodeArgs {
  email: string
  code: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderHtml(code: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">Your sign-in code is:</p>
        </td></tr>
        <tr><td style="padding:8px 32px 16px;">
          <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.08em;color:#0f1a2e;font-family:ui-monospace,'SF Mono',Menlo,monospace;">${code}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">This code expires in 15 minutes. If you didn't request it, you can safely ignore this email.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon &middot; email tracking for Gmail</p>
    </td></tr>
  </table>
</body>
</html>`
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to: email,
      subject: 'Your MailFalcon sign-in code',
      text: `Your sign-in code is ${code}.\n\nThis code expires in 15 minutes. If you didn't request it, you can safely ignore this email.\n\nMailFalcon`,
      html: renderHtml(code),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`)
  }
}

function renderDeleteHtml(code: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#b91c1c;letter-spacing:0.02em;">MailFalcon &middot; delete account</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">Your account-deletion confirmation code is:</p>
        </td></tr>
        <tr><td style="padding:8px 32px 16px;">
          <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.08em;color:#0f1a2e;font-family:ui-monospace,'SF Mono',Menlo,monospace;">${code}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Paste this code in the Settings page to confirm. <strong>This deletes every tracked email, event, push subscription, and your user record</strong>. It expires in 15 minutes. If you didn't request this, you can safely ignore the email and nothing happens.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon</p>
    </td></tr>
  </table>
</body>
</html>`
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to: email,
      subject: 'Confirm account deletion — MailFalcon',
      text: `Your account-deletion confirmation code is ${code}.\n\nPaste it in the Settings page to confirm. This permanently deletes every tracked email, event, push subscription, and your user record. The code expires in 15 minutes.\n\nIf you didn't request this, ignore this email.\n\nMailFalcon`,
      html: renderDeleteHtml(code),
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
  const sentDate = new Date(args.sentAt).toISOString().slice(0, 10)
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon &middot; follow-up reminder</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">You asked us to remind you about a tracked email that hadn't been opened.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 16px;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f1a2e;">${args.subject}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Sent ${sentDate}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <a href="${detailUrl}" style="display:inline-block;background:#3b6cb7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:500;">View on dashboard</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon</p>
    </td></tr>
  </table>
</body>
</html>`
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to,
      subject: `No opens yet: "${safeSubject}"`,
      text: `Your tracked email "${safeSubject}" hasn't been opened.\n\nView details: ${webUrl}/dashboard/email/?id=${encodeURIComponent(emailId)}\n\nMailFalcon`,
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

interface SendWorkspaceInviteArgs {
  to: string
  workspaceName: string
  inviterEmail: string
  acceptUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderInviteHtml({
  workspaceName,
  inviterEmail,
  acceptUrl,
}: {
  workspaceName: string
  inviterEmail: string
  acceptUrl: string
}): string {
  const safeName = workspaceName.replace(/[<>&"]/g, '')
  const safeInviter = inviterEmail.replace(/[<>&"]/g, '')
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon &middot; workspace invite</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            <strong>${safeInviter}</strong> invited you to the <strong>${safeName}</strong> workspace.
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 16px;">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
            Workspace members share templates and the workspace owner can see the team's tracked-email rollup. Your personal tracked sends stay private.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;">
          <a href="${acceptUrl}" style="display:inline-block;background:#3b6cb7;color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Accept invite</a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">This invite expires in 7 days. If you don't have a MailFalcon account yet, the accept link will sign you in first.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon &middot; email tracking for Gmail</p>
    </td></tr>
  </table>
</body>
</html>`
}

interface SendWelcomeArgs {
  to: string
  trialDaysRemaining: number
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderWelcomeHtml(args: { trialDaysRemaining: number; webUrl: string }): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f1a2e;">You're all set 🎉</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            The MailFalcon extension is installed and ready. Compose a new email in Gmail, hit Send, and we'll start tracking opens, clicks, and replies in real time.
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            Your free <strong>${args.trialDaysRemaining}-day Pro trial</strong> is active — unlimited tracking, scheduled sends, mail-merge, templates with variables. No card required until you decide to keep it.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;">
          <a href="${args.webUrl}/dashboard" style="display:inline-block;background:#3b6cb7;color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Open dashboard</a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            Quick start: open Gmail → click Compose → look for the MailFalcon bar above the body → hit Send. Watch the dashboard for live opens.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon · email tracking for Gmail</p>
    </td></tr>
  </table>
</body>
</html>`
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to,
      subject: `Welcome to MailFalcon — ${trialDaysRemaining}-day Pro trial active`,
      text: `Your MailFalcon extension is installed and ready.\n\nCompose a new email in Gmail, hit Send, and we'll start tracking opens, clicks, and replies.\n\nYour ${trialDaysRemaining}-day Pro trial is active — no card required.\n\nDashboard: ${webUrl}/dashboard`,
      html: renderWelcomeHtml({ trialDaysRemaining, webUrl }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend welcome send failed: ${res.status} ${await res.text()}`)
  }
}

interface SendActivationArgs {
  to: string
  trialDaysRemaining: number
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function renderActivationHtml(args: { trialDaysRemaining: number; webUrl: string }): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#3b6cb7;letter-spacing:0.02em;">MailFalcon</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f1a2e;">Send your first tracked email</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            MailFalcon's installed but you haven't sent a tracked email yet. It takes one click — compose like normal in Gmail, hit Send, and the dashboard fills with opens, clicks, and replies as they happen.
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            You've got <strong>${args.trialDaysRemaining} days left</strong> on your Pro trial — make it count.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;">
          <a href="https://mail.google.com/mail/u/0/?compose=1" style="display:inline-block;background:#3b6cb7;color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Open Gmail compose</a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            Not a fit? <a href="${args.webUrl}/settings" style="color:#6b7280;">Unsubscribe</a> from product nudges any time.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon</p>
    </td></tr>
  </table>
</body>
</html>`
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to,
      subject: 'Quick nudge — send your first tracked email',
      text: `MailFalcon's installed but you haven't sent a tracked email yet. Compose in Gmail, hit Send, and the dashboard starts filling.\n\nGmail compose: https://mail.google.com/mail/u/0/?compose=1\n\n${trialDaysRemaining} days left on your Pro trial.`,
      html: renderActivationHtml({ trialDaysRemaining, webUrl }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend activation send failed: ${res.status} ${await res.text()}`)
  }
}

export type EventNotificationKind = 'open' | 'click' | 'reply' | 'hot-lead'

interface SendEventNotificationArgs {
  to: string
  kind: EventNotificationKind
  subject: string | null
  recipientLabel?: string
  location?: string
  device?: string
  /** Optional — when present, the CTA deep-links to that email's
   *  detail page; otherwise falls back to the dashboard root. Hot-lead
   *  pushes don't always carry an emailId. */
  emailId?: string
  webUrl: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    if (c === '<') return '&lt;'
    if (c === '>') return '&gt;'
    if (c === '&') return '&amp;'
    if (c === '"') return '&quot;'
    return '&#39;'
  })
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

function eventColor(kind: EventNotificationKind): string {
  switch (kind) {
    case 'open':
      return '#3b6cb7'
    case 'click':
      return '#7c3aed'
    case 'reply':
      return '#16a34a'
    case 'hot-lead':
      return '#dc2626'
  }
}

function renderEventNotificationHtml(args: {
  kind: EventNotificationKind
  subject: string
  recipientLabel: string
  location?: string
  device?: string
  emailId?: string
  webUrl: string
}): string {
  const detailUrl = args.emailId
    ? `${args.webUrl}/dashboard/email/?id=${encodeURIComponent(args.emailId)}`
    : `${args.webUrl}/dashboard`
  const safeSubject = escapeHtml(args.subject)
  const safeWho = escapeHtml(args.recipientLabel)
  const color = eventColor(args.kind)
  const verb = eventVerb(args.kind)
  const metaParts: string[] = []
  if (args.location) metaParts.push(escapeHtml(args.location))
  if (args.device) metaParts.push(escapeHtml(args.device))
  const metaLine = metaParts.length
    ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">${metaParts.join(' &middot; ')}</p>`
    : ''
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:${color};letter-spacing:0.02em;">MailFalcon</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#0f1a2e;">${safeWho} ${verb}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${safeSubject}</p>
          ${metaLine}
        </td></tr>
        <tr><td style="padding:16px 32px 32px;">
          <a href="${detailUrl}" style="display:inline-block;background:${color};color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Open in dashboard</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">MailFalcon &middot; manage these alerts in <a href="${args.webUrl}/settings" style="color:#9ca3af;">Settings</a></p>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendEventNotification({
  to,
  kind,
  subject,
  recipientLabel,
  location,
  device,
  emailId,
  webUrl,
  env,
}: SendEventNotificationArgs): Promise<void> {
  const safeSubject = subject ?? '(no subject)'
  const who = recipientLabel ?? 'A recipient'
  const mailSubject = buildEventSubject(kind, who, safeSubject)

  if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
    console.log(`[mailfalcon] dev mailer: event-notify ${kind} → ${to}: ${mailSubject}`)
    return
  }

  const metaParts: string[] = []
  if (location) metaParts.push(location)
  if (device) metaParts.push(device)
  const metaText = metaParts.length ? `\n${metaParts.join(' · ')}\n` : '\n'
  const detailUrl = emailId
    ? `${webUrl}/dashboard/email/?id=${encodeURIComponent(emailId)}`
    : `${webUrl}/dashboard`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'MailFalcon <hello@mailfalcon.app>',
      to,
      subject: mailSubject,
      text: `${who} ${eventVerb(kind)}.\n\n"${safeSubject}"${metaText}\nOpen in dashboard: ${detailUrl}\n\nManage these alerts: ${webUrl}/settings`,
      html: renderEventNotificationHtml({
        kind,
        subject: safeSubject,
        recipientLabel: who,
        location,
        device,
        emailId,
        webUrl,
      }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend event-notify send failed: ${res.status} ${await res.text()}`)
  }
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
      from: 'MailFalcon <hello@mailfalcon.app>',
      to,
      subject: `${inviterEmail} invited you to "${workspaceName}" on MailFalcon`,
      text: `${inviterEmail} invited you to join the "${workspaceName}" workspace on MailFalcon.\n\nAccept here: ${acceptUrl}\n\nThis invite expires in 7 days.`,
      html: renderInviteHtml({ workspaceName, inviterEmail, acceptUrl }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend invite send failed: ${res.status} ${await res.text()}`)
  }
}
