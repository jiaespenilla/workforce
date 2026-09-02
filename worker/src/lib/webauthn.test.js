import { describe, it, expect, vi, beforeEach } from 'vitest'

// base64url-encode a string (mirrors webauthn.js encoding, using global btoa).
const b64urlFromInput = (str) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const calls = vi.hoisted(() => ({ reg: [], auth: [], verifyReg: [], verifyAuth: [] }))

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: async (opts) => {
    calls.reg.push(opts)
    return { challenge: 'reg-challenge', rpID: opts.rpID, timeout: 120000, attestationType: 'none' }
  },
  verifyRegistrationResponse: async (opts) => {
    calls.verifyReg.push(opts)
    return { verified: true, registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] } } }
  },
  generateAuthenticationOptions: async (opts) => {
    calls.auth.push(opts)
    return { challenge: 'auth-challenge', rpID: opts.rpID, timeout: 120000, userVerification: opts.userVerification }
  },
  verifyAuthenticationResponse: async (opts) => {
    calls.verifyAuth.push(opts)
    return { verified: true, authenticationInfo: { newCounter: 5 } }
  },
}))

import * as webauthn from '../webauthn.js'

// Minimal D1 mock: routes SQL by table name, first() returns canned rows.
function mockEnv({ credRow } = {}) {
  const runs = []
  const challengeRow = { challenge: 'x', kind: 'y', email: 'emp@acme.com', rp_id: 'kiosk.example.com', origin: 'https://kiosk.example.com', expires_at: Date.now() + 60000 }
  return {
    runs,
    DB: {
      prepare(_sql) {
        return {
          bind(...args) {
            return {
              first: async () => {
                if (_sql.includes('webauthn_credentials WHERE credential_id')) return credRow === undefined
                  ? { credential_id: 'cred-1', public_key: b64urlFromInput('fake-key'), counter: 0, transports: '["internal"]', email: 'emp@acme.com' }
                  : credRow
                if (_sql.includes('webauthn_challenges')) return { ...challengeRow, challenge: args[0], kind: args[1] }
                return null
              },
              run: async () => { runs.push({ sql: _sql, args }) },
              all: async () => ({ results: [] }),
            }
          },
          first: async () => null,
          run: async () => {},
          all: async () => ({ results: [] }),
        }
      },
      batch: async () => {},
    },
  }
}

const clientDataJSON = (challenge) => b64urlFromInput(JSON.stringify({ challenge }))

describe('webauthn: single shared kiosk device for ALL employees', () => {
  beforeEach(() => {
    calls.reg.length = 0
    calls.auth.length = 0
    calls.verifyReg.length = 0
    calls.verifyAuth.length = 0
  })

  it('registration uses platform authenticator + REQUIRED discoverable credentials', async () => {
    const env = mockEnv()
    await webauthn.buildRegistrationOptions(env, { username: 'emp@acme.com', origin: 'https://kiosk.example.com' })
    const opts = calls.reg[0]
    // residentKey 'required' = credential lives ON the device, so one mobile
    // device can hold every employee's fingerprint (many discoverable creds).
    expect(opts.authenticatorSelection).toEqual({
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    })
  })

  it('authentication options omit allowCredentials so the device offers every enrolled employee', async () => {
    const env = mockEnv()
    const options = await webauthn.buildAuthenticationOptions(env, { origin: 'https://kiosk.example.com' })
    const opts = calls.auth[0]
    expect('allowCredentials' in opts).toBe(false)
    expect(opts.userVerification).toBe('required')
    expect(options.challenge).toBe('auth-challenge')
  })

  it('verifyAuthentication resolves the employee from the scanned credential', async () => {
    const env = mockEnv()
    const result = await webauthn.verifyAuthentication(env, {
      response: { response: { clientDataJSON: clientDataJSON('auth-challenge') }, rawId: 'cred-1', id: 'cred-1' },
    })
    expect(result).toEqual({ email: 'emp@acme.com' })
    expect(calls.verifyAuth[0].expectedChallenge).toBe('auth-challenge')
    expect(calls.verifyAuth[0].expectedOrigin).toBe('https://kiosk.example.com')
    // counter is persisted after a successful scan
    expect(env.runs.some((r) => r.sql.includes('UPDATE webauthn_credentials SET counter'))).toBe(true)
  })

  it('rejects an unknown credential with 404', async () => {
    const env = mockEnv({ credRow: null })
    await expect(webauthn.verifyAuthentication(env, {
      response: { response: { clientDataJSON: clientDataJSON('auth-challenge') }, rawId: 'cred-404', id: 'cred-404' },
    })).rejects.toMatchObject({ status: 404 })
  })

  it('rejects an expired/unknown challenge with 400', async () => {
    const env = mockEnv()
    env.DB.prepare = (_sql) => ({
      bind: () => ({ first: async () => null, run: async () => {}, all: async () => ({ results: [] }) }),
      first: async () => null, run: async () => {}, all: async () => ({ results: [] }),
    })
    await expect(webauthn.verifyAuthentication(env, {
      response: { response: { clientDataJSON: clientDataJSON('stale') }, rawId: 'cred-1', id: 'cred-1' },
    })).rejects.toMatchObject({ status: 400 })
  })

  it('stores a one-time challenge for registration (replay protection)', async () => {
    const env = mockEnv()
    await webauthn.buildRegistrationOptions(env, { username: 'emp@acme.com', origin: 'https://kiosk.example.com' })
    expect(env.runs.some((r) => r.sql.includes('INSERT INTO webauthn_challenges'))).toBe(true)
  })
})
