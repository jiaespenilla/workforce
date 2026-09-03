import { describe, it, expect } from 'vitest'
import {
  dayStatus,
  summaryStatus,
  hoursForDay,
  overtimeForDay,
  shiftForEmployee,
  fmtHours,
  aggregateWindow,
  isExemptEmployee,
} from '../src/pages/TimeKeeping'

// Punch times are stored as UTC ISO strings. getSystemTimeZone() falls back to
// Asia/Manila (UTC+8) when no settings are configured, so:
//   2026-09-01T00:00:00Z  =>  08:00 local  (exactly the shift start)
//   2026-09-01T00:05:00Z  =>  08:05 local  (late)
//   2026-08-31T23:50:00Z  =>  07:50 local  (on time, before the shift start)
const AT_SHIFT_START = '2026-09-01T00:00:00.000Z'
const LATE = '2026-09-01T00:05:00.000Z'
const EARLY = '2026-08-31T23:50:00.000Z'

const shift = { id: 'sh-1', name: 'Morning', start: '08:00', end: '17:00' }

describe('TimeKeeping dayStatus — on-time / late vs the assigned shift', () => {
  it('records On time when the first clock-in is exactly at the shift start', () => {
    const st = dayStatus([{ type: 'in', time: AT_SHIFT_START }], shift, { isToday: true })
    expect(st).toEqual({ label: 'On time', cls: 'bg-brand-100 text-brand-700' })
  })

  it('records On time when the first clock-in is before the shift start', () => {
    const st = dayStatus([{ type: 'in', time: EARLY }], shift, { isToday: true })
    expect(st.label).toBe('On time')
  })

  it('records Late when the first clock-in is after the shift start', () => {
    const st = dayStatus([{ type: 'in', time: LATE }], shift, { isToday: true })
    expect(st).toEqual({ label: 'Late', cls: 'bg-amber-100 text-amber-700' })
  })

  it('records Missed for a timed shift on a finished day with no clock-in', () => {
    const st = dayStatus([], shift, { isToday: false, isPast: true })
    expect(st.label).toBe('Missed')
  })

  it('records Not yet for today before the employee clocks in', () => {
    const st = dayStatus([], shift, { isToday: true })
    expect(st.label).toBe('Not yet')
  })

  it('records Present on an open shift when the employee scanned', () => {
    const open = { ...shift, open: true }
    expect(dayStatus([{ type: 'in', time: AT_SHIFT_START }], open, { isToday: true }).label).toBe('Present')
  })

  it('records Absent on an open shift when the day is over and nobody scanned', () => {
    const open = { ...shift, open: true }
    expect(dayStatus([], open, { isToday: false, isPast: true }).label).toBe('Absent')
  })

  it('records No clock-in when a day only has clock-outs', () => {
    const st = dayStatus([{ type: 'out', time: LATE }], shift, { isToday: true })
    expect(st.label).toBe('No clock-in')
  })
})

describe('TimeKeeping summaryStatus — week/month on-time/late rollup', () => {
  // Anchor to LAST week (always in the past, regardless of when tests run).
  function lastWeekMondayLocal() {
    const now = new Date()
    const back = (now.getDay() + 6) % 7 + 7
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
  }
  // Build punches as UTC ISO strings that land on that week's Mon/Tue/Wed in
  // Asia/Manila (UTC+8), the deterministic fallback timezone in tests.
  function buildTestWeek() {
    const mon = lastWeekMondayLocal()
    const y = mon.getFullYear()
    const m = mon.getMonth()
    const d = mon.getDate()
    return {
      monPunch: { email: 'a@x.com', type: 'in', time: new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString() },      // Mon 08:00 - on time
      tuePunch: { email: 'a@x.com', type: 'in', time: new Date(Date.UTC(y, m, d + 1, 0, 5, 0)).toISOString() }, // Tue 08:05 - late
      wedPunch: { email: 'a@x.com', type: 'in', time: new Date(Date.UTC(y, m, d + 1, 23, 50, 0)).toISOString() }, // Wed 07:50 - on time
    }
  }

  it('rolls on-time and late counts across a week', () => {
    const mon = lastWeekMondayLocal()
    const { monPunch, tuePunch, wedPunch } = buildTestWeek()
    const st = summaryStatus([monPunch, tuePunch, wedPunch], shift, mon, 'week')
    expect(st.label).toContain('2 on time')
    expect(st.label).toContain('1 late')
    expect(st.cls).toBe('bg-brand-100 text-brand-700')
  })

  it('reports no punches for an empty future window', () => {
    const now = new Date()
    const nextMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7))
    const st = summaryStatus([], shift, nextMon, 'week')
    expect(st.label).toBe('No punches')
  })
})

describe('TimeKeeping hours helpers', () => {
  it('sums regular hours from in/out pairs', () => {
    const punches = [
      { type: 'in', time: '2026-09-01T00:00:00.000Z' },
      { type: 'out', time: '2026-09-01T08:00:00.000Z' },
    ]
    expect(hoursForDay(punches)).toBeCloseTo(8)
  })

  it('only counts overtime when the clock-out is flagged as overtime', () => {
    const punches = [
      { type: 'in', time: '2026-09-01T00:00:00.000Z' },
      { type: 'out', time: '2026-09-01T09:00:00.000Z', overtime: true },
    ]
    expect(overtimeForDay(punches)).toBeCloseTo(9)
    expect(overtimeForDay(punches.map((p) => ({ ...p, overtime: false })))).toBe(0)
  })

    it('uses overtime_minutes when present (open shift: whole session is OT)', () => {
    // 10h clock-out session flagged as overtime → the entire 10h session
    // (600 minutes) is OT, both for open and timed shifts.
    const punches = [
      { type: 'in', time: '2026-09-01T00:00:00.000Z' },
      { type: 'out', time: '2026-09-01T10:00:00.000Z', overtime: true, overtime_minutes: 600 },
    ]
    expect(overtimeForDay(punches)).toBeCloseTo(10)
  })
})

describe('TimeKeeping shiftForEmployee', () => {
  it('resolves the shift an employee is assigned to by email', () => {
    const data = { shifts: [shift], assignments: { 'a@x.com': 'sh-1', 'b@x.com': 'other' } }
    expect(shiftForEmployee(data, 'a@x.com')).toBe(shift)
    expect(shiftForEmployee(data, 'unknown@x.com')).toBeNull()
    expect(shiftForEmployee(null, 'a@x.com')).toBeNull()
  })
})

describe('fmtHours — weekly report number formats', () => {
  it('formats [h]:mm with hours beyond 24 and minute rounding', () => {
    expect(fmtHours(8, 'hmm')).toBe('8:00')
    expect(fmtHours(8.5, 'hmm')).toBe('8:30')
    expect(fmtHours(40.5, 'hmm')).toBe('40:30')
    expect(fmtHours(0, 'hmm')).toBe('0:00')
    expect(fmtHours(7.999, 'hmm')).toBe('8:00')
  })
  it('formats decimal hrs to two places', () => {
    expect(fmtHours(8, 'hrs')).toBe('8.00')
    expect(fmtHours(8.5, 'hrs')).toBe('8.50')
    expect(fmtHours(40.25, 'hrs')).toBe('40.25')
  })
  it('treats missing/negative values as 0', () => {
    expect(fmtHours(null, 'hmm')).toBe('0:00')
    expect(fmtHours(-2, 'hrs')).toBe('0.00')
  })
})

describe('CEO/admin exemption from clock-in requirement', () => {
  // Anchor to LAST week (always in the past, regardless of when tests run).
  function lastWeekMondayLocal() {
    const now = new Date()
    const back = (now.getDay() + 6) % 7 + 7
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
  }
  it('isExemptEmployee matches only ceo/administrator roles', () => {
    expect(isExemptEmployee({ role: 'CEO' })).toBe(true)
    expect(isExemptEmployee({ role: 'administrator' })).toBe(true)
    expect(isExemptEmployee({ role: 'Admin' })).toBe(true)
    expect(isExemptEmployee({ role: 'Manager' })).toBe(false)
    expect(isExemptEmployee({ role: 'Team Lead' })).toBe(false)
    expect(isExemptEmployee({ role: 'Employee' })).toBe(false)
    expect(isExemptEmployee(null)).toBe(false)
  })
  it('dayStatus shows Exempt on a past day without punches', () => {
    expect(dayStatus([], shift, { isToday: false, isPast: true, exempt: true }).label).toBe('Exempt')
    expect(dayStatus([], shift, { isToday: true, exempt: true }).label).toBe('Exempt')
  })
  it('dayStatus still reports real attendance when an exempt person has punches', () => {
    expect(dayStatus([{ type: 'in', time: AT_SHIFT_START }], shift, { isToday: true, exempt: true }).label).toBe('On time')
    expect(dayStatus([{ type: 'in', time: LATE }], shift, { isToday: true, exempt: true }).label).toBe('Late')
  })
  it('summaryStatus shows Exempt for an exempt person with an empty past week', () => {
    const monday = lastWeekMondayLocal()
    const st = summaryStatus([], shift, monday, 'week', { exempt: true })
    expect(st.label).toBe('Exempt')
    expect(st.cls).toBe('bg-violet-100 text-violet-700')
  })
  it('summaryStatus counts attendance normally for a non-exempt person with an empty past week', () => {
    const monday = lastWeekMondayLocal()
    const st = summaryStatus([], shift, monday, 'week')
    expect(st.label).toContain('missed')
  })
})

describe('aggregateWindow — weekly report columns', () => {
  // Mon/Tue punches in Asia/Manila: each "in" at 08:00 local.
  const monIn = '2026-08-31T00:00:00.000Z'
  const monOut = '2026-08-31T08:00:00.000Z' // 8h, no OT
  const tueIn = '2026-09-01T00:00:00.000Z'
  const tueOut = '2026-09-01T10:00:00.000Z' // 10h session, whole session OT
  it('computes first clock-in, last clock-out, regular/overtime/total', () => {
    const agg = aggregateWindow([
      { type: 'in', time: tueIn },
      { type: 'out', time: tueOut, overtime: true, overtime_minutes: 600 },
      { type: 'in', time: monIn },
      { type: 'out', time: monOut },
    ])
    expect(agg.clockIn.time).toBe(monIn)
    expect(agg.clockOut.time).toBe(tueOut)
    expect(agg.total).toBeCloseTo(18)  // 8h + 10h
    expect(agg.ot).toBeCloseTo(10)     // whole flagged session counts
    expect(agg.regular).toBeCloseTo(8) // total - overtime
  })
  it('handles an empty window', () => {
    const agg = aggregateWindow([])
    expect(agg.clockIn).toBeNull()
    expect(agg.clockOut).toBeNull()
    expect(agg.regular).toBe(0)
    expect(agg.ot).toBe(0)
    expect(agg.total).toBe(0)
  })
})