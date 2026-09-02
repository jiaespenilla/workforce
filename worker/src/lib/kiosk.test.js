/// <reference types="vitest" />
/**
 * Core tests for the kiosk device-token security layer (worker).
 *
 * Guards the contract that "kiosk feature complete" depends on:
 *  - tokens are well-formed (uwk_ prefix + 48 hex chars)
 *  - the X-Kiosk-Token header is read & trimmed
 *  - kioskTokenCompanyId REJECTS malformed tokens WITHOUT touching the DB
 *    (short-circuits, so attackers can't probe the settings table), then
 *  - resolves a well-formed token to its scoped companyId and rejects unknown ones.
 *
 * Co-located with the worker source so the import stays a plain sibling
 * (vitest transforms it cleanly).
 */
import { describe, it, expect } from 'vitest'
import { kioskTokenFrom, kioskTokenCompanyId, generateKioskToken } from './kiosk.js'

const HEADER = 'X-Kiosk-Token'

// Minimal mock of the CF Worker D1 binding surface used by kioskTokenCompanyId:
//   env.DB.prepare(sql).bind(...).first() -> Promise<row | null>
function mockEnv({ storedValue = null, expectDbHit = true } = {}) {
  return {
    DB: {
      prepare: (sql) => {
        if (!expectDbHit) {
          throw new Error(`DB.prepare must not be reached for this token (sql: ${sql})`)
        }
        return { bind: () => ({ first: () => Promise.resolve(storedValue) }) }
      },
    },
  }
}

const makeRequest = (token) => ({
  headers: { get: (k) => (k === HEADER ? token ?? null : null) },
})

describe('generateKioskToken', () => {
  it('produces tokens in the uwk_ namespace with 48 hex chars', () => {
    expect(generateKioskToken()).toMatch(/^uwk_[0-9a-f]{48}$/)
  })

  it('does not collide across a large sample', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateKioskToken()))
    expect(set.size).toBe(1000)
  })
})

describe('kioskTokenFrom', () => {
  it('reads and trims the X-Kiosk-Token header', () => {
    expect(kioskTokenFrom(makeRequest('  uwk_abcdef  '))).toBe('uwk_abcdef')
  })

  it('returns empty string when the header is absent', () => {
    expect(kioskTokenFrom(makeRequest(null))).toBe('')
  })
})

describe('kioskTokenCompanyId', () => {
  it('returns null for malformed tokens WITHOUT touching the DB', async () => {
    const env = mockEnv({ storedValue: { value: 'co_acme' }, expectDbHit: false })
    const result = await kioskTokenCompanyId(env, 'not-a-kiosk-token')
    expect(result).toBeNull()
  })

  it('returns null for an empty token', async () => {
    const env = mockEnv({ storedValue: { value: 'co_acme' }, expectDbHit: false })
    expect(await kioskTokenCompanyId(env, '')).toBeNull()
  })

  it('resolves a well-formed token to its scoped companyId', async () => {
    const env = mockEnv({ storedValue: { value: 'co_acme' }, expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_abc123')).toBe('co_acme')
  })

  it('returns null when the token is unknown (row missing)', async () => {
    const env = mockEnv({ storedValue: null, expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_does-not-exist')).toBeNull()
  })
})
