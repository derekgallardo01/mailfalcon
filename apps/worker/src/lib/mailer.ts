interface SendCodeArgs {
  email: string
  code: string
  env: { ENVIRONMENT: string; RESEND_API_KEY?: string }
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
      from: 'mailfalcon <hello@mailfalcon.app>',
      to: email,
      subject: `Your mailfalcon sign-in code: ${code}`,
      text: `Your sign-in code is ${code}. It expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`)
  }
}
