import { describe, it, expect } from 'vitest'
import { decideAction, isCurrentlyClockedIn, openSessionPunch, shiftForEmployee } from '../src/lib/shifts.js'

// (74) "Currently clocked in" must follow the SAME rule the kiosk uses to
// decide the next scan. A stale clock-in from a previous day must NOT show a
// person as clocked in (the kiosk would correctly record a new Clock In),
// except for open shifts, which legitimately carry sessions across midnight.

// Anchor: 2026-09-14 is a Monday. 04:00Z = 12:00 in Asia/Manila (GMT+8),
// safely mid-day so "today" in the system timezone is unambiguous.
const NOW = new Date('2026-09-14T04:00:00.000Z')
const TODAY_IN = '2026-09-14T01:00:00.000Z'   // 09:00 Manila
const TODAY_OUT = '2026-09-14T03:00:00.000Z'  // 11:00 Manila
const YESTERDAY_IN = '2026-09-13T01:00:00.000Z'
const TIMED_SHIFT = { id: 'sh-1', name: 'Day', start: '09:00', end: '18:00' }
const OPEN_SHIFT = { id: 'sh-open', name: 'Flexible', open: true }

describe('isCurrentlyClockedIn — same rule as the kiosk (74)', () => {
  it('is true when the latest punch today is a clock-in', () => {
    expect(isCurrentlyClockedIn([{ type: 'in', time: TODAY_IN }], TIMED_SHIFT, NOW)).toBe(true)
  })

  it('is false after a clock-out', () => {
    expect(isCurrentlyClockedIn([{ type: 'in', time: TODAY_IN }, { type: 'out', time: TODAY_OUT }], TIMED_SHIFT, NOW)).toBe(false)
  })

  it('is false for a stale yesterday clock-in with a timed shift (kiosk would say Clock In)', () => {
    expect(isCurrentlyClockedIn([{ type: 'in', time: YESTERDAY_IN }], TIMED_SHIFT, NOW)).toBe(false)
  })

  it('is false for a stale yesterday clock-in with no shift assigned', () => {
    expect(isCurrentlyClockedIn([{ type: 'in', time: YESTERDAY_IN }], null, NOW)).toBe(false)
  })

  it('is true for an open-shift session that started yesterday (carries over midnight)', () => {
    expect(isCurrentlyClockedIn([{ type: 'in', time: YESTERDAY_IN }], OPEN_SHIFT, NOW)).toBe(true)
  })

  it('is false with no punches at all', () => {
    expect(isCurrentlyClockedIn([], TIMED_SHIFT, NOW)).toBe(false)
    expect(isCurrentlyClockedIn([], null, NOW)).toBe(false)
  })
})

describe('openSessionPunch — the punch the next scan would end (74)', () => {
  it('returns the opening clock-in of the current session', () => {
    const p = { type: 'in', time: TODAY_IN }
    expect(openSessionPunch([p], TIMED_SHIFT, NOW)).toBe(p)
  })

  it('returns null once clocked out', () => {
    expect(openSessionPunch([{ type: 'in', time: TODAY_IN }, { type: 'out', time: TODAY_OUT }], TIMED_SHIFT, NOW)).toBeNull()
  })

  it('returns the yesterday clock-in for an overnight open shift', () => {
    const p = { type: 'in', time: YESTERDAY_IN }
    expect(openSessionPunch([p], OPEN_SHIFT, NOW)).toBe(p)
  })

  it('returns null for a stale yesterday clock-in on a timed shift', () => {
    expect(openSessionPunch([{ type: 'in', time: YESTERDAY_IN }], TIMED_SHIFT, NOW)).toBeNull()
  })
})

describe('decideAction exposes sessionStart without breaking its contract', () => {
  it('still returns action/overtime/overtimeMinutes and adds sessionStart on clock-out', () => {
    const r = decideAction([{ type: 'in', time: TODAY_IN }], TIMED_SHIFT, NOW)
    expect(r.action).toBe('out')
    expect(r.overtime).toBe(false)
    expect(r.overtimeMinutes).toBe(0)
    expect(r.sessionStart).toEqual({ type: 'in', time: TODAY_IN })
  })

  it('sessionStart is null when the next scan is a clock-in', () => {
    expect(decideAction([], TIMED_SHIFT, NOW).sessionStart).toBeNull()
  })
})

describe('shiftForEmployee (moved to lib/shifts)', () => {
  it('resolves the assigned shift by email', () => {
    const data = { shifts: [TIMED_SHIFT], assignments: { 'a@x.com': 'sh-1' } }
    expect(shiftForEmployee(data, 'a@x.com')).toBe(TIMED_SHIFT)
    expect(shiftForEmployee(data, 'unknown@x.com')).toBeNull()
    expect(shiftForEmployee(null, 'a@x.com')).toBeNull()
  })
})
