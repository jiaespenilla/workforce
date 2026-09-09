import { describe, it, expect } from 'vitest'
import { handle } from '../worker/src/routes/tasks.js'
import { mapTask } from '../worker/src/lib/db.js'

// Minimal D1 mock covering the queries the work-log timer issues.
// UPDATEs mutate the matching task row in place, mirroring D1 semantics.
function makeEnv(tasks) {
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
            return null
          },
          async all() { return { results: tasks } },
          async run() {
            if (/^UPDATE tasks SET/.test(sql)) {
              const t = tasks.find((x) => x.id === state.args[state.args.length - 1])
              if (t) {
                if (sql.includes('work_seconds')) {
                  t.work_seconds = state.args[0]
                  t.work_started_at = state.args[1]
                  t.work_log = state.args[2]
                } else if (sql.includes('status')) {
                  t.status = state.args[0]
                }
              }
            }
            return { success: true }
          },
        }
      },
    },
  }
}

const call = (env, id, action, claims = { sub: 'alice@acme.com', role: 'employee' }) =>
  handle({
    request: new Request(`https://app.test/api/tasks/${id}/work-log/${action}`, { method: 'POST' }),
    env,
    path: `/api/tasks/${id}/work-log/${action}`,
    method: 'POST',
    claims,
    isAdmin: false,
  })

const baseTask = {
  id: 1,
  title: 'Draft report',
  assignee: 'Alice Cruz (Acme)',
  assignee_email: 'alice@acme.com',
  status: 'inprogress',
  work_seconds: 0,
  work_started_at: null,
  work_log: null,
}

describe('POST /api/tasks/:id/work-log/start', () => {
  it('404s for unknown tasks', async () => {
    const res = await call(makeEnv([baseTask]), 99, 'start')
    expect(res.status).toBe(404)
  })

  it('403s when the caller is not the assignee', async () => {
    const res = await call(makeEnv([baseTask]), 1, 'start', { sub: 'bob@acme.com', role: 'employee' })
    expect(res.status).toBe(403)
  })

  it('starts a session and moves a pending task to in-progress', async () => {
    const env = makeEnv([{ ...baseTask, status: 'pending' }])
    const res = await call(env, 1, 'start')
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.status).toBe('inprogress')
    expect(data.workStartedAt).toBeTruthy()
  })

  it('409s when the timer is already running', async () => {
    const env = makeEnv([{ ...baseTask, work_started_at: new Date().toISOString() }])
    const res = await call(env, 1, 'start')
    expect(res.status).toBe(409)
  })
})

describe('POST /api/tasks/:id/work-log/stop', () => {
  it('accumulates elapsed seconds and appends a session to the log', async () => {
    const startedAt = new Date(Date.now() - 60000).toISOString() // ~60s ago
    const env = makeEnv([{ ...baseTask, work_started_at: startedAt }])
    const res = await call(env, 1, 'stop')
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.workStartedAt).toBeNull()
    expect(data.workSeconds).toBeGreaterThanOrEqual(55)
    expect(data.workSeconds).toBeLessThan(120)
    expect(data.workLog).toHaveLength(1)
    expect(data.workLog[0].start).toBe(startedAt)
    expect(data.workLog[0].seconds).toBe(data.workSeconds)
  })

  it('409s when the timer is not running', async () => {
    const res = await call(makeEnv([baseTask]), 1, 'stop')
    expect(res.status).toBe(409)
  })

  it('adds a second session on top of accumulated time', async () => {
    const startedAt = new Date(Date.now() - 30000).toISOString()
    const env = makeEnv([{ ...baseTask, work_seconds: 120, work_started_at: startedAt, work_log: JSON.stringify([{ start: startedAt, end: startedAt, seconds: 120 }]) }])
    const res = await call(env, 1, 'stop')
    const data = await res.json()
    expect(data.workSeconds).toBeGreaterThanOrEqual(145)
    expect(data.workLog).toHaveLength(2)
  })
})

describe('mapTask work-log fields', () => {
  it('exposes timer fields with safe defaults', () => {
    const mapped = mapTask({ id: 2, title: 'T', assignee: 'A (C)', work_seconds: 90, work_started_at: null, work_log: '[{"start":"s","end":"e","seconds":90}]' })
    expect(mapped.workSeconds).toBe(90)
    expect(mapped.workStartedAt).toBeNull()
    expect(mapped.workLog).toHaveLength(1)
  })

  it('defaults missing timer columns and corrupt JSON', () => {
    const mapped = mapTask({ id: 3, title: 'T', assignee: 'A (C)', work_log: 'not-json' })
    expect(mapped.workSeconds).toBe(0)
    expect(mapped.workStartedAt).toBeNull()
    expect(mapped.workLog).toEqual([])
  })
})
