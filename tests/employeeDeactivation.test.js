import { describe, it, expect } from 'vitest'
import { handle } from '../worker/src/routes/companies.js'

// (70) Resignation guard — an employee with active (non-completed) tasks
// cannot be deactivated or removed until the tasks are transferred or done.

function makeEnv({ activeTasks = 0, callerCompany = 'co1' } = {}) {
  const calls = []
  return {
    calls,
    DB: {
      prepare(sql) {
        const state = { args: [] }
        calls.push(sql)
        return {
          bind(...args) { state.args = args; return this },
          async first() {
            if (/COUNT\(\*\) AS n/.test(sql)) return { n: activeTasks }
            if (/SELECT email, name, company_id FROM employees/.test(sql)) {
              return { email: 'alice@acme.com', name: 'Alice Cruz', company_id: 'co1' }
            }
            if (/SELECT name FROM employees WHERE id/.test(sql)) return { name: 'Alice Cruz' }
            if (/SELECT company_id FROM employees WHERE id = \?/.test(sql)) return { company_id: 'co1' }
            if (/SELECT company_id FROM employees WHERE lower\(email\)/.test(sql)) return { company_id: callerCompany }
            if (/SELECT name FROM companies WHERE id/.test(sql)) return { name: 'Acme' }
            if (/SELECT email FROM employees WHERE id/.test(sql)) return { email: 'alice@acme.com' }
            return null
          },
          async all() { return { results: [] } },
          async run() { return { success: true } },
        }
      },
    },
  }
}

const putEmployee = (env, body, claims = { sub: 'ceo@acme.com', role: 'ceo' }, method = 'PUT') =>
  handle({
    request: new Request(`https://app.test/api/employees/7`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'PUT' ? JSON.stringify(body) : undefined,
    }),
    env,
    path: '/api/employees/7',
    method,
    claims,
    isAdmin: false,
  })

describe('employee deactivation guard (70)', () => {
  it('blocks deactivation with a 409 while active tasks exist', async () => {
    const env = makeEnv({ activeTasks: 2 })
    const res = await putEmployee(env, { active: false })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toMatch(/2 active tasks/)
    expect(data.error).toMatch(/Transfer/)
  })

  it('allows deactivation once no active tasks remain', async () => {
    const env = makeEnv({ activeTasks: 0 })
    const res = await putEmployee(env, { active: false })
    expect(res.status).toBe(200)
  })

  it('does not run the guard when activating an employee', async () => {
    const env = makeEnv({ activeTasks: 5 })
    const res = await putEmployee(env, { active: true })
    expect(res.status).toBe(200)
    expect(env.calls.some((s) => s.includes('COUNT(*)'))).toBe(false)
  })

  it('allows unrelated edits (role) while active tasks exist', async () => {
    const env = makeEnv({ activeTasks: 3 })
    const res = await putEmployee(env, { role: 'HR Manager' })
    expect(res.status).toBe(200)
  })

  it('blocks removal (DELETE) while active tasks exist', async () => {
    const env = makeEnv({ activeTasks: 1 })
    const res = await putEmployee(env, null, { sub: 'ceo@acme.com', role: 'ceo' }, 'DELETE')
    expect(res.status).toBe(409)
  })

  it('allows removal once tasks are cleared', async () => {
    const env = makeEnv({ activeTasks: 0 })
    const res = await putEmployee(env, null, { sub: 'ceo@acme.com', role: 'ceo' }, 'DELETE')
    expect(res.status).toBe(200)
  })
})