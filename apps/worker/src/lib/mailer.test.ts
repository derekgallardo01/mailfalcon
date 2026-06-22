import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  sendCode,
  sendDeleteCode,
  sendFollowupReminder,
  sendWorkspaceInvite,
} from './mailer'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('sendCode', () => {
  it('skips Resend in development', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await sendCode({
      email: 'alice@example.com',
      code: '123456',
      env: { ENVIRONMENT: 'development' },
    })
    expect(spy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('skips Resend when RESEND_API_KEY is missing in prod', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await sendCode({
      email: 'alice@example.com',
      code: '123456',
      env: { ENVIRONMENT: 'production' },
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('POSTs to Resend with the code in subject + body', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendCode({
      email: 'bob@example.com',
      code: '654321',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    expect(spy).toHaveBeenCalledOnce()
    const [url, init] = spy.mock.calls[0]!
    expect(String(url)).toBe('https://api.resend.com/emails')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.to).toBe('bob@example.com')
    expect(body.subject).toContain('sign-in')
    expect(body.text).toContain('654321')
    expect(body.html).toContain('654321')
  })

  it('throws when Resend rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate_limited', { status: 429 }),
    )
    await expect(
      sendCode({
        email: 'x@example.com',
        code: '000000',
        env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
      }),
    ).rejects.toThrow(/429/)
  })
})

describe('sendDeleteCode', () => {
  it('embeds the code and uses a different subject than sign-in', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendDeleteCode({
      email: 'alice@example.com',
      code: '999000',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    const body = JSON.parse(
      (spy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(body.text).toContain('999000')
    expect(body.subject.toLowerCase()).toMatch(/delete|deletion/)
  })
})

describe('sendFollowupReminder', () => {
  it('includes subject + dashboard link', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendFollowupReminder({
      to: 'alice@example.com',
      subject: 'Following up',
      emailId: 'abc123',
      sentAt: Date.now(),
      webUrl: 'https://app.mailfalcon.app',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    const body = JSON.parse(
      (spy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(body.text).toContain('Following up')
    expect(body.html).toContain('abc123')
  })

  it('handles null subject gracefully', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendFollowupReminder({
      to: 'alice@example.com',
      subject: null,
      emailId: 'abc123',
      sentAt: Date.now(),
      webUrl: 'https://app.mailfalcon.app',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('sendWorkspaceInvite', () => {
  it('embeds the workspace name, inviter, and accept URL', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendWorkspaceInvite({
      to: 'newbie@example.com',
      workspaceName: 'Acme Co',
      inviterEmail: 'owner@example.com',
      acceptUrl: 'https://app.mailfalcon.app/workspaces/accept?token=xyz',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    const body = JSON.parse(
      (spy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(body.to).toBe('newbie@example.com')
    expect(body.subject).toContain('Acme Co')
    expect(body.subject).toContain('owner@example.com')
    expect(body.html).toContain('Acme Co')
    expect(body.html).toContain('owner@example.com')
    expect(body.html).toContain('xyz')
  })

  it('strips angle brackets from the workspace name to prevent HTML injection', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await sendWorkspaceInvite({
      to: 'x@example.com',
      workspaceName: '<script>alert(1)</script>',
      inviterEmail: 'owner@example.com',
      acceptUrl: 'https://app.mailfalcon.app/accept?t=1',
      env: { ENVIRONMENT: 'production', RESEND_API_KEY: 'key' },
    })
    const body = JSON.parse(
      (spy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(body.html).not.toContain('<script>')
  })

  it('logs in development without calling Resend', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await sendWorkspaceInvite({
      to: 'x@example.com',
      workspaceName: 'Acme',
      inviterEmail: 'owner@example.com',
      acceptUrl: 'http://localhost/accept',
      env: { ENVIRONMENT: 'development' },
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
