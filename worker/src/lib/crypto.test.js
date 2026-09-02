import { describe, it, expect } from 'vitest'
import { createToken, verifyToken } from './crypto.js'

const b64url = (t) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('createToken / verifyToken', () => {
  it('round-trips a token whose base64 payload contains URL-safe characters', async () => {
    // Regression: names like "Ana María + José" produce base64 containing
    // '+' or '/', which b64url rewrites to '-'/'_' — verifyToken must convert
    // back before atob() or the token is rejected with 401.
    const user = { email: 'a@b.com', role: 'employee', name: 'Ana María + José' }
    const token = await createToken(user, 'secret')
    const claims = await verifyToken(token, 'secret')
    expect(claims).not.toBeNull()
    expect(claims.sub).toBe('a@b.com')
    expect(claims.name).toBe('Ana María + José')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await createToken({ email: 'x@y.com', role: 'employee', name: 'Zoë' }, 's1')
    expect(await verifyToken(token, 's2')).toBeNull()
  })

  it('rejects expired tokens', async () => {
    const payload = b64url(JSON.stringify({ sub: 'a@b.com', role: 'employee', exp: Date.now() - 1000 }))
    const token = `${payload}.deadbeef`
    expect(await verifyToken(token, 'secret')).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyToken('', 'secret')).toBeNull()
    expect(await verifyToken('no-dot-token', 'secret')).toBeNull()
    expect(await verifyToken('bad.sig', 'secret')).toBeNull()
  })
})
