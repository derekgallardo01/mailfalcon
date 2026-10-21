import { describe, expect, it } from 'vitest'
import { config } from './config'

describe('config', () => {
  it('resolves production endpoints when not in development mode', () => {
    // Under vitest / build modes, apiHost and trackerHost should default to production mailfalcon.app URLs
    expect(config.apiHost).toBe('https://api.mailfalcon.app')
    expect(config.trackerHost).toBe('https://t.mailfalcon.app')
    expect(config.publicWebUrl).toBe('https://mailfalcon.app')
  })

  it('has a valid inboxSdkAppId', () => {
    expect(config.inboxSdkAppId).toBeDefined()
    expect(typeof config.inboxSdkAppId).toBe('string')
    expect(config.inboxSdkAppId.length).toBeGreaterThan(0)
  })
})
