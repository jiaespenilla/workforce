import { describe, expect, it } from 'vitest'
import { activeEmployee, decideAttendanceAction, normalizeLocation } from './timeClock.js'

describe('personal time clock rules', () => {
  it('keeps a granted GPS reading and records denied/unavailable without coordinates', () => {
    expect(normalizeLocation({ status: 'granted', latitude: 14.6, longitude: 121.0, accuracy: 12 })).toEqual({ status: 'granted', latitude: 14.6, longitude: 121, accuracy: 12 })
    expect(normalizeLocation({ status: 'denied', latitude: 14.6, longitude: 121 })).toEqual({ status: 'denied', latitude: null, longitude: null, accuracy: null })
    expect(normalizeLocation({ status: 'granted', latitude: 200, longitude: 121 })).toEqual({ status: 'granted', latitude: null, longitude: null, accuracy: null })
  })

  it('uses server-side alternation and ignores any phone action', () => {
    const now = new Date('2026-09-21T01:00:00.000Z')
    expect(decideAttendanceAction([], null, now, 'UTC').action).toBe('in')
    expect(decideAttendanceAction([{ type: 'in', time: '2026-09-21T00:30:00.000Z' }], null, now, 'UTC').action).toBe('out')
  })

  it('keeps an open shift clocked in across midnight and calculates overtime', () => {
    const punches = [{ type: 'in', time: '2026-09-20T14:00:00.000Z' }]
    const result = decideAttendanceAction(punches, { open: true }, new Date('2026-09-21T01:00:00.000Z'), 'UTC')
    expect(result).toEqual({ action: 'out', overtime: true, overtimeMinutes: 660 })
  })

  it('honors a terminal-provided action but still calculates on the server', () => {
    const result = decideAttendanceAction([], null, new Date('2026-09-21T01:00:00.000Z'), 'UTC', 'out')
    expect(result).toEqual({ action: 'out', overtime: false, overtimeMinutes: 0 })
  })

  it('blocks inactive employees or companies before a punch', async () => {
    const env = {
      DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 1, active: 0, company_active: 1, company_status: 'approved' }) }) }) },
    }
    await expect(activeEmployee(env, 'inactive@example.com')).rejects.toMatchObject({ status: 403 })
  })
})
