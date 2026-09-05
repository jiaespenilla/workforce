// Payroll computation tests (item 49) — pure math from src/lib/payroll.js
import { describe, it, expect } from 'vitest'
import {
  sessionize, computePayrollRows, payrollTotals, periodRange, fmtHours,
  DEFAULT_DEDUCTIONS,
} from '../src/lib/payroll'

const DED = DEFAULT_DEDUCTIONS // 15 + 4.5 + 2 + 3 = 24.5% total

// Sep 2026: Sep 1 is a Tuesday. Anchor mid-month.
const ANCHOR = new Date(2026, 8, 10, 12, 0, 0)

function punch(email, type, isoTime, extra = {}) {
  return { email, type, time: isoTime, ...extra }
}

// An 8h morning session on 2026-09-10 01:00–09:00Z (09:00–17:00 Manila)
const IN1 = '2026-09-10T01:00:00.000Z'
const OUT1 = '2026-09-10T09:00:00.000Z'

describe('sessionize — punch pairs to hours/OT', () => {
  it('sums regular hours from in→out pairs', () => {
    const s = sessionize([punch('a@x.com', 'in', IN1), punch('a@x.com', 'out', OUT1)])
    expect(s.hours).toBeCloseTo(8, 5)
    expect(s.otHours).toBe(0)
  })

  it('counts flagged overtime minutes as OT', () => {
    const s = sessionize([
      punch('a@x.com', 'in', IN1),
      punch('a@x.com', 'out', OUT1, { overtime_minutes: 120 }),
    ])
    expect(s.hours).toBeCloseTo(8, 5)
    expect(s.otHours).toBeCloseTo(2, 5)
  })

  it('pairs punches even when stored out of order (sorted by time)', () => {
    const s = sessionize([
      punch('a@x.com', 'out', OUT1), // stored before its 'in' — sorting fixes the order
      punch('a@x.com', 'in', IN1),
    ])
    expect(s.hours).toBeCloseTo(8, 5)
  })

  it('sums multiple sessions', () => {
    const s = sessionize([
      punch('a@x.com', 'in', IN1), punch('a@x.com', 'out', OUT1),
      punch('a@x.com', 'in', '2026-09-11T01:00:00.000Z'), punch('a@x.com', 'out', '2026-09-11T05:00:00.000Z'),
    ])
    expect(s.hours).toBeCloseTo(12, 5)
  })
})

describe('computePayrollRows — hourly employees', () => {
  it('pays rate × hours plus 1.25× OT', () => {
    const rows = computePayrollRows({
      employees: [{ id: 1, name: 'Ana', email: 'ana@x.com', role: 'Employee', active: true, payType: 'hourly', payRate: 100 }],
      attendance: [
        punch('ana@x.com', 'in', IN1),
        punch('ana@x.com', 'out', OUT1, { overtime_minutes: 60 }),
      ],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.hours).toBeCloseTo(8, 5)
    expect(r.otHours).toBeCloseTo(1, 5)
    expect(r.base).toBe(800)            // 100 × 8
    expect(r.otPay).toBe(125)           // 100 × 1.25 × 1
    expect(r.gross).toBe(925)
    // deductions: 24.5% of 925 = 226.625 → 226.63
    expect(r.dedTotal).toBe(226.63)
    expect(r.net).toBe(698.37)          // 925 − 226.63
    expect(r.missing).toEqual([])
  })

  it('splits each deduction line', () => {
    const rows = computePayrollRows({
      employees: [{ id: 1, name: 'Ana', email: 'ana@x.com', role: 'Employee', payType: 'hourly', payRate: 100 }],
      attendance: [punch('ana@x.com', 'in', IN1), punch('ana@x.com', 'out', OUT1)],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    const amounts = rows[0].deductions.map((d) => d.amount)
    expect(amounts).toEqual([120, 36, 16, 24]) // 15% / 4.5% / 2% / 3% of 800
    expect(rows[0].deductions.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(rows[0].dedTotal, 2)
  })
})

describe('computePayrollRows — monthly employees', () => {
  it('pays the full monthly salary plus OT at salary/168 × 1.25', () => {
    const rows = computePayrollRows({
      employees: [{ id: 2, name: 'Ben', email: 'ben@x.com', role: 'Employee', payType: 'monthly', payRate: 22000 }],
      attendance: [punch('ben@x.com', 'in', IN1), punch('ben@x.com', 'out', OUT1, { overtime_minutes: 480 })], // 8h OT
      deductions: DED,
      period: periodRange('semi-monthly', ANCHOR),
    })
    const r = rows[0]
    expect(r.base).toBe(22000)
    expect(r.otHourly).toBe(130.95) // round2(22000 / 168)
    expect(r.otPay).toBeCloseTo(Math.round((22000 / 168) * 1.25 * 8 * 100) / 100, 2)
    expect(r.net).toBeCloseTo(Math.round((r.gross - r.dedTotal) * 100) / 100, 2)
  })

  it('monthly employee with no punches still receives base salary', () => {
    const rows = computePayrollRows({
      employees: [{ id: 3, name: 'Cai', email: 'cai@x.com', role: 'Employee', payType: 'monthly', payRate: 20000 }],
      attendance: [],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    expect(rows[0].base).toBe(20000)
    expect(rows[0].net).toBe(15100) // 20000 × (1 − 0.245)
  })
})

describe('computePayrollRows — missing data & exclusions', () => {
  it('flags employees without pay type/rate and excludes them from totals', () => {
    const rows = computePayrollRows({
      employees: [
        { id: 4, name: 'Dan', email: 'dan@x.com', role: 'Employee', payType: 'hourly', payRate: 100 },
        { id: 5, name: 'Eve', email: 'eve@x.com', role: 'Employee' },                      // nothing set
        { id: 6, name: 'Fay', email: 'fay@x.com', role: 'Employee', payType: 'hourly' },   // no rate
      ],
      attendance: [punch('dan@x.com', 'in', IN1), punch('dan@x.com', 'out', OUT1)],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    const dan = rows.find((r) => r.name === 'Dan')
    const eve = rows.find((r) => r.name === 'Eve')
    const fay = rows.find((r) => r.name === 'Fay')
    expect(dan.missing).toEqual([])
    expect(eve.missing).toEqual(['pay type', 'pay rate'])
    expect(eve.gross).toBe(0)
    expect(fay.missing).toEqual(['pay rate'])

    const totals = payrollTotals(rows)
    expect(totals.employeeCount).toBe(1)
    expect(totals.missingCount).toBe(2)
    expect(totals.gross).toBe(800)
  })

  it('excludes inactive employees and ceo/administrator roles', () => {
    const rows = computePayrollRows({
      employees: [
        { id: 7, name: 'CEO', email: 'ceo@x.com', role: 'CEO', payType: 'monthly', payRate: 90000 },
        { id: 8, name: 'Gus', email: 'gus@x.com', role: 'Employee', active: false, payType: 'hourly', payRate: 100 },
        { id: 9, name: 'Hal', email: 'hal@x.com', role: 'Employee', payType: 'hourly', payRate: 100 },
      ],
      attendance: [],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    expect(rows.map((r) => r.name)).toEqual(['Hal'])
  })
})

describe('payrollTotals', () => {
  it('sums net = gross − deductions across configured rows', () => {
    const rows = computePayrollRows({
      employees: [
        { id: 1, name: 'Ana', email: 'ana@x.com', role: 'Employee', payType: 'hourly', payRate: 100 },
        { id: 2, name: 'Ben', email: 'ben@x.com', role: 'Employee', payType: 'monthly', payRate: 20000 },
      ],
      attendance: [punch('ana@x.com', 'in', IN1), punch('ana@x.com', 'out', OUT1)],
      deductions: DED,
      period: periodRange('monthly', ANCHOR),
    })
    const t = payrollTotals(rows)
    expect(t.employeeCount).toBe(2)
    expect(t.gross).toBeCloseTo(800 + 20000, 2)
    expect(t.net).toBeCloseTo(Math.round((t.gross - t.deductions) * 100) / 100, 2)
  })
})

describe('periodRange', () => {
  it('monthly covers the whole calendar month', () => {
    const p = periodRange('monthly', ANCHOR)
    expect(p.start.getDate()).toBe(1)
    expect(p.end.getDate()).toBe(30) // Sep has 30 days
  })

  it('semi-monthly splits at the 15th/16th', () => {
    const first = periodRange('semi-monthly', new Date(2026, 8, 10))
    expect(first.start.getDate()).toBe(1)
    expect(first.end.getDate()).toBe(15)
    const second = periodRange('semi-monthly', new Date(2026, 8, 20))
    expect(second.start.getDate()).toBe(16)
    expect(second.end.getDate()).toBe(30)
  })

  it('weekly runs Monday→Sunday', () => {
    const p = periodRange('weekly', ANCHOR) // Sep 10 2026 is a Thursday
    expect(p.start.getDay()).toBe(1)
    expect(p.end.getDay()).toBe(0)
    expect(p.start.getDate()).toBe(7)
    expect(p.end.getDate()).toBe(13)
  })
})

describe('fmtHours', () => {
  it('formats [h]:mm', () => {
    expect(fmtHours(8)).toBe('8:00')
    expect(fmtHours(7.5)).toBe('7:30')
    expect(fmtHours(0)).toBe('0:00')
  })
})