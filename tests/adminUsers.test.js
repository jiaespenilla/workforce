import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handle } from '../worker/src/routes/admin.js'

// Minimal D1 mock covering the queries admin.js issues.
function makeEnv(users, opts = {}) {
  const updates = []
  return {
    updates,
    DEFAULT_EMPLOYEE_PASSWORD: opts.defaultPassword ?? 'uw-default-2024',
    DB: {
      prepare(sql) {
        const state = { args: [] }
        return {
          bind(...args) { state.args = args; return this },
          async first() {
            if (/lower\(email\) = \?/.test(sql)) {
              const email = String(state.args[0]).toLowerCase()
              return users.find((u) => u.email.toLowerCase() === email) || null
            }
            return null
          },
          async all() { return { results: users.map(({ password_hash, password_salt, ...rest }) => rest) } },
          async run() { updates.push({ sql, args: state.args }); return { success: true } },
        }
      },
    },
  }
}

const request = (path, { method = 'GET', body } = {}) =>
  new Request(`https://app.test${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  })

const USERS = [
  { id: 1, email: 'alice@acme.com', name: 'Alice Cruz', role: 'employee', must_change_password: 0, password_salt: 's', password_hash: 'h' },
  { id: 2, email: 'admin@celestsolutions.com', name: 'Aizl Jo Bornillo', role: 'administrator', must_change_password: 0, password_salt: 's', password_hash: 'h' },
  { id: 3, email: 'ceo@celestsolutions.com', name: 'Celestine Espenilla', role: 'administrator', must_change_password: 0, password_salt: 's', password_hash: 'h' },
]

beforeEach(() => vi.restoreAllMocks())

describe('GET /api/admin/users', () => {
  it('forbids non-administrators', async () => {
    const res = await handle({ request: request('/api/admin/users'), env: makeEnv(USERS), path: '/api/admin/users', method: 'GET', isAdmin: false })
    expect(res.status).toBe(403)
  })

  it('lists accounts without credential material and flags default passwords', async () => {
    const env = makeEnv(USERS)
    const res = await handle({ request: request('/api/admin/users'), env, path: '/api/admin/users', method: 'GET', isAdmin: true })
    const data = await res.json()
    expect(data.users).toHaveLength(3)
    expect(data.users[0].password_hash).toBeUndefined()
    expect(data.users[0].usingDefaultPassword).toBe(false)
  })
})

describe('GET /api/admin/default-password', () => {
  it('is admin-only', async () => {
    const res = await handle({ request: request('/api/admin/default-password'), env: makeEnv(USERS), path: '/api/admin/default-password', method: 'GET', isAdmin: false })
    expect(res.status).toBe(403)
  })

  it('returns the deployment default password', async () => {
    const res = await handle({ request: request('/api/admin/default-password'), env: makeEnv(USERS, { defaultPassword: 's3cret-default' }), path: '/api/admin/default-password', method: 'GET', isAdmin: true })
    const data = await res.json()
    expect(data.password).toBe('s3cret-default')
  })
})

describe('POST /api/admin/users/reset-password', () => {
  const reset = (env, body, isAdmin = true, claims = { sub: 'admin_celestine' }) =>
    handle({ request: request('/api/admin/users/reset-password', { method: 'POST', body }), env, path: '/api/admin/users/reset-password', method: 'POST', isAdmin, claims })

  it('forbids non-administrators', async () => {
    const res = await reset(makeEnv(USERS), { email: 'alice@acme.com' }, false)
    expect(res.status).toBe(403)
  })

  it('requires a valid email', async () => {
    const res = await reset(makeEnv(USERS), { email: 'not-an-email' })
    expect(res.status).toBe(400)
  })

  it('404s for unknown accounts', async () => {
    const res = await reset(makeEnv(USERS), { email: 'nobody@acme.com' })
    expect(res.status).toBe(404)
  })

  it('refuses platform administrator accounts', async () => {
    const res = await reset(makeEnv(USERS), { email: 'admin@celestsolutions.com' })
    expect(res.status).toBe(403)
  })

  it('refuses emails without a valid address format', async () => {
    const res = await reset(makeEnv(USERS), { email: 'admin_celestine' })
    expect(res.status).toBe(400)
  })

  it('refuses the platform CEO account', async () => {
    const res = await reset(makeEnv(USERS), { email: 'ceo@celestsolutions.com' })
    expect(res.status).toBe(403)
  })

  it('refuses resetting your own account', async () => {
    const env = makeEnv([...USERS, { id: 9, email: 'me@acme.com', name: 'Me', role: 'employee', must_change_password: 0, password_salt: 's', password_hash: 'h' }])
    const res = await reset(env, { email: 'me@acme.com' }, true, { sub: 'me@acme.com' })
    expect(res.status).toBe(400)
  })

  it('resets a user password to the default and forces a change at next sign-in', async () => {
    const env = makeEnv(USERS, { defaultPassword: 'uw-default-2024' })
    const res = await reset(env, { email: 'ALICE@acme.com' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(env.updates).toHaveLength(1)
    const { sql, args } = env.updates[0]
    expect(sql).toContain('must_change_password = 1')
    expect(args[2]).toBe(1) // user id
    expect(args[1]).toMatch(/^pbkdf2:\d+:/) // hashed default, not plaintext
  })
})
