import { describe, it, expect } from 'vitest'
import { timeByDay, taskTimeByDay, dayLabel, dayKeyOf } from '../src/lib/workLog.js'

// (72) Per-day time-consumption breakdown. Manila = GMT+8, no DST.
const MAN = 8 * 3600 * 1000
// 9/9/2026 09:00 Manila == 01:00 UTC
const SEP9_09 = Date.UTC(2026, 8, 9, 1, 0, 0)
const SEP10_09 = SEP9_09 + 24 * 3600 * 1000

describe('timeByDay (72)', () => {
  it('groups a single same-day session under its date', () => {
    const out = timeByDay([{ start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 + 3600 * 1000).toISOString(), seconds: 3600 }])
    expect(out).toEqual([{ date: '2026-09-09', seconds: 3600 }])
  })

  it('produces one row per day, newest first (the reported example)', () => {
    const out = timeByDay([
      { start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 + 6 * 3600 * 1000 + 49 * 60 * 1000 + 33000).toISOString(), seconds: 6 * 3600 + 49 * 60 + 33 },
      { start: new Date(SEP10_09).toISOString(), end: new Date(SEP10_09 + 3 * 3600 * 1000 + 30 * 60 * 1000 + 15000).toISOString(), seconds: 3 * 3600 + 30 * 60 + 15 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ date: '2026-09-10', seconds: 3 * 3600 + 30 * 60 + 15 })
    expect(out[1]).toEqual({ date: '2026-09-09', seconds: 6 * 3600 + 49 * 60 + 33 })
    // total preserved
    expect(out.reduce((s, d) => s + d.seconds, 0)).toBe((6 * 3600 + 49 * 60 + 33) + (3 * 3600 + 30 * 60 + 15))
  })

  it('splits a session that runs past midnight between the two days', () => {
    // 23:00 Manila → 01:00 Manila next day (2h total, 1h per day)
    const start = Date.UTC(2026, 8, 9, 15, 0, 0) // 23:00 Manila
    const out = timeByDay([{ start: new Date(start).toISOString(), end: new Date(start + 2 * 3600 * 1000).toISOString(), seconds: 7200 }])
    expect(out.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-09'])
    expect(out[0].seconds + out[1].seconds).toBe(7200)
    expect(Math.abs(out[0].seconds - 3600)).toBeLessThanOrEqual(1)
    expect(Math.abs(out[1].seconds - 3600)).toBeLessThanOrEqual(1)
  })

  it('counts a running session (no end) up to now', () => {
    const now = SEP9_09 + 30 * 60 * 1000
    const out = timeByDay([{ start: new Date(SEP9_09).toISOString(), seconds: null }], { now })
    expect(out).toEqual([{ date: '2026-09-09', seconds: 1800 }])
  })

  it('skips zero-duration and corrupt entries', () => {
    const out = timeByDay([
      null,
      { start: 'not-a-date', end: new Date(SEP9_09).toISOString(), seconds: 10 },
      { start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 + 1000).toISOString(), seconds: 0 },
      { start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 - 1000).toISOString(), seconds: 10 },
      { start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 + 60000).toISOString(), seconds: 60 },
    ])
    expect(out).toEqual([{ date: '2026-09-09', seconds: 60 }])
  })

  it('derives stored seconds from the timespan when seconds is missing', () => {
    const out = timeByDay([{ start: new Date(SEP9_09).toISOString(), end: new Date(SEP9_09 + 120000).toISOString() }])
    expect(out[0].seconds).toBe(120)
  })
})

describe('taskTimeByDay / labels', () => {
  it('appends the live running session to today', () => {
    const now = SEP9_09 + 20 * 60 * 1000
    const task = {
      workSeconds: 3600,
      workStartedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      workLog: [{ start: new Date(SEP9_09 - 3600 * 1000).toISOString(), end: new Date(SEP9_09).toISOString(), seconds: 3600 }],
    }
    const out = taskTimeByDay(task, now)
    expect(out).toEqual([{ date: '2026-09-09', seconds: 4200 }])
  })

  it('dayKeyOf maps a Manila evening after local midnight to the next day', () => {
    // 23:30 Manila on 9/9 → 15:30 UTC on 9/9 → still 9/9 in Manila
    expect(dayKeyOf(Date.UTC(2026, 8, 9, 15, 30, 0))).toBe('2026-09-09')
    // 01:30 Manila on 9/10 → 17:30 UTC on 9/9 (UTC says 9/9, Manila says 9/10)
    expect(dayKeyOf(Date.UTC(2026, 8, 9, 17, 30, 0))).toBe('2026-09-10')
  })

  it('dayLabel renders M/D/YYYY', () => {
    expect(dayLabel('2026-09-09')).toBe('9/9/2026')
  })
})