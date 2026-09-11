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
 *  - (71) temporary tokens honour their expiry: they resolve before the
 *    deadline, return null (and are cleaned up) after it, and permanent
 *    tokens with no expiry row keep working.
 */
import { describe, it, expect } from 'vitest'
import { kioskTokenFrom, kioskTokenCompanyId, kioskTokenInfo, generateKioskToken, kioskTtlExpiry, kioskTtlLabel, KIOSK_TOKEN_TTLS } from './kiosk.js'

const HEADER = 'X-Kiosk-Token'

// Minimal mock of the CF Worker D1 binding surface used by kioskTokenCompanyId:
//   env.DB.prepare(sql).bind(...).first() -> Promise<row | null>
// The device row (kiosk_device_token:…) returns `storedValue`; the expiry row
// (kiosk_token_expiry:…) returns `expiryValue` when provided. Batch/run record
// deletes for expired-token cleanup assertions.
function mockEnv({ storedValue = null, expiryValue = null, expectDbHit = true, batches = null } = {}) {
  return {
    DB: {
      prepare: (sql) => {
        if (!expectDbHit) {
          throw new Error(`DB.prepare must not be reached for this token (sql: ${sql})`)
        }
        const state = { args: [] }
        const stmt = {
          sql,
          state,
          bind(...args) { state.args = args; return stmt },
          async first() {
            const key = String(state.args[0] || '')
            if (key.startsWith('kiosk_token_expiry:')) {
              return expiryValue == null ? null : { value: expiryValue }
            }
            return storedValue == null ? null : { value: storedValue }
          },
          async run() { if (batches) batches.push(sql); return { success: true } },
        }
        return stmt
      },
      async batch(stmts) {
        if (batches) batches.push(...stmts.map((s) => `${s.sql ?? 'batch'} :: ${(s.state?.args || []).join(' ')}`))
        return null
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
    const env = mockEnv({ storedValue: 'co_acme', expectDbHit: false })
    const result = await kioskTokenCompanyId(env, 'not-a-kiosk-token')
    expect(result).toBeNull()
  })

  it('returns null for an empty token', async () => {
    const env = mockEnv({ storedValue: 'co_acme', expectDbHit: false })
    expect(await kioskTokenCompanyId(env, '')).toBeNull()
  })

  it('resolves a well-formed permanent token to its scoped companyId', async () => {
    const env = mockEnv({ storedValue: 'co_acme', expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_abc123')).toBe('co_acme')
  })

  it('returns null when the token is unknown (row missing)', async () => {
    const env = mockEnv({ storedValue: null, expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_does-not-exist')).toBeNull()
  })

  it('resolves a temporary token that has not expired yet', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const env = mockEnv({ storedValue: 'co_acme', expiryValue: future, expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_field01')).toBe('co_acme')
  })

  it('rejects and cleans up an expired temporary token', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const batches = []
    const env = mockEnv({ storedValue: 'co_acme', expiryValue: past, expectDbHit: true, batches })
    expect(await kioskTokenCompanyId(env, 'uwk_field02')).toBeNull()
    expect(batches.some((s) => s.includes('kiosk_device_token:'))).toBe(true)
    expect(batches.some((s) => s.includes('kiosk_token_expiry:'))).toBe(true)
  })

  it('rejects a temporary token with an unreadable expiry', async () => {
    const env = mockEnv({ storedValue: 'co_acme', expiryValue: 'not-a-date', expectDbHit: true })
    expect(await kioskTokenCompanyId(env, 'uwk_field03')).toBeNull()
  })
})

describe('kioskTokenInfo', () => {
  it('reports expiresAt for temporary tokens and null for permanent ones', async () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    const temp = await kioskTokenInfo(mockEnv({ storedValue: 'co_acme', expiryValue: future }), 'uwk_field04')
    expect(temp?.companyId).toBe('co_acme')
    expect(temp?.expiresAt).toBe(future)

    const perm = await kioskTokenInfo(mockEnv({ storedValue: 'co_acme' }), 'uwk_perm1')
    expect(perm?.companyId).toBe('co_acme')
    expect(perm?.expiresAt).toBeNull()
  })
})

describe('kioskTtlExpiry / ttl constants', () => {
  it('exposes exactly the 1h/3h/5h/day TTLs', () => {
    expect(KIOSK_TOKEN_TTLS).toEqual(['1h', '3h', '5h', 'day'])
  })

  it('computes a future expiry for each finite TTL', () => {
    for (const ttl of ['1h', '3h', '5h']) {
      const at = kioskTtlExpiry(ttl)
      expect(at).toBeInstanceOf(Date)
      expect(at.getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('end-of-day is later today (not already expired)', () => {
    const at = kioskTtlExpiry('day')
    expect(at).toBeInstanceOf(Date)
    expect(at.getTime()).toBeGreaterThan(Date.now())
  })

  it('returns null for an unknown TTL', () => {
    expect(kioskTtlExpiry('forever')).toBeNull()
  })

  it('labels each TTL for the UI', () => {
    expect(kioskTtlLabel('1h')).toBe('1 hour')
    expect(kioskTtlLabel('3h')).toBe('3 hours')
    expect(kioskTtlLabel('5h')).toBe('5 hours')
    expect(kioskTtlLabel('day')).toBe('End of day')
    expect(kioskTtlLabel('nope')).toBe('nope')
  })
})
