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
