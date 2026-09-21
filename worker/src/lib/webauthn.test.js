import { beforeEach, describe, expect, it, vi } from 'vitest'

const b64url = (value) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const calls = vi.hoisted(() => ({ reg: [], auth: [], verifyReg: [], verifyAuth: [] }))

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: async (options) => { calls.reg.push(options); return { challenge: 'reg-challenge' } },
  verifyRegistrationResponse: async (options) => {
    calls.verifyReg.push(options)
    return { verified: true, registrationInfo: { credential: { id: 'cred-new', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] } } }
  },
  generateAuthenticationOptions: async (options) => { calls.auth.push(options); return { challenge: 'auth-challenge' } },
  verifyAuthenticationResponse: async (options) => { calls.verifyAuth.push(options); return { verified: true, authenticationInfo: { newCounter: 5 } } },
}))

import * as webauthn from '../webauthn.js'

function mockEnv({ challengeEmail = 'emp@acme.com', credential = true } = {}) {
  const runs = []
  const activeCredentials = [
    { credential_id: 'cred-1', transports: '["internal"]' },
    { credential_id: 'cred-2', transports: '["internal"]' },
  ]
  return {
    runs,
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              all: async () => ({ results: sql.includes('webauthn_credentials') ? activeCredentials : [] }),
              first: async () => {
                if (sql.includes('webauthn_challenges')) return {
                  challenge: args[0], kind: args[1], email: challengeEmail,
                  rp_id: 'app.example.com', origin: 'https://app.example.com', expires_at: Date.now() + 60000,
                }
                if (sql.includes('webauthn_credentials WHERE credential_id')) return credential ? {
                  credential_id: 'cred-1', public_key: b64url('fake-key'), counter: 0,
                  transports: '["internal"]', email: 'emp@acme.com', revoked_at: null,
                } : null
                return null
              },
              run: async () => { runs.push({ sql, args }) },
            }
          },
        }
      },
    },
  }
}

const request = (origin = 'https://app.example.com') => new Request('https://app.example.com/api/time-clock', { headers: { Origin: origin } })
const response = (challenge = 'auth-challenge') => ({
  response: { clientDataJSON: b64url(JSON.stringify({ challenge })) },
  rawId: 'cred-1', id: 'cred-1',
})

describe('personal passkeys', () => {
  beforeEach(() => Object.values(calls).forEach((items) => { items.length = 0 }))

  it('derives the relying-party origin from the HTTP request and excludes all existing phone passkeys', async () => {
    const env = mockEnv()
    await webauthn.buildRegistrationOptions(env, { username: 'emp@acme.com', request: request() })
    expect(calls.reg[0].rpID).toBe('app.example.com')
    expect(calls.reg[0].excludeCredentials).toHaveLength(2)
    expect(calls.reg[0].authenticatorSelection).toEqual({
      authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required',
    })
    expect(env.runs.some((entry) => entry.sql.includes('INSERT INTO webauthn_challenges'))).toBe(true)
  })

  it('offers every active passkey registered to that employee and requires phone verification', async () => {
    const env = mockEnv()
    await webauthn.buildAuthenticationOptions(env, { request: request(), email: 'emp@acme.com' })
    expect(calls.auth[0].allowCredentials.map((item) => item.id)).toEqual(['cred-1', 'cred-2'])
    expect(calls.auth[0].userVerification).toBe('required')
  })

  it('rejects a foreign browser origin that is not configured', () => {
    expect(() => webauthn.expectedWebAuthnOrigin(request('https://evil.example'))).toThrow(/Untrusted/)
  })

  it('accepts an explicitly configured browser origin', () => {
    expect(webauthn.expectedWebAuthnOrigin(request('https://staff.example'), { ALLOWED_ORIGINS: 'https://staff.example' })).toBe('https://staff.example')
  })

  it('binds the one-time challenge to the employee and records last use', async () => {
    const env = mockEnv()
    const result = await webauthn.verifyAuthentication(env, { response: response() })
    expect(result).toMatchObject({ email: 'emp@acme.com', credentialId: 'cred-1' })
    expect(calls.verifyAuth[0].expectedOrigin).toBe('https://app.example.com')
    expect(env.runs.some((entry) => entry.sql.includes('last_used_at'))).toBe(true)
  })

  it('rejects a passkey belonging to a different employee', async () => {
    const env = mockEnv({ challengeEmail: 'other@acme.com' })
    await expect(webauthn.verifyAuthentication(env, { response: response() })).rejects.toMatchObject({ status: 401 })
  })

  it('rejects a revoked or unknown passkey', async () => {
    const env = mockEnv({ credential: false })
    await expect(webauthn.verifyAuthentication(env, { response: response() })).rejects.toMatchObject({ status: 404 })
  })

  it('rejects an expired or already-used challenge', async () => {
    const env = mockEnv()
    env.DB.prepare = () => ({ bind: () => ({ first: async () => null, run: async () => {}, all: async () => ({ results: [] }) }) })
    await expect(webauthn.verifyAuthentication(env, { response: response('stale') })).rejects.toMatchObject({ status: 400 })
  })
})
