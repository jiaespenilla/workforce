import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getActiveSettings, getSystemTimeZone, isMaintenanceMode, setMaintenanceMode, getSessionTimeoutMinutes, setSessionTimeoutMinutes, pushSystemSettingsToServer } from '../src/lib/systemSettings.js'
import { getLegalDocs } from '../src/lib/legal.js'

describe('systemSettings', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when empty', () => {
    const s = getActiveSettings()
    expect(s.name).toBe('CadensIQ')
    expect(s.developerCompany).toBe('CelestSolutions')
    expect(s.version).toBe('v0.1.0')
    expect(s.timezone).toBe('(GMT+08:00) Asia/Manila')
  })

  it('merges localStorage overrides', () => {
    localStorage.setItem('uw_system_settings', JSON.stringify({ name: 'Acme', version: 'v2.0.0' }))
    const s = getActiveSettings()
    expect(s.name).toBe('Acme')
    expect(s.version).toBe('v2.0.0')
    expect(s.timezone).toBe('(GMT+08:00) Asia/Manila')
  })

  it('parses timezone correctly', () => {
    localStorage.setItem('uw_system_settings', JSON.stringify({ timezone: '(GMT-05:00) America/New_York' }))
    expect(getSystemTimeZone()).toBe('America/New_York')
    localStorage.clear()
    expect(getSystemTimeZone()).toBe('Asia/Manila')
  })

  it('toggles maintenance mode', () => {
    expect(isMaintenanceMode()).toBe(false)
    setMaintenanceMode(true)
    expect(isMaintenanceMode()).toBe(true)
    setMaintenanceMode(false)
    expect(isMaintenanceMode()).toBe(false)
  })

  it('handles session timeout', () => {
    expect(getSessionTimeoutMinutes()).toBe(0)
    setSessionTimeoutMinutes(30)
    expect(getSessionTimeoutMinutes()).toBe(30)
    setSessionTimeoutMinutes(0)
    expect(getSessionTimeoutMinutes()).toBe(0)
    setSessionTimeoutMinutes('invalid')
    expect(getSessionTimeoutMinutes()).toBe(0)
  })

  it('saves developer credit to the server and updates default legal text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    try {
      expect(await pushSystemSettingsToServer({ developerCompany: 'Example Studio' })).toBeNull()
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ developer_company: 'Example Studio' })
      expect(getActiveSettings().developerCompany).toBe('Example Studio')
      expect(getLegalDocs().terms).toContain('by Example Studio')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
