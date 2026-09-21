import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handle as publicHandle } from '../worker/src/routes/public.js'
import { handle as attendanceHandle } from '../worker/src/routes/attendance.js'
import { handle as adminHandle } from '../worker/src/routes/admin.js'
import { ensureUser } from '../worker/src/lib/db.js'
import { cors, setAllowedOrigins, toErrorResponse, HttpError } from '../worker/src/lib/http.js'
import { getDefaultEmployeePassword } from '../worker/src/lib/constants.js'

// Generic D1 mock driven by SQL regexes; records every statement in .calls.
function makeDb(opts = {}) {
  const calls = []
  const settings = opts.settings || {}
  const db = {
    calls,
    prepare(sql) {
      const state = { args: [] }
      const stmt = {
        sql,
        bind(...args) { state.args = args; stmt._args = [...args]; return stmt },
        async first() {
          calls.push({ sql, args: [...state.args], op: 'first' })
          if (/FROM settings WHERE key = \?/.test(sql)) {
            const v = settings[state.args[0]]
            return v !== undefined ? { value: v } : null
          }
          if (/COUNT\(\*\) AS n FROM login_attempts/.test(sql)) return { n: 0 }
          if (/SELECT \* FROM companies WHERE id = \?/.test(sql)) {
            return { id: state.args[0], name: 'Test Co', status: 'pending', active: 1, registered: '2026-09-14' }
          }
          if (opts.first) return opts.first(sql, state.args)
          return null
        },
        async all() {
          calls.push({ sql, args: [...state.args], op: 'all' })
          if (/FROM employees e JOIN companies c/.test(sql)) {
            return { results: [{ id: 1, name: 'Emp One', email: 'one@test.co', company: 'Test Co' }] }
          }
          return { results: [] }
        },
        async run() { calls.push({ sql, args: [...state.args], op: 'run' }); return { success: true, meta: { last_row_id: 1 } } },
      }
      return stmt
    },
    async batch(stmts) {
      // Record every statement in the atomic batch (op: 'batch') so tests can
      // assert on registration's all-or-nothing employee+user creation.
      for (const s of stmts) calls.push({ sql: s.sql, args: [...(s._args || [])], op: 'batch' })
      return { results: [] }
    },
  }
  return db
}

const req = (path, { method = 'GET', body, headers = {} } = {}) =>
  new Request(`https://app.test${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body), headers: { ...headers, 'Content-Type': 'application/json' } } : {}),
  })

beforeEach(() => {
  vi.restoreAllMocks()
  setAllowedOrigins('') // keep allowlist tests isolated
})

describe('POST /api/companies — public registration hardening', () => {
  const register = async (env, body) =>
    publicHandle({
      request: req('/api/companies', { method: 'POST', body }),
      env,
      url: new URL('https://app.test/api/companies'),
      path: '/api/companies',
      method: 'POST',
    })

  it('ignores client-supplied status/active/id and persists server-controlled values', async () => {
    const env = { DB: makeDb(), DEFAULT_EMPLOYEE_PASSWORD: 'uw-test-default' }
    const res = await register(env, {
      id: 'forged-id',
      name: 'Test Co',
      status: 'approved',
      active: false,
      employees: [{ name: 'Emp One', email: 'one@test.co', role: 'Employee' }],
    })
    expect(res.status).toBe(201)
    const insert = env.DB.calls.find((c) => c.op === 'run' && /INSERT INTO companies/.test(c.sql))
    expect(insert).toBeTruthy()
    const [id, name, industry, , , , , , status, active] = insert.args
    expect(id).toMatch(/^reg-/)
    expect(id).not.toBe('forged-id')
    expect(name).toBe('Test Co')
    expect(industry).toBeNull()
    expect(status).toBe('pending') // never client-controlled
    expect(active).toBe(1) // never client-controlled
    // The employee's sign-in account is created inside the same atomic batch
    // (registerEmployees) with the configured default password.
    const userInsert = env.DB.calls.find((c) => c.op === 'batch' && /INSERT INTO users/.test(c.sql))
    expect(userInsert).toBeTruthy()
    expect(userInsert.args[0]).toBe('one@test.co')
    expect(userInsert.args[4]).toMatch(/^pbkdf2:/)
  })

  it('trims and length-caps free-text fields from the unauthenticated endpoint', async () => {
    const env = { DB: makeDb(), DEFAULT_EMPLOYEE_PASSWORD: 'uw-test-default' }
    const res = await register(env, {
      name: '  Padded Co  ',
      industry: 'x'.repeat(500),
      address: 'a'.repeat(1000),
      owner: { name: '  Own Er  ' },
    })
    expect(res.status).toBe(201)
    const insert = env.DB.calls.find((c) => c.op === 'run' && /INSERT INTO companies/.test(c.sql))
    expect(insert.args[1]).toBe('Padded Co')
    expect(insert.args[2]).toHaveLength(100)
    expect(insert.args[3]).toHaveLength(300)
    expect(insert.args[10]).toBe('Own Er')
  })
})
describe('GET /api/kiosk/directory — token-gated, company-scoped', () => {
  const directory = (env, kioskToken) =>
    publicHandle({
      request: req('/api/kiosk/directory', kioskToken ? { headers: { 'X-Kiosk-Token': kioskToken } } : {}),
      env,
      url: new URL('https://app.test/api/kiosk/directory'),
      path: '/api/kiosk/directory',
      method: 'GET',
    })

  it('rejects callers without a kiosk device token (no employee data leaks)', async () => {
    const env = { DB: makeDb() }
    const res = await directory(env)
    expect(res.status).toBe(410)
    expect((await res.json()).error).toMatch(/retired/i)
    // No employee query was issued at all.
    expect(env.DB.calls.some((c) => /FROM employees/.test(c.sql))).toBe(false)
  })

  it('rejects unknown tokens and scopes valid tokens to their own company', async () => {
    const env = { DB: makeDb({ settings: { 'kiosk_device_token:uwk_good': 'co-9' } }) }
    const bad = await directory(env, 'uwk_unknown')
    expect(bad.status).toBe(410)

    const res = await directory(env, 'uwk_good')
    expect(res.status).toBe(410)
    expect(env.DB.calls.some((c) => /FROM employees/.test(c.sql))).toBe(false)
  })
})

describe('POST /api/attendance — signed-in punches are pinned to the caller', () => {
  const punch = (env, body, claims) =>
    attendanceHandle({
      request: req('/api/attendance', { method: 'POST', body }),
      env,
      url: new URL('https://app.test/api/attendance'),
      path: '/api/attendance',
      method: 'POST',
      claims,
    })
  // Company-employee DB: caller maps to co-1; the punch target exists in co-1.
  const employeeEnv = () =>
    makeDb({
      first: (sql) => {
        if (/SELECT company_id FROM employees/.test(sql)) return { company_id: 'co-1' }
        if (/SELECT id FROM employees/.test(sql)) return { id: 1 }
        return null
      },
    })

  it('rejects an employee punching for a coworker', async () => {
    const env = { DB: employeeEnv() }
    const res = await punch(env, { email: 'bob@acme.com', type: 'in' }, { sub: 'alice@acme.com', role: 'employee' })
    expect(res.status).toBe(405)
    expect(env.DB.calls.some((c) => /INSERT INTO attendance/.test(c.sql))).toBe(false)
  })

  it('allows an employee punching for themselves (company forced to their own)', async () => {
    const env = { DB: employeeEnv() }
    const res = await punch(env, { email: 'ALICE@acme.com', type: 'in' }, { sub: 'alice@acme.com', role: 'employee' })
    expect(res.status).toBe(405)
    expect(env.DB.calls.some((c) => /INSERT INTO attendance/.test(c.sql))).toBe(false)
  })

  it('still lets administrators record punches on behalf of employees', async () => {
    const env = { DB: makeDb() }
    const res = await punch(env, { email: 'bob@acme.com', type: 'out', company_id: 'co-1' }, { sub: 'admin_celestine', role: 'administrator' })
    expect(res.status).toBe(405)
    expect(env.DB.calls.some((c) => /INSERT INTO attendance/.test(c.sql))).toBe(false)
  })
})
describe('CORS — origins are never blindly reflected', () => {
  const withOrigin = (origin) => cors(new Request('https://app.test/api/x', { headers: { Origin: origin } }))
  const acao = (headers) => headers['Access-Control-Allow-Origin']

  it('echoes same-origin and localhost dev origins', () => {
    expect(acao(withOrigin('https://app.test'))).toBe('https://app.test')
    expect(acao(withOrigin('http://localhost:5173'))).toBe('http://localhost:5173')
    expect(acao(withOrigin('http://127.0.0.1:4173'))).toBe('http://127.0.0.1:4173')
  })

  it('withholds CORS headers for foreign origins', () => {
    expect(acao(withOrigin('https://evil.example'))).toBeUndefined()
    expect(acao(withOrigin('https://app.test.evil.example'))).toBeUndefined()
    expect(withOrigin('https://evil.example')['Vary']).toBeUndefined()
  })

  it('honors the ALLOWED_ORIGINS allowlist', () => {
    setAllowedOrigins('https://partner.example, https://other.example')
    expect(acao(withOrigin('https://partner.example'))).toBe('https://partner.example')
    expect(acao(withOrigin('https://not-allowed.example'))).toBeUndefined()
  })
})

describe('toErrorResponse — internals never reach clients', () => {
  it('passes through client-safe errors that carry a status', async () => {
    const res = toErrorResponse(HttpError(404, 'Company not found'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Company not found' })
  })

  it('logs and genericizes unexpected errors (no SQL/D1 details leaked)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = toErrorResponse(new Error('SQLITE_ERROR: no such table: tasks'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
    expect(spy).toHaveBeenCalledTimes(1) // logged server-side only
  })
})

describe('default password fails closed when unconfigured', () => {
  it('ensureUser refuses to mint accounts with an empty or placeholder password', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const env = { DB: makeDb() }
    const placeholder = getDefaultEmployeePassword(env)
    expect(placeholder).toBe('___REPLACE_VIA_ENV_DEFAULT_EMPLOYEE_PASSWORD___')
    await expect(ensureUser(env, 'a@b.co', 'A', 'employee', placeholder)).rejects.toThrow(/DEFAULT_EMPLOYEE_PASSWORD/)
    await expect(ensureUser(env, 'a@b.co', 'A', 'employee', '')).rejects.toThrow()
    expect(env.DB.calls.some((c) => /INSERT INTO users/.test(c.sql))).toBe(false)
    expect(warn).toHaveBeenCalled() // deployment misconfiguration is visible in logs
  })

  it('ensureUser creates the account when a real default password is configured', async () => {
    const env = { DB: makeDb(), DEFAULT_EMPLOYEE_PASSWORD: 'real-secret-1' }
    await ensureUser(env, 'a@b.co', 'A', 'employee', getDefaultEmployeePassword(env))
    const insert = env.DB.calls.find((c) => /INSERT INTO users/.test(c.sql))
    expect(insert.args[4]).toMatch(/^pbkdf2:/)
  })

  it('admin password-reset refuses to run without a configured default password', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const env = {
      DB: makeDb({
        first: (sql) => (/SELECT \* FROM users/.test(sql) ? { id: 5, email: 'alice@acme.com', role: 'employee', must_change_password: 0 } : null),
      }),
    }
    const res = await adminHandle({
      request: req('/api/admin/users/reset-password', { method: 'POST', body: { email: 'alice@acme.com' } }),
      env,
      path: '/api/admin/users/reset-password',
      method: 'POST',
      isAdmin: true,
      claims: { sub: 'admin_celestine' },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No default password is configured for this deployment.' })
    expect(env.DB.calls.some((c) => /UPDATE users SET password_salt/.test(c.sql))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Medium-effort scalability & auth hardening batch
// ---------------------------------------------------------------------------
import { handle as tasksHandle } from '../worker/src/routes/tasks.js'
import { requireAuth } from '../worker/src/lib/auth.js'
import { recordAttempts } from '../worker/src/lib/rateLimit.js'

describe('GET /api/tasks — SQL-level tenant scoping and pagination', () => {
  function taskEnv() {
    const db = makeDb()
    const origPrepare = db.prepare.bind(db)
    db.prepare = (sql) => {
      const stmt = origPrepare(sql)
      const oldFirst = stmt.first
      stmt.first = async function () {
        if (/COUNT\(\*\) AS n FROM tasks/.test(sql)) {
          db.calls.push({ sql, args: [...(stmt._args || [])], op: 'first' })
          return { n: 3 }
        }
        if (/SELECT company_id FROM employees WHERE lower\(email\)/.test(sql)) {
          db.calls.push({ sql, args: [...(stmt._args || [])], op: 'first' })
          return { company_id: 'co1' }
        }
        if (/SELECT name FROM companies WHERE id = \?/.test(sql)) {
          db.calls.push({ sql, args: [...(stmt._args || [])], op: 'first' })
          return { name: 'Test Co' }
        }
        if (/FROM companies WHERE lower\(email\)/.test(sql)) {
          db.calls.push({ sql, args: [...(stmt._args || [])], op: 'first' })
          return { company_id: 'co1' }
        }
        return oldFirst.apply(stmt, arguments)
      }
      const oldAll = stmt.all
      stmt.all = async function () {
        if (/FROM tasks/.test(sql)) {
          db.calls.push({ sql, args: [...(stmt._args || [])], op: 'all' })
          return { results: [{ id: 1, title: 'T', assignee: 'A (Test Co)', assignee_company_id: 'co1' }] }
        }
        return oldAll.apply(stmt, arguments)
      }
      return stmt
    }
    return db
  }

  // role 'employee' is the tenant-scoped path — ceo/administrator are platform
  // roles that intentionally see every company's tasks.
  const getTasks = (env, search = '') =>
    tasksHandle({
      request: req(`/api/tasks${search}`),
      env,
      url: new URL(`https://app.test/api/tasks${search}`),
      path: '/api/tasks',
      method: 'GET',
      claims: { sub: 'emp@test.co', role: 'employee' },
      isAdmin: false,
    })

  it('scopes the list with a SQL WHERE (assignee_company_id) instead of loading all rows', async () => {
    const env = { DB: taskEnv() }
    const res = await getTasks(env)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    const scoped = env.DB.calls.find((c) => /assignee_company_id = \?/.test(c.sql))
    expect(scoped).toBeTruthy()
    expect(scoped.args).toContain('co1')
    // No full-table load happens anymore.
    expect(env.DB.calls.some((c) => c.sql === 'SELECT * FROM tasks ORDER BY id DESC')).toBe(false)
  })

  it('pushes pagination and search into SQL with a matching COUNT', async () => {
    const env = { DB: taskEnv() }
    const res = await getTasks(env, '?limit=10&offset=5&q=audit')
    const data = await res.json()
    expect(data.total).toBe(3)
    expect(data.limit).toBe(10)
    expect(data.offset).toBe(5)
    expect(data.data).toHaveLength(1)
    const count = env.DB.calls.find((c) => /COUNT\(\*\) AS n FROM tasks/.test(c.sql))
    expect(count.sql).toMatch(/lower\(title\) LIKE/)
    const list = env.DB.calls.find((c) => /LIMIT \? OFFSET \?/.test(c.sql))
    expect(list).toBeTruthy()
    expect(list.args.slice(-2)).toEqual([10, 5])
    expect(list.args).toContain('%audit%')
  })
})

describe('requireAuth — deactivated employees lose access immediately', () => {
  it('rejects a valid token whose employee row is inactive', async () => {
    const { createToken } = await import('../worker/src/lib/crypto.js')
    const env = {
      AUTH_SECRET: 'test-secret',
      DB: makeDb({ first: (sql) => (/SELECT active FROM employees/.test(sql) ? { active: 0 } : null) }),
    }
    const token = await createToken({ email: 'deactivated@x.co', role: 'employee', name: 'D' }, env.AUTH_SECRET)
    const request = new Request('https://app.test/api/tasks', { headers: { Authorization: `Bearer ${token}` } })
    await expect(requireAuth(request, env)).rejects.toMatchObject({ status: 401, message: 'Account deactivated.' })
  })

  it('allows active employees and platform administrators (no employee row)', async () => {
    const { createToken } = await import('../worker/src/lib/crypto.js')
    const env = {
      AUTH_SECRET: 'test-secret',
      DB: makeDb({ first: (sql) => (/SELECT active FROM employees/.test(sql) ? { active: 1 } : null) }),
    }
    const empToken = await createToken({ email: 'active@x.co', role: 'employee', name: 'A' }, env.AUTH_SECRET)
    const empReq = new Request('https://app.test/api/tasks', { headers: { Authorization: `Bearer ${empToken}` } })
    expect((await requireAuth(empReq, env)).sub).toBe('active@x.co')
    const envNoRow = { AUTH_SECRET: 'test-secret', DB: makeDb() }
    const adminToken = await createToken({ email: 'admin@x.co', role: 'administrator', name: 'Ad' }, envNoRow.AUTH_SECRET)
    const adminReq = new Request('https://app.test/api/tasks', { headers: { Authorization: `Bearer ${adminToken}` } })
    expect((await requireAuth(adminReq, envNoRow)).role).toBe('administrator')
  })
})

describe('recordAttempts — cleanup delete is sampled, not on every call', () => {
  it('always inserts the attempt; the DELETE appears only on sampled calls', async () => {
    const db = makeDb()
    let withDelete = 0
    for (let i = 0; i < 300; i++) {
      db.calls.length = 0
      await recordAttempts({ DB: db }, ['login:ip:1.2.3.4'])
      expect(db.calls.some((c) => /INSERT INTO login_attempts/.test(c.sql))).toBe(true)
      if (db.calls.some((c) => /DELETE FROM login_attempts/.test(c.sql))) withDelete++
    }
    expect(withDelete).toBeLessThan(60) // ~2% expected; never on every call
  })
})
