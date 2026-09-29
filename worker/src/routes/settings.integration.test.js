import { describe, expect, it } from 'vitest'
import { handle } from './settings.js'

function environment() {
  const values = new Map()
  return {
    values,
    DB: {
      prepare: (sql) => ({
        all: async () => ({ results: [...values].map(([key, value]) => ({ key, value })) }),
        bind: (key, value) => ({ run: async () => { values.set(key, value) } }),
      }),
    },
  }
}

const request = (body) => new Request('https://app.example/api/settings', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

describe('developer company setting', () => {
  it('lets an administrator save a trimmed developer company and read it back', async () => {
    const env = environment()
    const saved = await handle({ request: request({ developer_company: '  Example Studio  ' }), env, path: '/api/settings', method: 'PUT', claims: { role: 'administrator' }, isAdmin: true })
    expect(saved.status).toBe(200)
    expect(env.values.get('developer_company')).toBe('Example Studio')
    const read = await handle({ request: new Request('https://app.example/api/settings'), env, path: '/api/settings', method: 'GET' })
    expect(await read.json()).toEqual({ developer_company: 'Example Studio' })
  })

  it('rejects an owner editing platform credit or an empty name without partial writes', async () => {
    const env = environment()
    const owner = await handle({ request: request({ system_name: 'Changed', developer_company: 'Other' }), env, path: '/api/settings', method: 'PUT', claims: { role: 'ceo' }, isAdmin: false })
    expect(owner.status).toBe(403)
    const empty = await handle({ request: request({ system_name: 'Changed', developer_company: ' ' }), env, path: '/api/settings', method: 'PUT', claims: { role: 'administrator' }, isAdmin: true })
    expect(empty.status).toBe(400)
    expect(env.values.size).toBe(0)
  })
})
