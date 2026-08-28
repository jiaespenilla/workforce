import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiEnabled, cleanStaleLocalStorage } from '../src/lib/api.js'

describe('apiEnabled', () => {
  it('is true when location.origin exists (default)', () => {
    // In jsdom, location.origin is http://localhost:3000
    expect(apiEnabled()).toBe(true)
  })
})

describe('cleanStaleLocalStorage', () => {
  beforeEach(() => localStorage.clear())
  it('removes legacy keys once per session', () => {
    localStorage.setItem('uw_companies', '[]')
    localStorage.setItem('uw_ceo_tasks', '[]')
    localStorage.setItem('uw_punches', '[]')
    expect(localStorage.getItem('uw_companies')).toBe('[]')
    cleanStaleLocalStorage()
    expect(localStorage.getItem('uw_companies')).toBe(null)
    expect(localStorage.getItem('uw_ceo_tasks')).toBe(null)
    expect(localStorage.getItem('uw_local_cleaned')).toBe('1')
    // second call no-ops
    localStorage.setItem('uw_companies', '[]')
    cleanStaleLocalStorage()
    expect(localStorage.getItem('uw_companies')).toBe('[]')
  })
})

describe('api() headers', () => {
  it('includes Authorization when token present', async () => {
    localStorage.setItem('uw_token', 'test-jwt-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { api } = await import('../src/lib/api.js')
    await api('/api/me')
    const headers = fetchSpy.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer test-jwt-token')
    fetchSpy.mockRestore()
    localStorage.removeItem('uw_token')
  })
})
