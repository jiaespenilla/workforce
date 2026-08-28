import { describe, it, expect, beforeEach } from 'vitest'
import { getActiveSettings, getSystemTimeZone, isMaintenanceMode, setMaintenanceMode, getSessionTimeoutMinutes, setSessionTimeoutMinutes } from '../src/lib/systemSettings.js'

describe('systemSettings', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when empty', () => {
    const s = getActiveSettings()
    expect(s.name).toBe('CadensIQ')
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
})
