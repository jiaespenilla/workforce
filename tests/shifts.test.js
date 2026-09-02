import { describe, it, expect } from 'vitest'
import { decideAction } from '../src/lib/shifts.js'

const noon = new Date('2026-08-28T12:00:00')
const late = new Date('2026-08-28T19:00:00')

describe('decideAction', () => {
  it('alternates in/out when no shift (first scan is in)', () => {
    expect(decideAction([], null, noon).action).toBe('in')
    expect(decideAction([{ time: '2026-08-28T08:00:00', type: 'in' }], null, noon).action).toBe('out')
    expect(decideAction([{ time: '2026-08-28T08:00:00', type: 'in' }, { time: '2026-08-28T12:00:00', type: 'out' }], null, new Date('2026-08-28T13:00:00')).action).toBe('in')
  })

  it('open shift alternates regardless of time', () => {
    const openShift = { open: true }
    expect(decideAction([], openShift, noon).action).toBe('in')
    expect(decideAction([{ time: '2026-08-28T08:00:00', type: 'in' }], openShift, noon).action).toBe('out')
    expect(decideAction([{ time: '2026-08-28T08:00:00', type: 'in' }], openShift, noon).overtime).toBe(false)
  })

    it('open shift: overtime fires when clocking out past clock-in + 8h + grace (whole session is OT)', () => {
    const openShift = { open: true }
    const inAt = '2026-08-28T08:00:00'
    // Open-shift "end" is 08:00 + 8h + 15m grace = 16:15.
    // 18:00 is past the end → entire 10h session counts as overtime.
    const r = decideAction([{ time: inAt, type: 'in' }], openShift, new Date('2026-08-28T18:00:00'))
    expect(r.action).toBe('out')
    expect(r.overtime).toBe(true)
    expect(r.overtimeMinutes).toBe(600) // whole 10h session
    // Exactly 8h (16:00) is not past the 16:15 end → no overtime.
    const exact = decideAction([{ time: inAt, type: 'in' }], openShift, new Date('2026-08-28T16:00:00'))
    expect(exact.overtime).toBe(false)
    expect(exact.overtimeMinutes).toBe(0)
    // 8.5h (16:30) is past the end → whole session is overtime.
    const half = decideAction([{ time: inAt, type: 'in' }], openShift, new Date('2026-08-28T16:30:00'))
    expect(half.overtime).toBe(true)
    expect(half.overtimeMinutes).toBe(510) // whole 8.5h session
    // Clock-in scans never carry overtime
    expect(decideAction([], openShift, noon).overtimeMinutes).toBe(0)
  })

  it('timed shift: first scan is in, second is out', () => {
    const shift = { start: '09:00', end: '18:00' }
    expect(decideAction([], shift, new Date('2026-08-28T08:55:00')).action).toBe('in')
    expect(decideAction([{ time: '2026-08-28T09:00:00', type: 'in' }], shift, noon).action).toBe('out')
  })

  it('detects overtime when clocking out past end + grace', () => {
    const shift = { start: '09:00', end: '18:00' }
    const punches = [{ time: '2026-08-28T09:00:00', type: 'in' }]
    expect(decideAction(punches, shift, late, 15).overtime).toBe(true) // 19:00 > 18:15
    expect(decideAction(punches, shift, new Date('2026-08-28T18:10:00'), 15).overtime).toBe(false)
  })

  it('ignores punches from other days', () => {
    const shift = { start: '09:00', end: '18:00' }
    const yesterday = [{ time: '2026-08-27T09:00:00', type: 'in' }]
    expect(decideAction(yesterday, shift, noon).action).toBe('in')
  })
})
