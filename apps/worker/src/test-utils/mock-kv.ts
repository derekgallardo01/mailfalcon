interface StoredValue {
  value: string
  expiresAt: number | null
}

/**
 * Tiny in-memory KVNamespace stub for unit tests. Implements just the
 * methods our code uses: get (text + json), put (with expirationTtl),
 * delete. TTL is simulated against Date.now() so tests can run
 * synchronously without timers.
 */
export class MockKV {
  private store = new Map<string, StoredValue>()

  async get(
    key: string,
    type?: 'text' | 'json',
  ): Promise<string | unknown | null> {
    const v = this.store.get(key)
    if (!v) return null
    if (v.expiresAt !== null && v.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    if (type === 'json') {
      try {
        return JSON.parse(v.value) as unknown
      } catch {
        return null
      }
    }
    return v.value
  }

  async put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: opts?.expirationTtl
        ? Date.now() + opts.expirationTtl * 1000
        : null,
    })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  // Test-only helpers (not on the real KVNamespace).
  _size(): number {
    return this.store.size
  }

  _keys(): string[] {
    return [...this.store.keys()]
  }

  /** Force-expire a key by rewriting it with a past expiresAt. */
  _expire(key: string): void {
    const v = this.store.get(key)
    if (v) this.store.set(key, { ...v, expiresAt: Date.now() - 1000 })
  }
}

/**
 * Cast a MockKV to the production KVNamespace shape. The two methods we
 * skip (list, getWithMetadata) aren't used in the code under test.
 */
export function asKv(mock: MockKV): KVNamespace {
  return mock as unknown as KVNamespace
}
