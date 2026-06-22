import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger, errorMeta } from './logger'

describe('errorMeta', () => {
  it('extracts name + message + stack from an Error', () => {
    const meta = errorMeta(new TypeError('boom'))
    expect(meta.name).toBe('TypeError')
    expect(meta.message).toBe('boom')
    expect(typeof meta.stack).toBe('string')
  })

  it('stringifies non-Error values', () => {
    expect(errorMeta('plain string').value).toBe('plain string')
    expect(errorMeta(42).value).toBe('42')
    expect(errorMeta(null).value).toBe('null')
    expect(errorMeta(undefined).value).toBe('undefined')
  })
})

describe('createLogger', () => {
  const env = { ENVIRONMENT: 'test' }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes info to console.log with a JSON record', () => {
    const log = createLogger({ env })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    log.info('hello', { foo: 'bar' })
    expect(spy).toHaveBeenCalledOnce()
    const arg = spy.mock.calls[0]![0] as string
    const rec = JSON.parse(arg)
    expect(rec.msg).toBe('hello')
    expect(rec.level).toBe('info')
    expect(rec.env).toBe('test')
    expect(rec.meta).toEqual({ foo: 'bar' })
  })

  it('writes warn to console.warn', () => {
    const log = createLogger({ env })
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    log.warn('careful')
    expect(spy).toHaveBeenCalledOnce()
    const rec = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(rec.level).toBe('warn')
  })

  it('writes error to console.error', () => {
    const log = createLogger({ env })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    log.error('nope')
    expect(spy).toHaveBeenCalledOnce()
    const rec = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(rec.level).toBe('error')
  })

  it('omits meta from the record when not provided or empty', () => {
    const log = createLogger({ env })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    log.info('bare')
    const rec = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(rec.meta).toBeUndefined()
  })

  it('does not call fetch for info (only warn + error ship to Axiom)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const log = createLogger({
      env: { ENVIRONMENT: 'test', AXIOM_TOKEN: 'abc', AXIOM_DATASET: 'mf' },
    })
    log.info('quiet')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ships warn to Axiom when token + dataset are configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let captured: Promise<unknown> | null = null
    const log = createLogger({
      env: { ENVIRONMENT: 'test', AXIOM_TOKEN: 'abc', AXIOM_DATASET: 'mf' },
      waitUntil: (p) => {
        captured = p
      },
    })
    log.warn('shipped')
    expect(captured).not.toBeNull()
    await captured
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('api.axiom.co/v1/datasets/mf/ingest')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('does not ship to Axiom when token is missing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const log = createLogger({ env: { ENVIRONMENT: 'test' } })
    log.warn('local')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
