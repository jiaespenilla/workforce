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
