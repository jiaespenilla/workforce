import { describe, it, expect } from 'vitest'
import { handle } from '../worker/src/routes/tasks.js'

// (69) Due-date management — PUT /api/tasks/:id with `due` is a management
// action: the CEO, administrators and manager roles may change or clear it;
// regular employees may not (but may still update status, e.g. drag columns).

function makeEnv(tasks, people = {}) {
  return {
    DB: {
      prepare(sql) {
        const state = { args: [] }
        return {
          bind(...args) { state.args = args; return this },
          async first() {
            if (/SELECT \* FROM tasks WHERE id = \?/.test(sql)) {
              return tasks.find((t) => t.id === state.args[0]) || null
            }
            if (/SELECT assignee, assignee_company_id FROM tasks/.test(sql)) {
              const t = tasks.find((x) => x.id === state.args[0])
              return t ? { assignee: t.assignee, assignee_company_id: t.assignee_company_id } : null
            }
            // callerCompanyId / isManager — both look up the employees table by email
            if (/FROM employees WHERE lower\(email\)/.test(sql)) {
              return people[String(state.args[0]).toLowerCase()] || null
            }
            return null
          },
          async all() { return { results: [] } },
          async run() {
            if (/UPDATE tasks SET due = NULL/.test(sql)) {
              const t = tasks.find((x) => x.id === state.args[0])
              if (t) t.due = null
            } else if (/UPDATE tasks SET title = COALESCE/.test(sql)) {
              // Legacy bind order: title, assignee, priority, due, status, id
              const t = tasks.find((x) => x.id === state.args[state.args.length - 1])
              if (t) {
                const [title, assignee, priority, due, status] = state.args
                if (title != null) t.title = title
                if (assignee != null) t.assignee = assignee
                if (priority != null) t.priority = priority
                if (due != null) t.due = due
                if (status != null) t.status = status
              }
            }
            return { success: true }
          },
        }
      },
    },
  }
}

const PEOPLE = {
  'alice@acme.com': { company_id: 'co1', role: 'Employee' },
  'mandy@acme.com': { company_id: 'co1', role: 'HR Manager' },
}

const putTask = (env, id, body, claims, isAdmin = false) =>
  handle({
    request: new Request(`https://app.test/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    path: `/api/tasks/${id}`,
    method: 'PUT',
    claims,
    isAdmin,
  })

const baseTask = {
  id: 1,
  title: 'Draft report',
  assignee: 'Alice Cruz (Acme)',
  assignee_company_id: 'co1',
  status: 'pending',
  due: '2026-01-15',
}

describe('PUT /api/tasks/:id — due date is a management action (69)', () => {
  it('lets the CEO change the due date', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks), 1, { due: '2026-02-01' }, { sub: 'ceo@acme.com', role: 'ceo' })
    expect(res.status).toBe(200)
    expect(tasks[0].due).toBe('2026-02-01')
  })

  it('lets administrators change the due date', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks), 1, { due: '2026-03-01' }, { sub: 'a@x.com', role: 'employee' }, true)
    expect(res.status).toBe(200)
    expect(tasks[0].due).toBe('2026-03-01')
  })

  it('lets manager-role employees (HR Manager / Team Lead) change the due date', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks, PEOPLE), 1, { due: '2026-04-01' }, { sub: 'mandy@acme.com', role: 'employee' })
    expect(res.status).toBe(200)
    expect(tasks[0].due).toBe('2026-04-01')
  })

  it('rejects a regular employee with 403', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks, PEOPLE), 1, { due: '2026-05-01' }, { sub: 'alice@acme.com', role: 'employee' })
    expect(res.status).toBe(403)
    expect(tasks[0].due).toBe('2026-01-15') // unchanged
  })

  it('clears the due date when an empty value is sent', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks), 1, { due: '' }, { sub: 'ceo@acme.com', role: 'ceo' })
    expect(res.status).toBe(200)
    expect(tasks[0].due).toBeNull()
  })

  it('still lets a regular employee update status (no due field — drag columns)', async () => {
    const tasks = [{ ...baseTask }]
    const res = await putTask(makeEnv(tasks, PEOPLE), 1, { status: 'inprogress' }, { sub: 'alice@acme.com', role: 'employee' })
    expect(res.status).toBe(200)
    expect(tasks[0].status).toBe('inprogress')
    expect(tasks[0].due).toBe('2026-01-15')
  })
})