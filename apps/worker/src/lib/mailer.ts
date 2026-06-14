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
